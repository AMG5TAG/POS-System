import { pool } from "@workspace/db";
import type { Logger } from "pino";

/**
 * Idempotently creates (or replaces) the PostgreSQL views the management
 * reports depend on. drizzle-kit only manages tables declared in the schema,
 * so these report-only views live outside it — and a raw `drizzle-kit push`
 * (bypassing the `pnpm run db:push` wrapper) can drop them, which blanks the
 * Sales Overview / Profit & Loss / Product Performance reports with 500s.
 *
 * Safe to call on every server startup — CREATE OR REPLACE VIEW is a no-op
 * when the definition is unchanged. The setup-report-views script (run during
 * `pnpm run db:push`) does the same work; this call is a belt-and-suspenders
 * guard so the views always exist wherever the server runs.
 *
 * KEEP IN SYNC with scripts/src/setup-report-views.ts — both define the same
 * three views (that file documents the accounting conventions).
 */
export async function ensureReportViews(logger: Logger): Promise<void> {
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
    logger.info("Report views ensured: view_daily_sales_summary, view_payment_method_breakdown, view_product_performance_ledger");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
