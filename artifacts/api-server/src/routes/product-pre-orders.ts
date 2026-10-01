import { Router, type IRouter } from "express";
import { db, productPreOrdersTable, productPreOrderItemsTable, productsTable, transactionsTable, purchaseOrdersTable, purchaseOrderItemsTable, merchantsTable, customersTable } from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { balanceOwing, isPreOrderActive, localDate, preOrderNumber, OPEN_STATUSES, PRE_ORDER_STATUS } from "../lib/pre-orders";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateProductPreOrderParams, DeleteProductPreOrderParams } from "@workspace/api-zod";

const router: IRouter = Router();

type NormalizedItem = { productId: number | null; productName: string; quantity: number; unitPrice: string };

// Read the line items off a request body. Accepts the new `items` array and,
// for backward compatibility, a single flat product (productId/productName/
// quantity) which is treated as a one-line pre-order.
function normalizeItems(body: Record<string, unknown>): NormalizedItem[] {
  const raw = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  let items = raw
    .map((i) => ({
      productId: i.productId ? parseInt(String(i.productId)) : null,
      productName: String(i.productName ?? "").trim(),
      quantity: parseInt(String(i.quantity)) || 1,
      unitPrice: String(parseFloat(String(i.unitPrice)) || 0),
    }))
    .filter((i) => i.productName);
  if (items.length === 0 && body.productName) {
    items = [{
      productId: body.productId ? parseInt(String(body.productId)) : null,
      productName: String(body.productName).trim(),
      quantity: parseInt(String(body.quantity)) || 1,
      unitPrice: String(parseFloat(String(body.unitPrice)) || 0),
    }];
  }
  return items;
}

type SerializedItem = { id: number | null; productId: number | null; productName: string; quantity: number; unitPrice: number };

// Fetch and group items for the given pre-order ids in a single query.
async function itemsByOrder(orderIds: number[]): Promise<Map<number, SerializedItem[]>> {
  const map = new Map<number, SerializedItem[]>();
  if (orderIds.length === 0) return map;
  const rows = await db
    .select()
    .from(productPreOrderItemsTable)
    .where(inArray(productPreOrderItemsTable.preOrderId, orderIds));
  for (const r of rows) {
    const arr = map.get(r.preOrderId) ?? [];
    arr.push({ id: r.id, productId: r.productId, productName: r.productName, quantity: r.quantity, unitPrice: parseFloat(String(r.unitPrice)) });
    map.set(r.preOrderId, arr);
  }
  return map;
}

type OrderRow = typeof productPreOrdersTable.$inferSelect;

// Shape a pre-order for the API. Legacy rows created before the items table
// existed have no child rows, so synthesize a single item from the flat columns.
function serialize(order: OrderRow, itemsMap: Map<number, SerializedItem[]>, extra: { receiptNumber?: string | null; collectedReceiptNumber?: string | null; customerPhone?: string | null; customerEmail?: string | null } = {}) {
  const stored = itemsMap.get(order.id) ?? [];
  const items: SerializedItem[] = stored.length > 0
    ? stored
    : [{ id: null, productId: order.productId, productName: order.productName, quantity: order.quantity, unitPrice: 0 }];
  const paid = parseFloat(String(order.depositAmount)) || 0;
  // Older manual rows have no total recorded: their line prices are it.
  const recorded = parseFloat(String(order.totalAmount)) || 0;
  const total = recorded > 0 ? recorded : items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return {
    ...order,
    depositAmount: paid,
    totalAmount: Math.round(total * 100) / 100,
    balanceOwing: balanceOwing(total, paid),
    items,
    receiptNumber: extra.receiptNumber ?? null,
    collectedReceiptNumber: extra.collectedReceiptNumber ?? null,
    customerPhone: extra.customerPhone ?? null,
    customerEmail: extra.customerEmail ?? null,
  };
}

/** Receipt numbers of the sales that opened / collected these pre-orders, and the customers' contact details. */
async function extrasFor(rows: OrderRow[], merchantId: number) {
  const txIds = [...new Set(rows.flatMap((r) => [r.transactionId, r.collectedTransactionId]).filter((id): id is number => id != null))];
  const custIds = [...new Set(rows.map((r) => r.customerId).filter((id): id is number => id != null))];
  const [txs, custs] = await Promise.all([
    txIds.length ? db.select({ id: transactionsTable.id, receiptNumber: transactionsTable.receiptNumber }).from(transactionsTable)
      .where(and(eq(transactionsTable.merchantId, merchantId), inArray(transactionsTable.id, txIds))) : [],
    custIds.length ? db.select({ id: customersTable.id, phone: customersTable.phone, email: customersTable.email }).from(customersTable)
      .where(and(eq(customersTable.merchantId, merchantId), inArray(customersTable.id, custIds))) : [],
  ]);
  const receipt = new Map(txs.map((t) => [t.id, t.receiptNumber]));
  const cust = new Map(custs.map((c) => [c.id, c]));
  return (r: OrderRow) => ({
    receiptNumber: r.transactionId ? receipt.get(r.transactionId) ?? null : null,
    collectedReceiptNumber: r.collectedTransactionId ? receipt.get(r.collectedTransactionId) ?? null : null,
    customerPhone: r.customerId ? cust.get(r.customerId)?.phone ?? null : null,
    customerEmail: r.customerId ? cust.get(r.customerId)?.email ?? null : null,
  });
}

