import crypto from "crypto";
import type { PaymentStatus } from "@workspace/db";
import { readCredentialVault } from "../tokenVault";
import {
  registerPaymentProvider,
  PaymentProviderNotConfiguredError,
  type PaymentProvider,
  type CreateChargeInput,
  type CreateChargeResult,
  type StatusResult,
  type RefundResult,
  type WebhookEvent,
} from "./PaymentProvider";

/* ── Zip Pay (in-store scan-to-pay) ────────────────────────────────────────────
   IMPORTANT — wire format is provisional. The endpoint paths, request/response
   field names, auth scheme and webhook signature header below follow Zip's
   documented Merchant API shape, but MUST be confirmed against the merchant's
   Zip onboarding docs + sandbox before go-live. Everything provider-specific is
   localised here; the rest of the app only depends on PaymentProvider.

   Credentials live in the encrypted vault under provider "zip":
     { merchantId: string, apiKey: string }
   Endpoints / secrets are overridable via env for sandbox vs production. */

const ZIP_API_BASE       = process.env.ZIP_API_BASE ?? "https://api.zip.co";
const ZIP_SIGNATURE_HEADER = "zip-signature";

// Each merchant connects their own independent Zip account, so the webhook
// signing secret is per-merchant (stored in the vault), not a platform env var.
interface ZipCredentials { merchantId: string; apiKey: string; webhookSecret?: string }

interface ZipOrderResponse {
  id?: string;
  state?: string;
  status?: string;
  qr_code?: string;
  qrCode?: string;
  uri?: string;
  expires_at?: string;
  expiresAt?: string;
  declined_reason?: string;
  [k: string]: unknown;
}

async function getCreds(merchantId: number): Promise<ZipCredentials> {
  const creds = await readCredentialVault<ZipCredentials>(merchantId, "zip").catch(() => null);
  if (!creds?.apiKey || !creds.merchantId) throw new PaymentProviderNotConfiguredError("zip");
  return creds;
}

/** Map Zip's order/charge state strings onto our canonical lifecycle. */
function mapStatus(raw: string | undefined): PaymentStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "approved":
    case "authorised":
    case "authorized":   return "authorized";
    case "captured":
    case "charged":
    case "completed":    return "captured";
    case "declined":
    case "rejected":     return "declined";
    case "expired":      return "expired";
    case "cancelled":
    case "canceled":     return "cancelled";
    case "refunded":     return "refunded";
    case "failed":       return "failed";
    default:             return "pending";
  }
}

async function zipFetch(creds: ZipCredentials, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<{ ok: boolean; status: number; body: ZipOrderResponse }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.apiKey}`,
    "Content-Type": "application/json",
    "Zip-Merchant-Id": creds.merchantId,
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${ZIP_API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const body = await res.json().catch(() => ({})) as ZipOrderResponse;
  return { ok: res.ok, status: res.status, body };
}

export const zipProvider: PaymentProvider = {
  key: "zip",
  requiresCapture: true,

  async createCharge(merchantId: number, input: CreateChargeInput): Promise<CreateChargeResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await zipFetch(creds, "/merchant/v1/orders", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        reference: input.orderRef,
        amount: input.amount,
        currency: input.currency,
        capture_funds: false,
      }),
    });
    if (!ok || !body.id) {
      throw new Error(`Zip order creation failed${body.declined_reason ? `: ${body.declined_reason}` : ""}`);
    }
    const expiresRaw = body.expires_at ?? body.expiresAt;
    return {
      externalRef: body.id,
      qrPayload: body.qr_code ?? body.qrCode ?? body.uri ?? null,
      expiresAt: expiresRaw ? new Date(expiresRaw) : null,
      status: mapStatus(body.state ?? body.status),
      raw: body,
    };
  },

  async getStatus(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await zipFetch(creds, `/merchant/v1/orders/${encodeURIComponent(externalRef)}`, { method: "GET" });
    if (!ok) return { status: "failed", failureReason: "Zip status lookup failed", raw: body };
    return { status: mapStatus(body.state ?? body.status), failureReason: body.declined_reason, raw: body };
  },

  async capture(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await zipFetch(creds, `/merchant/v1/orders/${encodeURIComponent(externalRef)}/capture`, { method: "POST", body: JSON.stringify({}) });
    if (!ok) return { status: "failed", failureReason: body.declined_reason ?? "Zip capture failed", raw: body };
    return { status: mapStatus(body.state ?? body.status) === "pending" ? "captured" : mapStatus(body.state ?? body.status), raw: body };
  },

  async refund(merchantId: number, externalRef: string, amount: number): Promise<RefundResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await zipFetch(creds, `/merchant/v1/orders/${encodeURIComponent(externalRef)}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    if (!ok) return { ok: false, status: "captured", error: body.declined_reason ?? "Zip refund failed", raw: body };
    return { ok: true, status: "refunded", raw: body };
  },

  extractWebhookRef(rawBody: string): string | null {
    try {
      const parsed = JSON.parse(rawBody) as ZipOrderResponse;
      return parsed.id ?? null;
    } catch {
      return null;
    }
  },

  async verifyWebhook(merchantId: number, rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<WebhookEvent | null> {
    const creds = await readCredentialVault<ZipCredentials>(merchantId, "zip").catch(() => null);
    const secret = creds?.webhookSecret;
    if (!secret) return null;

    const sigHeader = headers[ZIP_SIGNATURE_HEADER];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!signature) return null;

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let parsed: ZipOrderResponse;
    try { parsed = JSON.parse(rawBody) as ZipOrderResponse; } catch { return null; }
    const externalRef = parsed.id;
    if (!externalRef) return null;
    return {
      externalRef,
      status: mapStatus(parsed.state ?? parsed.status),
      failureReason: parsed.declined_reason,
      raw: parsed,
    };
  },
};

registerPaymentProvider(zipProvider);
