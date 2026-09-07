import { pool } from "@workspace/db";

/**
 * Device colour on a service job. The booking form used to fold brand and colour
 * into one "Device Description (Brand / Colour)" field; colour now has its own,
 * so `device_description` means the brand/model alone from here on.
 *
 * Purely additive — existing jobs keep whatever they already have in
 * `device_description`, colour included, and simply have no colour of their own.
 * Idempotent, and safe to run as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS device_colour text");
    console.log("service_jobs.device_colour ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
