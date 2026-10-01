import { pool } from "@workspace/db";

/**
 * Customer files the customer can see (POS › Customers › Files, and the shop
 * account's "Your files"): adds customer_files.visible_to_customer. A new
 * column defaulting to 'false' — every existing file stays staff only, so
 * nothing already uploaded becomes visible to a customer.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS visible_to_customer text NOT NULL DEFAULT 'false'`);
    console.log("customer_files.visible_to_customer ready (existing files stay staff only)");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
