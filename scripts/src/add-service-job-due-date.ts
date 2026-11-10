import { pool } from "@workspace/db";

/**
 * service_jobs.due_date — when a repair is promised by (YYYY-MM-DD), printed as
 * "Due:" on the repair sticker. A new nullable column: existing jobs simply
 * have no due date. Idempotent; part of db:push.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS due_date TEXT");
    console.log("service_jobs.due_date ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
