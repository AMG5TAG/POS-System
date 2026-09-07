import { pool } from "@workspace/db";

/**
 * Creates the per-merchant `merchant_auto_sync_settings` table (automatic sync
 * schedule for pushing customers → account contacts and appointments → account
 * calendar). Idempotent — safe to run repeatedly and as part of the db:push
 * chain. Kept as a standalone script rather than relying on `drizzle-kit push`,
 * which would try to reconcile (and drop) the report views.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_auto_sync_settings (
        id                      serial PRIMARY KEY,
        merchant_id             integer NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
        contacts_provider       text NOT NULL DEFAULT '',
        contacts_frequency      text NOT NULL DEFAULT 'disabled',
        contacts_include_notes  boolean NOT NULL DEFAULT false,
        contacts_last_sync_at   timestamptz,
        calendar_provider       text NOT NULL DEFAULT '',
        calendar_frequency      text NOT NULL DEFAULT 'disabled',
        calendar_last_sync_at   timestamptz,
        updated_at              timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log("merchant_auto_sync_settings table ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
