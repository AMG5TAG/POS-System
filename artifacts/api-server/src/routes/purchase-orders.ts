import { Router, type IRouter } from "express";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, suppliersTable, merchantsTable, productsTable, productPriceHistoryTable } from "@workspace/db";
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
import { sendEmail } from "../services/email";

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

async function syncCostPricesFromPO(
  merchantId: number,
  poId: number,
  poNumber: string,
  items: Array<{ productId?: number | null; unitCost?: number | null }>,
  supplierName: string | null,
) {
  for (const item of items) {
    if (!item.productId || item.unitCost == null) continue;
    const cost = item.unitCost;
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

function nextPoNumber(existing: Array<{ poNumber: string }>, prefix = "KP", digits = 5): string {
  let max = 0;
  for (const po of existing) {
    const n = parseInt(po.poNumber.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(digits, "0")}`;
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

  let poNumber = body.poNumber;
  if (!poNumber) {
    const existing = await db
      .select({ poNumber: purchaseOrdersTable.poNumber })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.merchantId, merchantId));
    const prefix = (body as { poNumberPrefix?: string }).poNumberPrefix ?? "KP";
    const digits = (body as { poNumberDigits?: number }).poNumberDigits ?? 5;
    poNumber = nextPoNumber(existing, prefix, digits);
  }

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
  // Sync product cost prices and log pricing history
  if (body.items?.length) {
    let supplierName: string | null = null;
    if (body.supplierId) {
      const [sup] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
        .where(and(eq(suppliersTable.id, body.supplierId), eq(suppliersTable.merchantId, merchantId)));
      supplierName = sup?.name ?? null;
    }
    await syncCostPricesFromPO(merchantId, po.id, poNumber, body.items, supplierName);
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
      await syncCostPricesFromPO(merchantId, id, updatedPO?.poNumber ?? "", body.items, supplierName);
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

// POST /purchase-orders/:id/email
router.post("/purchase-orders/:id/email", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
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
      <td style="padding:7px 10px;">${i.productName}</td>
      <td style="padding:7px 10px;text-align:center;">${i.quantity}</td>
      <td style="padding:7px 10px;text-align:right;">${fmt(i.unitCost ?? 0)}</td>
      <td style="padding:7px 10px;text-align:right;">${fmt((i.quantity ?? 1) * (i.unitCost ?? 0))}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <div style="border-bottom:2px solid #f0c040;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <h2 style="margin:0;font-size:20px;">PURCHASE ORDER</h2>
      <p style="margin:4px 0 0;font-size:13px;color:#666;">#${po.poNumber}</p>
    </div>
    <div style="text-align:right;font-size:12px;color:#555;">
      <p style="margin:0;">From: <strong>${bizName}</strong></p>
      <p style="margin:2px 0 0;">Date: ${fmtDate(new Date().toISOString().slice(0, 10))}</p>
      <p style="margin:2px 0 0;">Status: <strong>${po.status}</strong></p>
      ${po.orderNumber ? `<p style="margin:2px 0 0;">Order #: ${po.orderNumber}</p>` : ""}
      ${po.expectedDate ? `<p style="margin:2px 0 0;">Expected: ${fmtDate(po.expectedDate)}</p>` : ""}
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
  ${po.notes ? `<div style="border-top:1px solid #eee;padding-top:12px;"><p style="margin:0;font-size:11px;text-transform:uppercase;color:#888;">Notes</p><p style="margin:4px 0 0;white-space:pre-wrap;font-size:13px;">${po.notes}</p></div>` : ""}
  <p style="margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:8px;">Sent from ${bizName} via KoaPOS.</p>
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
