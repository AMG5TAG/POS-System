import { Router, type IRouter, type Request } from "express";
import crypto from "crypto";
import { db, paymentAttemptsTable, transactionsTable, customersTable, type PaymentAttempt, type PaymentStatus } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { CreateTransactionBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { finalizeSale } from "./transactions";
import { getPaymentProvider, PaymentProviderNotConfiguredError } from "../services/payments/PaymentProvider";
import "../services/payments/zip";      // registers the Zip provider
import "../services/payments/afterpay"; // registers the Afterpay provider
import "../services/payments/klarna";   // registers the Klarna provider
import { logger } from "../lib/logger";

const router: IRouter = Router();

const TERMINAL: ReadonlySet<PaymentStatus> = new Set(["captured", "declined", "expired", "cancelled", "failed", "refunded"]);

/** Asynchronous (scan-to-pay / approval-then-capture) payment providers. */
const ASYNC_PAYMENT_PROVIDERS: ReadonlySet<string> = new Set(["zip", "afterpay", "klarna"]);
const PROVIDER_LABELS: Record<string, string> = { zip: "Zip", afterpay: "Afterpay", klarna: "Klarna" };
const providerLabel = (key: string) => PROVIDER_LABELS[key] ?? key;

type CreateTransactionInput = Extract<ReturnType<typeof CreateTransactionBody.safeParse>, { success: true }>["data"];

function publicAttempt(a: PaymentAttempt) {
  return {
    id: a.id,
    provider: a.provider,
    status: a.status,
    externalRef: a.externalRef,
    amount: parseFloat(a.amount),
    currency: a.currency,
    qrPayload: a.qrPayload,
    expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
    transactionId: a.transactionId,
    failureReason: a.failureReason,
  };
}

/**
 * Drive a payment attempt towards a terminal state in response to a provider
 * status (from a webhook or a status poll). Shared by both so the lifecycle
 * lives in one place.
 *
 * Money-safety: Zip orders are created with capture_funds=false, so funds are
 * only taken when WE capture. On approval we therefore (1) finalise the sale —
 * which validates stock/loyalty/gift-cards atomically — and only if that
 * succeeds do we (2) capture the funds. If capture then fails we leave the sale
 * standing and log loudly (manual reconciliation). Conversely a sale that fails
 * to finalise never captures, so the customer is never charged for a sale we
 * can't fulfil.
 */
async function settleAttempt(attempt: PaymentAttempt, providerStatus: PaymentStatus, providerData: unknown): Promise<PaymentAttempt> {
  if (TERMINAL.has(attempt.status as PaymentStatus)) return attempt;

  const provider = getPaymentProvider(attempt.provider);
  if (!provider) return attempt;
  const label = providerLabel(attempt.provider);

  // Negative outcomes: just record them.
  if (providerStatus === "declined" || providerStatus === "expired" || providerStatus === "cancelled" || providerStatus === "failed") {
    const [updated] = await db.update(paymentAttemptsTable)
      .set({ status: providerStatus, providerData: providerData as object, failureReason: `${label} reported "${providerStatus}"` })
      .where(eq(paymentAttemptsTable.id, attempt.id))
      .returning();
    return updated ?? attempt;
  }

  // Approval (authorized) or already-captured → finalise the parked sale, then capture.
  if (providerStatus === "authorized" || providerStatus === "captured") {
    const parsed = CreateTransactionBody.safeParse(attempt.salePayload);
    if (!parsed.success) {
      const [updated] = await db.update(paymentAttemptsTable)
        .set({ status: "failed", providerData: providerData as object, failureReason: "Parked sale payload is invalid" })
        .where(eq(paymentAttemptsTable.id, attempt.id)).returning();
      return updated ?? attempt;
    }
    const rawItems = Array.isArray((attempt.salePayload as { items?: unknown }).items)
      ? (attempt.salePayload as { items: Array<{ serials?: unknown }> }).items
      : [];

    const result = await finalizeSale(attempt.merchantId, parsed.data, rawItems);
    if (!result.ok) {
      const [updated] = await db.update(paymentAttemptsTable)
        .set({ status: "failed", providerData: providerData as object, failureReason: result.error })
        .where(eq(paymentAttemptsTable.id, attempt.id)).returning();
      logger.warn({ attemptId: attempt.id, provider: attempt.provider, externalRef: attempt.externalRef, error: result.error }, `${label}: sale finalisation failed after approval — not capturing funds`);
      return updated ?? attempt;
    }

    // Capture funds now that the sale is committed (skip if already captured).
    if (provider.requiresCapture && providerStatus !== "captured" && attempt.externalRef) {
      const cap = await provider.capture(attempt.merchantId, attempt.externalRef).catch((e: unknown) => {
        logger.error({ attemptId: attempt.id, provider: attempt.provider, err: e }, `${label}: capture threw after sale finalisation — manual reconciliation required`);
        return null;
      });
      if (!cap || cap.status === "failed") {
        logger.error({ attemptId: attempt.id, provider: attempt.provider, transactionId: result.transaction.id }, `${label}: capture failed after sale finalisation — sale stands, funds NOT captured`);
      }
    }

    // Stamp the provider order id onto the sale for receipts & reconciliation.
    if (attempt.externalRef) {
      await db.update(transactionsTable)
        .set({ notes: sql`COALESCE(${transactionsTable.notes}, '') || ${` [${label} ref: ${attempt.externalRef}]`}` })
        .where(eq(transactionsTable.id, result.transaction.id));
    }

    const [updated] = await db.update(paymentAttemptsTable)
      .set({ status: "captured", transactionId: result.transaction.id, providerData: providerData as object, failureReason: null })
      .where(eq(paymentAttemptsTable.id, attempt.id)).returning();
    return updated ?? attempt;
  }

  return attempt; // still pending
}

/* ── POST /payments/:provider/create ───────────────────────────────────────────
   Park a sale and open an async charge with the named provider (zip, afterpay).
   Body is the same CreateTransaction payload used by POST /transactions; the
   sale is NOT recorded until the provider captures. */
router.post("/payments/:provider/create", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const providerKey = String(req.params.provider);
  if (!ASYNC_PAYMENT_PROVIDERS.has(providerKey)) { res.status(404).json({ error: "Unknown payment provider" }); return; }
  const label = providerLabel(providerKey);

  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.items.length === 0) { res.status(400).json({ error: "Sale must include at least one item" }); return; }

  const provider = getPaymentProvider(providerKey);
  if (!provider) { res.status(500).json({ error: `${label} provider unavailable` }); return; }

  const amount = parsed.data.total;
  if (!(amount > 0)) { res.status(400).json({ error: "Sale total must be greater than zero" }); return; }

  // Ensure the parked sale carries a stable idempotency key so a webhook and a
  // status poll racing to finalise can never create two transactions.
  const salePayload: CreateTransactionInput = { ...parsed.data };
  if (!salePayload.idempotencyKey) salePayload.idempotencyKey = `${providerKey}_${crypto.randomUUID()}`;
  const orderRef = salePayload.idempotencyKey;

  let charge;
  try {
    charge = await provider.createCharge(merchantId, { amount, currency: "AUD", orderRef, idempotencyKey: orderRef });
  } catch (e) {
    if (e instanceof PaymentProviderNotConfiguredError) {
      res.status(400).json({ error: `${label} is not connected. Add your ${label} credentials under Management → Integrations.` });
      return;
    }
    logger.error({ err: e, merchantId, provider: providerKey }, `${label}: createCharge failed`);
    res.status(502).json({ error: e instanceof Error ? e.message : `Failed to start ${label} payment` });
    return;
  }

  const [attempt] = await db.insert(paymentAttemptsTable).values({
    merchantId,
    provider: providerKey,
    status: charge.status,
    externalRef: charge.externalRef,
    orderRef,
    amount: amount.toFixed(2),
    currency: "AUD",
    qrPayload: charge.qrPayload,
    expiresAt: charge.expiresAt,
    salePayload,
    providerData: charge.raw as object,
    idempotencyKey: salePayload.idempotencyKey,
  }).returning();

  res.status(201).json(publicAttempt(attempt));
});

