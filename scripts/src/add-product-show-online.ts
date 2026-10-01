import { pool } from "@workspace/db";

/**
 * Online shop visibility: adds products.show_online ("true"/"false", default
 * "true"), so every active product is listed on koastal.com.au/shop until it is
 * switched off. Additive only — no existing value changes.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS show_online text NOT NULL DEFAULT 'true'");
    console.log("products.show_online ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
