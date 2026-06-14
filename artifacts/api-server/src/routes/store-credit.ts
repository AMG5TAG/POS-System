import { Router, type IRouter } from "express";
import { db, storeCreditLedgerTable, customersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type Row = typeof storeCreditLedgerTable.$inferSelect;

const TYPES = new Set(["issue", "redeem", "adjust", "refund", "expire"]);

function fmt(row: Row) {
  return {
    id: row.id,
    customerId: row.customerId,
    type: row.type,
    amount: parseFloat(row.amount),
    balanceAfter: parseFloat(row.balanceAfter),
    note: row.note ?? null,
    transactionId: row.transactionId ?? null,
    staffId: row.staffId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function ownCustomer(merchantId: number, customerId: number): Promise<boolean> {
  if (!Number.isFinite(customerId)) return false;
  const [c] = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId))).limit(1);
  return !!c;
}

async function currentBalance(customerId: number): Promise<number> {
  const [r] = await db
    .select({ bal: sql<string>`COALESCE(SUM(${storeCreditLedgerTable.amount}), 0)` })
    .from(storeCreditLedgerTable)
    .where(eq(storeCreditLedgerTable.customerId, customerId));
  return Math.round(parseFloat(r?.bal ?? "0") * 100) / 100;
}

async function balanceAndEntries(customerId: number) {
  const rows = await db.select().from(storeCreditLedgerTable)
    .where(eq(storeCreditLedgerTable.customerId, customerId))
    .orderBy(desc(storeCreditLedgerTable.id));
  const balance = Math.round(rows.reduce((s, r) => s + parseFloat(r.amount), 0) * 100) / 100;
  return { balance, entries: rows.map(fmt) };
}

// GET /customers/:customerId/store-credit — balance + ledger.
router.get("/customers/:customerId/store-credit", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const customerId = Number(req.params.customerId);
  if (!(await ownCustomer(merchantId, customerId))) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(await balanceAndEntries(customerId));
});

// POST /customers/:customerId/store-credit — record a ledger movement.
// body: { type, amount (>0), note?, transactionId? }. The sign is derived from type.
router.post("/customers/:customerId/store-credit", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const customerId = Number(req.params.customerId);
  if (!(await ownCustomer(merchantId, customerId))) { res.status(404).json({ error: "Customer not found" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const type = typeof b.type === "string" && TYPES.has(b.type) ? b.type : null;
  if (!type) { res.status(400).json({ error: "Invalid type" }); return; }
  const rawAmount = Number(b.amount);
  if (!Number.isFinite(rawAmount) || rawAmount === 0) { res.status(400).json({ error: "Amount must be non-zero" }); return; }

  // redeem/expire reduce the balance; issue/refund increase it; adjust uses the
  // caller's sign (positive amount = credit, send a negative amount to debit).
  const magnitude = Math.abs(rawAmount);
  const signed =
    type === "redeem" || type === "expire" ? -magnitude
    : type === "adjust" ? rawAmount
    : magnitude;

  const balance = await currentBalance(customerId);
  if (signed < 0 && balance + signed < -0.0001) {
    res.status(400).json({ error: "Insufficient store credit balance" }); return;
  }
  const balanceAfter = Math.round((balance + signed) * 100) / 100;

  await db.insert(storeCreditLedgerTable).values({
    merchantId,
    customerId,
    type,
    amount: String(signed),
    balanceAfter: String(balanceAfter),
    note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
    transactionId: b.transactionId != null && Number.isFinite(Number(b.transactionId)) ? Number(b.transactionId) : null,
    staffId: req.session.staffId ?? null,
  });
  res.json(await balanceAndEntries(customerId));
});

export default router;
