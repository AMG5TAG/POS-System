import { Router, type IRouter } from "express";
import { db, taxSettingsTable, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateTaxSettingsBody, SendTransactionReceiptParams } from "@workspace/api-zod";

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
  // Verify transaction belongs to merchant
  const [tx] = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)));
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  // Email sending would require an SMTP / email integration.
  // For now we log the intent and return success (integrate with email service when ready).
  req.log.info({ transactionId: id, email }, "Receipt send requested (email integration not configured)");
  res.json({ success: true, queued: false, message: "Email integration not yet configured. Connect an email provider in Settings." });
});

export default router;