/* ── GET /payments/:id/status ──────────────────────────────────────────────────
   Polling fallback for the POS while it waits for the customer to approve. */
router.get("/payments/:id/status", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid payment id" }); return; }

  const [attempt] = await db.select().from(paymentAttemptsTable)
    .where(and(eq(paymentAttemptsTable.id, id), eq(paymentAttemptsTable.merchantId, merchantId)));
  if (!attempt) { res.status(404).json({ error: "Payment not found" }); return; }

  if (TERMINAL.has(attempt.status as PaymentStatus) || !attempt.externalRef) {
    res.json(publicAttempt(attempt));
    return;
  }

  const provider = getPaymentProvider(attempt.provider);
  if (!provider) { res.json(publicAttempt(attempt)); return; }

  const status = await provider.getStatus(merchantId, attempt.externalRef).catch((e: unknown) => {
    logger.error({ err: e, attemptId: attempt.id, provider: attempt.provider }, `${providerLabel(attempt.provider)}: getStatus failed`);
    return null;
  });
  if (!status) { res.json(publicAttempt(attempt)); return; }

  const settled = await settleAttempt(attempt, status.status, status.raw);
  res.json(publicAttempt(settled));
});

/* ── POST /payments/:id/refund ─────────────────────────────────────────────────
   Reverse a captured Zip payment and mark the underlying sale refunded. */
