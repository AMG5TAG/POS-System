import { Router, type IRouter } from "express";
import { db, productPreOrdersTable, productPreOrderItemsTable } from "@workspace/db";
import { eq, and, desc, max, inArray } from "drizzle-orm";
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
function serialize(order: OrderRow, itemsMap: Map<number, SerializedItem[]>) {
  const stored = itemsMap.get(order.id) ?? [];
  const items: SerializedItem[] = stored.length > 0
    ? stored
    : [{ id: null, productId: order.productId, productName: order.productName, quantity: order.quantity, unitPrice: 0 }];
  return { ...order, depositAmount: parseFloat(String(order.depositAmount)), items };
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
  res.json({
    items: rows.map((r) => serialize(r, itemsMap)),
    total: rows.length,
  });
});

router.post("/pre-orders", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const { customerId, customerName, depositAmount, status, expectedDate, notes } = req.body;
  if (!customerName) { res.status(400).json({ error: "customerName is required" }); return; }
  const items = normalizeItems(req.body);
  if (items.length === 0) { res.status(400).json({ error: "At least one product is required" }); return; }
  const first = items[0];

  const [maxRow] = await db
    .select({ max: max(productPreOrdersTable.id) })
    .from(productPreOrdersTable)
    .where(eq(productPreOrdersTable.merchantId, mid));
  const nextNum = (maxRow?.max ?? 0) + 1;
  const poNumber = `PRE-${String(nextNum).padStart(4, "0")}`;

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
        status: status ?? "Pending",
        expectedDate: expectedDate ?? null,
        notes: notes ?? null,
      })
      .returning();
    await tx.insert(productPreOrderItemsTable).values(
      items.map((i) => ({ preOrderId: created.id, productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
    );
    return created;
  });

  const itemsMap = await itemsByOrder([order.id]);
  res.status(201).json(serialize(order, itemsMap));
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
  res.json(serialize(order, itemsMap));
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
