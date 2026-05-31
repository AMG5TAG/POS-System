import { Router, type IRouter } from "express";
import { db, laybysTable, laybyPaymentsTable, customersTable } from "@workspace/db";
import { eq, and, desc, ilike, or, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  GetLaybyParams,
  UpdateLaybyParams,
  ListLaybyPaymentsParams,
  AddLaybyPaymentParams,
  CancelLaybyParams,
  CompleteLaybyParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type LaybyRow = typeof laybysTable.$inferSelect;
type CustomerRow = typeof customersTable.$inferSelect;

function fmtLayby(l: LaybyRow, customer?: CustomerRow | null) {
  const total = parseFloat(l.totalAmount as string);
  const paid = parseFloat(l.amountPaid as string);
  return {
    id: l.id,
    reference: l.reference,
    customerId: l.customerId ?? null,
    customerName: customer
      ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || null
      : null,
    items: Array.isArray(l.items) ? l.items : [],
    totalAmount: total,
    depositAmount: parseFloat(l.depositAmount as string),
    amountPaid: paid,
    balance: Math.max(0, total - paid),
    status: l.status,
    dueDate: l.dueDate ?? null,
    notes: l.notes ?? null,
    cancelReason: l.cancelReason ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

async function generateReference(merchantId: number): Promise<string> {
  const [row] = await db
    .select({ cnt: count() })
    .from(laybysTable)
    .where(eq(laybysTable.merchantId, merchantId));
  const num = (row?.cnt ?? 0) + 1;
  return `LB-${String(num).padStart(4, "0")}`;
}

// GET /laybys
router.get("/laybys", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { status, customerId, search, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const conditions = [eq(laybysTable.merchantId, merchantId)];
  if (status) conditions.push(eq(laybysTable.status, status));
  if (customerId) conditions.push(eq(laybysTable.customerId, parseInt(customerId)));

  const rows = await db
    .select({
      layby: laybysTable,
      customer: customersTable,
    })
    .from(laybysTable)
    .leftJoin(customersTable, eq(laybysTable.customerId, customersTable.id))
    .where(and(...conditions))
    .orderBy(desc(laybysTable.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const [{ total }] = await db
    .select({ total: count() })
    .from(laybysTable)
    .where(and(...conditions));

  let items = rows.map((r) => fmtLayby(r.layby, r.customer));

  if (search) {
    const q = search.toLowerCase();
    items = items.filter(
      (l) =>
        l.reference.toLowerCase().includes(q) ||
        (l.customerName ?? "").toLowerCase().includes(q)
    );
  }

  res.json({ items, total });
});

// POST /laybys
router.post("/laybys", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { customerId, items, totalAmount, depositAmount, dueDate, notes, paymentMethod } = req.body;

  if (!items?.length) {
    res.status(400).json({ error: "At least one item is required" });
    return;
  }
  if (typeof totalAmount !== "number" || totalAmount <= 0) {
    res.status(400).json({ error: "Invalid total amount" });
    return;
  }
  if (typeof depositAmount !== "number" || depositAmount < 0) {
    res.status(400).json({ error: "Invalid deposit amount" });
    return;
  }

  const reference = await generateReference(merchantId);

  const [layby] = await db
    .insert(laybysTable)
    .values({
      merchantId,
      customerId: customerId ?? null,
      reference,
      items,
      totalAmount: String(totalAmount),
      depositAmount: String(depositAmount),
      amountPaid: String(depositAmount),
      status: depositAmount >= totalAmount ? "completed" : "active",
      dueDate: dueDate ?? null,
      notes: notes ?? null,
    })
    .returning();

  if (depositAmount > 0) {
    await db.insert(laybyPaymentsTable).values({
      laybyId: layby.id,
      amount: String(depositAmount),
      paymentMethod: paymentMethod ?? "cash",
      note: "Initial deposit",
    });
  }

  let customer: CustomerRow | undefined;
  if (customerId) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
    customer = c;
  }

  res.status(201).json(fmtLayby(layby, customer));
});

// GET /laybys/:id
router.get("/laybys/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const paramsResult = GetLaybyParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;

  const [row] = await db
    .select({ layby: laybysTable, customer: customersTable })
    .from(laybysTable)
    .leftJoin(customersTable, eq(laybysTable.customerId, customersTable.id))
    .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)));

  if (!row) {
    res.status(404).json({ error: "Layby not found" });
    return;
  }

  res.json(fmtLayby(row.layby, row.customer));
});

