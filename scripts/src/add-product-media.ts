import { pool } from "@workspace/db";

/**
 * Product gallery: adds products.media (jsonb, nullable) — extra images and
 * videos shown after the primary image. Additive only; existing products keep
 * their single image until more are added.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS media jsonb");
    console.log("products.media ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
