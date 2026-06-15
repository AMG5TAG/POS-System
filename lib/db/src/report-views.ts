/**
 * Single source of truth for the PostgreSQL views the management reports depend
 * on. drizzle-kit only manages tables declared in the schema, so these
 * report-only views live outside it.
 *
 * BOTH of these import and run these exact statements, so the definitions can
 * never drift:
 *   - artifacts/api-server/src/services/reportViewsSetup.ts  (re-run on every boot)
 *   - scripts/src/setup-report-views.ts                      (run during db:push)
 *
 * Accounting conventions:
 *   - Prices/totals are GST-inclusive; `gross_revenue` is the inclusive amount,
 *     `ex_gst_revenue` = gross_revenue − tax_collected.
 *   - COGS uses the cost price snapshotted on each line item at sale time and
 *     falls back to the product's current cost_price when the snapshot is
 *     missing — matching the KPI and dashboard COGS calculations.
 *   - `net_profit` = ex-GST revenue − COGS (GST is collected for the ATO).
 *   - Coverage spans POS sales + paid invoices + completed laybys.
 *
 * Statements MUST be applied in this order: view_payment_method_breakdown
 * references view_invoice_payment_legs and view_layby_payment_legs, so the leg
 * views are created first. Every statement is idempotent (CREATE OR REPLACE).
 */
