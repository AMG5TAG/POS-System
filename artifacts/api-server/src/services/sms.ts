import { readVault } from "./tokenVault";

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsSendResult {
  success: boolean;
  provider: string;
  error?: string;
}

function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("04") && digits.length === 10) return `+61${digits.slice(1)}`;
  if (digits.startsWith("61") && digits.length === 11) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

async function getTwilioCredentials(merchantId?: number): Promise<{
  accountSid: string;
  authToken: string;
  fromNumber: string;
} | null> {
  // Per-merchant credentials from vault take precedence
  if (merchantId) {
    const vault = await readVault(merchantId, "twilio").catch(() => null);
    if (vault?.accessToken && vault.accountHandle) {
      return {
        accountSid: vault.accountId ?? vault.accessToken.split(":")[0] ?? "",
        authToken:  vault.accessToken,
        fromNumber: vault.accountHandle,
      };
    }
  }
  // Legacy platform-level env var fallback
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (accountSid && authToken && fromNumber) return { accountSid, authToken, fromNumber };
  return null;
}

/**
 * Send an SMS via Twilio.
 * Credentials are loaded from the per-merchant vault (provider "twilio").
 * Falls back to TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER env vars.
 */
export async function sendSms(message: SmsMessage, merchantId?: number): Promise<SmsSendResult> {
  const creds = await getTwilioCredentials(merchantId);
  if (!creds) {
    return { success: false, provider: "none", error: "SMS not configured. Connect Twilio under Management → Settings & Integrations → SMS." };
  }

  const to = normalisePhone(message.to);

  const body = new URLSearchParams({
    From: creds.fromNumber,
    To:   to,
    Body: message.body,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Unknown error" })) as { message?: string };
    return { success: false, provider: "twilio", error: err.message ?? "SMS send failed" };
  }

  return { success: true, provider: "twilio" };
}
