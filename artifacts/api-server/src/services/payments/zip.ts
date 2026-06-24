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

/* ── Zip Pay — AU In-store QR code API ─────────────────────────────────────────
   Targets Zip's documented "In-store QR code API (AU)": the POS displays a QR
   the customer scans in the Zip app, which matches our scan-to-pay flow.
     docs: https://developers.zip.co/v4/docs/getting-started  (QR code API, AU)

   Wire format below follows the published v3 spec:
     • Base host:  https://api.sandbox.zip.co (sandbox) / https://api.zip.co (prod)
     • Path:       /au/merchant/instore-qr/checkouts
     • Auth:       X-Zip-API-Key header (NOT OAuth / Bearer)
     • Media type: application/vnd.zipco.v3+json
     • Amounts are decimal STRINGS; currency is lowercase ("aud").
     • Lifecycle is POLL-based (checkout.status), ~short approval window. Webhooks
       are a best-effort supplement, not the primary confirmation path.

   STILL CONFIRM AGAINST SANDBOX before go-live:
     • capture / refund paths — the public QR docs expose only create/get/cancel,
       yet GET returns charge.status of "captured"/"refunded" and config.capture,
       so the operations exist. The paths below are the consistent REST shape but
       are unverified; check the merchant's onboarding spec.
     • webhook signature scheme (header + algorithm) — see verifyWebhook.

   Credentials live in the encrypted vault under provider "zip":
     { apiKey: string, locationId: string, deviceRefCode?: string, webhookSecret?: string }
   The API host is overridable via env for sandbox vs production. */

const ZIP_API_BASE         = process.env.ZIP_API_BASE ?? "https://api.zip.co";
const ZIP_INSTORE_PATH     = "/au/merchant/instore-qr/checkouts";
const ZIP_MEDIA_TYPE       = "application/vnd.zipco.v3+json";
const ZIP_SIGNATURE_HEADER = "zip-signature";

// Each merchant connects their own independent Zip account, so the webhook
// signing secret is per-merchant (stored in the vault), not a platform env var.
interface ZipCredentials {
  apiKey: string;
  /** Zip-assigned store location → originator.location_id. */
  locationId: string;
  /** Merchant's device reference → originator.device_ref_code. */
  deviceRefCode?: string;
  webhookSecret?: string;
}

interface ZipChargeObject {
  charge_id?: string;
  receipt_number?: string;
  status?: string;
  amount?: string;
  currency?: string;
}

interface ZipCheckoutResponse {
  id?: string;
  status?: string;
  media?: { include_qr_code?: boolean; qr_code?: string };
  charge?: ZipChargeObject;
  _links?: { checkout?: { href?: string } };
  decline_reason?: string;
  [k: string]: unknown;
}

async function getCreds(merchantId: number): Promise<ZipCredentials> {
  const creds = await readCredentialVault<ZipCredentials>(merchantId, "zip").catch(() => null);
  if (!creds?.apiKey || !creds.locationId) throw new PaymentProviderNotConfiguredError("zip");
  return creds;
}

/** Map Zip's checkout + charge state onto our canonical lifecycle.
    charge.status is more precise once a charge exists, so it wins. */
function mapStatus(checkoutStatus: string | undefined, chargeStatus: string | undefined): PaymentStatus {
  switch ((chargeStatus ?? "").toLowerCase()) {
    case "authorised":
    case "authorized": return "authorized";
    case "captured":   return "captured";
    case "declined":   return "declined";
    case "cancelled":
    case "canceled":   return "cancelled";
    case "refunded":   return "refunded";
  }
  switch ((checkoutStatus ?? "").toLowerCase()) {
    // Customer approved; with config.capture=false the charge is authorised and
    // we capture it ourselves once the sale is committed.
    case "completed":        return "authorized";
    case "cancel_requested": return "pending";
    case "cancelled":
    case "canceled":         return "cancelled";
    case "expired":          return "expired";
    case "new":
    case "pending":          return "pending";
    default:                 return "pending";
  }
}

