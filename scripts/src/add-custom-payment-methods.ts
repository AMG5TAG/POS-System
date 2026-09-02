import { pool } from "@workspace/db";

/**
 * Adds the `custom_payment_methods` column to `pos_settings`. Holds a JSON array
 * of merchant-defined payment methods ({id,label,description,icon,enabled}) that
 * appear in the POS checkout alongside the built-in tenders. These are recorded
 * at checkout as a generic "other" tender with an audit note carrying the label.
 * Idempotent — safe to run repeatedly as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      ALTER TABLE pos_settings
      ADD COLUMN IF NOT EXISTS custom_payment_methods text NOT NULL DEFAULT '[]'
    `);
    console.log("pos_settings.custom_payment_methods ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
