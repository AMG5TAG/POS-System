import type { PaymentStatus } from "@workspace/db";

/* ── Provider-agnostic async payment abstraction ──────────────────────────────
   Buy-now-pay-later and other redirect/scan providers confirm out-of-band, so
   they share a common shape: create a charge → customer approves → we learn the
   result via webhook (status poll as fallback) → capture/finalise → optional
   refund. Zip Pay is the first implementation; Afterpay/Klarna/PayPal slot in by
   implementing this interface and registering below. */

export interface CreateChargeInput {
  /** Charge amount in major units (dollars). */
  amount: number;
  currency: string;
  /** Our own reference for reconciliation (the payment_attempts.orderRef). */
  orderRef: string;
  /** Forwarded to the provider so retries don't double-charge. */
  idempotencyKey?: string;
}

export interface CreateChargeResult {
  /** Provider-side charge/order identifier. */
  externalRef: string;
  /** QR/scan payload or approval URL the cashier shows the customer; null if none. */
  qrPayload: string | null;
  /** When the provider's approval window closes; null if open-ended. */
  expiresAt: Date | null;
  status: PaymentStatus;
  raw: unknown;
}

export interface StatusResult {
  status: PaymentStatus;
  failureReason?: string;
  raw: unknown;
}

export interface RefundResult {
  ok: boolean;
  status: PaymentStatus;
  error?: string;
  raw: unknown;
}

export interface WebhookEvent {
  externalRef: string;
  status: PaymentStatus;
  failureReason?: string;
  raw: unknown;
}

export interface PaymentProvider {
  /** Integration catalogue key, e.g. "zip". */
  readonly key: string;
  /** True when the provider separates authorisation from capture. */
  readonly requiresCapture: boolean;
  createCharge(merchantId: number, input: CreateChargeInput): Promise<CreateChargeResult>;
  getStatus(merchantId: number, externalRef: string): Promise<StatusResult>;
  /** Capture a previously authorised charge. No-op providers may resolve directly. */
  capture(merchantId: number, externalRef: string): Promise<StatusResult>;
  refund(merchantId: number, externalRef: string, amount: number): Promise<RefundResult>;
  /**
   * Void/cancel a charge that was never captured (customer abandoned, sale
   * discarded), releasing any hold on the customer. Optional: providers whose
   * charges auto-expire need not implement it. Resolves to the resulting status.
   */
  cancel?(merchantId: number, externalRef: string): Promise<StatusResult>;
  /**
   * Extract the provider-side charge reference from an UNVERIFIED webhook body.
   * Used only to resolve which merchant the event belongs to (so their signing
   * secret can be loaded); trust is established by verifyWebhook afterwards.
   * Returns null if the body is unparseable / has no reference.
   */
  extractWebhookRef(rawBody: string): string | null;
  /**
   * Verify a webhook signature against the given merchant's secret and parse it.
   * Resolves null if the signature is invalid or the merchant has no secret on
   * file. Async because the signing secret is loaded from the per-merchant vault
   * (each independent Zip merchant account has its own secret).
   */
  verifyWebhook(merchantId: number, rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<WebhookEvent | null>;
}

/** Raised when a provider is asked to act without configured credentials. */
export class PaymentProviderNotConfiguredError extends Error {
  constructor(public readonly providerKey: string) {
    super(`Payment provider "${providerKey}" is not configured for this merchant.`);
    this.name = "PaymentProviderNotConfiguredError";
  }
}

const REGISTRY = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider): void {
  REGISTRY.set(provider.key, provider);
}

export function getPaymentProvider(key: string): PaymentProvider | null {
  return REGISTRY.get(key) ?? null;
}
