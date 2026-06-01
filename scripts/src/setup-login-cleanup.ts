/**
 * Creates (or replaces) the cleanup_login_attempts() PostgreSQL function and,
 * if pg_cron is available, registers a daily cron job that calls it.
 *
 * Safe to run multiple times — all statements are idempotent.
 * Run via: pnpm --filter @workspace/scripts run setup-login-cleanup
 *          (also called automatically by pnpm run db:push)
 */
import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create the DB-level cleanup function.  This encapsulates the cleanup
    // logic inside PostgreSQL so that pg_cron (or any other DB scheduler) can
    // call it directly, independent of application uptime.
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
            -- Fully cleared rows: no lock, no hold, no failures
            (locked_until IS NULL AND account_hold_until IS NULL AND fail_count = 0)
            -- Expired lockouts that have been idle for more than a day
            OR (locked_until IS NOT NULL AND locked_until < NOW() - INTERVAL '1 day')
            -- Expired account holds that have been idle for more than a day
            OR (account_hold_until IS NOT NULL AND account_hold_until < NOW() - INTERVAL '1 day')
          RETURNING 1
        )
        SELECT COUNT(*) INTO deleted_count FROM deleted;
        RETURN deleted_count;
      END;
      $$;
    `);

    await client.query("COMMIT");
    console.log("cleanup_login_attempts() function created/updated in database");

    // Best-effort: try to wire up a daily pg_cron job.
    // pg_cron is an optional extension — if unavailable we fall back to the
    // Node.js application scheduler.
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
      // Remove any stale version of the job before re-creating it.
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
      console.log(
        "pg_cron job 'cleanup_login_attempts_daily' scheduled (runs at 03:00 UTC daily)",
      );
    } catch {
      console.log(
        "pg_cron not available — application-level scheduler remains the fallback",
      );
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("setup-login-cleanup failed:", err);
  process.exit(1);
});
