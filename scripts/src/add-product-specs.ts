import { pool } from "@workspace/db";

/**
 * Online shop product page: adds products.technical_specs, weight_kg,
 * length_cm, width_cm and height_cm (all nullable), and
 * product_reviews.customer_id with a partial unique index so a customer has at
 * most one review per product. Additive only — no existing value changes;
 * older review rows keep a null customer_id, which the index ignores.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS technical_specs text,
        ADD COLUMN IF NOT EXISTS weight_kg numeric(10,3),
        ADD COLUMN IF NOT EXISTS length_cm numeric(10,1),
        ADD COLUMN IF NOT EXISTS width_cm numeric(10,1),
        ADD COLUMN IF NOT EXISTS height_cm numeric(10,1)`);
    await pool.query("ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS customer_id integer");
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_customer_product_uniq
      ON product_reviews (merchant_id, product_id, customer_id) WHERE customer_id IS NOT NULL`);
    console.log("product specs and review customer link ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
