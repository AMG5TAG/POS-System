import { pool } from "@workspace/db";

/**
 * Creates the per-merchant `mobile_pos_app_settings` table backing the Mobile
 * POS web app. Idempotent — safe to run repeatedly and as part of db:push.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mobile_pos_app_settings (
        id            serial PRIMARY KEY,
        merchant_id   integer NOT NULL REFERENCES merchants(id),
        enabled       text NOT NULL DEFAULT 'true',
        show_sell     text NOT NULL DEFAULT 'true',
        show_invoices text NOT NULL DEFAULT 'true',
        show_products text NOT NULL DEFAULT 'true',
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log("mobile_pos_app_settings table ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
