import { Router, type IRouter } from "express";
import { db, laybysTable, laybyPaymentsTable, customersTable, productsTable } from "@workspace/db";
import { eq, and, desc, ilike, or, sql, count, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";
import { getPassOnSurchargeMap, surchargeForLeg } from "../services/surcharges";
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
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ── Layby stock + customer-spend side effects ───────────────────────────────
 * A completed layby is treated like a POS sale / paid invoice: it deducts stock
 * for each product-linked line item and rolls its total into the customer's
 * lifetime spend + visit count. Both are reversed if the layby later leaves the
 * completed state (cancelled / re-opened) so the figures never drift. Layby
 * line items always carry a real productId. */
interface LaybyStockLine { productId?: number | null; quantity?: number | null }

/** Snapshot each product-linked layby line item's cost price (server-authoritative)
 *  so completed-layby COGS reflects cost at sale, not the product's later cost. */
async function snapshotLaybyItemCosts(merchantId: number, items: unknown): Promise<unknown> {
  if (!Array.isArray(items)) return items;
  const arr = items as Array<Record<string, unknown>>;
  const ids = [...new Set(arr.map((l) => l.productId).filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0))];
  if (ids.length === 0) return items;
  const rows = await db
    .select({ id: productsTable.id, costPrice: productsTable.costPrice })
    .from(productsTable)
    .where(and(inArray(productsTable.id, ids), eq(productsTable.merchantId, merchantId)));
  const costById = new Map(rows.map((r) => [r.id, r.costPrice != null ? parseFloat(r.costPrice) : NaN]));
  return arr.map((l) => {
    const pid = l.productId;
    if (typeof pid === "number" && costById.has(pid)) {
      const c = costById.get(pid)!;
      if (Number.isFinite(c)) return { ...l, costPrice: c };
    }
    return l;
  });
}

function aggregateQtyByProduct(items: unknown): Map<number, number> {
  const map = new Map<number, number>();
  if (!Array.isArray(items)) return map;
  for (const it of items as LaybyStockLine[]) {
    const pid = it?.productId;
    if (typeof pid === "number" && pid > 0) {
      map.set(pid, (map.get(pid) ?? 0) + (Number(it.quantity) || 0));
    }
  }
  return map;
}

/** Apply a stock movement for a layby's line items. `direction` is -1 to deduct
 *  (layby became completed) or +1 to restore (layby left completed). */
async function applyLaybyStock(tx: DbExecutor, merchantId: number, items: unknown, direction: -1 | 1): Promise<void> {
  for (const [productId, qty] of aggregateQtyByProduct(items)) {
    if (qty <= 0) continue;
    const [product] = await tx
      .select({ stockQuantity: productsTable.stockQuantity, trackInventory: productsTable.trackInventory })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)))
      .for("update");
    if (product?.trackInventory !== "true") continue;
    const newQty = Math.max(0, product.stockQuantity + direction * qty);
    await tx.update(productsTable).set({ stockQuantity: newQty }).where(eq(productsTable.id, productId));
  }
}

/** Roll a layby total into (or back out of) a customer's lifetime spend.
 *  `sign` is +1 when the layby completes, -1 when it leaves completed. */
async function applyLaybyCustomerSpend(tx: DbExecutor, merchantId: number, customerId: number | null, total: number, sign: 1 | -1): Promise<void> {
  if (!customerId || total <= 0) return;
  await tx
    .update(customersTable)
    .set({
      totalSpent: sql`GREATEST(0, ${customersTable.totalSpent} + ${sign * total})`,
      visitCount: sql`GREATEST(0, ${customersTable.visitCount} + ${sign})`,
    })
    .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId)));
}

/** Apply the stock + customer-spend effects for a layby entering the completed
 *  state (deduct stock, credit customer spend). Completion is terminal — a
 *  completed layby cannot be cancelled or re-opened — so there is no reversal. */
async function applyLaybyCompletion(
  tx: DbExecutor,
  merchantId: number,
  layby: { items: unknown; customerId: number | null; totalAmount: string | number | null },
): Promise<void> {
  const total = typeof layby.totalAmount === "number" ? layby.totalAmount : parseFloat((layby.totalAmount as string) ?? "0");
  await applyLaybyStock(tx, merchantId, layby.items, -1);
  await applyLaybyCustomerSpend(tx, merchantId, layby.customerId, total, 1);
}

