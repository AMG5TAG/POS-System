import { Router, type IRouter } from "express";
import { db, cashDrawerEntriesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListCashDrawerEntriesQueryParams,
  CreateCashDrawerEntryBody,
  DeleteCashDrawerEntryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function fmt(e: typeof cashDrawerEntriesTable.$inferSelect) {
  return {
    id: e.id,
    type: e.type,
    amount: parseFloat(e.amount),
    note: e.note ?? null,
    shiftDate: e.shiftDate,
    createdAt: e.createdAt.toISOString(),
  };
}

// GET /cash-drawer
router.get("/cash-drawer", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const query = ListCashDrawerEntriesQueryParams.parse(req.query);
  const conditions = [eq(cashDrawerEntriesTable.merchantId, merchantId)];
  if (query.date) {
    conditions.push(eq(cashDrawerEntriesTable.shiftDate, query.date));
  }
  const rows = await db.select().from(cashDrawerEntriesTable)
    .where(and(...conditions))
    .orderBy(desc(cashDrawerEntriesTable.createdAt));
  res.json(rows.map(fmt));
});

// POST /cash-drawer
router.post("/cash-drawer", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = CreateCashDrawerEntryBody.parse(req.body);
  const [row] = await db.insert(cashDrawerEntriesTable).values({
    merchantId,
    type: body.type,
    amount: String(body.amount),
    note: body.note ?? null,
    shiftDate: body.shiftDate,
  }).returning();
  res.status(201).json(fmt(row));
});

// DELETE /cash-drawer/:id
router.delete("/cash-drawer/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = DeleteCashDrawerEntryParams.parse({ id: Number(req.params.id) });
  await db.delete(cashDrawerEntriesTable)
    .where(and(eq(cashDrawerEntriesTable.id, id), eq(cashDrawerEntriesTable.merchantId, merchantId)));
  res.json({ success: true });
});

export default router;
