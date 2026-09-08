import { pool } from "@workspace/db";

/**
 * Creates the `end_of_week_reports` table — the merchant-entered half of the
 * End of Week report (float retained, cash purchases, employee costs, banking).
 *
 * Purely additive and idempotent: CREATE TABLE / CREATE INDEX IF NOT EXISTS,
 * no existing column touched and no row rewritten. Safe to run repeatedly and
 * as part of the db:push chain. Kept as a standalone script rather than relying
 * on `drizzle-kit push`, which would try to reconcile (and drop) the report
 * views.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS end_of_week_reports (
        id                serial PRIMARY KEY,
        merchant_id       integer NOT NULL REFERENCES merchants(id),
        start_date        date NOT NULL,
        end_date          date NOT NULL,
        status            text NOT NULL DEFAULT 'draft',
        float_retained    numeric(12,2) NOT NULL DEFAULT '0',
        cash_counted      numeric(12,2),
        banked_amount     numeric(12,2),
        cash_purchases    jsonb NOT NULL DEFAULT '[]'::jsonb,
        staff_costs       jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes             text NOT NULL DEFAULT '',
        snapshot          jsonb,
        finalised_at      timestamptz,
        finalised_by      integer REFERENCES staff(id),
        finalised_by_name text,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS end_of_week_reports_merchant_idx ON end_of_week_reports (merchant_id)",
    );
    // Makes saving a draft an upsert rather than a pile of duplicate weeks.
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS end_of_week_reports_merchant_range_idx ON end_of_week_reports (merchant_id, start_date, end_date)",
    );
    console.log("end_of_week_reports table ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
