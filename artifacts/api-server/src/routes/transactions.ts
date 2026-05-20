import { Router, type IRouter } from "express";
import { db, transactionsTable, customersTable, productsTable, serviceJobsTable, appointmentsTable } from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListTransactionsQueryParams,
  CreateTransactionBody,
  GetTransactionParams,
  RefundTransactionParams,
  RefundTransactionBody,
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

function generateReceiptNumber(merchantId: number): string {
  const timestamp = Date.now();
  return `RCP-${merchantId}-${timestamp}`;
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
      .where(inArray(customersTable.id, customerIds));
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

  const { subtotal, taxTotal, discountTotal = 0, total, amountTendered, changeDue, items, customerId, staffId, paymentMethod, notes, loyaltyEarned } = parsed.data;

  const receiptNumber = generateReceiptNumber(req.session.merchantId!);

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
      amountTendered: amountTendered?.toString(),
      changeDue: changeDue?.toString(),
      notes: notes ?? null,
      loyaltyEarned: loyaltyEarned?.toString() ?? null,
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

  // Update customer stats atomically — no pre-fetch needed
  if (customerId) {
    await db
      .update(customersTable)
      .set({
        totalSpent:    sql`(${customersTable.totalSpent}::numeric + ${total})::text`,
        visitCount:    sql`${customersTable.visitCount} + 1`,
        loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${Math.floor(total)}`,
      })
      .where(eq(customersTable.id, customerId));
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
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, transaction.customerId));
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
    .where(eq(transactionsTable.id, params.data.id))
    .returning();

  res.json(formatTransaction(updated));
});

export default router;
