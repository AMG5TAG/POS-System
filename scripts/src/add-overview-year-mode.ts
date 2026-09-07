import { pool } from "@workspace/db";

/**
 * Adds the `overview_year_mode` column to `sales_settings`. Controls what the
 * "Year" tab on Management → Sales Overview means: the current Australian
 * financial year (1 Jul → 30 Jun) or a rolling window of the last 365 days.
 * Idempotent — safe to run repeatedly as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      ALTER TABLE sales_settings
      ADD COLUMN IF NOT EXISTS overview_year_mode text NOT NULL DEFAULT 'financial'
    `);
    console.log("sales_settings.overview_year_mode ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