async function zipFetch(creds: ZipCredentials, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<{ ok: boolean; status: number; body: ZipCheckoutResponse }> {
  const headers: Record<string, string> = {
    "X-Zip-API-Key": creds.apiKey,
    "Content-Type": ZIP_MEDIA_TYPE,
    Accept: ZIP_MEDIA_TYPE,
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${ZIP_API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const body = await res.json().catch(() => ({})) as ZipCheckoutResponse;
  return { ok: res.ok, status: res.status, body };
}

function originator(creds: ZipCredentials) {
  return { location_id: creds.locationId, device_ref_code: creds.deviceRefCode };
}

export const zipProvider: PaymentProvider = {
  key: "zip",
  requiresCapture: true,

  async createCharge(merchantId: number, input: CreateChargeInput): Promise<CreateChargeResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await zipFetch(creds, ZIP_INSTORE_PATH, {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        media: { include_qr_code: true },
        originator: originator(creds),
        order: {
          id: crypto.randomUUID(),
          currency: input.currency.toLowerCase(),
          amount: input.amount.toFixed(2),
          reference: input.orderRef,
        },
        reference: input.orderRef,
        type: "standard",
        // Authorise now, capture once the sale is finalised (two-phase).
        config: { capture: false },
      }),
    });
    if (!ok || !body.id) {
      throw new Error(`Zip checkout creation failed${body.decline_reason ? `: ${body.decline_reason}` : ""}`);
    }
    return {
      externalRef: body.id,
      qrPayload: body.media?.qr_code ?? body._links?.checkout?.href ?? null,
      // The QR API response carries no expiry field; the approval window is
      // managed by Zip and surfaced via polling on the checkout status.
      expiresAt: null,
      status: mapStatus(body.status, body.charge?.status),
      raw: body,
    };
  },

  async getStatus(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    const { ok, body } = await zipFetch(creds, `${ZIP_INSTORE_PATH}/${encodeURIComponent(externalRef)}`, { method: "GET" });
    if (!ok) return { status: "failed", failureReason: "Zip status lookup failed", raw: body };
    return { status: mapStatus(body.status, body.charge?.status), failureReason: body.decline_reason, raw: body };
  },

  async capture(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    // NOTE: capture path is not in the public QR docs — confirm against sandbox.
    const { ok, body } = await zipFetch(creds, `${ZIP_INSTORE_PATH}/${encodeURIComponent(externalRef)}/capture`, { method: "POST", body: JSON.stringify({}) });
    if (!ok) return { status: "failed", failureReason: body.decline_reason ?? "Zip capture failed", raw: body };
    const mapped = mapStatus(body.status, body.charge?.status);
    // A successful capture call leaves us captured even if the echoed checkout
    // status still reads "completed".
    return { status: mapped === "authorized" || mapped === "pending" ? "captured" : mapped, raw: body };
  },

  async cancel(merchantId: number, externalRef: string): Promise<StatusResult> {
    const creds = await getCreds(merchantId);
    // POST /checkouts/{id}/cancel — no body, 204 on success. Voids the checkout,
    // reversing any hold/captured funds for this purchase request.
    const { ok, body } = await zipFetch(creds, `${ZIP_INSTORE_PATH}/${encodeURIComponent(externalRef)}/cancel`, { method: "POST" });
    if (!ok) return { status: "failed", failureReason: body.decline_reason ?? "Zip cancel failed", raw: body };
    return { status: "cancelled", raw: body };
  },

  async refund(merchantId: number, externalRef: string, amount: number): Promise<RefundResult> {
    const creds = await getCreds(merchantId);
    // NOTE: refund path is not in the public QR docs — confirm against sandbox.
    const { ok, body } = await zipFetch(creds, `${ZIP_INSTORE_PATH}/${encodeURIComponent(externalRef)}/refund`, {
      method: "POST",
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ amount: amount.toFixed(2), reference: externalRef }),
    });
    if (!ok) return { ok: false, status: "captured", error: body.decline_reason ?? "Zip refund failed", raw: body };
    return { ok: true, status: "refunded", raw: body };
  },

  extractWebhookRef(rawBody: string): string | null {
    try {
      const parsed = JSON.parse(rawBody) as ZipCheckoutResponse;
      return parsed.id ?? null;
    } catch {
      return null;
    }
  },

  async verifyWebhook(merchantId: number, rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<WebhookEvent | null> {
    const creds = await readCredentialVault<ZipCredentials>(merchantId, "zip").catch(() => null);
    const secret = creds?.webhookSecret;
    if (!secret) return null;

    // NOTE: in-store QR is poll-based; the webhook signature scheme (header +
    // algorithm) is not published — confirm against the merchant's spec.
    const sigHeader = headers[ZIP_SIGNATURE_HEADER];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!signature) return null;

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let parsed: ZipCheckoutResponse;
    try { parsed = JSON.parse(rawBody) as ZipCheckoutResponse; } catch { return null; }
    const externalRef = parsed.id;
    if (!externalRef) return null;
    return {
      externalRef,
      status: mapStatus(parsed.status, parsed.charge?.status),
      failureReason: parsed.decline_reason,
      raw: parsed,
    };
  },
};

registerPaymentProvider(zipProvider);
