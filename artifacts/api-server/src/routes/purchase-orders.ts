import { Router, type IRouter } from "express";
import { foreignIdError } from "../lib/owned-ids";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, purchaseOrderReceiptsTable, suppliersTable, merchantsTable, productsTable, productPriceHistoryTable, productSerialsTable, productOversellLedgerTable, productTypesTable, lowStockAlertSettingsTable } from "@workspace/db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { allocateArrivals, notifyArrivals, type PreOrderArrival } from "../lib/pre-order-sales";
import { reconcileOversellLedger } from "../lib/oversellLedger";
import { withUniqueRetry, nextSequential, isUniqueViolation } from "../lib/document-numbers";
import {
  ListPurchaseOrdersQueryParams,
  CreatePurchaseOrderBody,
  GetPurchaseOrderParams,
  UpdatePurchaseOrderParams,
  UpdatePurchaseOrderBody,
  DeletePurchaseOrderParams,
  ReceivePurchaseOrderItemsParams,
  SendPurchaseOrderEmailParams,
  MatchSupplierInvoiceBody,
  ImportSupplierInvoiceBody,
} from "@workspace/api-zod";
import { registerProductQr, registerQrBestEffort } from "../services/entityQr";
import { cleanSerials, matchProducts, matchSupplier, serialsNote } from "../lib/supplier-invoice";
import { isLeaderImageUrl, isLeaderSupplier, warrantyFromMonths } from "../lib/leader-feed";
import { getLeaderFeed, leaderFeedConfigured, lookupLeaderProducts } from "../services/leaderFeed";
import { brandsTable } from "@workspace/db";
import { sendEmail } from "../services/email";
import { escapeHtml } from "../lib/html-escape";

const router: IRouter = Router();

type PORow = typeof purchaseOrdersTable.$inferSelect;
type POItemRow = typeof purchaseOrderItemsTable.$inferSelect;
type ReceiptRow = typeof purchaseOrderReceiptsTable.$inferSelect;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Per-product backorder context, joined onto a PO line for the receive warning.
type OversellSale = { receiptNumber: string | null; quantity: number; saleAt: string };
type OversellInfo = { currentStock: number | null; oversellSales: OversellSale[] };

function fmtItem(i: POItemRow, oversell?: OversellInfo) {
  const oversellSales = oversell?.oversellSales ?? [];
  const oversoldUnits = oversellSales.reduce((s, o) => s + o.quantity, 0);
  return {
    id: i.id,
    productId: i.productId ?? null,
    productName: i.productName,
    quantity: i.quantity,
    received: i.received,
    unitCost: parseFloat(i.unitCost),
    notes: i.notes ?? null,
    // Current on-hand for this line's product (negative = oversold). Null for
    // non-catalogued lines. `oversellSales` names the sales that oversold it.
    currentStock: oversell?.currentStock ?? null,
    oversoldUnits,
    oversellSales,
  };
}

// Propagate each PO line's "has serial number" checkbox onto its product, so
// receiving (and later selling) knows whether to capture/consume serials. Only
// catalogued lines (with a productId) that explicitly set the flag are touched.
async function applyTracksSerialFromItems(
  merchantId: number,
  items: Array<{ productId?: number | null; tracksSerial?: boolean }>,
) {
  const byProduct = new Map<number, boolean>();
  for (const i of items) {
    if (i.productId != null && i.tracksSerial !== undefined) byProduct.set(i.productId, i.tracksSerial);
  }
  for (const [productId, flag] of byProduct) {
    await db.update(productsTable)
      .set({ tracksSerial: flag ? "true" : "false" })
      .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
  }
}

function fmtReceipt(r: ReceiptRow) {
  return {
    id: r.id,
    processedBy: r.processedBy,
    processedAt: r.processedAt.toISOString(),
    notes: r.notes,
  };
}

function fmtPO(po: PORow, items: POItemRow[] = [], supplierName?: string | null, receipts: ReceiptRow[] = [], oversellByProduct?: Map<number, OversellInfo>) {
  let invoiceUrls: string[] = [];
  try { if (po.invoiceUrls) invoiceUrls = JSON.parse(po.invoiceUrls); } catch {}
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
    invoiceUrls,
    totalCost: parseFloat(po.totalCost),
    deliveryCharge: parseFloat(po.deliveryCharge ?? "0"),
    deliveryTaxMode: po.deliveryTaxMode ?? "exclusive",
    distributeDelivery: (po as { distributeDelivery?: string }).distributeDelivery === "true",
    amountPaid: parseFloat(po.amountPaid ?? "0"),
    paymentStatus: po.paymentStatus ?? "unpaid",
    paymentMethod: po.paymentMethod ?? null,
    paidAt: po.paidAt ? po.paidAt.toISOString() : null,
    items: items.map((i) => fmtItem(i, i.productId ? oversellByProduct?.get(i.productId) : undefined)),
    receipts: receipts.map(fmtReceipt),
    createdAt: po.createdAt.toISOString(),
  };
}

async function syncCostPricesFromPO(
  merchantId: number,
  poId: number,
  poNumber: string,
  items: Array<{ productId?: number | null; unitCost?: number | null; quantity?: number | null }>,
  supplierName: string | null,
  // Total delivery/shipping charge to spread across the line items (by value),
  // folding it into each product's landed cost. 0 = don't distribute.
  deliveryToDistribute = 0,
) {
  // Allocation basis: each line's extended value (qty × unitCost) as a share of
  // the order's goods subtotal, so pricier lines absorb proportionally more.
  const goodsSubtotal = items.reduce(
    (s, i) => (i.productId && i.unitCost != null ? s + (i.quantity ?? 1) * i.unitCost : s),
    0,
  );
  const distribute = deliveryToDistribute > 0 && goodsSubtotal > 0;

  for (const item of items) {
    if (!item.productId || item.unitCost == null) continue;
    const qty = item.quantity ?? 1;
    let cost = item.unitCost;
    if (distribute && qty > 0) {
      const lineShare = (qty * item.unitCost) / goodsSubtotal;
      const allocatedPerUnit = (deliveryToDistribute * lineShare) / qty;
      cost = item.unitCost + allocatedPerUnit;
    }
    cost = Math.round(cost * 100) / 100;
    await db.update(productsTable)
      .set({ costPrice: String(cost) })
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.merchantId, merchantId)));
    await db.insert(productPriceHistoryTable).values({
      merchantId,
      productId: item.productId,
      costPrice: String(cost),
      supplierName: supplierName ?? null,
      poNumber,
      poId,
    });
  }
}

