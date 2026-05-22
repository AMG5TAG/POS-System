import { Router, type IRouter } from "express";
import { db, transactionsTable, customersTable, productsTable, serviceJobsTable, appointmentsTable, loyaltySettingsTable } from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListTransactionsQueryParams,
  CreateTransactionBody,
  GetTransactionParams,
  RefundTransactionParams,
  RefundTransactionBody,
  DeleteTransactionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatTransaction(t: typeof transactionsTable.$inferSelect, customer?: typeof customersTable.$inferSelect | null) {
  return {
    id: t.id,
    merchantId: t.merchantId,
    customerId: t.customerId ?? null,
    customer: customer
      ? {
          id: customer.id,
          merchantId: customer.merchantId,
          firstName: customer.firstName ?? null,
          lastName: customer.lastName ?? null,
          email: customer.email ?? null,
          phone: customer.phone ?? null,
          address: customer.address ?? null,
          notes: customer.notes ?? null,
          loyaltyPoints: customer.loyaltyPoints,
          totalSpent: parseFloat(customer.totalSpent),
          visitCount: customer.visitCount,
          createdAt: customer.createdAt.toISOString(),
        }
      : undefined,
    staffId: t.staffId ?? null,
    receiptNumber: t.receiptNumber,
    status: t.status,
    subtotal: parseFloat(t.subtotal),
    taxTotal: parseFloat(t.taxTotal),
    discountTotal: parseFloat(t.discountTotal),
    total: parseFloat(t.total),
    paymentMethod: t.paymentMethod,
    amountTendered: t.amountTendered ? parseFloat(t.amountTendered) : null,
    changeDue: t.changeDue ? parseFloat(t.changeDue) : null,
    notes: t.notes ?? null,
    loyaltyEarned: t.loyaltyEarned ? parseFloat(t.loyaltyEarned) : null,
    items: Array.isArray(t.items) ? t.items : [],
    createdAt: t.createdAt.toISOString(),
  };
}

