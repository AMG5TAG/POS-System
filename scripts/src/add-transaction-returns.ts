import { pool } from "@workspace/db";

/**
 * Returns & swaps (customer History › Return / swap): adds
 * transactions.return_of_transaction_id and its index. A new nullable column —
 * every existing sale is left as it is. Idempotent; part of db:push.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS return_of_transaction_id INTEGER");
    await pool.query("CREATE INDEX IF NOT EXISTS transactions_return_of_idx ON transactions (return_of_transaction_id)");
    console.log("transactions.return_of_transaction_id ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