export const REPORT_VIEW_STATEMENTS: readonly string[] = [
  // ── Daily sales summary (POS sales + paid invoices + completed laybys) ──
  // Laybys carry no GST split, so ex-GST/tax are derived from the merchant's
  // default tax rate (treating the layby total as GST-inclusive).
  `
    CREATE OR REPLACE VIEW view_daily_sales_summary AS
    WITH pos AS (
      SELECT
        t.merchant_id,
        (t.created_at)::date AS sale_date,
        COUNT(*) FILTER (WHERE t.status = 'completed')                                  AS transaction_count,
        COALESCE(SUM(t.total)               FILTER (WHERE t.status = 'completed'), 0)   AS gross_revenue,
        COALESCE(SUM(t.total - t.tax_total) FILTER (WHERE t.status = 'completed'), 0)   AS ex_gst_revenue,
        COALESCE(SUM(t.tax_total)           FILTER (WHERE t.status = 'completed'), 0)   AS tax_collected,
        COALESCE(SUM(t.discount_total)      FILTER (WHERE t.status = 'completed'), 0)   AS discount_total,
        COALESCE(SUM(t.total)               FILTER (WHERE t.status = 'refunded'), 0)    AS refund_total
      FROM transactions t
      GROUP BY t.merchant_id, (t.created_at)::date
    ),
    pos_cogs AS (
      SELECT t.merchant_id, (t.created_at)::date AS sale_date,
        SUM((item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0)) AS total_cogs
      FROM transactions t
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) AS item
      LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = t.merchant_id
      WHERE t.status = 'completed'
      GROUP BY t.merchant_id, (t.created_at)::date
    ),
    inv AS (
      SELECT i.merchant_id, (i.paid_at)::date AS sale_date,
        COUNT(*)                              AS transaction_count,
        COALESCE(SUM(i.total), 0)             AS gross_revenue,
        COALESCE(SUM(i.total - i.tax_total), 0) AS ex_gst_revenue,
        COALESCE(SUM(i.tax_total), 0)         AS tax_collected,
        COALESCE(SUM(i.discount_total), 0)    AS discount_total
      FROM invoices i
      WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
      GROUP BY i.merchant_id, (i.paid_at)::date
    ),
    inv_cogs AS (
      SELECT i.merchant_id, (i.paid_at)::date AS sale_date,
        SUM((item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0)) AS total_cogs
      FROM invoices i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.items::jsonb) = 'array' THEN i.items::jsonb ELSE '[]'::jsonb END) AS item
      LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = i.merchant_id
      WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
      GROUP BY i.merchant_id, (i.paid_at)::date
    ),
    lay AS (
      SELECT l.merchant_id, (COALESCE(l.completed_at, l.updated_at))::date AS sale_date,
        COUNT(*)                       AS transaction_count,
        COALESCE(SUM(l.total_amount), 0) AS gross_revenue,
        COALESCE(SUM(l.total_amount / (1 + COALESCE(NULLIF(ers.default_tax_rate, '')::numeric, 10) / 100)), 0) AS ex_gst_revenue,
        COALESCE(SUM(l.total_amount - l.total_amount / (1 + COALESCE(NULLIF(ers.default_tax_rate, '')::numeric, 10) / 100)), 0) AS tax_collected,
        0::numeric                     AS discount_total
      FROM laybys l
      -- LATERAL … LIMIT 1: merchant_id is not unique on regional_ext_settings,
      -- so a plain join would fan out (double-count) layby totals if a merchant
      -- ever had >1 settings row. Mirrors getDefaultTaxRate()'s LIMIT 1 read.
      LEFT JOIN LATERAL (
        SELECT default_tax_rate FROM regional_ext_settings
        WHERE merchant_id = l.merchant_id ORDER BY id LIMIT 1
      ) ers ON true
      WHERE l.status = 'completed'
      GROUP BY l.merchant_id, (COALESCE(l.completed_at, l.updated_at))::date
    ),
    lay_cogs AS (
      SELECT l.merchant_id, (COALESCE(l.completed_at, l.updated_at))::date AS sale_date,
        SUM((item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0)) AS total_cogs
      FROM laybys l
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(l.items) = 'array' THEN l.items ELSE '[]'::jsonb END) AS item
      LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = l.merchant_id
      WHERE l.status = 'completed'
      GROUP BY l.merchant_id, (COALESCE(l.completed_at, l.updated_at))::date
    ),
    days AS (
      SELECT merchant_id, sale_date FROM pos
      UNION
      SELECT merchant_id, sale_date FROM inv
      UNION
      SELECT merchant_id, sale_date FROM lay
    )
    SELECT
      d.merchant_id,
      d.sale_date,
      COALESCE(pos.transaction_count, 0) + COALESCE(inv.transaction_count, 0) + COALESCE(lay.transaction_count, 0) AS transaction_count,
      COALESCE(pos.gross_revenue, 0)     + COALESCE(inv.gross_revenue, 0)     + COALESCE(lay.gross_revenue, 0)     AS gross_revenue,
      COALESCE(pos.ex_gst_revenue, 0)    + COALESCE(inv.ex_gst_revenue, 0)    + COALESCE(lay.ex_gst_revenue, 0)    AS ex_gst_revenue,
      COALESCE(pos.tax_collected, 0)     + COALESCE(inv.tax_collected, 0)     + COALESCE(lay.tax_collected, 0)     AS tax_collected,
      COALESCE(pos.discount_total, 0)    + COALESCE(inv.discount_total, 0)    + COALESCE(lay.discount_total, 0)    AS discount_total,
      COALESCE(pos_cogs.total_cogs, 0)   + COALESCE(inv_cogs.total_cogs, 0)   + COALESCE(lay_cogs.total_cogs, 0)   AS total_cogs,
      (COALESCE(pos.ex_gst_revenue, 0)   + COALESCE(inv.ex_gst_revenue, 0)    + COALESCE(lay.ex_gst_revenue, 0))
        - (COALESCE(pos_cogs.total_cogs, 0) + COALESCE(inv_cogs.total_cogs, 0) + COALESCE(lay_cogs.total_cogs, 0)) AS net_profit,
      COALESCE(pos.refund_total, 0)                                                   AS refund_total
    FROM days d
    LEFT JOIN pos      ON pos.merchant_id      = d.merchant_id AND pos.sale_date      = d.sale_date
    LEFT JOIN pos_cogs ON pos_cogs.merchant_id = d.merchant_id AND pos_cogs.sale_date = d.sale_date
    LEFT JOIN inv      ON inv.merchant_id      = d.merchant_id AND inv.sale_date      = d.sale_date
    LEFT JOIN inv_cogs ON inv_cogs.merchant_id = d.merchant_id AND inv_cogs.sale_date = d.sale_date
    LEFT JOIN lay      ON lay.merchant_id      = d.merchant_id AND lay.sale_date      = d.sale_date
    LEFT JOIN lay_cogs ON lay_cogs.merchant_id = d.merchant_id AND lay_cogs.sale_date = d.sale_date;
  `,

  // ── Invoice payment legs (per-method amounts) ──────────────────────────────
  `
    CREATE OR REPLACE VIEW view_invoice_payment_legs AS
    SELECT i.merchant_id, i.paid_at,
      COALESCE(e->>'method', 'invoice') AS method,
      (e->>'amount')::numeric           AS amount
    FROM invoices i
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.events::jsonb) = 'array' THEN i.events::jsonb ELSE '[]'::jsonb END) e
    WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
      AND e->>'type' = 'payment' AND (e->>'amount') IS NOT NULL AND (e->>'amount')::numeric > 0
    UNION ALL
    SELECT i.merchant_id, i.paid_at,
      COALESCE((SELECT e2->>'method' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.events::jsonb) = 'array' THEN i.events::jsonb ELSE '[]'::jsonb END) e2
                WHERE e2->>'type' = 'payment' AND (e2->>'method') IS NOT NULL
                ORDER BY (e2->>'timestamp') DESC LIMIT 1), 'invoice') AS method,
      (i.amount_paid::numeric - COALESCE((SELECT SUM((e3->>'amount')::numeric) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.events::jsonb) = 'array' THEN i.events::jsonb ELSE '[]'::jsonb END) e3
                WHERE e3->>'type' = 'payment' AND (e3->>'amount') IS NOT NULL), 0)) AS amount
    FROM invoices i
    WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
      AND (i.amount_paid::numeric - COALESCE((SELECT SUM((e3->>'amount')::numeric) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.events::jsonb) = 'array' THEN i.events::jsonb ELSE '[]'::jsonb END) e3
                WHERE e3->>'type' = 'payment' AND (e3->>'amount') IS NOT NULL), 0)) > 0.005;
  `,

  // ── Layby payment legs ─────────────────────────────────────────────────────
  `
    CREATE OR REPLACE VIEW view_layby_payment_legs AS
    SELECT l.merchant_id, COALESCE(l.completed_at, l.updated_at) AS completed_at,
      lp.payment_method AS method, lp.amount::numeric AS amount
    FROM laybys l
    JOIN layby_payments lp ON lp.layby_id = l.id
    WHERE l.status = 'completed'
    UNION ALL
    SELECT l.merchant_id, COALESCE(l.completed_at, l.updated_at) AS completed_at,
      COALESCE((SELECT lp2.payment_method FROM layby_payments lp2 WHERE lp2.layby_id = l.id ORDER BY lp2.created_at DESC LIMIT 1), 'layby') AS method,
      (l.total_amount::numeric - COALESCE((SELECT SUM(lp3.amount::numeric) FROM layby_payments lp3 WHERE lp3.layby_id = l.id), 0)) AS amount
    FROM laybys l
    WHERE l.status = 'completed'
      AND (l.total_amount::numeric - COALESCE((SELECT SUM(lp3.amount::numeric) FROM layby_payments lp3 WHERE lp3.layby_id = l.id), 0)) > 0.005;
  `,

  // ── Payment method breakdown (POS + invoice legs + layby legs) ─────────────
  `
    CREATE OR REPLACE VIEW view_payment_method_breakdown AS
    WITH paid AS (
      SELECT t.merchant_id, (t.created_at)::date AS sale_date, t.payment_method, t.total
      FROM transactions t
      WHERE t.status = 'completed'
      UNION ALL
      SELECT merchant_id, (paid_at)::date AS sale_date, method AS payment_method, amount AS total
      FROM view_invoice_payment_legs
      UNION ALL
      SELECT merchant_id, (completed_at)::date AS sale_date, method AS payment_method, amount AS total
      FROM view_layby_payment_legs
    )
    SELECT
      merchant_id,
      sale_date,
      payment_method,
      COUNT(*)                AS transaction_count,
      COALESCE(SUM(total), 0) AS total_amount,
      COALESCE(AVG(total), 0) AS avg_transaction_value
    FROM paid
    GROUP BY merchant_id, sale_date, payment_method;
  `,

  // ── Product performance ledger (POS + paid invoices + completed laybys) ────
  `
    CREATE OR REPLACE VIEW view_product_performance_ledger AS
    WITH lines AS (
      -- POS line items (revenue carried as totalPrice)
      SELECT
        t.merchant_id,
        (t.created_at)::date AS sale_date,
        NULLIF(item->>'productId', '')::int    AS product_id,
        COALESCE(p.name, item->>'productName') AS product_name,
        p.sku                                  AS sku,
        (item->>'quantity')::numeric           AS quantity,
        (item->>'totalPrice')::numeric         AS revenue,
        (item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0) AS cogs
      FROM transactions t
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) AS item
      LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = t.merchant_id
      WHERE t.status = 'completed' AND (item->>'productId') IS NOT NULL AND (item->>'productId') <> '0'
      UNION ALL
      -- Paid-invoice line items (revenue = quantity × unitPrice)
      SELECT
        i.merchant_id,
        (i.paid_at)::date AS sale_date,
        NULLIF(item->>'productId', '')::int     AS product_id,
        COALESCE(p.name, item->>'description')  AS product_name,
        p.sku                                   AS sku,
        (item->>'quantity')::numeric            AS quantity,
        (item->>'quantity')::numeric * (item->>'unitPrice')::numeric AS revenue,
        (item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0) AS cogs
      FROM invoices i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.items::jsonb) = 'array' THEN i.items::jsonb ELSE '[]'::jsonb END) AS item
      LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = i.merchant_id
      WHERE i.status = 'paid' AND i.paid_at IS NOT NULL AND (item->>'productId') IS NOT NULL AND (item->>'productId') <> '0'
      UNION ALL
      -- Completed-layby line items (revenue = quantity × price; cost snapshot
      -- captured at sale, falling back to the product's current cost)
      SELECT
        l.merchant_id,
        (COALESCE(l.completed_at, l.updated_at))::date AS sale_date,
        NULLIF(item->>'productId', '')::int      AS product_id,
        COALESCE(p.name, item->>'productName')   AS product_name,
        p.sku                                    AS sku,
        (item->>'quantity')::numeric             AS quantity,
        (item->>'quantity')::numeric * (item->>'price')::numeric AS revenue,
        (item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0) AS cogs
      FROM laybys l
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(l.items) = 'array' THEN l.items ELSE '[]'::jsonb END) AS item
      LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = l.merchant_id
      WHERE l.status = 'completed' AND (item->>'productId') IS NOT NULL AND (item->>'productId') <> '0'
    )
    SELECT
      merchant_id,
      sale_date,
      product_id,
      product_name,
      sku,
      SUM(quantity)            AS quantity_sold,
      SUM(revenue)             AS total_revenue,
      SUM(cogs)                AS total_cogs,
      SUM(revenue) - SUM(cogs) AS gross_profit
    FROM lines
    GROUP BY merchant_id, sale_date, product_id, product_name, sku;
  `,
];