function nextPoNumber(existing: Array<{ poNumber: string }>, prefix = "KP", digits = 5, tryIndex = 0): string {
  return `${prefix}${String(nextSequential(existing.map((p) => p.poNumber), tryIndex)).padStart(digits, "0")}`;
}

// For each catalogued product on a PO, gather its current on-hand stock and any
// still-outstanding backorders (oldest sale first) so the receive worksheet can
// warn that incoming units are already spoken for.
async function getOversellByProduct(merchantId: number, productIds: number[]): Promise<Map<number, OversellInfo>> {
  const map = new Map<number, OversellInfo>();
  const unique = [...new Set(productIds)];
  if (!unique.length) return map;

  const products = await db
    .select({ id: productsTable.id, stockQuantity: productsTable.stockQuantity })
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, merchantId), inArray(productsTable.id, unique)));
  for (const p of products) map.set(p.id, { currentStock: p.stockQuantity, oversellSales: [] });

  const openRows = await db
    .select({
      productId: productOversellLedgerTable.productId,
      receiptNumber: productOversellLedgerTable.receiptNumber,
      remaining: productOversellLedgerTable.remaining,
      saleAt: productOversellLedgerTable.saleAt,
    })
    .from(productOversellLedgerTable)
    .where(and(
      eq(productOversellLedgerTable.merchantId, merchantId),
      inArray(productOversellLedgerTable.productId, unique),
      sql`${productOversellLedgerTable.remaining} > 0`,
    ))
    .orderBy(asc(productOversellLedgerTable.createdAt), asc(productOversellLedgerTable.id));
  for (const r of openRows) {
    const info = map.get(r.productId) ?? { currentStock: null, oversellSales: [] };
    info.oversellSales.push({ receiptNumber: r.receiptNumber, quantity: r.remaining, saleAt: r.saleAt.toISOString() });
    map.set(r.productId, info);
  }
  return map;
}

async function getPOWithItems(id: number, merchantId: number) {
  const [po] = await db.select().from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
  if (!po) return null;
  const [items, receipts] = await Promise.all([
    db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id)),
    db.select().from(purchaseOrderReceiptsTable)
      .where(eq(purchaseOrderReceiptsTable.poId, id))
      .orderBy(desc(purchaseOrderReceiptsTable.processedAt)),
  ]);
  let supplierName: string | null = null;
  if (po.supplierId) {
    const [s] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, po.supplierId), eq(suppliersTable.merchantId, po.merchantId)));
    supplierName = s?.name ?? null;
  }
  const oversellByProduct = await getOversellByProduct(
    merchantId,
    items.map((i) => i.productId).filter((p): p is number => p != null),
  );
  return fmtPO(po, items, supplierName, receipts, oversellByProduct);
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
      const [s] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, po.supplierId), eq(suppliersTable.merchantId, po.merchantId)));
      supplierName = s?.name ?? null;
    }
    return fmtPO(po, items, supplierName);
  }));
  res.json(results);
});

// POST /purchase-orders
/** Units received per product, summed over a PO's lines (free-text lines have no product). */
export function receivedByProduct(rows: Array<{ productId?: number | null; received?: number | null }>): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) {
    if (r.productId) m.set(r.productId, (m.get(r.productId) ?? 0) + (r.received ?? 0));
  }
  return m;
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Move each tracked product's stock by its delta (units received, or the
 * change in units received on an edit), keeping the backorder ledger in step.
 * Products that don't track inventory, or belong to another business, are
 * skipped. Shared by create and edit so the two can't drift again.
 */
async function applyReceivedToStock(tx: DbTx, merchantId: number, deltas: Map<number, number>): Promise<void> {
  for (const [productId, delta] of deltas) {
    if (!delta) continue;
    const [product] = await tx.select({ trackInventory: productsTable.trackInventory, stockQuantity: productsTable.stockQuantity })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
    if (product?.trackInventory !== "true") continue;
    const newStock = product.stockQuantity + delta;
    await tx.update(productsTable)
      .set({ stockQuantity: newStock })
      .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
    await reconcileOversellLedger(tx, { merchantId, productId, prevStock: product.stockQuantity, newStock });
  }
}

