import { pool } from "@workspace/db";

/**
 * Creates the per-merchant `service_settings` table (toggles for which sections
 * appear in the service job menu). Idempotent — safe to run repeatedly and as
 * part of the db:push chain. Kept as a standalone script rather than relying on
 * `drizzle-kit push`, which would try to reconcile (and drop) the report views
 * created by setup-report-views.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_settings (
        id          serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id),
        config      jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log("service_settings table ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
