import { pool } from "@workspace/db";

/**
 * How many items a service job covers. Media jobs (VHS, DVD, cassette) arrive as
 * a stack rather than a single device, so the booking form asks for a count.
 *
 * Purely additive and idempotent: existing jobs have no quantity, which reads as
 * the single device they always were. Safe as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS device_quantity integer");
    console.log("service_jobs.device_quantity ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
