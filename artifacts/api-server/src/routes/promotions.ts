import { Router, type IRouter } from "express";
import {
  db, productsTable, brandsTable, categoriesTable, productPromotionsTable, aiSettingsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { SaveProductPromotionBody } from "@workspace/api-zod";
import { aiJson, isAiAvailable, NoAiProviderError } from "../services/ai";
import {
  cleanPromoCopy, cleanTemplate, draftPromoFromProduct, mergeAiCopy, promoPrompt, suggestTemplate, PROMO_JSON_SCHEMA,
  type PromoSource,
} from "../lib/product-promo";

/* Inventory › Promotions. Saved promo card copy per product, and drafting it
   from the product (Claude when connected, else the product's own text).
   Rules live in lib/product-promo.ts. Any staff member may print a poster, so
   nothing here is manager-gated; generating spends the merchant's own AI key,
   which the AI kill-switch (Management › AI) turns off. */

const router: IRouter = Router();

function format(row: typeof productPromotionsTable.$inferSelect) {
  return {
    productId: row.productId,
    template: cleanTemplate(row.template),
    copy: cleanPromoCopy(row.copy),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function productIdParam(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The product with its brand and category names, scoped to the merchant on every join. */
async function loadSource(merchantId: number, productId: number): Promise<PromoSource | null> {
  const [row] = await db
    .select({
      name: productsTable.name,
      description: productsTable.description,
      technicalSpecs: productsTable.technicalSpecs,
      warrantyDuration: productsTable.warrantyDuration,
      warrantyUnit: productsTable.warrantyUnit,
      brand: brandsTable.name,
      category: categoriesTable.name,
    })
    .from(productsTable)
    .leftJoin(brandsTable, and(eq(brandsTable.id, productsTable.brandId), eq(brandsTable.merchantId, merchantId)))
    .leftJoin(categoriesTable, and(eq(categoriesTable.id, productsTable.categoryId), eq(categoriesTable.merchantId, merchantId)))
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
  return row ?? null;
}

router.get("/promotions", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(productPromotionsTable)
    .where(eq(productPromotionsTable.merchantId, req.session.merchantId!));
  res.json(rows.map(format));
});

router.put("/promotions/:productId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const productId = productIdParam(req.params.productId);
  const parsed = SaveProductPromotionBody.safeParse(req.body);
  if (!productId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid product id" : parsed.error.message });
    return;
  }
  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const values = {
    template: cleanTemplate(parsed.data.template),
    copy: cleanPromoCopy(parsed.data.copy),
  };
  const [row] = await db
    .insert(productPromotionsTable)
    .values({ merchantId, productId, ...values })
    .onConflictDoUpdate({
      target: [productPromotionsTable.merchantId, productPromotionsTable.productId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  res.json(format(row!));
});

router.delete("/promotions/:productId", requireAuth, async (req, res): Promise<void> => {
  const productId = productIdParam(req.params.productId);
  if (!productId) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  await db
    .delete(productPromotionsTable)
    .where(and(
      eq(productPromotionsTable.merchantId, req.session.merchantId!),
      eq(productPromotionsTable.productId, productId),
    ));
  res.status(204).end();
});

router.post("/promotions/:productId/generate", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const productId = productIdParam(req.params.productId);
  if (!productId) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  const src = await loadSource(merchantId, productId);
  if (!src) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const draft = draftPromoFromProduct(src);
  const suggestedTemplate = suggestTemplate(src);

  const [aiSettings] = await db
    .select({ aiEnabled: aiSettingsTable.aiEnabled })
    .from(aiSettingsTable)
    .where(eq(aiSettingsTable.merchantId, merchantId));
  if (aiSettings?.aiEnabled === false || !(await isAiAvailable(merchantId))) {
    res.json({ copy: draft, source: "product", suggestedTemplate });
    return;
  }

  try {
    const { data } = await aiJson(merchantId, {
      system: "You write short, factual retail promotional copy for printed in-store cards. Answer only with the requested JSON.",
      messages: [{ role: "user", content: promoPrompt(src) }],
      maxTokens: 4000,
      effort: "low",
      schema: PROMO_JSON_SCHEMA,
    });
    res.json({ copy: mergeAiCopy(data, draft), source: "ai", suggestedTemplate });
  } catch (err) {
    if (!(err instanceof NoAiProviderError)) req.log.warn({ err }, "AI promo copy failed; using product data");
    res.json({
      copy: draft,
      source: "product",
      suggestedTemplate,
      aiError: err instanceof NoAiProviderError ? undefined : "Claude couldn't write this one, so it was filled from the product's description and specs.",
    });
  }
});

export default router;
