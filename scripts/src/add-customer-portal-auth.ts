import { pool } from "@workspace/db";

/**
 * Customer-portal passwords.
 *
 * Adds the three things the portal login flow needs and nothing else:
 *
 *   - customers.portal_password_hash / _set_at / portal_last_login_at — all
 *     nullable, so every existing customer starts with no password, which is
 *     exactly the state that keeps their current portal link working.
 *   - merchants.require_portal_password — NOT NULL DEFAULT 'false', so the
 *     feature is off for every merchant until one opts in. (Booleans are stored
 *     as text throughout this schema; see CLAUDE.md.)
 *   - customer_portal_tokens — the single-use set-up/reset links, mirroring
 *     password_reset_tokens on the merchant side.
 *
 * Purely additive: no column is dropped, renamed or rewritten, and no existing
 * row's data changes. Idempotent — safe to run repeatedly and as part of the
 * db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS portal_password_hash text,
        ADD COLUMN IF NOT EXISTS portal_password_set_at timestamptz,
        ADD COLUMN IF NOT EXISTS portal_last_login_at timestamptz
    `);
    console.log("customers portal password columns ready");

    await pool.query(`
      ALTER TABLE merchants
        ADD COLUMN IF NOT EXISTS require_portal_password text NOT NULL DEFAULT 'false'
    `);
    console.log("merchants.require_portal_password ready (defaults off)");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_tokens (
        id serial PRIMARY KEY,
        customer_id integer NOT NULL REFERENCES customers(id),
        token_hash text NOT NULL UNIQUE,
        purpose text NOT NULL DEFAULT 'setup',
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS customer_portal_tokens_customer_id_idx
        ON customer_portal_tokens (customer_id)
    `);
    console.log("customer_portal_tokens ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
