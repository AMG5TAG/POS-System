import { Router, type IRouter } from "express";
import { db, partCompatibilityTable, productsTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function ownProduct(merchantId: number, productId: number): Promise<boolean> {
  if (!Number.isFinite(productId)) return false;
  const [p] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId))).limit(1);
  return !!p;
}

// GET /parts-lookup?model=iPhone 13 — parts that fit a device model.
router.get("/parts-lookup", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const model = String(req.query.model ?? "").trim();
  if (!model) { res.json({ model: "", parts: [] }); return; }

  const rows = await db
    .select({
      productId: partCompatibilityTable.productId,
      model: partCompatibilityTable.model,
      name: productsTable.name,
      sku: productsTable.sku,
      price: productsTable.price,
      stockQuantity: productsTable.stockQuantity,
    })
    .from(partCompatibilityTable)
    .innerJoin(productsTable, eq(productsTable.id, partCompatibilityTable.productId))
    .where(and(
      eq(partCompatibilityTable.merchantId, merchantId),
      sql`${partCompatibilityTable.model} ILIKE ${"%" + model + "%"}`,
    ))
    .orderBy(asc(productsTable.name));

  res.json({
    model,
    parts: rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      sku: r.sku ?? null,
      price: r.price != null ? parseFloat(r.price as unknown as string) : 0,
      stockQuantity: r.stockQuantity ?? null,
      matchedModel: r.model,
    })),
  });
});

// GET /products/:id/compatibility — models a part fits.
router.get("/products/:id/compatibility", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const productId = Number(req.params.id);
  if (!(await ownProduct(merchantId, productId))) { res.status(404).json({ error: "Product not found" }); return; }
  const rows = await db.select().from(partCompatibilityTable)
    .where(eq(partCompatibilityTable.productId, productId))
    .orderBy(asc(partCompatibilityTable.model));
  res.json({ items: rows.map((r) => ({ id: r.id, model: r.model })) });
});

// POST /products/:id/compatibility — add one model or many (models[]).
router.post("/products/:id/compatibility", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const productId = Number(req.params.id);
  if (!(await ownProduct(merchantId, productId))) { res.status(404).json({ error: "Product not found" }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const models = Array.isArray(b.models) ? (b.models as unknown[]).map(String) : (b.model != null ? [String(b.model)] : []);
  const clean = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
  if (clean.length === 0) { res.status(400).json({ error: "No models provided" }); return; }
  await db.insert(partCompatibilityTable)
    .values(clean.map((model) => ({ merchantId, productId, model })))
    .onConflictDoNothing();
  const rows = await db.select().from(partCompatibilityTable)
    .where(eq(partCompatibilityTable.productId, productId)).orderBy(asc(partCompatibilityTable.model));
  res.json({ items: rows.map((r) => ({ id: r.id, model: r.model })) });
});

// DELETE /products/:id/compatibility/:rowId
router.delete("/products/:id/compatibility/:rowId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const productId = Number(req.params.id);
  const rowId = Number(req.params.rowId);
  if (!(await ownProduct(merchantId, productId))) { res.status(404).json({ error: "Product not found" }); return; }
  await db.delete(partCompatibilityTable)
    .where(and(eq(partCompatibilityTable.id, rowId), eq(partCompatibilityTable.productId, productId), eq(partCompatibilityTable.merchantId, merchantId)));
  const rows = await db.select().from(partCompatibilityTable)
    .where(eq(partCompatibilityTable.productId, productId)).orderBy(asc(partCompatibilityTable.model));
  res.json({ items: rows.map((r) => ({ id: r.id, model: r.model })) });
});

export default router;
