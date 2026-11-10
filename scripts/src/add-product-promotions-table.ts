import { pool } from "@workspace/db";

/**
 * Inventory › Promotions: creates product_promotions (saved promo card copy and
 * template per product). A new, empty table — nothing
 * existing changes.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_promotions (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        template text NOT NULL DEFAULT 'classic',
        copy jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS product_promotions_merchant_product_unique
        ON product_promotions (merchant_id, product_id)`);
    console.log("product_promotions ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