router.post("/purchase-orders", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = CreatePurchaseOrderBody.parse(req.body);
  {
    const foreign = await foreignIdError(merchantId, { supplierId: body.supplierId });
    if (foreign) { res.status(400).json({ error: foreign }); return; }
  }

  // A client-supplied PO number is used verbatim (no retry — a duplicate is a
  // client error surfaced as 409); an auto number is max+1 and retried on the
  // unique-index conflict so concurrent creates land on distinct numbers.
  const autoNumber = !body.poNumber;
  const rawPrefix = (body as { poNumberPrefix?: unknown }).poNumberPrefix;
  const poPrefix = typeof rawPrefix === "string" && /^[A-Za-z0-9-]{1,10}$/.test(rawPrefix) ? rawPrefix : "KP";
  // Bounded, as service-job numbers are: an unchecked digit count builds a
  // string of that length in padStart and can take the API down.
  const rawDigits = (body as { poNumberDigits?: unknown }).poNumberDigits;
  const poDigits = typeof rawDigits === "number" && Number.isInteger(rawDigits) && rawDigits >= 1 && rawDigits <= 10 ? rawDigits : 5;
  let poNumber = body.poNumber ?? "";

  const itemsSubtotal = (body.items ?? []).reduce((s, i) => s + (i.quantity ?? 1) * (i.unitCost ?? 0), 0);
  const deliveryCharge = body.deliveryCharge ?? 0;
  const deliveryTaxMode = body.deliveryTaxMode ?? "exclusive";
  const distributeDelivery = req.body?.distributeDelivery === true;
  const deliveryGross = deliveryTaxMode === "exclusive" ? deliveryCharge * 1.1 : deliveryCharge;
  const totalCost = round2(itemsSubtotal + deliveryGross);

  // Optional supplier payment recorded at creation. `payFull` settles the order
  // at the exact server-computed total (so client/server GST rounding can't leave
  // a stray cent unpaid); otherwise `paymentAmount` records a partial payment,
  // clamped to the total. paidAt is stamped only once the order is settled in full.
  const payFull = (body as { payFull?: boolean }).payFull === true;
  const requestedPay = payFull
    ? totalCost
    : round2(Math.max(0, Number((body as { paymentAmount?: number }).paymentAmount ?? 0)));
  const amountPaid = round2(Math.min(requestedPay, totalCost));
  const fullyPaid = totalCost > 0 && amountPaid >= totalCost - 0.005;
  const paymentStatus = fullyPaid ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
  const paymentMethod = amountPaid > 0
    ? ((body as { paymentMethod?: string }).paymentMethod?.trim() || null)
    : null;
  const paidAt = fullyPaid ? new Date() : null;

  let po: typeof purchaseOrdersTable.$inferSelect;
  try {
    po = await withUniqueRetry("purchase_orders_merchant_po_number_unique", async (tryIndex) => {
      if (autoNumber) {
        const existing = await db
          .select({ poNumber: purchaseOrdersTable.poNumber })
          .from(purchaseOrdersTable)
          .where(eq(purchaseOrdersTable.merchantId, merchantId));
        poNumber = nextPoNumber(existing, poPrefix, poDigits, tryIndex);
      }
      const [row] = await db.insert(purchaseOrdersTable).values({
        merchantId,
        supplierId: body.supplierId ?? null,
        poNumber,
        orderNumber: body.orderNumber ?? null,
        status: body.status ?? "Draft",
        orderDate: body.orderDate,
        expectedDate: body.expectedDate ?? null,
        receivedDate: body.receivedDate ?? null,
        notes: body.notes ?? null,
        invoiceUrls: body.invoiceUrls?.length ? JSON.stringify(body.invoiceUrls) : null,
        totalCost: String(totalCost),
        deliveryCharge: String(deliveryCharge),
        deliveryTaxMode,
        distributeDelivery: distributeDelivery ? "true" : "false",
        amountPaid: String(amountPaid),
        paymentStatus,
        paymentMethod,
        paidAt,
      }).returning();
      return row;
    }, autoNumber ? 6 : 1);
  } catch (err) {
    if (isUniqueViolation(err, "purchase_orders_merchant_po_number_unique")) {
      res.status(409).json({ error: `Purchase order number "${poNumber}" already exists` });
      return;
    }
    throw err;
  }
  if (body.items?.length) {
    // An order can be created already received (status "Fully Received" with
    // the received counts filled in). Those units must reach stock exactly as
    // they would through PUT or the Receive worksheet — this used to record
    // `received` and move no stock at all. Items and stock commit together.
    const items = body.items;
    await db.transaction(async (tx) => {
      await tx.insert(purchaseOrderItemsTable).values(
        items.map((i) => ({
          poId: po.id,
          productId: i.productId ?? null,
          productName: i.productName ?? "",
          quantity: i.quantity ?? 1,
          received: i.received ?? 0,
          unitCost: String(i.unitCost ?? 0),
          notes: i.notes ?? null,
        }))
      );
      await applyReceivedToStock(tx, merchantId, receivedByProduct(items));
    });
    await applyTracksSerialFromItems(merchantId, body.items);
  }
  // Sync product cost prices and log pricing history
  if (body.items?.length) {
    let supplierName: string | null = null;
    if (body.supplierId) {
      const [sup] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
        .where(and(eq(suppliersTable.id, body.supplierId), eq(suppliersTable.merchantId, merchantId)));
      supplierName = sup?.name ?? null;
    }
    await syncCostPricesFromPO(merchantId, po.id, poNumber, body.items, supplierName, distributeDelivery ? deliveryCharge : 0);
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
  // Confirm ownership before touching child items keyed only on poId, otherwise
  // another merchant's PO items could be deleted and overwritten.
  const [owned] = await db.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }
  {
    const foreign = await foreignIdError(merchantId, { supplierId: body.supplierId });
    if (foreign) { res.status(400).json({ error: foreign }); return; }
  }
  // A PO can only be marked complete once goods have actually been received.
  // Receiving flows through POST /:id/receive (which raises `received`); guard the
  // generic status edit so a PO can't be flipped to received with nothing received.
  const completeStatuses = ["Fully Received", "Received"];
  if (body.status && completeStatuses.includes(body.status)) {
    const itemsToCheck = body.items !== undefined
      ? body.items
      : await db.select({ received: purchaseOrderItemsTable.received })
          .from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
    if (!itemsToCheck.some((i) => (i.received ?? 0) > 0)) {
      res.status(400).json({ error: "Cannot mark a purchase order as received before at least one item has been received." });
      return;
    }
  }
  const itemsSubtotal = (body.items ?? []).reduce((s, i) => s + (i.quantity ?? 1) * (i.unitCost ?? 0), 0);
  const deliveryCharge = body.deliveryCharge ?? 0;
  const deliveryTaxMode = body.deliveryTaxMode ?? "exclusive";
  const distributeDelivery = req.body?.distributeDelivery === true;
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
    invoiceUrls: body.invoiceUrls !== undefined
      ? (body.invoiceUrls.length ? JSON.stringify(body.invoiceUrls) : null)
      : undefined,
    totalCost: String(totalCost),
    deliveryCharge: String(deliveryCharge),
    deliveryTaxMode,
    distributeDelivery: distributeDelivery ? "true" : "false",
  }).where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
  if (body.items !== undefined) {
    // Editing a PO's received quantities must move inventory the same way the
    // Receive worksheet does. Aggregate received-per-product before and after the
    // edit, then shift each tracked product's stock by the delta — all inside one
    // transaction so the item rewrite and the stock adjustments can't split apart.
    await db.transaction(async (tx) => {
      const oldItems = await tx.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
      const oldReceived = receivedByProduct(oldItems);
      const newReceived = receivedByProduct(body.items ?? []);

      await tx.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
      if (body.items!.length) {
        await tx.insert(purchaseOrderItemsTable).values(
          body.items!.map((i) => ({
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

      const deltas = new Map<number, number>();
      for (const productId of new Set<number>([...oldReceived.keys(), ...newReceived.keys()])) {
        deltas.set(productId, (newReceived.get(productId) ?? 0) - (oldReceived.get(productId) ?? 0));
      }
      await applyReceivedToStock(tx, merchantId, deltas);
    });
    // Sync product cost prices and log pricing history
    const [updatedPO] = await db.select().from(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
    let supplierName: string | null = null;
    if (updatedPO?.supplierId) {
      const [sup] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
        .where(and(eq(suppliersTable.id, updatedPO.supplierId), eq(suppliersTable.merchantId, merchantId)));
      supplierName = sup?.name ?? null;
    }
    if (body.items.length) {
      await syncCostPricesFromPO(merchantId, id, updatedPO?.poNumber ?? "", body.items, supplierName, distributeDelivery ? deliveryCharge : 0);
    }
    await applyTracksSerialFromItems(merchantId, body.items);
  }
  const result = await getPOWithItems(id, merchantId);
  res.json(result);
});

// DELETE /purchase-orders/:id
// Deletes the PO *and reverses every change it made*: stock added at receipt is
// backed out, unsold serial numbers it created are removed, and the cost-price
// history it wrote is dropped (with each affected product's cost restored to its
// prior history entry). All of it runs in one transaction so a partial reversal
// can never be left behind.
router.delete("/purchase-orders/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = DeletePurchaseOrderParams.parse({ id: Number(req.params.id) });
  // Confirm ownership before deleting child items keyed only on poId.
  const [owned] = await db.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }

  await db.transaction(async (tx) => {
    const items = await tx.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));

    // 1) Reverse stock — back out the units this PO added to on-hand (the
    //    received quantity, tracked products only). Aggregate per product so
    //    repeated lines for the same product net correctly.
    const receivedByProduct = new Map<number, number>();
    for (const it of items) {
      if (it.productId && it.received > 0) {
        receivedByProduct.set(it.productId, (receivedByProduct.get(it.productId) ?? 0) + it.received);
      }
    }
    for (const [productId, qty] of receivedByProduct) {
      const [product] = await tx.select({ trackInventory: productsTable.trackInventory, stockQuantity: productsTable.stockQuantity })
        .from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
      if (product?.trackInventory === "true") {
        const newStock = product.stockQuantity - qty;
        await tx.update(productsTable)
          .set({ stockQuantity: newStock })
          .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
        // Backing out received units can re-open backorders these units had covered.
        await reconcileOversellLedger(tx, {
          merchantId, productId,
          prevStock: product.stockQuantity, newStock,
        });
      }
    }

    // 2) Remove serial numbers this PO received that are still on hand. Serials
    //    already sold belong to completed sales and are left untouched.
    const itemIds = items.map((i) => i.id);
    if (itemIds.length) {
      await tx.delete(productSerialsTable).where(and(
        eq(productSerialsTable.merchantId, merchantId),
        eq(productSerialsTable.status, "available"),
        inArray(productSerialsTable.poItemId, itemIds),
      ));
    }

    // 3) Reverse cost-price changes — drop the price-history rows this PO wrote,
    //    then restore each affected product's cost price to its most recent
    //    remaining history entry (left unchanged if no prior history remains).
    const affectedProducts = [...new Set((await tx
      .select({ productId: productPriceHistoryTable.productId })
      .from(productPriceHistoryTable)
      .where(and(eq(productPriceHistoryTable.merchantId, merchantId), eq(productPriceHistoryTable.poId, id))))
      .map((r) => r.productId))];
    await tx.delete(productPriceHistoryTable)
      .where(and(eq(productPriceHistoryTable.merchantId, merchantId), eq(productPriceHistoryTable.poId, id)));
    for (const productId of affectedProducts) {
      const [prior] = await tx.select({ costPrice: productPriceHistoryTable.costPrice })
        .from(productPriceHistoryTable)
        .where(and(eq(productPriceHistoryTable.merchantId, merchantId), eq(productPriceHistoryTable.productId, productId)))
        .orderBy(desc(productPriceHistoryTable.changedAt))
        .limit(1);
      if (prior) {
        await tx.update(productsTable)
          .set({ costPrice: prior.costPrice })
          .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
      }
    }

    // 4) Delete the PO's receipts, items, then the PO itself (FK order).
    await tx.delete(purchaseOrderReceiptsTable).where(eq(purchaseOrderReceiptsTable.poId, id));
    await tx.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
    await tx.delete(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));
  });

  res.json({ success: true });
});

