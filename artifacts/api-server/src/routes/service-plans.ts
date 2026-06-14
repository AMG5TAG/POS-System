import { Router, type IRouter } from "express";
import { db, servicePlansTable, customersTable, invoicesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";

const router: IRouter = Router();

type Row = typeof servicePlansTable.$inferSelect;
const CYCLES = new Set(["weekly", "fortnightly", "monthly", "quarterly", "yearly"]);
const STATUSES = new Set(["active", "paused", "cancelled"]);

function fmt(row: Row, customerName?: string | null) {
  return {
    id: row.id,
    customerId: row.customerId ?? null,
    customerName: customerName ?? null,
    name: row.name,
    feeAmount: parseFloat(row.feeAmount),
    billingCycle: row.billingCycle,
    status: row.status,
    slaHours: row.slaHours ?? null,
    startDate: row.startDate ?? null,
    nextBillDate: row.nextBillDate ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listAll(merchantId: number) {
  const rows = await db.select().from(servicePlansTable)
    .where(eq(servicePlansTable.merchantId, merchantId)).orderBy(desc(servicePlansTable.updatedAt));
  const ids = [...new Set(rows.map((r) => r.customerId).filter((v): v is number => v != null))];
  const map = new Map<number, string | null>();
  if (ids.length) {
    const cs = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId));
    for (const c of cs) map.set(c.id, customerDisplayName(c.firstName, c.lastName, c.company));
  }
  return rows.map((r) => fmt(r, r.customerId ? map.get(r.customerId) : null));
}

/** Advance an ISO date string by one billing cycle. */
function advance(dateStr: string | null, cycle: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (cycle === "weekly") d.setDate(d.getDate() + 7);
  else if (cycle === "fortnightly") d.setDate(d.getDate() + 14);
  else if (cycle === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
}

// GET /service-plans
router.get("/service-plans", requireAuth, async (req, res): Promise<void> => {
  res.json({ items: await listAll(req.session.merchantId!) });
});

// POST /service-plans
router.post("/service-plans", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) { res.status(400).json({ error: "Plan name is required" }); return; }
  const cycle = typeof b.billingCycle === "string" && CYCLES.has(b.billingCycle) ? b.billingCycle : "monthly";
  const start = typeof b.startDate === "string" && b.startDate ? b.startDate : new Date().toISOString().split("T")[0];
  await db.insert(servicePlansTable).values({
    merchantId,
    customerId: b.customerId != null ? Number(b.customerId) : null,
    name,
    feeAmount: String(Number(b.feeAmount) || 0),
    billingCycle: cycle,
    slaHours: b.slaHours != null ? Math.max(0, Math.round(Number(b.slaHours))) : null,
    startDate: start,
    nextBillDate: typeof b.nextBillDate === "string" && b.nextBillDate ? b.nextBillDate : start,
    notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
  });
  res.status(201).json({ items: await listAll(merchantId) });
});

// PUT /service-plans/:id
router.put("/service-plans/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof servicePlansTable.$inferInsert> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (b.feeAmount != null) patch.feeAmount = String(Number(b.feeAmount) || 0);
  if (typeof b.billingCycle === "string" && CYCLES.has(b.billingCycle)) patch.billingCycle = b.billingCycle;
  if (typeof b.status === "string" && STATUSES.has(b.status)) patch.status = b.status;
  if (b.slaHours !== undefined) patch.slaHours = b.slaHours != null ? Math.max(0, Math.round(Number(b.slaHours))) : null;
  if (b.customerId !== undefined) patch.customerId = b.customerId != null ? Number(b.customerId) : null;
  if (typeof b.nextBillDate === "string") patch.nextBillDate = b.nextBillDate || null;
  if (typeof b.notes === "string") patch.notes = b.notes.trim() || null;
  const [updated] = await db.update(servicePlansTable).set(patch)
    .where(and(eq(servicePlansTable.id, id), eq(servicePlansTable.merchantId, merchantId))).returning();
  if (!updated) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({ items: await listAll(merchantId) });
});

// POST /service-plans/:id/bill — generate an invoice for the fee and advance the cycle.
router.post("/service-plans/:id/bill", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  const [plan] = await db.select().from(servicePlansTable)
    .where(and(eq(servicePlansTable.id, id), eq(servicePlansTable.merchantId, merchantId))).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const fee = parseFloat(plan.feeAmount);
  const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(invoicesTable).where(eq(invoicesTable.merchantId, merchantId));
  const invoiceNumber = `INV-${String(Number(countRow.c) + 1).padStart(4, "0")}`;
  // Fee treated as GST-inclusive (10%), matching the quotes/invoices convention.
  const taxTotal = Math.round(fee * (10 / 110) * 100) / 100;

  const [invoice] = await db.insert(invoicesTable).values({
    merchantId,
    customerId: plan.customerId ?? null,
    invoiceNumber,
    status: "sent",
    subtotal: String(Math.round((fee - taxTotal) * 100) / 100),
    taxTotal: String(taxTotal),
    total: String(fee),
    items: [{ description: `${plan.name} — service plan`, quantity: 1, unitPrice: fee, taxRate: 10 }],
    isRecurring: "true",
  }).returning();

  await db.update(servicePlansTable)
    .set({ nextBillDate: advance(plan.nextBillDate, plan.billingCycle) })
    .where(eq(servicePlansTable.id, id));

  res.json({ items: await listAll(merchantId), invoiceId: invoice.id, invoiceNumber });
});

// DELETE /service-plans/:id
router.delete("/service-plans/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  await db.delete(servicePlansTable).where(and(eq(servicePlansTable.id, id), eq(servicePlansTable.merchantId, merchantId)));
  res.json({ items: await listAll(merchantId) });
});

export default router;
