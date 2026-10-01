import { pool } from "@workspace/db";

/**
 * Online shop options (Management › Online Store): creates shop_settings.
 * A new, empty table — nothing existing changes; every option defaults off.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_settings (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
        hide_out_of_stock text NOT NULL DEFAULT 'false',
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    console.log("shop_settings ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