router.get("/pre-orders", requireAuth, async (req, res): Promise<void> => {
  const { search, status } = req.query as { search?: string; status?: string };
  const mid = req.session.merchantId!;
  let rows = await db
    .select()
    .from(productPreOrdersTable)
    .where(eq(productPreOrdersTable.merchantId, mid))
    .orderBy(desc(productPreOrdersTable.createdAt));

  if (status) rows = rows.filter((r) => r.status === status);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.poNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q),
    );
  }
  const itemsMap = await itemsByOrder(rows.map((r) => r.id));
  const extra = await extrasFor(rows, mid);
  res.json({
    items: rows.map((r) => serialize(r, itemsMap, extra(r))),
    total: rows.length,
  });
});

/**
 * Products on pre-order (the switch on), with where each stands: how many
 * units customers have pre-ordered and are still waiting on, how many are
 * already set aside for them, and how many are on purchase orders not yet
 * received. `active` is false once the release date has passed.
 */
router.get("/pre-orders/products", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const [m] = await db.select({ timezone: merchantsTable.timezone }).from(merchantsTable).where(eq(merchantsTable.id, mid));
  const today = localDate(m?.timezone);
  const products = await db.select({
    id: productsTable.id, name: productsTable.name, sku: productsTable.sku, price: productsTable.price,
    stockQuantity: productsTable.stockQuantity, imageUrl: productsTable.imageUrl,
    preOrder: productsTable.preOrder, preOrderReleaseDate: productsTable.preOrderReleaseDate, preOrderEtaDate: productsTable.preOrderEtaDate,
  }).from(productsTable).where(and(eq(productsTable.merchantId, mid), eq(productsTable.preOrder, "true")));
  const ids = products.map((p) => p.id);
  const [demand, onOrder] = ids.length === 0 ? [[], []] : await Promise.all([
    db.select({
      productId: productPreOrderItemsTable.productId,
      waiting: sql<number>`coalesce(sum(${productPreOrderItemsTable.quantity}), 0)::int`,
      allocated: sql<number>`coalesce(sum(least(${productPreOrdersTable.allocatedQuantity}, ${productPreOrderItemsTable.quantity})), 0)::int`,
      orders: sql<number>`count(distinct ${productPreOrdersTable.id})::int`,
    }).from(productPreOrderItemsTable)
      .innerJoin(productPreOrdersTable, eq(productPreOrdersTable.id, productPreOrderItemsTable.preOrderId))
      .where(and(eq(productPreOrdersTable.merchantId, mid), inArray(productPreOrdersTable.status, [...OPEN_STATUSES]), inArray(productPreOrderItemsTable.productId, ids)))
      .groupBy(productPreOrderItemsTable.productId),
    db.select({
      productId: purchaseOrderItemsTable.productId,
      onOrder: sql<number>`coalesce(sum(greatest(${purchaseOrderItemsTable.quantity} - ${purchaseOrderItemsTable.received}, 0)), 0)::int`,
    }).from(purchaseOrderItemsTable)
      .innerJoin(purchaseOrdersTable, eq(purchaseOrdersTable.id, purchaseOrderItemsTable.poId))
      .where(and(eq(purchaseOrdersTable.merchantId, mid), inArray(purchaseOrdersTable.status, ["Draft", "Ordered", "Sent", "Partial", "Partially Received"]), inArray(purchaseOrderItemsTable.productId, ids)))
      .groupBy(purchaseOrderItemsTable.productId),
  ]);
  const d = new Map(demand.map((r) => [r.productId, r]));
  const o = new Map(onOrder.map((r) => [r.productId, r.onOrder]));
  res.json(products.map((p) => ({
    ...p,
    price: parseFloat(p.price),
    active: isPreOrderActive(p, today),
    openOrders: d.get(p.id)?.orders ?? 0,
    unitsWaiting: d.get(p.id)?.waiting ?? 0,
    unitsAllocated: d.get(p.id)?.allocated ?? 0,
    unitsOnOrder: o.get(p.id) ?? 0,
  })).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)));
});

