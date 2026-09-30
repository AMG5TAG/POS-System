import { pool } from "@workspace/db";

/**
 * Online shop wishlist: creates customer_wishlist_items (one row per customer
 * per product). A new, empty table — nothing existing changes. Rows go when
 * their customer or product is deleted.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_wishlist_items (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id),
        customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS customer_wishlist_items_customer_product_uniq
      ON customer_wishlist_items (customer_id, product_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS customer_wishlist_items_merchant_id_idx
      ON customer_wishlist_items (merchant_id)`);
    console.log("customer_wishlist_items ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