/* ── Import a supplier invoice ────────────────────────────────────────────
   Purchase Orders › Import supplier invoice. The browser reads the PDF; these
   two routes match it (read-only) and then create everything in one
   transaction. Receiving stays the ordinary /:id/receive call, so stock,
   serials, pre-orders and the sale-ticket prompt behave exactly as they do
   for any PO. Rules in lib/supplier-invoice.ts. */

router.post("/purchase-orders/import/match", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = MatchSupplierInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const body = parsed.data;

  const suppliers = await db
    .select({ id: suppliersTable.id, name: suppliersTable.name, accountNumber: suppliersTable.accountNumber, creditAccountNumber: suppliersTable.creditAccountNumber })
    .from(suppliersTable).where(eq(suppliersTable.merchantId, merchantId));
  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku, supplierCode: productsTable.supplierCode, price: productsTable.price, isActive: productsTable.isActive })
    .from(productsTable).where(eq(productsTable.merchantId, merchantId));

  let poNumberTaken: { id: number; poNumber: string } | null = null;
  if (body.poNumber?.trim()) {
    const [hit] = await db.select({ id: purchaseOrdersTable.id, poNumber: purchaseOrdersTable.poNumber }).from(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.merchantId, merchantId), eq(purchaseOrdersTable.poNumber, body.poNumber.trim())));
    poNumberTaken = hit ?? null;
  }

  const supplier = matchSupplier(suppliers, { name: body.supplierName, accountCode: body.accountCode });
  // Leader's dealer datafeed fills in new products (description, image, …).
  // Only for a Leader invoice: stock codes are the supplier's own, and another
  // supplier's code could collide with one of Leader's.
  const fromLeader = isLeaderSupplier(body.supplierName) || isLeaderSupplier(supplier?.name);
  const feed = fromLeader && leaderFeedConfigured()
    ? await lookupLeaderProducts(body.lines.map((l) => l.stockCode), req.log)
    : body.lines.map(() => null);

  res.json({
    supplier,
    feedAvailable: fromLeader && feed.some(Boolean),
    feed,
    poNumberTaken,
    lines: matchProducts(
      products.map((p) => ({ ...p, price: parseFloat(String(p.price)) || 0, isActive: p.isActive === "true" })),
      body.lines.map((l) => ({ stockCode: l.stockCode, manufCode: l.manufCode })),
    ),
  });
});

