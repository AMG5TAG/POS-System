import { Router, type IRouter } from "express";
import { db, wastageTable, productsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListWastageQueryParams,
  CreateWastageEntryBody,
  DeleteWastageEntryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function fmt(w: typeof wastageTable.$inferSelect) {
  return {
    id: w.id,
    productId: w.productId ?? null,
    productName: w.productName,
    quantity: parseFloat(String(w.quantity)),
    reason: w.reason,
    cost: w.cost ? parseFloat(w.cost) : null,
    notes: w.notes ?? null,
    staffId: w.staffId ?? null,
    createdAt: w.createdAt.toISOString(),
  };
}

// GET /wastage
router.get("/wastage", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const query = ListWastageQueryParams.parse(req.query);
  const conditions = [eq(wastageTable.merchantId, merchantId)];
  if (query.productId) conditions.push(eq(wastageTable.productId, query.productId));
  const rows = await db.select().from(wastageTable)
    .where(and(...conditions))
    .orderBy(desc(wastageTable.createdAt));
  res.json(rows.map(fmt));
});

// POST /wastage
router.post("/wastage", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = CreateWastageEntryBody.parse(req.body);
  // Default the cost impact from the product's cost price when not supplied, so
  // wastage reporting reflects real cost rather than depending on manual entry.
  let resolvedCost: string | null = body.cost != null ? String(body.cost) : null;
  if (body.productId) {
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, body.productId), eq(productsTable.merchantId, merchantId)));
    if (product) {
      // Reduce stock if the product tracks inventory
      if (product.trackInventory === "true") {
        const newQty = (product.stockQuantity ?? 0) - Math.floor(body.quantity);
        await db.update(productsTable).set({ stockQuantity: Math.max(0, newQty) })
          .where(eq(productsTable.id, body.productId));
      }
      if (resolvedCost == null && product.costPrice != null) {
        const unitCost = parseFloat(product.costPrice);
        if (Number.isFinite(unitCost)) resolvedCost = String(Math.round(unitCost * body.quantity * 100) / 100);
      }
    }
  }
  const [row] = await db.insert(wastageTable).values({
    merchantId,
    productId: body.productId ?? null,
    productName: body.productName,
    quantity: String(body.quantity),
    reason: body.reason,
    cost: resolvedCost,
    notes: body.notes ?? null,
    staffId: body.staffId ?? null,
  }).returning();
  res.status(201).json(fmt(row));
});

// DELETE /wastage/:id
router.delete("/wastage/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = DeleteWastageEntryParams.parse({ id: Number(req.params.id) });
  await db.delete(wastageTable)
    .where(and(eq(wastageTable.id, id), eq(wastageTable.merchantId, merchantId)));
  res.json({ success: true });
});

export default router;
