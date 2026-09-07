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

/* ── Klarna (scan-to-pay / pay-later) ───────────────────────────────────────────
   IMPORTANT — wire format is provisional. Endpoint paths, request/response field
   names, the auth scheme and the webhook signature header below follow Klarna's
   documented Payments / Order Management API shape, but MUST be confirmed against
   the merchant's Klarna onboarding docs + sandbox before go-live. Everything
   provider-specific is localised here; the rest of the app only depends on
   PaymentProvider.

   Each merchant connects their OWN Klarna account; credentials (incl. the
   per-merchant webhook signing secret) live encrypted in the vault under
   provider "klarna": { merchantId, apiKey, webhookSecret? }.
   Klarna authenticates with HTTP Basic (username:password = merchantId:apiKey). */

const KLARNA_API_BASE = process.env.KLARNA_API_BASE ?? "https://api.klarna.com";
const KLARNA_SIGNATURE_HEADER = "klarna-signature";

interface KlarnaCredentials { merchantId: string; apiKey: string; webhookSecret?: string }

interface KlarnaResponse {
  order_id?: string;
  id?: string;
  status?: string;
  state?: string;
  redirect_url?: string;
  hpp_url?: string;
  qr_code?: string;
  expires_at?: string;
  error_messages?: string[];
  [k: string]: unknown;
}

async function getCreds(merchantId: number): Promise<KlarnaCredentials> {
  const creds = await readCredentialVault<KlarnaCredentials>(merchantId, "klarna").catch(() => null);
  if (!creds?.apiKey || !creds.merchantId) throw new PaymentProviderNotConfiguredError("klarna");
  return creds;
}

/** Map Klarna's order status strings onto our canonical lifecycle. */
function mapStatus(raw: string | undefined): PaymentStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "authorized":
    case "authorised":          return "authorized";
    case "captured":
    case "part_captured":
    case "partially_captured":
    case "charged":
    case "completed":           return "captured";
    case "declined":
    case "rejected":            return "declined";
    case "expired":             return "expired";
    case "cancelled":
    case "canceled":            return "cancelled";
    case "refunded":            return "refunded";
    case "failed":              return "failed";
    default:                    return "pending";
  }
}

function firstError(body: KlarnaResponse): string | undefined {
  return Array.isArray(body.error_messages) && body.error_messages.length > 0 ? body.error_messages[0] : undefined;
}

async function klarnaFetch(creds: KlarnaCredentials, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<{ ok: boolean; status: number; body: KlarnaResponse }> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${creds.merchantId}:${creds.apiKey}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey) headers["Klarna-Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${KLARNA_API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const body = await res.json().catch(() => ({})) as KlarnaResponse;
  return { ok: res.ok, status: res.status, body };
}

export const klarnaProvider: PaymentProvider = {
  key: "klarna",
  requiresCapture: true,

  async createCharge(merchantId: number, input: CreateChargeInput): Promise<CreateChargeResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await klarnaFetch(creds, "/payments/v1/sessions", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        merchant_reference1: input.orderRef,
        order_amount: Math.round(input.amount * 100), // Klarna uses minor units
        purchase_currency: input.currency,
      }),
    });
    const externalRef = body.order_id ?? body.id;
    if (!ok || !externalRef) {
      throw new Error(`Klarna session creation failed${firstError(body) ? `: ${firstError(body)}` : ""}`);
    }
    return {
      externalRef,
      qrPayload: body.redirect_url ?? body.hpp_url ?? body.qr_code ?? null,
      expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      status: mapStatus(body.status ?? body.state),
      raw: body,
    };
  },

  async getStatus(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await klarnaFetch(creds, `/ordermanagement/v1/orders/${encodeURIComponent(externalRef)}`, { method: "GET" });
    if (!ok) return { status: "failed", failureReason: "Klarna status lookup failed", raw: body };
    return { status: mapStatus(body.status ?? body.state), failureReason: firstError(body), raw: body };
  },

  async capture(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await klarnaFetch(creds, `/ordermanagement/v1/orders/${encodeURIComponent(externalRef)}/captures`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!ok) return { status: "failed", failureReason: firstError(body) ?? "Klarna capture failed", raw: body };
    return { status: mapStatus(body.status ?? body.state) === "pending" ? "captured" : mapStatus(body.status ?? body.state), raw: body };
  },

  async refund(merchantId: number, externalRef: string, amount: number): Promise<RefundResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await klarnaFetch(creds, `/ordermanagement/v1/orders/${encodeURIComponent(externalRef)}/refunds`, {
      method: "POST",
      body: JSON.stringify({ refunded_amount: Math.round(amount * 100) }),
    });
    if (!ok) return { ok: false, status: "captured", error: firstError(body) ?? "Klarna refund failed", raw: body };
    return { ok: true, status: "refunded", raw: body };
  },

  extractWebhookRef(rawBody: string): string | null {
    try {
      const parsed = JSON.parse(rawBody) as KlarnaResponse;
      return parsed.order_id ?? parsed.id ?? null;
    } catch {
      return null;
    }
  },

  async verifyWebhook(merchantId: number, rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<WebhookEvent | null> {
    const creds = await readCredentialVault<KlarnaCredentials>(merchantId, "klarna").catch(() => null);
    const secret = creds?.webhookSecret;
    if (!secret) return null;

    const sigHeader = headers[KLARNA_SIGNATURE_HEADER];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!signature) return null;

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let parsed: KlarnaResponse;
    try { parsed = JSON.parse(rawBody) as KlarnaResponse; } catch { return null; }
    const externalRef = parsed.order_id ?? parsed.id;
    if (!externalRef) return null;
    return {
      externalRef,
      status: mapStatus(parsed.status ?? parsed.state),
      failureReason: firstError(parsed),
      raw: parsed,
    };
  },
};

registerPaymentProvider(klarnaProvider);
