import { pool } from "@workspace/db";

/**
 * Online › Orders tracking: adds tracking_carrier, tracking_number (text,
 * default '') and shipped_at, delivered_at (timestamptz, null) to
 * delivery_orders. Additive only — no existing value changes.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      ALTER TABLE delivery_orders
        ADD COLUMN IF NOT EXISTS tracking_carrier text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS tracking_number  text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS shipped_at   timestamptz,
        ADD COLUMN IF NOT EXISTS delivered_at timestamptz
    `);
    console.log("delivery_orders tracking columns ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