// PATCH /laybys/:id
router.patch("/laybys/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const paramsResult = UpdateLaybyParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const { dueDate, notes, status } = req.body;

  const updates: Partial<typeof laybysTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (notes !== undefined) updates.notes = notes;
  if (status !== undefined) updates.status = status;

  const [updated] = await db
    .update(laybysTable)
    .set(updates)
    .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Layby not found" });
    return;
  }

  let customer: CustomerRow | undefined;
  if (updated.customerId) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, updated.customerId));
    customer = c;
  }

  res.json(fmtLayby(updated, customer));
});

// GET /laybys/:id/payments
router.get("/laybys/:id/payments", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const paramsResult = ListLaybyPaymentsParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;

  const [layby] = await db
    .select()
    .from(laybysTable)
    .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)));

  if (!layby) {
    res.status(404).json({ error: "Layby not found" });
    return;
  }

  const payments = await db
    .select()
    .from(laybyPaymentsTable)
    .where(eq(laybyPaymentsTable.laybyId, id))
    .orderBy(desc(laybyPaymentsTable.createdAt));

  res.json(
    payments.map((p) => ({
      id: p.id,
      laybyId: p.laybyId,
      amount: parseFloat(p.amount as string),
      paymentMethod: p.paymentMethod,
      note: p.note ?? null,
      createdAt: p.createdAt.toISOString(),
    }))
  );
});

// POST /laybys/:id/payments
router.post("/laybys/:id/payments", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const paramsResult = AddLaybyPaymentParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const { amount, paymentMethod, note } = req.body;

  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "Invalid payment amount" });
    return;
  }

  const [layby] = await db
    .select()
    .from(laybysTable)
    .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)));

  if (!layby) {
    res.status(404).json({ error: "Layby not found" });
    return;
  }
  if (layby.status !== "active") {
    res.status(400).json({ error: "Cannot add payments to a non-active layby" });
    return;
  }

  await db.insert(laybyPaymentsTable).values({
    laybyId: id,
    amount: String(amount),
    paymentMethod: paymentMethod ?? "cash",
    note: note ?? null,
  });

  const newPaid = parseFloat(layby.amountPaid as string) + amount;
  const total = parseFloat(layby.totalAmount as string);
  const newStatus = newPaid >= total ? "completed" : "active";

  const [updated] = await db
    .update(laybysTable)
    .set({
      amountPaid: String(newPaid),
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(laybysTable.id, id))
    .returning();

  let customer: CustomerRow | undefined;
  if (updated.customerId) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, updated.customerId));
    customer = c;
  }

  res.status(201).json(fmtLayby(updated, customer));
});

// POST /laybys/:id/cancel
router.post("/laybys/:id/cancel", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const paramsResult = CancelLaybyParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const { reason } = req.body ?? {};

  const [layby] = await db
    .select()
    .from(laybysTable)
    .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)));

  if (!layby) {
    res.status(404).json({ error: "Layby not found" });
    return;
  }
  if (layby.status === "completed") {
    res.status(400).json({ error: "Cannot cancel a completed layby" });
    return;
  }

  const [updated] = await db
    .update(laybysTable)
    .set({
      status: "cancelled",
      cancelReason: reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(laybysTable.id, id))
    .returning();

  let customer: CustomerRow | undefined;
  if (updated.customerId) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, updated.customerId));
    customer = c;
  }

  res.json(fmtLayby(updated, customer));
});

// POST /laybys/:id/complete
router.post("/laybys/:id/complete", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const paramsResult = CompleteLaybyParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;

  const [layby] = await db
    .select()
    .from(laybysTable)
    .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)));

  if (!layby) {
    res.status(404).json({ error: "Layby not found" });
    return;
  }
  if (layby.status !== "active") {
    res.status(400).json({ error: "Only active laybys can be completed" });
    return;
  }

  const [updated] = await db
    .update(laybysTable)
    .set({
      status: "completed",
      amountPaid: layby.totalAmount,
      updatedAt: new Date(),
    })
    .where(eq(laybysTable.id, id))
    .returning();

  let customer: CustomerRow | undefined;
  if (updated.customerId) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, updated.customerId));
    customer = c;
  }

  res.json(fmtLayby(updated, customer));
});

export default router;