function generateReceiptNumber(prefix = "KR", digits = 5): string {
  const n = Math.floor(Math.random() * Math.pow(10, digits));
  return `${prefix}${String(n).padStart(digits, "0")}`;
}

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListTransactionsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { limit = 50, offset = 0, status } = queryParams.data;

  const conditions = [eq(transactionsTable.merchantId, req.session.merchantId!)];
  if (status) conditions.push(eq(transactionsTable.status, status));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(and(...conditions));

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(transactionsTable.createdAt));

  const customerIds = [...new Set(transactions.filter((t) => t.customerId).map((t) => t.customerId!))];
  const customerMap = new Map<number, typeof customersTable.$inferSelect>();
  if (customerIds.length > 0) {
    const customers = await db
      .select()
      .from(customersTable)
      .where(and(inArray(customersTable.id, customerIds), eq(customersTable.merchantId, req.session.merchantId!)));
    customers.forEach((c) => customerMap.set(c.id, c));
  }

  res.json({
    items: transactions.map((t) => formatTransaction(t, t.customerId ? customerMap.get(t.customerId) : null)),
    total: Number(countResult.count),
  });
});

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { subtotal, taxTotal, discountTotal = 0, total, amountTendered, changeDue, items, customerId, staffId, paymentMethod, notes, loyaltyEarned, receiptNumber: providedReceiptNumber } = parsed.data;

  // Tenant isolation: any provided customerId must belong to this merchant.
  let scopedCustomer: typeof customersTable.$inferSelect | null = null;
  if (customerId != null) {
    const [c] = await db
      .select()
      .from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, req.session.merchantId!)));
    if (!c) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    scopedCustomer = c;
  }

  // Loyalty payment invariants — enforced server-side, not just in the UI.
  // Use ceil so a fractional total like $10.99 requires 11 points, never 10.
  const requiredLoyaltyPoints = Math.max(0, Math.ceil(total));
  if (paymentMethod === "loyalty") {
    if (!scopedCustomer) {
      res.status(400).json({ error: "Loyalty payments require a customer" });
      return;
    }
    if (requiredLoyaltyPoints > scopedCustomer.loyaltyPoints) {
      res.status(400).json({ error: "Insufficient loyalty balance" });
      return;
    }
  }

  // Sanitize loyaltyEarned BEFORE persisting so the stored transaction
  // record matches what the customer balance is credited with. Never trust
  // the client value blindly.
  let sanitizedEarned = 0;
  if (scopedCustomer && paymentMethod !== "loyalty" && loyaltyEarned != null) {
    const [loyaltyRow] = await db
      .select({ programType: loyaltySettingsTable.programType, isEnabled: loyaltySettingsTable.isEnabled })
      .from(loyaltySettingsTable)
      .where(eq(loyaltySettingsTable.merchantId, req.session.merchantId!));
    const programType = loyaltyRow?.programType ?? "cashback";
    const isMonetary = programType === "cashback" || programType === "tiered" || programType === "custom";
    const programOn = loyaltyRow?.isEnabled === "true";
    if (programOn && isMonetary) {
      sanitizedEarned = Math.max(0, Math.min(Math.floor(loyaltyEarned), Math.floor(total)));
    }
  }

  const receiptNumber = providedReceiptNumber || generateReceiptNumber();

  // Persist sanitized monetary fields, never raw client input.
  //   - Cash: cashier hands over >= total; we accept the actual tendered
  //     amount (no upper cap) and derive change ourselves. Reject under-tender.
  //   - Loyalty: tender equals the required points (in dollars), change = 0.
  //   - All other methods: force tendered = total, change = 0.
  let persistedTendered: number;
  let persistedChange: number;
  if (paymentMethod === "cash") {
    const cashTendered = Math.max(0, amountTendered ?? total);
    if (cashTendered < total - 0.009) {
      res.status(400).json({ error: "Cash tendered is less than the sale total" });
      return;
    }
    persistedTendered = cashTendered;
    persistedChange = Math.max(0, cashTendered - total);
  } else if (paymentMethod === "loyalty") {
    persistedTendered = requiredLoyaltyPoints;
    persistedChange = 0;
  } else {
    persistedTendered = total;
    persistedChange = 0;
  }
  void changeDue; // client-supplied changeDue is intentionally ignored

  const [transaction] = await db
    .insert(transactionsTable)
    .values({
      merchantId: req.session.merchantId!,
      customerId: customerId ?? null,
      staffId: staffId ?? null,
      receiptNumber,
      status: "completed",
      subtotal: subtotal.toString(),
      taxTotal: taxTotal.toString(),
      discountTotal: discountTotal.toString(),
      total: total.toString(),
      paymentMethod,
      amountTendered: persistedTendered.toString(),
      changeDue: persistedChange.toString(),
      notes: notes ?? null,
      loyaltyEarned: sanitizedEarned > 0 ? sanitizedEarned.toString() : null,
      items,
    })
    .returning();

  // Update inventory for tracked products — one SELECT for all items, then targeted UPDATEs
  if (items.length > 0) {
    const productIds = items.map((i) => i.productId);
    const inventoryProducts = await db
      .select()
      .from(productsTable)
      .where(and(inArray(productsTable.id, productIds), eq(productsTable.merchantId, req.session.merchantId!)));
    const productMap = new Map(inventoryProducts.map((p) => [p.id, p]));
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (product?.trackInventory === "true") {
        await db
          .update(productsTable)
          .set({ stockQuantity: Math.max(0, product.stockQuantity - item.quantity) })
          .where(eq(productsTable.id, item.productId));
      }
    }
  }

  // Update customer stats atomically using values sanitized above.
  if (scopedCustomer) {
    const redeemed = paymentMethod === "loyalty" ? requiredLoyaltyPoints : 0;
    const loyaltyDelta = paymentMethod === "loyalty"
      ? sql`GREATEST(0, ${customersTable.loyaltyPoints} - ${redeemed})`
      : sql`${customersTable.loyaltyPoints} + ${sanitizedEarned}`;
    await db
      .update(customersTable)
      .set({
        totalSpent:    sql`(${customersTable.totalSpent}::numeric + ${total})::text`,
        visitCount:    sql`${customersTable.visitCount} + 1`,
        loyaltyPoints: loyaltyDelta,
      })
      .where(and(eq(customersTable.id, scopedCustomer.id), eq(customersTable.merchantId, req.session.merchantId!)));
  }

  // Auto-complete linked service job or appointment
  if (notes) {
    const serviceMatch = notes.match(/\[Service #([^:]+):/);
    if (serviceMatch) {
      const jobNumber = serviceMatch[1].trim();
      await db
        .update(serviceJobsTable)
        .set({ status: "completed" })
        .where(
          and(
            eq(serviceJobsTable.jobNumber, jobNumber),
            eq(serviceJobsTable.merchantId, req.session.merchantId!),
          ),
        );
    }

    const apptMatch = notes.match(/\[Appt #(\d+):/);
    if (apptMatch) {
      const apptId = parseInt(apptMatch[1], 10);
      await db
        .update(appointmentsTable)
        .set({ status: "completed" })
        .where(
          and(
            eq(appointmentsTable.id, apptId),
            eq(appointmentsTable.merchantId, req.session.merchantId!),
          ),
        );
    }
  }

  res.status(201).json(formatTransaction(transaction));
});

router.get("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [transaction] = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)));
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  let customer = null;
  if (transaction.customerId) {
    const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, transaction.customerId), eq(customersTable.merchantId, req.session.merchantId!)));
    customer = c ?? null;
  }
  res.json(formatTransaction(transaction, customer));
});

router.post("/transactions/:id/refund", requireAuth, async (req, res): Promise<void> => {
  const params = RefundTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RefundTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [transaction] = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)));

  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  const [updated] = await db
    .update(transactionsTable)
    .set({ status: "refunded", notes: parsed.data.reason })
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)))
    .returning();

  res.json(formatTransaction(updated));
});

router.delete("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)));

  if (!existing) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  await db
    .delete(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)));

  res.status(204).send();
});

export default router;
