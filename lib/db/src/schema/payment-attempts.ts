import { pgTable, text, serial, timestamp, integer, numeric, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { transactionsTable } from "./transactions";

/**
 * payment_attempts — provider-agnostic record of an asynchronous external
 * payment (currently Zip Pay; the shape is intentionally generic so Afterpay,
 * Klarna, PayPal etc. can reuse it).
 *
 * Unlike cash / EFTPOS, buy-now-pay-later providers confirm out-of-band: the
 * customer approves on their phone and we learn the result via webhook (with a
 * status poll as fallback). We therefore CANNOT create the `transactions` row
 * up front — doing so would deduct inventory, award loyalty and burn gift cards
 * before the payment is real.
 *
 * Instead the whole pending sale is parked here in `salePayload` (the original
 * CreateTransaction request). When the provider reports `captured`, the webhook
 * handler replays `salePayload` through the normal transaction-finalisation
 * path, creating the real `transactions` row atomically, and stamps its id onto
 * `transactionId`. If the customer declines / it expires, no transaction is ever
 * created and stock is untouched.
 */
export const paymentAttemptsTable = pgTable("payment_attempts", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  /** Set only once the sale is finalised on capture. NULL while pending/failed. */
  transactionId:  integer("transaction_id").references(() => transactionsTable.id),
  /** Provider key from the integration catalogue, e.g. "zip". */
  provider:       text("provider").notNull(),
  /**
   * Lifecycle status. Canonical, provider-agnostic values:
   *   pending    — charge created at the provider, awaiting customer approval
   *   authorized — approved but not yet captured (providers with auth+capture)
   *   captured   — funds confirmed; `transactionId` is populated (terminal-success)
   *   declined   — customer/provider rejected the payment
   *   expired    — approval window lapsed without action
   *   cancelled  — cashier or customer aborted before approval
   *   failed     — an API/processing error prevented completion
   *   refunded   — a captured payment was later reversed via the provider
   */
  status:         text("status").notNull().default("pending"),
  /** Provider-side identifier for this charge/order (Zip order id). NULL until created. */
  externalRef:    text("external_ref"),
  /** Our own reference sent to the provider for reconciliation. */
  orderRef:       text("order_ref").notNull(),
  amount:         numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency:       text("currency").notNull().default("AUD"),
  /** QR code content / URL the cashier displays for the customer to scan. */
  qrPayload:      text("qr_payload"),
  /** When the provider's approval window closes, after which we treat it as expired. */
  expiresAt:      timestamp("expires_at", { withTimezone: true }),
  /** The parked CreateTransaction request, replayed verbatim on capture. */
  salePayload:    jsonb("sale_payload").notNull(),
  /** Last raw response / webhook event from the provider, for debugging & audit. */
  providerData:   jsonb("provider_data"),
  /** Human-readable reason when status is declined/expired/failed. */
  failureReason:  text("failure_reason"),
  /** Carries the sale's idempotency key so capture-time finalisation stays idempotent. */
  idempotencyKey: text("idempotency_key"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("payment_attempts_merchant_id_idx").on(t.merchantId),
  index("payment_attempts_merchant_id_status_idx").on(t.merchantId, t.status),
  index("payment_attempts_transaction_id_idx").on(t.transactionId),
  // One attempt per provider charge. externalRef is NULL until the charge is
  // created at the provider; Postgres treats NULLs as distinct, so unpersisted
  // attempts never collide — only a repeated (provider, externalRef) does.
  uniqueIndex("payment_attempts_provider_external_ref_idx").on(t.provider, t.externalRef),
  // The 5-minute expiry sweep filters non-terminal attempts by expires_at /
  // created_at with no merchantId, which the merchant-leading indexes can't
  // serve. This partial index covers exactly the rows the sweep scans.
  index("payment_attempts_expiry_sweep_idx").on(t.status, t.expiresAt)
    .where(sql`status IN ('pending', 'authorized')`),
]);

export type PaymentAttempt = typeof paymentAttemptsTable.$inferSelect;

/** Canonical payment lifecycle states, shared by the provider layer and the API. */
export const PAYMENT_STATUSES = [
  "pending", "authorized", "captured",
  "declined", "expired", "cancelled", "failed", "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

/** Terminal states — no further provider transitions are expected. */
export const PAYMENT_TERMINAL_STATUSES: readonly PaymentStatus[] = [
  "captured", "declined", "expired", "cancelled", "failed", "refunded",
];