function fmtLayby(l: LaybyRow, customer?: CustomerRow | null) {
  const total = parseFloat(l.totalAmount as string);
  const paid = parseFloat(l.amountPaid as string);
  return {
    id: l.id,
    reference: l.reference,
    customerId: l.customerId ?? null,
    customerName: customer
      ? customerDisplayName(customer.firstName, customer.lastName, customer.company)
      : null,
    staffId: l.staffId ?? null,
    items: Array.isArray(l.items) ? l.items : [],
    totalAmount: total,
    depositAmount: parseFloat(l.depositAmount as string),
    amountPaid: paid,
    balance: Math.max(0, total - paid),
    status: l.status,
    dueDate: l.dueDate ?? null,
    notes: l.notes ?? null,
    cancelReason: l.cancelReason ?? null,
    completedAt: l.completedAt ? l.completedAt.toISOString() : null,
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

  if (customerId !== undefined && isNaN(parseInt(customerId, 10))) { res.status(400).json({ error: "Invalid customerId" }); return; }
  if (isNaN(parseInt(limit, 10))) { res.status(400).json({ error: "Invalid limit" }); return; }
  if (isNaN(parseInt(offset, 10))) { res.status(400).json({ error: "Invalid offset" }); return; }

  const conditions = [eq(laybysTable.merchantId, merchantId)];
  if (status) conditions.push(eq(laybysTable.status, status));
  if (customerId) conditions.push(eq(laybysTable.customerId, parseInt(customerId, 10)));

  const rows = await db
    .select({
      layby: laybysTable,
      customer: customersTable,
    })
    .from(laybysTable)
    .leftJoin(customersTable, eq(laybysTable.customerId, customersTable.id))
    .where(and(...conditions))
    .orderBy(desc(laybysTable.createdAt))
    .limit(parseInt(limit, 10))
    .offset(parseInt(offset, 10));

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
  const { customerId, staffId, items, totalAmount, depositAmount, dueDate, notes, paymentMethod } = req.body;

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
  // A deposit covering the full amount completes the layby immediately, which
  // (like a POS sale) deducts stock and rolls into the customer's spend.
  const completedOnCreate = depositAmount >= totalAmount;
  const itemsWithCost = await snapshotLaybyItemCosts(merchantId, items);
  // Pass-on surcharge on the deposit, collected on top of it, when the deposit's
  // payment method passes its acceptance cost to the customer.
  const depositSurchargeMap = await getPassOnSurchargeMap(merchantId);
  const depositSurcharge = surchargeForLeg(depositSurchargeMap, paymentMethod ?? "cash", depositAmount);

  const layby = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(laybysTable)
      .values({
        merchantId,
        customerId: customerId ?? null,
        staffId: typeof staffId === "number" ? staffId : null,
        reference,
        items: itemsWithCost,
        totalAmount: String(totalAmount),
        depositAmount: String(depositAmount),
        amountPaid: String(depositAmount),
        status: completedOnCreate ? "completed" : "active",
        completedAt: completedOnCreate ? new Date() : null,
        dueDate: dueDate ?? null,
        notes: notes ?? null,
      })
      .returning();

    if (depositAmount > 0) {
      await tx.insert(laybyPaymentsTable).values({
        laybyId: created.id,
        amount: String(depositAmount),
        paymentMethod: paymentMethod ?? "cash",
        surchargeAmount: String(depositSurcharge),
        note: "Initial deposit",
      });
    }

    if (completedOnCreate) {
      await applyLaybyCompletion(tx, merchantId, created);
    }
    return created;
  });

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

  // A direct status change can complete a layby (which drives stock + customer
  // spend) — compute it atomically under a row lock. Completion is terminal:
  // a completed layby cannot be moved back to active/cancelled here.
  const result = await db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(laybysTable)
      .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)))
      .for("update");
    if (!cur) return { error: 404 as const };

    const wasCompleted = cur.status === "completed";
    const willComplete = status !== undefined && status === "completed";
    if (wasCompleted && status !== undefined && status !== "completed") {
      return { error: 400 as const };
    }

    const updates: Partial<typeof laybysTable.$inferInsert> = { updatedAt: new Date() };
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) {
      updates.status = status;
      if (!wasCompleted && willComplete) updates.completedAt = new Date();
    }

    const [row] = await tx
      .update(laybysTable)
      .set(updates)
      .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)))
      .returning();

    if (!wasCompleted && willComplete) await applyLaybyCompletion(tx, merchantId, cur);
    return { row };
  });

  if (result.error === 404) { res.status(404).json({ error: "Layby not found" }); return; }
  if (result.error === 400) { res.status(400).json({ error: "Cannot change the status of a completed layby" }); return; }
  const updated = result.row!;

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
  const { amount, paymentMethod, payments, note } = req.body ?? {};

  // Normalise to a list of payment legs. A split payment supplies `payments`
  // (each method + amount, recorded as its own layby_payments row so reporting
  // attributes each leg to its method); a single payment is one leg.
  const isSplit = Array.isArray(payments) && payments.length > 0;
  const legs: { amount: number; paymentMethod: string }[] = isSplit
    ? payments.map((p: { amount?: unknown; method?: unknown }) => ({ amount: Number(p.amount), paymentMethod: typeof p.method === "string" && p.method ? p.method : "cash" }))
    : [{ amount: Number(amount), paymentMethod: typeof paymentMethod === "string" && paymentMethod ? paymentMethod : "cash" }];
  if (legs.some((l) => !Number.isFinite(l.amount) || l.amount <= 0)) {
    res.status(400).json({ error: "Invalid payment amount" });
    return;
  }
  const payTotal = legs.reduce((s, l) => s + l.amount, 0);

  // Pass-on surcharge per leg, collected on top of the amount applied to the
  // balance. Config is merchant-global, so read once outside the lock.
  const surchargeMap = await getPassOnSurchargeMap(merchantId);

  // Lock the row, record the payment leg(s), and — if this payment settles the
  // layby in full — complete it (deducting stock + crediting customer spend),
  // all in one transaction so a concurrent payment can't double-apply it.
  const result = await db.transaction(async (tx) => {
    const [layby] = await tx
      .select()
      .from(laybysTable)
      .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)))
      .for("update");

    if (!layby) return { error: 404 as const };
    if (layby.status !== "active") return { error: 400 as const };

    await tx.insert(laybyPaymentsTable).values(
      legs.map((l) => ({
        laybyId: id,
        amount: String(l.amount),
        paymentMethod: l.paymentMethod,
        // Single-method payments only (split legs aren't surcharged), matching
        // the POS terminal and what the payment UI collects.
        surchargeAmount: String(isSplit ? 0 : surchargeForLeg(surchargeMap, l.paymentMethod, l.amount)),
        note: note ?? null,
      })),
    );

    const newPaid = parseFloat(layby.amountPaid as string) + payTotal;
    const total = parseFloat(layby.totalAmount as string);
    const nowCompleted = newPaid >= total;

    const [row] = await tx
      .update(laybysTable)
      .set({
        amountPaid: String(newPaid),
        status: nowCompleted ? "completed" : "active",
        completedAt: nowCompleted ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(laybysTable.id, id))
      .returning();

    if (nowCompleted) await applyLaybyCompletion(tx, merchantId, layby);
    return { row };
  });

  if (result.error === 404) { res.status(404).json({ error: "Layby not found" }); return; }
  if (result.error === 400) { res.status(400).json({ error: "Cannot add payments to a non-active layby" }); return; }
  const updated = result.row!;

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
  // Completion is terminal — a completed layby (stock already deducted, spend
  // already credited) cannot be cancelled.
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

  // Force-completing a layby settles it like a POS sale: deduct stock, roll the
  // total into customer spend, stamp the completion time — atomically.
  const result = await db.transaction(async (tx) => {
    const [layby] = await tx
      .select()
      .from(laybysTable)
      .where(and(eq(laybysTable.id, id), eq(laybysTable.merchantId, merchantId)))
      .for("update");

    if (!layby) return { error: 404 as const };
    if (layby.status !== "active") return { error: 400 as const };

    const [row] = await tx
      .update(laybysTable)
      .set({
        status: "completed",
        amountPaid: layby.totalAmount,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(laybysTable.id, id))
      .returning();

    await applyLaybyCompletion(tx, merchantId, layby);
    return { row };
  });

  if (result.error === 404) { res.status(404).json({ error: "Layby not found" }); return; }
  if (result.error === 400) { res.status(400).json({ error: "Only active laybys can be completed" }); return; }
  const updated = result.row!;

  let customer: CustomerRow | undefined;
  if (updated.customerId) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, updated.customerId));
    customer = c;
  }

  res.json(fmtLayby(updated, customer));
});

export default router;
