import { pool } from "@workspace/db";

/**
 * `sales_settings.eow_include_tax_in_staff_cost` — whether PAYG withheld counts
 * toward "cost to business" in the End of Week employee-cost total.
 *
 * Defaults to 'false', which is exactly what the report did before the option
 * existed: PAYG is withheld out of the wage, so adding it on top counts the same
 * dollars twice. Merchants who budget on the gross figure turn it on.
 *
 * Purely additive and idempotent: one new column with a default, no existing
 * column touched and no row rewritten. Weeks already finalised keep the totals
 * frozen in their snapshot, so flipping this cannot restate banked history.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS eow_include_tax_in_staff_cost text NOT NULL DEFAULT 'false'",
    );
    console.log("sales_settings.eow_include_tax_in_staff_cost ready (defaults to excluding PAYG)");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