router.post("/payments/:id/refund", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid payment id" }); return; }

  const [attempt] = await db.select().from(paymentAttemptsTable)
    .where(and(eq(paymentAttemptsTable.id, id), eq(paymentAttemptsTable.merchantId, merchantId)));
  if (!attempt) { res.status(404).json({ error: "Payment not found" }); return; }
  if (attempt.status !== "captured" || !attempt.externalRef) {
    res.status(400).json({ error: `Only captured payments can be refunded (this one is "${attempt.status}").` });
    return;
  }

  const provider = getPaymentProvider(attempt.provider);
  if (!provider) { res.status(500).json({ error: "Payment provider unavailable" }); return; }

  const refund = await provider.refund(merchantId, attempt.externalRef, parseFloat(attempt.amount)).catch((e: unknown) => {
    logger.error({ err: e, attemptId: attempt.id, provider: attempt.provider }, `${providerLabel(attempt.provider)}: refund failed`);
    return null;
  });
  if (!refund || !refund.ok) {
    res.status(502).json({ error: refund?.error ?? `${providerLabel(attempt.provider)} refund failed` });
    return;
  }

  await db.update(paymentAttemptsTable).set({ status: "refunded", providerData: refund.raw as object })
    .where(eq(paymentAttemptsTable.id, attempt.id));
  if (attempt.transactionId) {
    await db.update(transactionsTable)
      .set({ status: "refunded", notes: `Refunded via ${providerLabel(attempt.provider)}` })
      .where(and(eq(transactionsTable.id, attempt.transactionId), eq(transactionsTable.merchantId, merchantId)));
  }

  res.json({ status: "refunded" });
});

/* ── POST /webhooks/:provider ───────────────────────────────────────────────────
   Unauthenticated provider callback (zip, afterpay). Authenticity is established
   by HMAC signature over the raw body, not a session. */
router.post("/webhooks/:provider", async (req: Request & { rawBody?: string }, res): Promise<void> => {
  const providerKey = String(req.params.provider);
  if (!ASYNC_PAYMENT_PROVIDERS.has(providerKey)) { res.status(404).end(); return; }
  const provider = getPaymentProvider(providerKey);
  if (!provider) { res.status(503).end(); return; }

  const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});

  // Each merchant has an independent provider account with its own signing
  // secret, so resolve the merchant from the (unverified) order ref FIRST, then
  // verify the signature against that merchant's secret. The unverified parse is
  // only used to locate the row — trust comes from the signature check below.
  const ref = provider.extractWebhookRef(rawBody);
  if (!ref) { res.status(400).json({ error: "Unrecognised payload" }); return; }

  const [attempt] = await db.select().from(paymentAttemptsTable)
    .where(and(eq(paymentAttemptsTable.provider, providerKey), eq(paymentAttemptsTable.externalRef, ref)));
  // Unknown ref → ack so the provider stops retrying; nothing to do.
  if (!attempt) { res.status(200).json({ received: true }); return; }

  const event = await provider.verifyWebhook(attempt.merchantId, rawBody, req.headers);
  if (!event) { res.status(400).json({ error: "Invalid signature" }); return; }

  try {
    await settleAttempt(attempt, event.status, event.raw);
  } catch (e) {
    logger.error({ err: e, provider: providerKey, externalRef: event.externalRef }, `${providerLabel(providerKey)} webhook: settle failed`);
    res.status(500).json({ error: "Processing error" });
    return;
  }
  res.status(200).json({ received: true });
});

export default router;
