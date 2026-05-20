import { Router, type IRouter } from "express";
import { db, taxSettingsTable, transactionsTable, merchantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateTaxSettingsBody, SendTransactionReceiptParams } from "@workspace/api-zod";
import { sendEmail } from "../services/email";

const router: IRouter = Router();

function fmt(t: typeof taxSettingsTable.$inferSelect) {
  return {
    gstEnabled: t.gstEnabled,
    gstRate: parseFloat(t.gstRate),
    gstNumber: t.gstNumber ?? null,
    taxInclusive: t.taxInclusive,
    showTaxOnReceipt: t.showTaxOnReceipt,
    taxName: t.taxName,
    receiptFooter: t.receiptFooter ?? null,
    receiptHeader: t.receiptHeader ?? null,
    emailReceiptsEnabled: t.emailReceiptsEnabled,
    smsReceiptsEnabled: t.smsReceiptsEnabled,
  };
}

const defaults = {
  gstEnabled: "true",
  gstRate: "10",
  gstNumber: null,
  taxInclusive: "true",
  showTaxOnReceipt: "true",
  taxName: "GST",
  receiptFooter: null,
  receiptHeader: null,
  emailReceiptsEnabled: "false",
  smsReceiptsEnabled: "false",
};

// GET /settings/tax
router.get("/settings/tax", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(taxSettingsTable).where(eq(taxSettingsTable.merchantId, merchantId));
  if (!row) {
    res.json({ ...defaults, gstRate: 10 });
    return;
  }
  res.json(fmt(row));
});

// PUT /settings/tax
router.put("/settings/tax", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = UpdateTaxSettingsBody.parse(req.body);
  const [existing] = await db.select().from(taxSettingsTable).where(eq(taxSettingsTable.merchantId, merchantId));
  const data = {
    ...(body.gstEnabled !== undefined ? { gstEnabled: body.gstEnabled } : {}),
    ...(body.gstRate !== undefined ? { gstRate: String(body.gstRate) } : {}),
    ...(body.gstNumber !== undefined ? { gstNumber: body.gstNumber ?? null } : {}),
    ...(body.taxInclusive !== undefined ? { taxInclusive: body.taxInclusive } : {}),
    ...(body.showTaxOnReceipt !== undefined ? { showTaxOnReceipt: body.showTaxOnReceipt } : {}),
    ...(body.taxName !== undefined ? { taxName: body.taxName } : {}),
    ...(body.receiptFooter !== undefined ? { receiptFooter: body.receiptFooter ?? null } : {}),
    ...(body.receiptHeader !== undefined ? { receiptHeader: body.receiptHeader ?? null } : {}),
    ...(body.emailReceiptsEnabled !== undefined ? { emailReceiptsEnabled: body.emailReceiptsEnabled } : {}),
    ...(body.smsReceiptsEnabled !== undefined ? { smsReceiptsEnabled: body.smsReceiptsEnabled } : {}),
  };
  if (existing) {
    await db.update(taxSettingsTable).set(data).where(eq(taxSettingsTable.merchantId, merchantId));
  } else {
    await db.insert(taxSettingsTable).values({ merchantId, ...data });
  }
  const [row] = await db.select().from(taxSettingsTable).where(eq(taxSettingsTable.merchantId, merchantId));
  res.json(row ? fmt(row) : { ...defaults, gstRate: 10 });
});

// POST /transactions/:id/send-receipt
router.post("/transactions/:id/send-receipt", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = SendTransactionReceiptParams.parse({ id: Number(req.params.id) });
  const { email } = req.body as { email: string };
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  const [tx] = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)));
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }

  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const bizName = merchant?.businessName ?? "KoaPOS";

  const itemsRaw = tx.items as Array<{ name: string; qty: number; price: number; total: number }> | null;
  const itemRows = (itemsRaw ?? []).map(i =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${i.name}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${i.qty}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;">$${Number(i.total ?? i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#222;">
      <h2 style="margin:0 0 4px;">${bizName}</h2>
      <p style="margin:0 0 24px;color:#888;font-size:13px;">Receipt #${tx.receiptNumber ?? tx.id}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Item</th>
            <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Qty</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="margin-top:16px;text-align:right;font-size:15px;">
        <strong>Total: $${Number(tx.total).toFixed(2)}</strong>
      </div>
      <p style="margin-top:32px;font-size:12px;color:#aaa;text-align:center;">Thank you for shopping with us!</p>
    </div>`;

  const result = await sendEmail(merchantId, {
    to: email,
    subject: `Receipt from ${bizName} — #${tx.receiptNumber ?? tx.id}`,
    html,
    text: `Receipt from ${bizName}\nReceipt #${tx.receiptNumber ?? tx.id}\nTotal: $${Number(tx.total).toFixed(2)}\n\nThank you for shopping with us!`,
  });

  if (!result.success) {
    req.log.warn({ transactionId: id, email, error: result.error }, "Receipt email failed");
    res.status(400).json({ error: result.error ?? "Failed to send receipt email" });
    return;
  }

  req.log.info({ transactionId: id, email, provider: result.provider }, "Receipt emailed");
  res.json({ success: true });
});

export default router;
