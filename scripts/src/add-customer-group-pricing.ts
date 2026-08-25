import { pool } from "@workspace/db";

/**
 * Customer-group default pricing: adds customer_settings.group_pricing, a
 * JSON-encoded GroupPricingRule[] holding each group's automatic price formula
 * (e.g. Trade = cost ex GST + 40%, capped at RRP).
 *
 * Before this column the rules had nowhere to live — PUT /customer-settings
 * dropped them, so they survived only in the browser cache and were lost on
 * refresh.
 *
 * Additive and idempotent — existing rows take the '[]' default, no data is
 * rewritten. Safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE customer_settings ADD COLUMN IF NOT EXISTS group_pricing text NOT NULL DEFAULT '[]'",
    );
    console.log("customer_settings.group_pricing ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
