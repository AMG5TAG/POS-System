import { pool } from "@workspace/db";

/**
 * Shopping channels (Management › Online Store › Shopping Channels): adds
 * shop_settings.feed_token, the secret in the product feed's URL. A new,
 * nullable column — every existing row gets NULL, which means "feed off", so
 * nothing existing changes.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS feed_token text`);
    console.log("shop_settings.feed_token ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
