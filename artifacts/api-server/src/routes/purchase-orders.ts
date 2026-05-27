import { Router, type IRouter } from "express";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, suppliersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListPurchaseOrdersQueryParams,
  CreatePurchaseOrderBody,
  GetPurchaseOrderParams,
  UpdatePurchaseOrderParams,
  UpdatePurchaseOrderBody,
  DeletePurchaseOrderParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type PORow = typeof purchaseOrdersTable.$inferSelect;
type POItemRow = typeof purchaseOrderItemsTable.$inferSelect;

function fmtItem(i: POItemRow) {
  return {
    id: i.id,
    productId: i.productId ?? null,
    productName: i.productName,
    quantity: i.quantity,
    received: i.received,
    unitCost: parseFloat(i.unitCost),
    notes: i.notes ?? null,
  };
}

function fmtPO(po: PORow, items: POItemRow[] = [], supplierName?: string | null) {
  return {
    id: po.id,
    supplierId: po.supplierId ?? null,
    supplierName: supplierName ?? null,
    poNumber: po.poNumber,
    orderNumber: po.orderNumber ?? null,
    status: po.status,
    orderDate: po.orderDate,
    expectedDate: po.expectedDate ?? null,
    receivedDate: po.receivedDate ?? null,
    notes: po.notes ?? null,
    totalCost: parseFloat(po.totalCost),
    deliveryCharge: parseFloat(po.deliveryCharge ?? "0"),
    deliveryTaxMode: po.deliveryTaxMode ?? "exclusive",
    items: items.map(fmtItem),
    createdAt: po.createdAt.toISOString(),
  };
}

async function getPOWithItems(id: number, merchantId: number) {
  const [po] = await db.select().from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
  if (!po) return null;
  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
  let supplierName: string | null = null;
  if (po.supplierId) {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, po.supplierId));
    supplierName = s?.name ?? null;
  }
  return fmtPO(po, items, supplierName);
}

// GET /purchase-orders
router.get("/purchase-orders", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const query = ListPurchaseOrdersQueryParams.parse(req.query);
  const conditions = [eq(purchaseOrdersTable.merchantId, merchantId)];
  if (query.status) conditions.push(eq(purchaseOrdersTable.status, query.status));
  const pos = await db.select().from(purchaseOrdersTable)
    .where(and(...conditions))
    .orderBy(desc(purchaseOrdersTable.createdAt));
  const results = await Promise.all(pos.map(async (po) => {
    const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, po.id));
    let supplierName: string | null = null;
    if (po.supplierId) {
      const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, po.supplierId));
      supplierName = s?.name ?? null;
    }
    return fmtPO(po, items, supplierName);
  }));
  res.json(results);
});

// POST /purchase-orders
router.post("/purchase-orders", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = CreatePurchaseOrderBody.parse(req.body);
  const poNumber = body.poNumber ?? `PO-${Date.now()}`;
  const itemsSubtotal = (body.items ?? []).reduce((s, i) => s + (i.quantity ?? 1) * (i.unitCost ?? 0), 0);
  const deliveryCharge = body.deliveryCharge ?? 0;
  const deliveryTaxMode = body.deliveryTaxMode ?? "exclusive";
  const deliveryGross = deliveryTaxMode === "exclusive" ? deliveryCharge * 1.1 : deliveryCharge;
  const totalCost = itemsSubtotal + deliveryGross;
  const [po] = await db.insert(purchaseOrdersTable).values({
    merchantId,
    supplierId: body.supplierId ?? null,
    poNumber,
    orderNumber: body.orderNumber ?? null,
    status: body.status ?? "Draft",
    orderDate: body.orderDate,
    expectedDate: body.expectedDate ?? null,
    receivedDate: body.receivedDate ?? null,
    notes: body.notes ?? null,
    totalCost: String(totalCost),
    deliveryCharge: String(deliveryCharge),
    deliveryTaxMode,
  }).returning();
  if (body.items?.length) {
    await db.insert(purchaseOrderItemsTable).values(
      body.items.map((i) => ({
        poId: po.id,
        productId: i.productId ?? null,
        productName: i.productName ?? "",
        quantity: i.quantity ?? 1,
        received: i.received ?? 0,
        unitCost: String(i.unitCost ?? 0),
        notes: i.notes ?? null,
      }))
    );
  }
  const result = await getPOWithItems(po.id, merchantId);
  res.status(201).json(result);
});

// GET /purchase-orders/:id
router.get("/purchase-orders/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = GetPurchaseOrderParams.parse({ id: Number(req.params.id) });
  const result = await getPOWithItems(id, merchantId);
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json(result);
});

// PUT /purchase-orders/:id
router.put("/purchase-orders/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = UpdatePurchaseOrderParams.parse({ id: Number(req.params.id) });
  const body = UpdatePurchaseOrderBody.parse(req.body);
  const itemsSubtotal = (body.items ?? []).reduce((s, i) => s + (i.quantity ?? 1) * (i.unitCost ?? 0), 0);
  const deliveryCharge = body.deliveryCharge ?? 0;
  const deliveryTaxMode = body.deliveryTaxMode ?? "exclusive";
  const deliveryGross = deliveryTaxMode === "exclusive" ? deliveryCharge * 1.1 : deliveryCharge;
  const totalCost = itemsSubtotal + deliveryGross;
  await db.update(purchaseOrdersTable).set({
    supplierId: body.supplierId ?? null,
    ...(body.poNumber ? { poNumber: body.poNumber } : {}),
    orderNumber: body.orderNumber ?? null,
    ...(body.status ? { status: body.status } : {}),
    ...(body.orderDate ? { orderDate: body.orderDate } : {}),
    expectedDate: body.expectedDate ?? null,
    receivedDate: body.receivedDate ?? null,
    notes: body.notes ?? null,
    totalCost: String(totalCost),
    deliveryCharge: String(deliveryCharge),
    deliveryTaxMode,
  }).where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
  if (body.items !== undefined) {
    await db.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
    if (body.items.length) {
      await db.insert(purchaseOrderItemsTable).values(
        body.items.map((i) => ({
          poId: id,
          productId: i.productId ?? null,
          productName: i.productName ?? "",
          quantity: i.quantity ?? 1,
          received: i.received ?? 0,
          unitCost: String(i.unitCost ?? 0),
          notes: i.notes ?? null,
        }))
      );
    }
  }
  const result = await getPOWithItems(id, merchantId);
  res.json(result);
});

// DELETE /purchase-orders/:id
router.delete("/purchase-orders/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = DeletePurchaseOrderParams.parse({ id: Number(req.params.id) });
  await db.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
  await db.delete(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
  res.json({ success: true });
});

export default router;
