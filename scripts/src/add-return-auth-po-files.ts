import { pool } from "@workspace/db";

/**
 * Return Authorisation enhancements:
 *  - purchase_order_id: links an RMA to the purchase order it came from.
 *  - return_items: structured list of products being returned (jsonb).
 *  - attachments: uploaded supporting files (jsonb).
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS purchase_order_id integer");
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS return_items jsonb");
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS attachments jsonb");
    console.log("product_return_auths: purchase_order_id + return_items + attachments ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
