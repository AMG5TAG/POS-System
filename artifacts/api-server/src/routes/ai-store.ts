import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod/v4";
import {
  db,
  merchantsTable,
  businessProfileTable,
  categoriesTable,
  productsTable,
  onlineStoreSettingsTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  aiJson,
  providersFor,
  NoAiProviderError,
  type AiProvider,
} from "../services/ai";
import {
  buildStorePrompt,
  generatedSiteSchema,
  storeOutputSchema,
  toStoreDraft,
  type StoreContext,
  type StoreDraft,
} from "../lib/ai-store";

/**
 * AI store generation for the Online Store builder.
 *
 * The merchant describes the shop they want; Claude returns a `theme` + `pages`
 * document built from the block catalogue, and the editor previews it.
 *
 * Generation runs on the merchant's **own** Anthropic key, read from the vault
 * by `services/ai` — so the cost of a generation lands on the merchant who
 * asked for it, and a merchant with no key connected gets a 503 pointing at
 * Integrations rather than a bill on someone else's account.
 *
 * **This route never writes.** It reads the merchant's business details, product
 * catalogue and current store settings to brief the model, and returns a draft.
 * Applying that draft is a separate action the merchant takes in the editor,
 * through the same upsert that saves any other edit — so an AI generation cannot
 * overwrite a live storefront, and there is no new write path to audit.
 */

const router: IRouter = Router();

/** Generation is slow and costs real money per call, so it is rate limited per
 *  session rather than left to the global limiter. */
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Always a merchant id in practice — requireAuth runs first — but the IP
  // fallback keeps a session-less request from collapsing onto one shared key.
  keyGenerator: (req) =>
    req.session?.merchantId ? `m:${req.session.merchantId}` : ipKeyGenerator(req.ip ?? ""),
  message: { error: "Too many store generations. Try again in an hour." },
});

const bodySchema = z.object({
  /** What the merchant wants. Optional — business details alone are enough. */
  brief: z.string().max(2000).optional(),
});

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Feature toggles the generated store is allowed to lean on. */
function enabledFeatures(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, on]) => on === true)
      .map(([name]) => name);
  } catch {
    return [];
  }
}

/** Everything the model is told about this merchant, gathered in one pass. */
async function loadContext(merchantId: number): Promise<StoreContext> {
  const [merchant, profile, storeSettings, categories, products] = await Promise.all([
    db
      .select({
        businessName: merchantsTable.businessName,
        email: merchantsTable.email,
        phone: merchantsTable.phone,
        address: merchantsTable.address,
        city: merchantsTable.city,
      })
      .from(merchantsTable)
      .where(eq(merchantsTable.id, merchantId))
      .limit(1),
    db
      .select()
      .from(businessProfileTable)
      .where(eq(businessProfileTable.merchantId, merchantId))
      .limit(1),
    db
      .select()
      .from(onlineStoreSettingsTable)
      .where(eq(onlineStoreSettingsTable.merchantId, merchantId))
      .limit(1),
    db
      .select({ id: categoriesTable.id, name: categoriesTable.name })
      .from(categoriesTable)
      .where(eq(categoriesTable.merchantId, merchantId))
      .orderBy(categoriesTable.sortOrder)
      .limit(40),
    db
      .select({
        name: productsTable.name,
        price: productsTable.price,
        categoryId: productsTable.categoryId,
      })
      .from(productsTable)
      .where(and(eq(productsTable.merchantId, merchantId), eq(productsTable.isActive, "true")))
      .orderBy(desc(productsTable.createdAt))
      .limit(40),
  ]);

  const bp = profile[0];
  const store = storeSettings[0];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return {
    businessName: merchant[0]?.businessName ?? "This business",
    storeName: store?.storeName ?? "",
    tagline: store?.tagline || bp?.tagline || "",
    description: bp?.description ?? "",
    businessCategories: parseJsonArray(bp?.categories),
    categories: categories.map((c) => c.name),
    products: products.map((p) => ({
      name: p.name,
      price: parseFloat(String(p.price)),
      category: p.categoryId ? categoryName.get(p.categoryId) ?? null : null,
    })),
    brandColors: [
      ...parseJsonArray(bp?.brandColors),
      ...parseJsonArray(bp?.bgColors),
      ...parseJsonArray(bp?.textColors),
    ].slice(0, 8),
    phone: merchant[0]?.phone ?? "",
    email: bp?.contactEmail || (merchant[0]?.email ?? ""),
    address: [merchant[0]?.address, merchant[0]?.city, bp?.state, bp?.postcode]
      .filter(Boolean)
      .join(", "),
    openingHours: bp?.openingHours && bp.openingHours !== "{}" ? bp.openingHours : "",
    enabledFeatures: enabledFeatures(store?.features),
  };
}

/**
 * GET /online-store/ai/status — whether *this merchant* can generate, and who
 * would serve it. KoaPOS is bring-your-own-key, so the answer is per-merchant:
 * the editor uses it to point an unconnected merchant at Integrations instead
 * of letting them write a brief and only then discover nothing is connected.
 */
router.get("/online-store/ai/status", requireAuth, async (req, res): Promise<void> => {
  const providers = await providersFor(req.session.merchantId!);
  res.json({
    available: providers.length > 0,
    provider: (providers[0]?.provider ?? null) as AiProvider | null,
  });
});

/** POST /online-store/ai/generate — design a storefront. Returns a draft only. */
router.post(
  "/online-store/ai/generate",
  requireAuth,
  generateLimiter,
  async (req, res): Promise<void> => {
    const merchantId = req.session.merchantId!;

    if (!(await providersFor(merchantId)).length) {
      res.status(503).json({
        error: "Connect your Claude account under Management › Integrations to use the AI designer.",
      });
      return;
    }

    const parsedBody = bodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({ error: "Invalid request", details: parsedBody.error.issues });
      return;
    }

    const context = await loadContext(merchantId);
    const brief = parsedBody.data.brief?.trim();

    let draft: StoreDraft;
    let provider: AiProvider;
    try {
      const result = await aiJson(
        merchantId,
        {
          system: buildStorePrompt(context),
          schema: storeOutputSchema(),
          maxTokens: 16000,
          messages: [
            {
              role: "user",
              content: brief
                ? `Design my online store. What I want:\n\n${brief}`
                : "Design my online store using the business details and catalogue above.",
            },
          ],
        },
        (err, failed) => req.log.warn({ err, provider: failed }, "AI store generation falling back"),
      );
      provider = result.provider;

      // The model's output is untrusted until Zod has seen it — the OpenAI
      // fallback has the schema described rather than enforced, and even a
      // schema-valid document can be unusable.
      const site = generatedSiteSchema.safeParse(result.data);
      if (!site.success) {
        req.log.warn({ issues: site.error.issues, provider }, "AI store generation failed validation");
        res.status(502).json({ error: "The AI returned a store design we could not read. Try again." });
        return;
      }
      draft = toStoreDraft(site.data);
    } catch (err) {
      if (err instanceof NoAiProviderError) {
        res.status(503).json({
          error: "Connect your Claude account under Management › Integrations to use the AI designer.",
        });
        return;
      }
      req.log.error({ err }, "AI store generation failed");
      res.status(502).json({ error: "The AI service could not be reached. Try again shortly." });
      return;
    }

    res.json({ provider, theme: draft.theme, pages: draft.pages });
  },
);

export default router;
