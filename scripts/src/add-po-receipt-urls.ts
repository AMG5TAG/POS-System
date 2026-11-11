import { pool } from "@workspace/db";

/**
 * purchase_orders.receipt_urls — payment receipts attached to a PO (JSON array
 * of storage URLs). A new nullable column: existing orders simply have none.
 * Idempotent; part of db:push.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS receipt_urls TEXT");
    console.log("purchase_orders.receipt_urls ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
