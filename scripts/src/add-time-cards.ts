import { pool } from "@workspace/db";

/**
 * Time Cards feature:
 *  - Adds products.time_card_minutes (prepaid duration for "time_card" products).
 *  - Creates the time_card_sessions table that backs the dashboard timer for
 *    each sold time card (status + accumulated elapsed seconds + running-since).
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE products ADD COLUMN IF NOT EXISTS time_card_minutes integer NOT NULL DEFAULT 0"
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS time_card_sessions (
        id                serial PRIMARY KEY,
        merchant_id       integer NOT NULL REFERENCES merchants(id),
        transaction_id    integer,
        product_id        integer,
        customer_id       integer,
        customer_name     text NOT NULL,
        label             text NOT NULL,
        purchased_seconds integer NOT NULL DEFAULT 0,
        status            text NOT NULL DEFAULT 'ready',
        elapsed_seconds   integer NOT NULL DEFAULT 0,
        running_since     timestamptz,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS time_card_sessions_merchant_status_idx ON time_card_sessions (merchant_id, status)"
    );
    console.log("products.time_card_minutes + time_card_sessions table ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