/* The feed's image for a stock code, so the browser can upload it to our own
   storage (Leader's site sends no CORS headers). Only the URL the feed names
   is fetched, and only on Leader's own domain — the request names a stock
   code, never a URL. */
router.get("/purchase-orders/import/feed-image/:stockCode", requireAuth, async (req, res): Promise<void> => {
  const feed = await getLeaderFeed(req.log);
  const item = feed?.get(String(req.params.stockCode).replace(/\s+/g, "").toUpperCase());
  if (!item?.imageUrl || !isLeaderImageUrl(item.imageUrl)) { res.status(404).json({ error: "No image for that code" }); return; }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(item.imageUrl, { signal: ctl.signal, redirect: "error" });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/^image\/(jpeg|png|webp|gif)/i.test(type)) { res.status(404).json({ error: "No image for that code" }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) { res.status(413).json({ error: "Image too large" }); return; }
    res.setHeader("Content-Type", type.split(";")[0]!);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buf);
  } catch {
    res.status(502).json({ error: "Couldn't fetch the supplier's image" });
  } finally {
    clearTimeout(timer);
  }
});

router.post("/purchase-orders/import", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = ImportSupplierInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const body = parsed.data;
  const poNumber = body.poNumber.trim();
  if (!poNumber) { res.status(400).json({ error: "The invoice number is needed as the PO number" }); return; }
  if (!body.supplierId && !body.newSupplier?.name.trim()) { res.status(400).json({ error: "Choose a supplier or create a new one" }); return; }
  {
    const foreign = await foreignIdError(merchantId, { supplierId: body.supplierId });
    if (foreign) { res.status(400).json({ error: foreign }); return; }
  }
  // Existing products named on lines must be this business's.
  const linkedIds = [...new Set(body.lines.map((l) => l.productId).filter((id): id is number => id != null))];
  if (linkedIds.length) {
    const owned = await db.select({ id: productsTable.id }).from(productsTable)
      .where(and(eq(productsTable.merchantId, merchantId), inArray(productsTable.id, linkedIds)));
    if (owned.length !== linkedIds.length) { res.status(400).json({ error: "A line names a product that doesn't exist" }); return; }
  }

  // Feed details on new products: categories must be this business's, and
  // images must already be in its own storage (the browser uploads them).
  for (const l of body.lines) {
    const np = l.newProduct;
    if (!np) continue;
    const foreign = await foreignIdError(merchantId, { categoryId: np.categoryId });
    if (foreign) { res.status(400).json({ error: foreign }); return; }
    if (np.imageUrl && !np.imageUrl.startsWith(`/api/storage/objects/merchants/${merchantId}/`)) {
      res.status(400).json({ error: "Product images must be uploaded first" }); return;
    }
  }

  // Defaults a product made in the product form would get.
  const [standardType] = await db.select().from(productTypesTable)
    .where(and(eq(productTypesTable.slug, "standard"), eq(productTypesTable.merchantId, merchantId)));
  if (!standardType && body.lines.some((l) => !l.productId && l.newProduct)) {
    res.status(400).json({ error: "No standard product type found; please set up product types first" });
    return;
  }
  const [lowStock] = await db.select({ globalThreshold: lowStockAlertSettingsTable.globalThreshold })
    .from(lowStockAlertSettingsTable).where(eq(lowStockAlertSettingsTable.merchantId, merchantId)).limit(1);

  // The invoice number is the PO number, so importing the same invoice twice
  // is refused here (and by the unique index, should two imports race).
  const alreadyImported = `PO number "${poNumber}" already exists — this invoice looks like it has already been imported.`;
  {
    const [taken] = await db.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.merchantId, merchantId), eq(purchaseOrdersTable.poNumber, poNumber)));
    if (taken) { res.status(409).json({ error: alreadyImported }); return; }
  }

  const itemsSubtotal = round2(body.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));

  let result: { poId: number; supplierName: string; supplierCreated: boolean; newProducts: Array<{ id: number; name: string; sku: string | null; hidden: boolean }>; items: Array<{ productId: number | null; quantity: number; unitCost: number }> };
  try {
    result = await db.transaction(async (tx) => {
      // Supplier
      let supplierId = body.supplierId ?? null;
      let supplierName = "";
      let supplierCreated = false;
      if (supplierId) {
        const [sup] = await tx.select().from(suppliersTable)
          .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.merchantId, merchantId)));
        supplierName = sup!.name;
        // Learn the account code, so the next invoice matches by it — only
        // into an empty field, never over one staff typed.
        const code = body.accountCode?.trim();
        if (code && !sup!.accountNumber?.trim()) {
          await tx.update(suppliersTable).set({ accountNumber: code }).where(eq(suppliersTable.id, supplierId));
        }
      } else {
        const ns = body.newSupplier!;
        const [sup] = await tx.insert(suppliersTable).values({
          merchantId,
          name: ns.name.trim(),
          accountNumber: ns.accountNumber?.trim() || null,
          website: ns.website?.trim() || null,
          phone: ns.phone?.trim() || null,
          notes: ns.notes?.trim() || null,
        }).returning();
        supplierId = sup!.id;
        supplierName = sup!.name;
        supplierCreated = true;
      }

      // Products: new ones are basic, and hidden from the till until priced.
      const newProducts: Array<{ id: number; name: string; sku: string | null; hidden: boolean }> = [];
      const items: Array<{ productId: number | null; productName: string; quantity: number; unitCost: number; notes: string | null }> = [];
      for (const l of body.lines) {
        let productId = l.productId ?? null;
        let productName = (l.productName || l.newProduct?.name || "").trim();
        if (!productId && l.newProduct) {
          const np = l.newProduct;
          const sellPrice = np.sellPrice && np.sellPrice > 0 ? round2(np.sellPrice) : 0;
          const sku = np.sku?.trim() || l.stockCode?.trim() || null;
          // Brand by name, created when this business doesn't have it yet.
          let brandId: number | null = null;
          const brandName = np.brand?.trim();
          if (brandName) {
            const [b] = await tx.select({ id: brandsTable.id }).from(brandsTable)
              .where(and(eq(brandsTable.merchantId, merchantId), sql`lower(${brandsTable.name}) = ${brandName.toLowerCase()}`)).limit(1);
            brandId = b?.id ?? (await tx.insert(brandsTable).values({ merchantId, name: brandName }).returning())[0]!.id;
          }
          const warranty = warrantyFromMonths(np.warrantyMonths);
          const measure = (n: number | undefined) => (n != null && Number.isFinite(n) && n > 0 ? String(Math.round(n * 1000) / 1000) : null);
          const [p] = await tx.insert(productsTable).values({
            merchantId,
            name: np.name.trim(),
            sku,
            price: String(sellPrice),
            costPrice: String(round2(l.unitCost)),
            supplier: supplierName,
            supplierCode: l.stockCode?.trim() || null,
            technicalSpecs: np.manufCode?.trim() ? `Manufacturer code: ${np.manufCode.trim()}` : null,
            description: np.description?.trim() || null,
            barcode: np.barcode?.trim() || null,
            imageUrl: np.imageUrl || null,
            brandId,
            categoryId: np.categoryId ?? null,
            weightKg: measure(np.weightKg),
            lengthCm: measure(np.lengthCm),
            widthCm: measure(np.widthCm),
            heightCm: measure(np.heightCm),
            ...(warranty ?? {}),
            // Trimmed, de-duplicated case-insensitively, first spelling kept.
            tags: (() => {
              const seen = new Set<string>();
              const out = (np.tags ?? []).map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && (seen.add(t.toLowerCase()), true));
              return out.length ? out : null;
            })(),
            productTypeId: standardType!.id,
            lowStockThreshold: lowStock?.globalThreshold ?? null,
            trackInventory: "true",
            isActive: sellPrice > 0 ? "true" : "false",
          }).returning();
          productId = p!.id;
          productName = p!.name;
          newProducts.push({ id: p!.id, name: p!.name, sku: p!.sku, hidden: sellPrice <= 0 });
        }
        items.push({
          productId,
          productName: productName || l.stockCode || "Item",
          quantity: l.quantity,
          unitCost: round2(l.unitCost),
          notes: serialsNote(cleanSerials(l.serials)),
        });
      }

      // The purchase order: Ordered — receiving is its own step.
      const [po] = await tx.insert(purchaseOrdersTable).values({
        merchantId,
        supplierId,
        poNumber,
        orderNumber: body.orderNumber?.trim() || null,
        status: "Ordered",
        orderDate: body.orderDate,
        notes: body.notes?.trim() || null,
        invoiceUrls: body.invoiceUrls?.length ? JSON.stringify(body.invoiceUrls) : null,
        totalCost: String(itemsSubtotal),
        deliveryCharge: "0",
        deliveryTaxMode: "exclusive",
        distributeDelivery: "false",
        amountPaid: "0",
        paymentStatus: "unpaid",
      }).returning();
      await tx.insert(purchaseOrderItemsTable).values(items.map((i) => ({
        poId: po!.id,
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        received: 0,
        unitCost: String(i.unitCost),
        notes: i.notes,
      })));
      return { poId: po!.id, supplierName, supplierCreated, newProducts, items };
    });
  } catch (err) {
    // Inside a transaction the driver error arrives wrapped, with Postgres's on `.cause`.
    const cause = (err as { cause?: unknown } | null)?.cause;
    if (isUniqueViolation(err, "purchase_orders_merchant_po_number_unique") || isUniqueViolation(cause, "purchase_orders_merchant_po_number_unique")) {
      res.status(409).json({ error: alreadyImported });
      return;
    }
    throw err;
  }

  // Same follow-ups as a PO created by hand: cost prices + price history, QR codes.
  await syncCostPricesFromPO(merchantId, result.poId, poNumber, result.items, result.supplierName, 0);
  for (const p of result.newProducts) registerQrBestEffort(registerProductQr(merchantId, p.id, p.name));

  res.status(201).json({
    purchaseOrder: await getPOWithItems(result.poId, merchantId),
    supplierCreated: result.supplierCreated,
    newProducts: result.newProducts,
  });
});

