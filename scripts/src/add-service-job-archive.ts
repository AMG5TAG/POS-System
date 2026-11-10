import { pool } from "@workspace/db";

/**
 * Service Jobs › Archive: adds service_jobs.archived_at and archive_reason.
 * Two new nullable columns — every existing job is left unarchived, nothing
 * existing changes. Idempotent — safe to run repeatedly and in db:push.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS archive_reason TEXT");
    console.log("service_jobs.archived_at / archive_reason ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
