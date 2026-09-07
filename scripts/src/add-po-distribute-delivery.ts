import { pool } from "@workspace/db";

async function main() {
  try {
    await pool.query("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS distribute_delivery TEXT NOT NULL DEFAULT 'false'");
    console.log("purchase_orders.distribute_delivery ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
