import { Router, type IRouter } from "express";
import { db, parkedSalesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateParkedSaleBody,
  DeleteParkedSaleParams,
  RestoreParkedSaleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function fmt(s: typeof parkedSalesTable.$inferSelect) {
  return {
    id: s.id,
    reference: s.reference,
    note: s.note ?? null,
    saleNote: s.saleNote ?? null,
    customerId: s.customerId ?? null,
    items: Array.isArray(s.items) ? s.items : [],
    total: parseFloat(String(s.total)),
    createdAt: s.createdAt.toISOString(),
  };
}

// GET /parked-sales
router.get("/parked-sales", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select().from(parkedSalesTable)
    .where(eq(parkedSalesTable.merchantId, merchantId))
    .orderBy(desc(parkedSalesTable.createdAt));
  res.json(rows.map(fmt));
});

// POST /parked-sales
router.post("/parked-sales", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = CreateParkedSaleBody.parse(req.body);
  const reference = body.reference ?? `PARK-${Date.now()}`;
  const [row] = await db.insert(parkedSalesTable).values({
    merchantId,
    reference,
    note: body.note ?? null,
    saleNote: body.saleNote ?? null,
    customerId: body.customerId ?? null,
    items: body.items ?? [],
    total: String(body.total ?? 0),
  }).returning();
  res.status(201).json(fmt(row));
});

// DELETE /parked-sales/:id
router.delete("/parked-sales/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = DeleteParkedSaleParams.parse({ id: Number(req.params.id) });
  await db.delete(parkedSalesTable)
    .where(and(eq(parkedSalesTable.id, id), eq(parkedSalesTable.merchantId, merchantId)));
  res.json({ success: true });
});

// POST /parked-sales/:id/restore — return data then delete
router.post("/parked-sales/:id/restore", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = RestoreParkedSaleParams.parse({ id: Number(req.params.id) });
  const [row] = await db.select().from(parkedSalesTable)
    .where(and(eq(parkedSalesTable.id, id), eq(parkedSalesTable.merchantId, merchantId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(parkedSalesTable)
    .where(and(eq(parkedSalesTable.id, id), eq(parkedSalesTable.merchantId, merchantId)));
  res.json(fmt(row));
});

export default router;
