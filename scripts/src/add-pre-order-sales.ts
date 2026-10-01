import { pool } from "@workspace/db";

/**
 * Pre-order products and sale-linked pre-orders:
 *  - products.pre_order ("false" default), pre_order_release_date, pre_order_eta_date;
 *  - product_pre_orders: source ("manual" default — every existing row was typed
 *    in by hand), transaction_id, total_amount, allocated_quantity, arrived_at,
 *    notified_at, collected_at, collected_transaction_id.
 * Additive only: existing products stay normal products, existing pre-orders
 * keep every value they had.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`ALTER TABLE products
      ADD COLUMN IF NOT EXISTS pre_order text NOT NULL DEFAULT 'false',
      ADD COLUMN IF NOT EXISTS pre_order_release_date text,
      ADD COLUMN IF NOT EXISTS pre_order_eta_date text`);
    await pool.query(`ALTER TABLE product_pre_orders
      ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS transaction_id integer,
      ADD COLUMN IF NOT EXISTS total_amount numeric(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS allocated_quantity integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
      ADD COLUMN IF NOT EXISTS notified_at timestamptz,
      ADD COLUMN IF NOT EXISTS collected_at timestamptz,
      ADD COLUMN IF NOT EXISTS collected_transaction_id integer`);
    await pool.query(`CREATE INDEX IF NOT EXISTS product_pre_orders_merchant_status_idx ON product_pre_orders (merchant_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS product_pre_order_items_product_idx ON product_pre_order_items (product_id)`);
    console.log("products pre-order columns and product_pre_orders sale links ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
