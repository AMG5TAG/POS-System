/**
 * Backfills NULL cost_price values to '0' on the products table before the
 * schema migration sets the column NOT NULL.
 *
 * Safe to run multiple times — the UPDATE is a no-op when there are no NULLs.
 * Run via: pnpm --filter @workspace/scripts run backfill-cost-prices
 *          (called automatically by pnpm run db:push before drizzle-kit push)
 */
import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      UPDATE products SET cost_price = '0' WHERE cost_price IS NULL
    `);
    if (result.rowCount) {
      console.log(`backfill-cost-prices: set ${result.rowCount} NULL cost_price row(s) to 0`);
    } else {
      console.log("backfill-cost-prices: no NULL cost_price rows found, nothing to do");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("backfill-cost-prices failed:", err);
  process.exit(1);
});