router.post("/pre-orders", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const { customerId, customerName, depositAmount, status, expectedDate, notes } = req.body;
  if (!customerName) { res.status(400).json({ error: "customerName is required" }); return; }
  const items = normalizeItems(req.body);
  if (items.length === 0) { res.status(400).json({ error: "At least one product is required" }); return; }
  const first = items[0];

  // Numbered from the row's own id (set just after insert) so two created at
  // once can't take the same number, as max+1 could.
  const poNumber = "PRE-…";
  const total = items.reduce((s, i) => s + (parseFloat(i.unitPrice) || 0) * i.quantity, 0);

  const order = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(productPreOrdersTable)
      .values({
        merchantId: mid,
        poNumber,
        customerId: customerId ? parseInt(String(customerId)) : null,
        customerName,
        // Mirror the first line into the legacy flat columns.
        productId: first.productId,
        productName: first.productName,
        quantity: first.quantity,
        depositAmount: String(parseFloat(String(depositAmount)) || 0),
        status: status ?? PRE_ORDER_STATUS.awaiting,
        expectedDate: expectedDate ?? null,
        notes: notes ?? null,
        totalAmount: total.toFixed(2),
      })
      .returning();
    await tx.update(productPreOrdersTable).set({ poNumber: preOrderNumber(created.id) }).where(eq(productPreOrdersTable.id, created.id));
    created.poNumber = preOrderNumber(created.id);
    await tx.insert(productPreOrderItemsTable).values(
      items.map((i) => ({ preOrderId: created.id, productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
    );
    return created;
  });

  const itemsMap = await itemsByOrder([order.id]);
  res.status(201).json(serialize(order, itemsMap, (await extrasFor([order], mid))(order)));
});

router.patch("/pre-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateProductPreOrderParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const mid = req.session.merchantId!;
  const { customerId, customerName, depositAmount, status, expectedDate, notes } = req.body;

  // Items are replaced whole when an `items` array (or a legacy flat product) is
  // supplied; a partial update that omits them leaves the existing items intact.
  const itemsProvided = Array.isArray(req.body.items) || req.body.productName !== undefined;
  let items: NormalizedItem[] = [];
  if (itemsProvided) {
    items = normalizeItems(req.body);
    if (items.length === 0) { res.status(400).json({ error: "At least one product is required" }); return; }
  }

  const [existing] = await db
    .select({ id: productPreOrdersTable.id })
    .from(productPreOrdersTable)
    .where(and(eq(productPreOrdersTable.id, id), eq(productPreOrdersTable.merchantId, mid)));
  if (!existing) { res.status(404).json({ error: "Pre-order not found" }); return; }

  const setFields: Record<string, unknown> = {
    ...(customerId !== undefined && { customerId: customerId ? parseInt(String(customerId)) : null }),
    ...(customerName !== undefined && { customerName }),
    ...(depositAmount !== undefined && { depositAmount: String(parseFloat(String(depositAmount)) || 0) }),
    ...(status !== undefined && { status }),
    ...((status === PRE_ORDER_STATUS.collected || status === PRE_ORDER_STATUS.shipped) && { collectedAt: new Date() }),
    ...(status === PRE_ORDER_STATUS.arrived && { arrivedAt: new Date() }),
    ...(expectedDate !== undefined && { expectedDate }),
    ...(notes !== undefined && { notes }),
  };
  if (itemsProvided) {
    // Keep the legacy flat columns mirroring the first line.
    setFields.productId = items[0].productId;
    setFields.productName = items[0].productName;
    setFields.quantity = items[0].quantity;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(setFields).length > 0) {
      await tx
        .update(productPreOrdersTable)
        .set(setFields)
        .where(and(eq(productPreOrdersTable.id, id), eq(productPreOrdersTable.merchantId, mid)));
    }
    if (itemsProvided) {
      await tx.delete(productPreOrderItemsTable).where(eq(productPreOrderItemsTable.preOrderId, id));
      await tx.insert(productPreOrderItemsTable).values(
        items.map((i) => ({ preOrderId: id, productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
      );
    }
  });

  const [order] = await db
    .select()
    .from(productPreOrdersTable)
    .where(and(eq(productPreOrdersTable.id, id), eq(productPreOrdersTable.merchantId, mid)));
  const itemsMap = await itemsByOrder([id]);
  res.json(serialize(order, itemsMap, (await extrasFor([order], mid))(order)));
});

router.delete("/pre-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteProductPreOrderParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const mid = req.session.merchantId!;
  await db.transaction(async (tx) => {
    // Child rows first — they FK-reference the parent.
    await tx.delete(productPreOrderItemsTable).where(eq(productPreOrderItemsTable.preOrderId, id));
    await tx.delete(productPreOrdersTable).where(
      and(eq(productPreOrdersTable.id, id), eq(productPreOrdersTable.merchantId, mid)),
    );
  });
  res.sendStatus(204);
});

export default router;
