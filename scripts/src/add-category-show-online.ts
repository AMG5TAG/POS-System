import { pool } from "@workspace/db";

/**
 * Online shop category visibility: adds categories.show_online ("true"/"false",
 * default "true"), so every category stays on shop.koastal.com.au until it is
 * hidden under Management › Online Store › Products. Additive only — no
 * existing value changes.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_online text NOT NULL DEFAULT 'true'");
    console.log("categories.show_online ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
