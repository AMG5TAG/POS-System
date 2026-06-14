/**
 * Creates (or replaces) the PostgreSQL views that the management reports depend
 * on. drizzle-kit only manages tables declared in the schema, so these
 * report-only views have to be (re)created here.
 *
 * Views created:
 *   - view_daily_sales_summary       → /reports/profit-loss, /reports/sales-summary
 *   - view_payment_method_breakdown  → /reports/sales-summary
 *   - view_product_performance_ledger→ /reports/product-performance
 *
 * Accounting conventions (kept consistent with the rest of the app):
 *   - Prices/totals are GST-inclusive. `gross_revenue` is the inclusive amount.
 *   - `ex_gst_revenue` = gross_revenue − tax_collected.
 *   - COGS uses the cost price snapshotted on each line item at sale time and
 *     falls back to the product's current cost_price when the snapshot is
 *     missing (historical / imported sales) — matching the KPI and dashboard
 *     COGS calculations.
 *   - `net_profit` is ex-GST revenue − COGS (GST is collected on behalf of the
 *     ATO, not income), matching the gross-margin formula used by the report.
 *   - Product-level `total_revenue` is the GST-inclusive amount charged for the
 *     line (consistent with the inventory-valuation report's margin basis).
 *
 * Safe to run multiple times — every statement is idempotent (CREATE OR REPLACE).
 * Run via: pnpm --filter @workspace/scripts run setup-report-views
 *          (also called automatically by pnpm run db:push)
 *
 * KEEP IN SYNC with artifacts/api-server/src/services/reportViewsSetup.ts —
 * the API server re-runs the same statements on every boot as a guard against
 * the views being dropped (e.g. by a raw `drizzle-kit push`).
 */
import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Daily sales summary ────────────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE VIEW view_daily_sales_summary AS
      WITH daily_cogs AS (
        SELECT
          t.merchant_id,
          (t.created_at)::date AS sale_date,
          SUM(
            (item->>'quantity')::numeric
            * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0)
          ) AS total_cogs
        FROM transactions t
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END
        ) AS item
        LEFT JOIN products p
          ON p.id = NULLIF(item->>'productId', '')::int
         AND p.merchant_id = t.merchant_id
        WHERE t.status = 'completed'
        GROUP BY t.merchant_id, (t.created_at)::date
      )
      SELECT
        t.merchant_id,
        (t.created_at)::date AS sale_date,
        COUNT(*) FILTER (WHERE t.status = 'completed')                                  AS transaction_count,
        COALESCE(SUM(t.total)               FILTER (WHERE t.status = 'completed'), 0)   AS gross_revenue,
        COALESCE(SUM(t.total - t.tax_total) FILTER (WHERE t.status = 'completed'), 0)   AS ex_gst_revenue,
        COALESCE(SUM(t.tax_total)           FILTER (WHERE t.status = 'completed'), 0)   AS tax_collected,
        COALESCE(SUM(t.discount_total)      FILTER (WHERE t.status = 'completed'), 0)   AS discount_total,
        COALESCE(dc.total_cogs, 0)                                                      AS total_cogs,
        COALESCE(SUM(t.total - t.tax_total) FILTER (WHERE t.status = 'completed'), 0)
          - COALESCE(dc.total_cogs, 0)                                                  AS net_profit,
        COALESCE(SUM(t.total)               FILTER (WHERE t.status = 'refunded'), 0)    AS refund_total
      FROM transactions t
      LEFT JOIN daily_cogs dc
        ON dc.merchant_id = t.merchant_id
       AND dc.sale_date   = (t.created_at)::date
      GROUP BY t.merchant_id, (t.created_at)::date, dc.total_cogs;
    `);

    // ── Payment method breakdown ───────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE VIEW view_payment_method_breakdown AS
      SELECT
        t.merchant_id,
        (t.created_at)::date AS sale_date,
        t.payment_method,
        COUNT(*)                  AS transaction_count,
        COALESCE(SUM(t.total), 0) AS total_amount,
        COALESCE(AVG(t.total), 0) AS avg_transaction_value
      FROM transactions t
      WHERE t.status = 'completed'
      GROUP BY t.merchant_id, (t.created_at)::date, t.payment_method;
    `);

    // ── Product performance ledger ─────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE VIEW view_product_performance_ledger AS
      SELECT
        t.merchant_id,
        (t.created_at)::date AS sale_date,
        NULLIF(item->>'productId', '')::int       AS product_id,
        COALESCE(p.name, item->>'productName')    AS product_name,
        p.sku                                     AS sku,
        SUM((item->>'quantity')::numeric)         AS quantity_sold,
        SUM((item->>'totalPrice')::numeric)       AS total_revenue,
        SUM(
          (item->>'quantity')::numeric
          * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0)
        )                                         AS total_cogs,
        SUM((item->>'totalPrice')::numeric)
          - SUM(
              (item->>'quantity')::numeric
              * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0)
            )                                     AS gross_profit
      FROM transactions t
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END
      ) AS item
      LEFT JOIN products p
        ON p.id = NULLIF(item->>'productId', '')::int
       AND p.merchant_id = t.merchant_id
      WHERE t.status = 'completed'
        AND (item->>'productId') IS NOT NULL
        AND (item->>'productId') <> '0'
      GROUP BY
        t.merchant_id,
        (t.created_at)::date,
        NULLIF(item->>'productId', '')::int,
        COALESCE(p.name, item->>'productName'),
        p.sku;
    `);

    await client.query("COMMIT");
    console.log("Report views created/updated: view_daily_sales_summary, view_payment_method_breakdown, view_product_performance_ledger");
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
