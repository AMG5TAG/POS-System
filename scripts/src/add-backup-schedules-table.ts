import { pool } from "@workspace/db";

/**
 * Creates the `merchant_backup_schedules` table (multiple named backup
 * schedules per merchant). Idempotent — safe to run repeatedly and as part of
 * the db:push chain. Kept as a standalone script rather than relying on
 * `drizzle-kit push`, which would try to reconcile (and drop) the report views.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_backup_schedules (
        id              serial PRIMARY KEY,
        merchant_id     integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        label           text NOT NULL DEFAULT 'Backup',
        frequency       text NOT NULL DEFAULT 'daily',
        destination_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        enabled         boolean NOT NULL DEFAULT true,
        last_backup_at  timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS merchant_backup_schedules_merchant_id_idx ON merchant_backup_schedules (merchant_id)",
    );
    console.log("merchant_backup_schedules table ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