// POST /purchase-orders/:id/receive
router.post("/purchase-orders/:id/receive", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const userEmail  = (req.session as { email?: string }).email ?? "Unknown";
  const paramsResult = ReceivePurchaseOrderItemsParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;

  const po = await getPOWithItems(id, merchantId);
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  const receivableStatuses = ["Ordered", "Partially Received", "Sent", "Partial"];
  if (!receivableStatuses.includes(po.status)) {
    res.status(400).json({ error: `Cannot receive items on a PO with status '${po.status}'` });
    return;
  }

  const {
    processedBy,
    items: receiveItems,
  }: {
    processedBy?: string;
    items?: Array<{ poItemId: number; quantityReceiving: number; serialNumbers?: string[] }>;
  } = req.body ?? {};

  const safeItems = receiveItems ?? [];
  if (!safeItems.length) {
    res.status(400).json({ error: "At least one item is required" });
    return;
  }

  const actor = processedBy?.trim() || userEmail;
  const poItemMap = new Map(po.items.map((i) => [i.id, i]));
  const receiptLines: string[] = [];

  const preOrderArrivals: PreOrderArrival[] = [];
  try {
    await db.transaction(async (tx) => {
      preOrderArrivals.length = 0; // a retried transaction starts again
      for (const { poItemId, quantityReceiving, serialNumbers } of safeItems) {
        if (quantityReceiving <= 0) continue;
        const poItem = poItemMap.get(poItemId);
        if (!poItem) continue;

        const maxReceivable = poItem.quantity - poItem.received;
        const qty = Math.min(quantityReceiving, maxReceivable);
        if (qty <= 0) continue;

        await tx.update(purchaseOrderItemsTable)
          .set({ received: sql`${purchaseOrderItemsTable.received} + ${qty}` })
          .where(eq(purchaseOrderItemsTable.id, poItemId));

        if (poItem.productId) {
          const [product] = await tx.select({ trackInventory: productsTable.trackInventory, tracksSerial: productsTable.tracksSerial, costPrice: productsTable.costPrice, stockQuantity: productsTable.stockQuantity })
            .from(productsTable)
            .where(and(eq(productsTable.id, poItem.productId), eq(productsTable.merchantId, merchantId)));

          // Serial-tracked products: record any serial numbers captured at receiving.
          if (product && product.tracksSerial === "true" && serialNumbers && serialNumbers.length) {
            const cleaned = [...new Set(serialNumbers.map((s) => s.trim()).filter(Boolean))];
            if (cleaned.length) {
              await tx.insert(productSerialsTable)
                .values(cleaned.map((serial) => ({
                  merchantId, productId: poItem.productId!, serial, poItemId, status: "available" as const,
                })))
                .onConflictDoNothing();
            }
          }

          if (product?.trackInventory === "true") {
            const prevStock = product.stockQuantity ?? 0;
            const newStock = prevStock + qty;
            await tx.update(productsTable)
              .set({ stockQuantity: newStock })
              .where(and(eq(productsTable.id, poItem.productId), eq(productsTable.merchantId, merchantId)));
            // Received units cover any outstanding backorders first (FIFO).
            await reconcileOversellLedger(tx, {
              merchantId, productId: poItem.productId,
              prevStock, newStock,
            });
          }

          // Units arriving for customers' pre-orders are set aside for them,
          // oldest pre-order first (lib/pre-order-sales.ts).
          preOrderArrivals.push(...await allocateArrivals(tx, merchantId, poItem.productId, qty));

          // Update cost via a moving (weighted) average: blend the existing
          // on-hand value with the newly received value. Falls back to the PO
          // unit cost when there's no prior on-hand stock/cost or the product
          // doesn't track inventory (last-cost). Applies to ALL received items,
          // tracked or not, and records a "po"-sourced price-history row.
          const poUnit = Number(poItem.unitCost);
          if (product && Number.isFinite(poUnit)) {
            const onHand  = product.stockQuantity ?? 0;
            const oldCost = product.costPrice != null ? parseFloat(product.costPrice) : NaN;
            let newCost = poUnit;
            if (product.trackInventory === "true" && onHand > 0 && Number.isFinite(oldCost) && (onHand + qty) > 0) {
              newCost = (onHand * oldCost + qty * poUnit) / (onHand + qty);
            }
            newCost = Math.round(newCost * 100) / 100;
            await tx.update(productsTable)
              .set({ costPrice: String(newCost) })
              .where(and(eq(productsTable.id, poItem.productId), eq(productsTable.merchantId, merchantId)));
            await tx.insert(productPriceHistoryTable).values({
              merchantId,
              productId: poItem.productId,
              costPrice: String(newCost),
              source: "po",
              supplierName: po.supplierName ?? null,
              poNumber: po.poNumber,
              poId: id,
            });
          }
        }

        receiptLines.push(`${qty}x ${poItem.productName}`);
      }

      if (receiptLines.length === 0) {
        throw Object.assign(new Error("No receivable quantities — all items may already be fully received"), { status: 400 });
      }

      const updatedItems = await tx.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
      const totalOrdered  = updatedItems.reduce((s, i) => s + i.quantity, 0);
      const totalReceived = updatedItems.reduce((s, i) => s + i.received, 0);
      const newStatus = totalReceived >= totalOrdered ? "Fully Received" : "Partially Received";
      const nowDate   = new Date().toISOString().slice(0, 10);

      await tx.update(purchaseOrdersTable)
        .set({
          status: newStatus,
          ...(newStatus === "Fully Received" ? { receivedDate: nowDate } : {}),
        })
        .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.merchantId, merchantId)));

      const receiptNote = `Received ${receiptLines.join(", ")} — processed by ${actor}`;
      await tx.insert(purchaseOrderReceiptsTable).values({
        poId: id,
        merchantId,
        processedBy: actor,
        notes: receiptNote ?? null,
      });
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to process goods receipt";
    if (status !== 500) {
      res.status(status).json({ error: message });
    } else {
      req.log.error({ err }, "receive PO transaction failed");
      res.status(500).json({ error: "Failed to process goods receipt. No changes were saved — please try again." });
    }
    return;
  }

  // Customers whose pre-orders are now complete hear about it — after commit,
  // and without holding up the response.
  void notifyArrivals(merchantId, preOrderArrivals).catch((err) => req.log.error({ err }, "pre-order arrival notification failed"));

  const result = await getPOWithItems(id, merchantId);
  res.json({ ...result, preOrderArrivals: preOrderArrivals.map(({ customerId: _c, ...a }) => a) });
});

