import { Router, type IRouter } from "express";
import { db, emailSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateEmailSettingsBody, TestEmailSettingsBody } from "@workspace/api-zod";
import { sendEmail } from "../services/email";

const router: IRouter = Router();

function fmt(row: typeof emailSettingsTable.$inferSelect) {
  return {
    provider:             row.provider,
    fromName:             row.fromName ?? null,
    fromEmail:            row.fromEmail ?? null,
    smtpHost:             row.smtpHost ?? null,
    smtpPort:             row.smtpPort ?? null,
    smtpSecure:           row.smtpSecure,
    smtpUser:             row.smtpUser ?? null,
    smtpPassSet:          !!row.smtpPass,
    apiKeySet:            !!row.apiKey,
    receiptEmailsEnabled: row.receiptEmailsEnabled,
  };
}

const defaults = {
  provider: "none", fromName: null, fromEmail: null,
  smtpHost: null, smtpPort: null, smtpSecure: "true", smtpUser: null,
  smtpPassSet: false, apiKeySet: false, receiptEmailsEnabled: "false",
};

// GET /settings/email
router.get("/settings/email", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(emailSettingsTable).where(eq(emailSettingsTable.merchantId, merchantId));
  res.json(row ? fmt(row) : defaults);
});

// PUT /settings/email
router.put("/settings/email", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = UpdateEmailSettingsBody.parse(req.body);
  const [existing] = await db.select().from(emailSettingsTable).where(eq(emailSettingsTable.merchantId, merchantId));
  const data: Record<string, string | null> = {};
  if (body.provider             !== undefined) data.provider             = body.provider;
  if (body.fromName             !== undefined) data.fromName             = body.fromName   ?? null;
  if (body.fromEmail            !== undefined) data.fromEmail            = body.fromEmail  ?? null;
  if (body.smtpHost             !== undefined) data.smtpHost             = body.smtpHost   ?? null;
  if (body.smtpPort             !== undefined) data.smtpPort             = body.smtpPort   ?? null;
  if (body.smtpSecure           !== undefined) data.smtpSecure           = body.smtpSecure;
  if (body.smtpUser             !== undefined) data.smtpUser             = body.smtpUser   ?? null;
  if (body.smtpPass             !== undefined) data.smtpPass             = body.smtpPass   ?? null;
  if (body.apiKey               !== undefined) data.apiKey               = body.apiKey     ?? null;
  if (body.receiptEmailsEnabled !== undefined) data.receiptEmailsEnabled = body.receiptEmailsEnabled;
  if (existing) {
    await db.update(emailSettingsTable).set(data).where(eq(emailSettingsTable.merchantId, merchantId));
  } else {
    await db.insert(emailSettingsTable).values({ merchantId, ...data });
  }
  const [row] = await db.select().from(emailSettingsTable).where(eq(emailSettingsTable.merchantId, merchantId));
  res.json(row ? fmt(row) : defaults);
});

// POST /settings/email/test
router.post("/settings/email/test", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { to } = TestEmailSettingsBody.parse(req.body);
  const result = await sendEmail(merchantId, {
    to,
    subject: "KoaPOS — Email Configuration Test",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
        <h2 style="margin:0 0 8px;color:#111;">Email is working!</h2>
        <p style="color:#555;margin:0 0 16px;">Your KoaPOS email integration is configured correctly.</p>
        <p style="color:#888;font-size:13px;">Sent via provider: <strong>${"smtp"}</strong></p>
      </div>`,
    text: "Email is working! Your KoaPOS email integration is configured correctly.",
  });
  if (!result.success) {
    res.status(400).json({ error: result.error ?? "Failed to send test email" });
    return;
  }
  res.json({ success: true, provider: result.provider });
});

export default router;
