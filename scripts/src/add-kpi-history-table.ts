import { pool } from "@workspace/db";

/**
 * Creates the `kpi_history` table — archived snapshots of a KPI's final result
 * for a completed period (e.g. a finished month). Idempotent — safe to run
 * repeatedly and as part of the db:push chain. Kept as a standalone script
 * rather than relying on `drizzle-kit push`, which would try to reconcile (and
 * drop) the report views.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kpi_history (
        id             serial PRIMARY KEY,
        merchant_id    integer NOT NULL REFERENCES merchants(id),
        target_id      text NOT NULL,
        kpi_target_id  integer,
        name           text NOT NULL,
        metric         text NOT NULL,
        category_id    text NOT NULL DEFAULT '',
        period         text NOT NULL DEFAULT 'monthly',
        target         numeric(12,2) NOT NULL DEFAULT '0',
        actual         numeric(12,2),
        staff_ids      text NOT NULL DEFAULT '[]',
        reward         text NOT NULL DEFAULT 'null',
        period_start   timestamptz NOT NULL,
        period_end     timestamptz NOT NULL,
        period_label   text NOT NULL DEFAULT '',
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS kpi_history_merchant_id_idx ON kpi_history (merchant_id)",
    );
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS kpi_history_merchant_target_period_idx ON kpi_history (merchant_id, target_id, period_start)",
    );
    console.log("kpi_history table ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
