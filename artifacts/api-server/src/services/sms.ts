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
  // Australian mobile: 04xxxxxxxx → +614xxxxxxxx
  if (digits.startsWith("04") && digits.length === 10) return `+61${digits.slice(1)}`;
  // Already has country code
  if (digits.startsWith("61") && digits.length === 11) return `+${digits}`;
  // Already E.164
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

/**
 * Send an SMS via Twilio.
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */
export async function sendSms(message: SmsMessage): Promise<SmsSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, provider: "none", error: "SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER." };
  }

  const to = normalisePhone(message.to);

  const body = new URLSearchParams({
    From: fromNumber,
    To: to,
    Body: message.body,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
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
