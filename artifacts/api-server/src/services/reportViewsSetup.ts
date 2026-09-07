import { pool, REPORT_VIEW_STATEMENTS } from "@workspace/db";
import type { Logger } from "pino";

/**
 * Idempotently creates (or replaces) the PostgreSQL views the management
 * reports depend on. drizzle-kit only manages tables declared in the schema,
 * so these report-only views live outside it — and a raw `drizzle-kit push`
 * (bypassing the `pnpm run db:push` wrapper) can drop them, which blanks the
 * Sales Overview / Profit & Loss / Product Performance reports with 500s.
 *
 * Safe to call on every server startup — CREATE OR REPLACE VIEW is a no-op
 * when the definition is unchanged.
 *
 * The view SQL is the single source of truth in @workspace/db
 * (REPORT_VIEW_STATEMENTS), shared verbatim with the setup-report-views script
 * run during `pnpm run db:push`, so the two can never drift.
 */
export async function ensureReportViews(logger: Logger): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const stmt of REPORT_VIEW_STATEMENTS) {
      await client.query(stmt);
    }
    await client.query("COMMIT");
    logger.info("Report views ensured: view_daily_sales_summary, view_invoice_payment_legs, view_layby_payment_legs, view_payment_method_breakdown, view_product_performance_ledger");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
