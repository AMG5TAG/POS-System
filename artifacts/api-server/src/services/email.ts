import nodemailer from "nodemailer";
import { db, emailSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
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

export async function sendEmail(merchantId: number, message: EmailMessage): Promise<SendResult> {
  const settings = await getSettings(merchantId);

  if (!settings || settings.provider === "none") {
    return { success: false, provider: "none", error: "No email provider configured. Configure one in Management → Email." };
  }

  if (settings.provider === "smtp") {
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return { success: false, provider: "smtp", error: "SMTP configuration is incomplete" };
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
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { success: true, provider: "smtp" };
  }

  if (settings.provider === "resend") {
    if (!settings.apiKey) {
      return { success: false, provider: "resend", error: "Resend API key not configured" };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: buildFrom(settings.fromName ?? null, settings.fromEmail ?? null, "onboarding@resend.dev"),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
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
      return { success: false, provider: "sendgrid", error: "SendGrid API key not configured" };
    }
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: settings.fromEmail ?? "noreply@example.com", name: settings.fromName ?? undefined },
        subject: message.subject,
        content: [
          { type: "text/html", value: message.html },
          ...(message.text ? [{ type: "text/plain", value: message.text }] : []),
        ],
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
