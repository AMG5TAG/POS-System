/**
 * Products › New Product › Import Details — read a product page into the form.
 * Nothing here writes: the form shows the result for staff to confirm, edit and
 * complete before the ordinary product save. Rules in lib/product-page-import.ts.
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, aiSettingsTable } from "@workspace/db";
import { ImportProductFromUrlBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { safeFetch, SafeFetchError } from "../lib/safe-fetch";
import { extractProduct, mergeAiFields, pageTextForAi, AI_JSON_SCHEMA, type ImportField } from "../lib/product-page-import";
import { aiJson, isAiAvailable, NoAiProviderError } from "../services/ai";

const router: IRouter = Router();

const PAGE_MAX_BYTES = 6 * 1024 * 1024;
const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;

router.post("/products/import-from-url", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = ImportProductFromUrlBody.safeParse(req.body);
  const raw = parsed.success ? parsed.data.url.trim() : "";
  if (!raw) { res.status(400).json({ error: "Paste a link to the product's page" }); return; }
  const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let page;
  try {
    page = await safeFetch(target, { maxBytes: PAGE_MAX_BYTES, timeoutMs: 20000 });
  } catch (err) {
    if (err instanceof SafeFetchError) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }
  if (page.status >= 400) {
    res.status(502).json({
      error: page.status === 403 || page.status === 429
        ? `That site refused the request (${page.status}). Some shops block automated reads — copy the details in by hand.`
        : `That page answered ${page.status}.`,
    });
    return;
  }
  if (!/html|xml/i.test(page.contentType) && page.contentType) {
    res.status(400).json({ error: "That link isn't a web page" });
    return;
  }

  const html = page.body.toString("utf8");
  const fromPage = extractProduct(html, page.url);
  const aiFilled: ImportField[] = [];
  let product = fromPage;
  let aiUsed = false;
  let aiError: string | undefined;

  const [aiSettings] = await db.select({ aiEnabled: aiSettingsTable.aiEnabled })
    .from(aiSettingsTable).where(eq(aiSettingsTable.merchantId, merchantId));
  const missing = (["name", "description", "brand", "price", "technicalSpecs", "weightKg", "category"] as const)
    .some((f) => fromPage[f] == null);
  const text = pageTextForAi(html);
  if (missing && text.length > 200 && aiSettings?.aiEnabled !== false && (await isAiAvailable(merchantId))) {
    try {
      const { data } = await aiJson(merchantId, {
        system:
          "You read a retail product web page and extract the product's details for a shop's catalogue. " +
          "Use only what the page states — never guess or invent. Answer null for anything the page does not state. " +
          "Prices are numbers in the page's currency, without symbols. weightKg in kilograms; lengthCm/widthCm/heightCm in centimetres (convert). " +
          "description: the product's own description as plain text, no marketing about the shop, delivery or returns. " +
          "technicalSpecs: one 'Label: value' per line. category: one short category name. barcode: EAN/UPC digits only.",
        messages: [{ role: "user", content: `Page: ${page.url}\n\n${text}` }],
        maxTokens: 6000,
        effort: "low",
        schema: AI_JSON_SCHEMA,
      });
      if (data && typeof data === "object") {
        const merged = mergeAiFields(fromPage, data as Record<string, unknown>);
        product = merged.product;
        aiFilled.push(...merged.aiFilled);
        aiUsed = true;
      }
    } catch (err) {
      if (!(err instanceof NoAiProviderError)) {
        req.log.warn({ err }, "AI product import failed; using page data");
        aiError = "Claude couldn't read this page, so only the page's own product data was used.";
      }
    }
  }

  res.json({ url: page.url, product, aiFilled, aiUsed, ...(aiError ? { aiError } : {}) });
});

router.get("/products/import-from-url/image", requireAuth, async (req, res): Promise<void> => {
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  if (!raw) { res.status(400).json({ error: "url is required" }); return; }
  try {
    const img = await safeFetch(raw, { maxBytes: IMAGE_MAX_BYTES, timeoutMs: 20000, accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" });
    const type = img.contentType.split(";")[0]!.trim().toLowerCase();
    if (img.status >= 400 || !IMAGE_TYPES.test(type)) { res.status(400).json({ error: "That isn't an image" }); return; }
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(img.body);
  } catch (err) {
    if (err instanceof SafeFetchError) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }
});

export default router;
