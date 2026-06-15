import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Logger } from "pino";

/**
 * Expire stale async payment attempts (Zip Pay and future BNPL providers).
 *
 * An attempt sits in `pending`/`authorized` until the customer approves and the
 * webhook (or status poll) settles it. If the customer walks away, or the
 * webhook is never delivered, the row would otherwise linger forever. This
 * sweep marks such rows `expired` once the provider's own approval window
 * (`expires_at`) has passed, or — when the provider gave no deadline — after a
 * 30-minute fallback.
 *
 * Money-safety: Zip orders are created with capture_funds=false, so an expired
 * attempt was never charged. A late approval webhook arriving after expiry is
 * ignored (expired is terminal), so we simply never capture — the customer is
 * not charged for a sale that won't be recorded.
 */
async function expireStalePaymentAttempts(logger: Logger): Promise<void> {
  const result = await db.execute<{ count: string }>(sql`
    WITH expired AS (
      UPDATE payment_attempts
      SET status = 'expired',
          failure_reason = COALESCE(failure_reason, 'Approval window elapsed'),
          updated_at = NOW()
      WHERE status IN ('pending', 'authorized')
        AND (
          (expires_at IS NOT NULL AND expires_at < NOW())
          OR (expires_at IS NULL AND created_at < NOW() - INTERVAL '30 minutes')
        )
      RETURNING 1
    )
    SELECT COUNT(*)::text AS count FROM expired
  `);
  const count = parseInt(result.rows[0]?.count ?? "0", 10);
  if (count > 0) {
    logger.info({ count }, "Payment attempts: expired stale pending charges");
  }
}

export function schedulePaymentAttemptsExpiry(logger: Logger): void {
  const FIVE_MINUTES = 5 * 60 * 1000;
  expireStalePaymentAttempts(logger).catch((err) =>
    logger.error({ err }, "Payment attempts expiry startup run error"),
  );
  setInterval(
    () =>
      expireStalePaymentAttempts(logger).catch((err) =>
        logger.error({ err }, "Payment attempts expiry scheduled run error"),
      ),
    FIVE_MINUTES,
  );
  logger.info("Payment attempts expiry scheduler started (every 5 minutes)");
}