// POST /purchase-orders/:id/email
router.post("/purchase-orders/:id/email", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = SendPurchaseOrderEmailParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;

  const po = await getPOWithItems(id, merchantId);
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  // Determine recipient: override from body, else supplier's email
  const bodyTo = typeof req.body?.to === "string" ? req.body.to.trim() : "";
  let toEmail = bodyTo;

  if (!toEmail && po.supplierId) {
    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, po.supplierId), eq(suppliersTable.merchantId, merchantId)));
    toEmail = supplier?.email?.trim() ?? "";
  }

  if (!toEmail) {
    res.status(400).json({ error: "no_email", message: "Supplier has no email address on file" });
    return;
  }

  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const bizName = merchant?.businessName ?? "Your Business";

  const GST_RATE = 0.1;
  const itemsSubtotal = (po.items ?? []).reduce((s, i) => s + (i.quantity ?? 1) * (i.unitCost ?? 0), 0);
  const itemsGst = itemsSubtotal * GST_RATE;
  const deliveryCharge = po.deliveryCharge ?? 0;
  const deliveryTaxMode = po.deliveryTaxMode ?? "exclusive";
  const deliveryIncGst = deliveryTaxMode === "exclusive" ? deliveryCharge * 1.1 : deliveryCharge;
  const grandTotal = itemsSubtotal * (1 + GST_RATE) + deliveryIncGst;

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const itemRows = (po.items ?? []).map((i) => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:7px 10px;">${escapeHtml(i.productName)}</td>
      <td style="padding:7px 10px;text-align:center;">${escapeHtml(String(i.quantity))}</td>
      <td style="padding:7px 10px;text-align:right;">${fmt(i.unitCost ?? 0)}</td>
      <td style="padding:7px 10px;text-align:right;">${fmt((i.quantity ?? 1) * (i.unitCost ?? 0))}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <div style="border-bottom:2px solid #f0c040;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <h2 style="margin:0;font-size:20px;">PURCHASE ORDER</h2>
      <p style="margin:4px 0 0;font-size:13px;color:#666;">#${escapeHtml(po.poNumber)}</p>
    </div>
    <div style="text-align:right;font-size:12px;color:#555;">
      <p style="margin:0;">From: <strong>${escapeHtml(bizName)}</strong></p>
      <p style="margin:2px 0 0;">Date: ${fmtDate(new Date().toISOString().slice(0, 10))}</p>
      <p style="margin:2px 0 0;">Status: <strong>${escapeHtml(po.status)}</strong></p>
      ${po.orderNumber ? `<p style="margin:2px 0 0;">Order #: ${escapeHtml(po.orderNumber)}</p>` : ""}
      ${po.expectedDate ? `<p style="margin:2px 0 0;">Expected: ${escapeHtml(fmtDate(po.expectedDate))}</p>` : ""}
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <thead>
      <tr style="background:#f5f5f5;border-bottom:1px solid #ddd;">
        <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;">Product</th>
        <th style="text-align:center;padding:8px 10px;font-size:11px;text-transform:uppercase;width:60px;">Qty</th>
        <th style="text-align:right;padding:8px 10px;font-size:11px;text-transform:uppercase;width:100px;">Unit Cost</th>
        <th style="text-align:right;padding:8px 10px;font-size:11px;text-transform:uppercase;width:100px;">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
    <table style="border-collapse:collapse;min-width:240px;">
      <tr><td style="padding:3px 10px;color:#666;font-size:12px;">Items subtotal (ex GST)</td><td style="padding:3px 10px;text-align:right;font-size:12px;">${fmt(itemsSubtotal)}</td></tr>
      <tr><td style="padding:3px 10px;color:#666;font-size:12px;">GST (10%)</td><td style="padding:3px 10px;text-align:right;font-size:12px;">+ ${fmt(itemsGst)}</td></tr>
      ${deliveryIncGst > 0 ? `<tr><td style="padding:3px 10px;color:#666;font-size:12px;">Delivery (inc GST)</td><td style="padding:3px 10px;text-align:right;font-size:12px;">+ ${fmt(deliveryIncGst)}</td></tr>` : ""}
      <tr style="border-top:2px solid #222;"><td style="padding:6px 10px;font-weight:700;font-size:14px;">Total (inc GST)</td><td style="padding:6px 10px;text-align:right;font-weight:700;font-size:14px;">${fmt(grandTotal)}</td></tr>
    </table>
  </div>
  ${po.notes ? `<div style="border-top:1px solid #eee;padding-top:12px;"><p style="margin:0;font-size:11px;text-transform:uppercase;color:#888;">Notes</p><p style="margin:4px 0 0;white-space:pre-wrap;font-size:13px;">${escapeHtml(po.notes)}</p></div>` : ""}
  <p style="margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:8px;">Sent from ${escapeHtml(bizName)} via KoaPOS.</p>
</body></html>`;

  const plainText = `Purchase Order #${po.poNumber} from ${bizName}\n\nStatus: ${po.status}\nDate: ${fmtDate(new Date().toISOString().slice(0, 10))}\n\nItems:\n${(po.items ?? []).map((i) => `- ${i.productName} x${i.quantity} @ ${fmt(i.unitCost ?? 0)} = ${fmt((i.quantity ?? 1) * (i.unitCost ?? 0))}`).join("\n")}\n\nSubtotal (ex GST): ${fmt(itemsSubtotal)}\nGST (10%): ${fmt(itemsGst)}\n${deliveryIncGst > 0 ? `Delivery (inc GST): ${fmt(deliveryIncGst)}\n` : ""}Total (inc GST): ${fmt(grandTotal)}${po.notes ? `\n\nNotes:\n${po.notes}` : ""}\n\nSent from ${bizName} via KoaPOS.`;

  const result = await sendEmail(merchantId, {
    to: toEmail,
    subject: `Purchase Order #${po.poNumber} from ${bizName}`,
    html,
    text: plainText,
  });

  res.json(result);
});

export default router;
