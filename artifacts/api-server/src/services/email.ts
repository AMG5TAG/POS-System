import nodemailer from "nodemailer";
import { db, emailSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  /** Optional blind-copy recipient (e.g. the business's own contact email). */
  bcc?: string;
}

export interface SendResult {
  success: boolean;
  provider: string;
  error?: string;
}

async function getSettings(merchantId: number) {
  const [row] = await db.select().from(emailSettingsTable).where(eq(emailSettingsTable.merchantId, merchantId));
  return row ?? null;
}

function buildFrom(fromName: string | null, fromEmail: string | null, fallback: string): string {
  if (!fromEmail) return fallback;
  return fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
}

/**
 * Send an email using the system-level email configuration from environment variables.
 *
 * Supports two providers:
 *   - SMTP:   SYSTEM_SMTP_HOST, SYSTEM_SMTP_PORT, SYSTEM_SMTP_USER, SYSTEM_SMTP_PASS,
 *             SYSTEM_SMTP_SECURE (optional, defaults "false"), SYSTEM_FROM_EMAIL,
 *             SYSTEM_FROM_NAME (optional, defaults "KoaPOS")
 *   - Resend: SYSTEM_RESEND_API_KEY, SYSTEM_FROM_EMAIL (required),
 *             SYSTEM_FROM_NAME (optional, defaults "KoaPOS")
 *
 * Returns { success: false } if no system email is configured.
 */
export async function sendSystemEmail(message: EmailMessage): Promise<SendResult> {
  const fromName = process.env.SYSTEM_FROM_NAME ?? "KoaPOS";
  const fromEmail = process.env.SYSTEM_FROM_EMAIL ?? null;

  const resendKey = process.env.SYSTEM_RESEND_API_KEY;
  if (resendKey) {
    if (!fromEmail) {
      return { success: false, provider: "system-resend", error: "SYSTEM_FROM_EMAIL is required when using SYSTEM_RESEND_API_KEY" };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: buildFrom(fromName, fromEmail, "onboarding@resend.dev"),
        to: [message.to],
        ...(message.bcc ? { bcc: [message.bcc] } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.attachments?.length ? {
          attachments: message.attachments.map((a) => ({
            filename: a.filename,
            content: a.content.toString("base64"),
          })),
        } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, provider: "system-resend", error: err };
    }
    return { success: true, provider: "system-resend" };
  }

  const smtpHost = process.env.SYSTEM_SMTP_HOST;
  const smtpUser = process.env.SYSTEM_SMTP_USER;
  const smtpPass = process.env.SYSTEM_SMTP_PASS;
  if (smtpHost && smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SYSTEM_SMTP_PORT ?? "587"),
      secure: (process.env.SYSTEM_SMTP_SECURE ?? "false") === "true",
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: buildFrom(fromName, fromEmail ?? smtpUser, smtpUser),
      to: message.to,
      ...(message.bcc ? { bcc: message.bcc } : {}),
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { success: true, provider: "system-smtp" };
  }

  return { success: false, provider: "none", error: "No system email provider configured. Set SYSTEM_RESEND_API_KEY or SYSTEM_SMTP_HOST/USER/PASS environment variables." };
}

/**
 * Send an email for a merchant. Uses the merchant's configured email provider.
 * Falls back to the system-level email provider if the merchant has none configured.
 * This fallback is essential for auth emails (password reset, login alerts) that must
 * reach the merchant even before they have set up their own email settings.
 */
export async function sendEmail(merchantId: number, message: EmailMessage): Promise<SendResult> {
  const settings = await getSettings(merchantId);

  if (!settings || settings.provider === "none") {
    return sendSystemEmail(message);
  }

  if (settings.provider === "smtp") {
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return sendSystemEmail(message);
    }
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort ?? "587"),
      secure: settings.smtpSecure === "true",
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    });
    await transporter.sendMail({
      from: buildFrom(settings.fromName ?? null, settings.fromEmail ?? null, settings.smtpUser),
      to: message.to,
      ...(message.bcc ? { bcc: message.bcc } : {}),
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { success: true, provider: "smtp" };
  }

  if (settings.provider === "resend") {
    if (!settings.apiKey) {
      return sendSystemEmail(message);
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: buildFrom(settings.fromName ?? null, settings.fromEmail ?? null, "onboarding@resend.dev"),
        to: [message.to],
        ...(message.bcc ? { bcc: [message.bcc] } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.attachments?.length ? {
          attachments: message.attachments.map((a) => ({
            filename: a.filename,
            content: a.content.toString("base64"),
          })),
        } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, provider: "resend", error: err };
    }
    return { success: true, provider: "resend" };
  }

  if (settings.provider === "sendgrid") {
    if (!settings.apiKey) {
      return sendSystemEmail(message);
    }
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }], ...(message.bcc ? { bcc: [{ email: message.bcc }] } : {}) }],
        from: { email: settings.fromEmail ?? "noreply@example.com", name: settings.fromName ?? undefined },
        subject: message.subject,
        content: [
          { type: "text/html", value: message.html },
          ...(message.text ? [{ type: "text/plain", value: message.text }] : []),
        ],
        ...(message.attachments?.length ? {
          attachments: message.attachments.map((a) => ({
            filename: a.filename,
            content: a.content.toString("base64"),
            type: a.contentType,
            disposition: "attachment",
          })),
        } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, provider: "sendgrid", error: err };
    }
    return { success: true, provider: "sendgrid" };
  }

  return { success: false, provider: settings.provider, error: "Unknown provider" };
}
