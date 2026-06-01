import { pool } from "@workspace/db";
import type { Logger } from "pino";

/**
 * Idempotently creates the cleanup_login_attempts() PostgreSQL function and,
 * if pg_cron is available in this PostgreSQL instance, registers a daily cron
 * job (03:00 UTC) so cleanup runs independently of application uptime.
 *
 * Safe to call on every server startup — CREATE OR REPLACE is a no-op when
 * the function body is unchanged.  The setup-login-cleanup script (run during
 * `pnpm run db:push`) does the same work; this call is a belt-and-suspenders
 * guard for environments where db:push was not run before starting the server.
 */
export async function ensureLoginCleanupFunction(
  logger: Logger,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_login_attempts()
      RETURNS integer
      LANGUAGE plpgsql
      AS $$
      DECLARE
        deleted_count integer;
      BEGIN
        WITH deleted AS (
          DELETE FROM login_attempts
          WHERE
            (locked_until IS NULL AND account_hold_until IS NULL AND fail_count = 0)
            OR (locked_until IS NOT NULL AND locked_until < NOW() - INTERVAL '1 day')
            OR (account_hold_until IS NOT NULL AND account_hold_until < NOW() - INTERVAL '1 day')
          RETURNING 1
        )
        SELECT COUNT(*) INTO deleted_count FROM deleted;
        RETURN deleted_count;
      END;
      $$;
    `);
    logger.info("cleanup_login_attempts() DB function ensured");

    // Best-effort pg_cron wiring — silently skip if extension is unavailable.
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
      await client.query(`
        SELECT cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'cleanup_login_attempts_daily';
      `);
      await client.query(`
        SELECT cron.schedule(
          'cleanup_login_attempts_daily',
          '0 3 * * *',
          $$SELECT cleanup_login_attempts();$$
        );
      `);
      logger.info(
        "pg_cron job 'cleanup_login_attempts_daily' scheduled (03:00 UTC daily)",
      );
    } catch {
      logger.debug(
        "pg_cron not available — application-level scheduler is the cleanup fallback",
      );
    }
  } catch (err) {
    // Log but do not crash the server — the in-process scheduler still runs.
    logger.warn(
      { err },
      "Could not ensure cleanup_login_attempts() DB function; application-level scheduler will handle cleanup",
    );
  } finally {
    client.release();
  }
}
