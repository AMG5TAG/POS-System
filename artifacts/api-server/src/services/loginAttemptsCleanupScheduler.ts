import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { trackedInterval } from "../lib/shutdown";
import type { Logger } from "pino";

/**
 * Direct DELETE fallback — used when the cleanup_login_attempts() DB function
 * is not yet available (e.g. db:push / startup setup has not run yet or failed
 * due to permissions).  Mirrors the logic inside the PostgreSQL function so
 * that cleanup always succeeds regardless of DB-function availability.
 */
async function cleanupDirect(logger: Logger): Promise<void> {
  const result = await db.execute<{ count: string }>(sql`
    WITH deleted AS (
      DELETE FROM login_attempts
      WHERE
        (locked_until IS NULL AND account_hold_until IS NULL AND fail_count = 0)
        OR (locked_until IS NOT NULL AND locked_until < NOW() - INTERVAL '1 day')
        OR (account_hold_until IS NOT NULL AND account_hold_until < NOW() - INTERVAL '1 day')
      RETURNING 1
    )
    SELECT COUNT(*)::text AS count FROM deleted
  `);
  const count = parseInt(result.rows[0]?.count ?? "0", 10);
  if (count > 0) {
    logger.info(
      { count },
      "Login attempts cleanup (direct SQL fallback): removed stale rows",
    );
  }
}

/**
 * Attempt cleanup via the DB-level cleanup_login_attempts() PostgreSQL function.
 * Falls back to a direct DELETE query when the function does not exist or
 * execution fails for any reason, so cleanup is always independent of whether
 * the DB-native setup has run successfully.
 *
 * When pg_cron is available and wired up (by ensureLoginCleanupFunction() /
 * setup-login-cleanup script), the database also runs cleanup_login_attempts()
 * at 03:00 UTC daily — independent of application uptime.  This scheduler is
 * the belt-and-suspenders fallback for environments where pg_cron is not
 * installed.
 */
async function cleanupLoginAttempts(logger: Logger): Promise<void> {
  try {
    const result = await db.execute<{ cleanup_login_attempts: string }>(
      sql`SELECT cleanup_login_attempts()`,
    );
    const count = parseInt(
      result.rows[0]?.cleanup_login_attempts ?? "0",
      10,
    );
    if (count > 0) {
      logger.info({ count }, "Login attempts cleanup: removed stale rows");
    }
  } catch {
    // DB function not available (not yet created, permission issue, etc.) —
    // fall back to direct SQL so cleanup is never skipped.
    logger.debug(
      "cleanup_login_attempts() DB function unavailable; falling back to direct SQL",
    );
    await cleanupDirect(logger);
  }
}

export function scheduleLoginAttemptsCleanup(logger: Logger): void {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  cleanupLoginAttempts(logger).catch((err) =>
    logger.error({ err }, "Login attempts cleanup startup run error"),
  );
  trackedInterval(
    () =>
      cleanupLoginAttempts(logger).catch((err) =>
        logger.error({ err }, "Login attempts cleanup scheduled run error"),
      ),
    ONE_DAY,
  );
  logger.info(
    "Login attempts cleanup scheduler started (daily fallback — pg_cron handles cleanup when available)",
  );
}
