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

/* ── Afterpay (in-store scan-to-pay) ────────────────────────────────────────────
   IMPORTANT — wire format is provisional. Endpoint paths, request/response field
   names, the auth scheme and the webhook signature header below follow Afterpay's
   documented Online/Merchant API shape, but MUST be confirmed against the
   merchant's Afterpay onboarding docs + sandbox before go-live. Everything
   provider-specific is localised here; the rest of the app only depends on
   PaymentProvider.

   Each merchant connects their OWN Afterpay account; credentials (incl. the
   per-merchant webhook signing secret) live encrypted in the vault under
   provider "afterpay": { merchantId, apiKey, webhookSecret? }.
   Afterpay authenticates with HTTP Basic (merchantId:secretKey). */

const AFTERPAY_API_BASE = process.env.AFTERPAY_API_BASE ?? "https://global-api.afterpay.com";
const AFTERPAY_SIGNATURE_HEADER = "afterpay-signature";

interface AfterpayCredentials { merchantId: string; apiKey: string; webhookSecret?: string }

interface AfterpayResponse {
  id?: string;
  token?: string;
  status?: string;
  state?: string;
  redirectCheckoutUrl?: string;
  qr_code?: string;
  uri?: string;
  expires?: string;
  expires_at?: string;
  message?: string;
  [k: string]: unknown;
}

async function getCreds(merchantId: number): Promise<AfterpayCredentials> {
  const creds = await readCredentialVault<AfterpayCredentials>(merchantId, "afterpay").catch(() => null);
  if (!creds?.apiKey || !creds.merchantId) throw new PaymentProviderNotConfiguredError("afterpay");
  return creds;
}

/** Map Afterpay's order/payment status strings onto our canonical lifecycle. */
function mapStatus(raw: string | undefined): PaymentStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "approved":
    case "auth_approved":
    case "authorised":
    case "authorized":          return "authorized";
    case "captured":
    case "partially_captured":
    case "charged":
    case "completed":           return "captured";
    case "declined":
    case "rejected":            return "declined";
    case "expired":             return "expired";
    case "voided":
    case "cancelled":
    case "canceled":            return "cancelled";
    case "refunded":            return "refunded";
    case "failed":              return "failed";
    default:                    return "pending";
  }
}

async function apFetch(creds: AfterpayCredentials, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<{ ok: boolean; status: number; body: AfterpayResponse }> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${creds.merchantId}:${creds.apiKey}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${AFTERPAY_API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const body = await res.json().catch(() => ({})) as AfterpayResponse;
  return { ok: res.ok, status: res.status, body };
}

export const afterpayProvider: PaymentProvider = {
  key: "afterpay",
  requiresCapture: true,

  async createCharge(merchantId: number, input: CreateChargeInput): Promise<CreateChargeResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await apFetch(creds, "/v2/checkouts", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        merchantReference: input.orderRef,
        amount: { amount: input.amount.toFixed(2), currency: input.currency },
      }),
    });
    const externalRef = body.token ?? body.id;
    if (!ok || !externalRef) {
      throw new Error(`Afterpay checkout creation failed${body.message ? `: ${body.message}` : ""}`);
    }
    const expiresRaw = body.expires ?? body.expires_at;
    return {
      externalRef,
      qrPayload: body.redirectCheckoutUrl ?? body.qr_code ?? body.uri ?? null,
      expiresAt: expiresRaw ? new Date(expiresRaw) : null,
      status: mapStatus(body.status ?? body.state),
      raw: body,
    };
  },

  async getStatus(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await apFetch(creds, `/v2/payments/${encodeURIComponent(externalRef)}`, { method: "GET" });
    if (!ok) return { status: "failed", failureReason: "Afterpay status lookup failed", raw: body };
    return { status: mapStatus(body.status ?? body.state), failureReason: body.message, raw: body };
  },

  async capture(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await apFetch(creds, "/v2/payments/capture", {
      method: "POST",
      body: JSON.stringify({ token: externalRef }),
    });
    if (!ok) return { status: "failed", failureReason: body.message ?? "Afterpay capture failed", raw: body };
    return { status: mapStatus(body.status ?? body.state) === "pending" ? "captured" : mapStatus(body.status ?? body.state), raw: body };
  },

  async refund(merchantId: number, externalRef: string, amount: number): Promise<RefundResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await apFetch(creds, `/v2/payments/${encodeURIComponent(externalRef)}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount: { amount: amount.toFixed(2), currency: "AUD" } }),
    });
    if (!ok) return { ok: false, status: "captured", error: body.message ?? "Afterpay refund failed", raw: body };
    return { ok: true, status: "refunded", raw: body };
  },

  extractWebhookRef(rawBody: string): string | null {
    try {
      const parsed = JSON.parse(rawBody) as AfterpayResponse;
      return parsed.token ?? parsed.id ?? null;
    } catch {
      return null;
    }
  },

  async verifyWebhook(merchantId: number, rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<WebhookEvent | null> {
    const creds = await readCredentialVault<AfterpayCredentials>(merchantId, "afterpay").catch(() => null);
    const secret = creds?.webhookSecret;
    if (!secret) return null;

    const sigHeader = headers[AFTERPAY_SIGNATURE_HEADER];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!signature) return null;

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let parsed: AfterpayResponse;
    try { parsed = JSON.parse(rawBody) as AfterpayResponse; } catch { return null; }
    const externalRef = parsed.token ?? parsed.id;
    if (!externalRef) return null;
    return {
      externalRef,
      status: mapStatus(parsed.status ?? parsed.state),
      failureReason: parsed.message,
      raw: parsed,
    };
  },
};

registerPaymentProvider(afterpayProvider);
