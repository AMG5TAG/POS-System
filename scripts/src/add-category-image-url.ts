import { pool } from "@workspace/db";

/**
 * Category images for the online shop: adds categories.image_url (nullable
 * text). Additive only — no existing value changes; categories without an
 * image keep showing as they do now.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url text");
    console.log("categories.image_url ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
