/**
 * Creates (or replaces) the PostgreSQL views the management reports depend on.
 * drizzle-kit only manages tables declared in the schema, so these report-only
 * views have to be (re)created here (also run automatically by `pnpm run db:push`).
 *
 * The view SQL is the single source of truth in @workspace/db
 * (REPORT_VIEW_STATEMENTS), shared verbatim with the API server's
 * ensureReportViews() (re-run on every boot), so the two can never drift — and
 * db:push can no longer silently revert the views to a POS-only definition that
 * drops invoice/layby revenue and COGS from the reports.
 *
 * Safe to run multiple times — every statement is idempotent (CREATE OR REPLACE).
 * Run via: pnpm --filter @workspace/scripts run setup-report-views
 */
import { pool, REPORT_VIEW_STATEMENTS } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const stmt of REPORT_VIEW_STATEMENTS) {
      await client.query(stmt);
    }
    await client.query("COMMIT");
    console.log("Report views created/updated: view_daily_sales_summary, view_invoice_payment_legs, view_layby_payment_legs, view_payment_method_breakdown, view_product_performance_ledger");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("setup-report-views failed:", err);
  process.exit(1);
});
