import { Router, type IRouter } from "express";
import { db, productStockTable, productsTable, locationsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function ownProduct(merchantId: number, productId: number) {
  const [p] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId))).limit(1);
  return p ?? null;
}

async function ensureLocations(merchantId: number) {
  const rows = await db.select().from(locationsTable)
    .where(eq(locationsTable.merchantId, merchantId)).orderBy(asc(locationsTable.id));
  if (rows.length > 0) return rows;
  await db.insert(locationsTable).values({ merchantId, name: "Main", isDefault: "true" });
  return db.select().from(locationsTable).where(eq(locationsTable.merchantId, merchantId)).orderBy(asc(locationsTable.id));
}

/** Per-location breakdown for a product. The default location's quantity is
 *  derived as total − sum(non-default rows). */
async function breakdown(merchantId: number, product: typeof productsTable.$inferSelect) {
  const locations = await ensureLocations(merchantId);
  const defaultLoc = locations.find((l) => l.isDefault === "true") ?? locations[0];
  const rows = await db.select().from(productStockTable).where(eq(productStockTable.productId, product.id));
  const qtyByLoc = new Map<number, number>(rows.map((r) => [r.locationId, r.quantity]));
  const total = product.stockQuantity ?? 0;
  const nonDefaultSum = rows.filter((r) => r.locationId !== defaultLoc.id).reduce((s, r) => s + r.quantity, 0);
  return {
    productId: product.id,
    total,
    locations: locations.map((l) => ({
      locationId: l.id,
      name: l.name,
      isDefault: l.isDefault === "true",
      quantity: l.id === defaultLoc.id ? Math.max(0, total - nonDefaultSum) : (qtyByLoc.get(l.id) ?? 0),
    })),
  };
}

// GET /products/:id/stock-by-location
router.get("/products/:id/stock-by-location", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const product = await ownProduct(merchantId, Number(req.params.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(await breakdown(merchantId, product));
});

// POST /stock-transfers — move stock between two locations (total is unchanged).
router.post("/stock-transfers", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const productId = Number(b.productId);
  const fromLocationId = Number(b.fromLocationId);
  const toLocationId = Number(b.toLocationId);
  const quantity = Math.round(Number(b.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) { res.status(400).json({ error: "Quantity must be > 0" }); return; }
  if (fromLocationId === toLocationId) { res.status(400).json({ error: "Pick two different locations" }); return; }

  const product = await ownProduct(merchantId, productId);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const bd = await breakdown(merchantId, product);
  const from = bd.locations.find((l) => l.locationId === fromLocationId);
  const to = bd.locations.find((l) => l.locationId === toLocationId);
  if (!from || !to) { res.status(404).json({ error: "Location not found" }); return; }
  if (from.quantity < quantity) { res.status(409).json({ error: `Only ${from.quantity} in stock at ${from.name}` }); return; }

  // Apply the delta to each NON-default location's stored row; the default
  // location is derived, so it needs no row write.
  const applyDelta = async (locationId: number, isDefault: boolean, delta: number) => {
    if (isDefault) return;
    const [existing] = await db.select().from(productStockTable)
      .where(and(eq(productStockTable.productId, productId), eq(productStockTable.locationId, locationId))).limit(1);
    if (existing) {
      await db.update(productStockTable).set({ quantity: Math.max(0, existing.quantity + delta) })
        .where(eq(productStockTable.id, existing.id));
    } else if (delta > 0) {
      await db.insert(productStockTable).values({ merchantId, productId, locationId, quantity: delta });
    }
  };
  await applyDelta(from.locationId, from.isDefault, -quantity);
  await applyDelta(to.locationId, to.isDefault, +quantity);

  res.json(await breakdown(merchantId, product));
});

export default router;
