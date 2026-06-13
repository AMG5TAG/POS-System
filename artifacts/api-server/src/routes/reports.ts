import { Router, type IRouter } from "express";
import { db, productsTable } from "@workspace/db";
import { sql, eq, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { getDefaultTaxRate, splitGstInclusive } from "../lib/tax";
import { z } from "zod/v4";

const router: IRouter = Router();

/* ── Shared date-range validator ─────────────────────────────────────────── */
const DateRangeParams = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
});

const SalesSummaryParams = DateRangeParams.extend({
  registerId: z.string().optional(),
});

/* ── Helper: round to 2dp ────────────────────────────────────────────────── */
const r2 = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;

/* ── GET /reports/profit-loss ────────────────────────────────────────────── */
router.get("/reports/profit-loss", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = DateRangeParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message }); return;
  }
  const { startDate, endDate } = parsed.data;
  const merchantId = req.session.merchantId!;

  const rows = await db.execute<{
    sale_date:         string;
    transaction_count: string;
    gross_revenue:     string;
    ex_gst_revenue:    string;
    tax_collected:     string;
    discount_total:    string;
    total_cogs:        string;
    net_profit:        string;
    refund_total:      string;
  }>(sql`
    SELECT
      sale_date::text,
      transaction_count,
      gross_revenue,
      ex_gst_revenue,
      tax_collected,
      discount_total,
      total_cogs,
      net_profit,
      refund_total
    FROM view_daily_sales_summary
    WHERE merchant_id = ${merchantId}
      AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
    ORDER BY sale_date
  `);

  const daily = rows.rows.map((r) => ({
    date:             r.sale_date,
    grossRevenue:     r2(r.gross_revenue),
    exGstRevenue:     r2(r.ex_gst_revenue),
    taxCollected:     r2(r.tax_collected),
    discountTotal:    r2(r.discount_total),
    totalCogs:        r2(r.total_cogs),
    netProfit:        r2(r.net_profit),
    refundTotal:      r2(r.refund_total),
    transactionCount: Number(r.transaction_count),
  }));

  const totals = daily.reduce((acc, d) => ({
    grossRevenue:     acc.grossRevenue     + d.grossRevenue,
    exGstRevenue:     acc.exGstRevenue     + d.exGstRevenue,
    taxCollected:     acc.taxCollected     + d.taxCollected,
    discountTotal:    acc.discountTotal    + d.discountTotal,
    totalCogs:        acc.totalCogs        + d.totalCogs,
    netProfit:        acc.netProfit        + d.netProfit,
    refundTotal:      acc.refundTotal      + d.refundTotal,
    transactionCount: acc.transactionCount + d.transactionCount,
  }), { grossRevenue: 0, exGstRevenue: 0, taxCollected: 0, discountTotal: 0, totalCogs: 0, netProfit: 0, refundTotal: 0, transactionCount: 0 });

  const grossMarginPct = totals.exGstRevenue > 0
    ? r2((totals.exGstRevenue - totals.totalCogs) / totals.exGstRevenue * 100)
    : 0;

  res.json({
    startDate,
    endDate,
    grossRevenue:     r2(totals.grossRevenue),
    exGstRevenue:     r2(totals.exGstRevenue),
    taxCollected:     r2(totals.taxCollected),
    discountTotal:    r2(totals.discountTotal),
    totalCogs:        r2(totals.totalCogs),
    netProfit:        r2(totals.netProfit),
    grossMarginPct,
    refundTotal:      r2(totals.refundTotal),
    transactionCount: totals.transactionCount,
    dailyBreakdown:   daily,
  });
});

/* ── GET /reports/sales-summary ──────────────────────────────────────────── */
router.get("/reports/sales-summary", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = SalesSummaryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message }); return;
  }
  const { startDate, endDate } = parsed.data;
  const merchantId = req.session.merchantId!;

  const [dailyRows, paymentRows] = await Promise.all([
    db.execute<{
      sale_date:         string;
      transaction_count: string;
      gross_revenue:     string;
      ex_gst_revenue:    string;
      tax_collected:     string;
      discount_total:    string;
      total_cogs:        string;
      net_profit:        string;
      refund_total:      string;
    }>(sql`
      SELECT
        sale_date::text,
        transaction_count,
        gross_revenue,
        ex_gst_revenue,
        tax_collected,
        discount_total,
        total_cogs,
        net_profit,
        refund_total
      FROM view_daily_sales_summary
      WHERE merchant_id = ${merchantId}
        AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
      ORDER BY sale_date
    `),
    db.execute<{
      payment_method:       string;
      transaction_count:    string;
      total_amount:         string;
      avg_transaction_value: string;
    }>(sql`
      SELECT
        payment_method,
        SUM(transaction_count)::int        AS transaction_count,
        SUM(total_amount)                  AS total_amount,
        AVG(avg_transaction_value)         AS avg_transaction_value
      FROM view_payment_method_breakdown
      WHERE merchant_id = ${merchantId}
        AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `),
  ]);

  const daily = dailyRows.rows.map((r) => ({
    date:             r.sale_date,
    grossRevenue:     r2(r.gross_revenue),
    exGstRevenue:     r2(r.ex_gst_revenue),
    taxCollected:     r2(r.tax_collected),
    discountTotal:    r2(r.discount_total),
    totalCogs:        r2(r.total_cogs),
    netProfit:        r2(r.net_profit),
    refundTotal:      r2(r.refund_total),
    transactionCount: Number(r.transaction_count),
  }));

  const totalRevenue     = r2(daily.reduce((s, d) => s + d.grossRevenue, 0));
  const transactionCount = daily.reduce((s, d) => s + d.transactionCount, 0);
  const avgOrderValue    = transactionCount > 0 ? r2(totalRevenue / transactionCount) : 0;

  const paymentBreakdown = paymentRows.rows.map((p) => ({
    paymentMethod:       p.payment_method,
    transactionCount:    Number(p.transaction_count),
    totalAmount:         r2(p.total_amount),
    avgTransactionValue: r2(p.avg_transaction_value),
  }));

  res.json({
    startDate,
    endDate,
    totalRevenue,
    transactionCount,
    avgOrderValue,
    paymentBreakdown,
    dailyBreakdown: daily,
  });
});

/* ── GET /reports/inventory-valuation ────────────────────────────────────── */
router.get("/reports/inventory-valuation", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const products = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.merchantId, merchantId),
        eq(productsTable.isActive, "true"),
        eq(productsTable.trackInventory, "true"),
      )
    );

  const items = products.map((p) => {
    const stock       = p.stockQuantity ?? 0;
    const cost        = parseFloat(p.costPrice ?? "0");
    const retail      = parseFloat(p.price);
    const costValue   = r2(stock * cost);
    const retailValue = r2(stock * retail);
    const marginPct   = retail > 0 ? r2((retail - cost) / retail * 100) : 0;
    return {
      productId:    p.id,
      name:         p.name,
      sku:          p.sku ?? null,
      stockQuantity: stock,
      costPrice:    r2(cost),
      retailPrice:  r2(retail),
      costValue,
      retailValue,
      marginPct,
    };
  });

  const totalSkus       = items.length;
  const totalUnits      = items.reduce((s, i) => s + i.stockQuantity, 0);
  const totalCostValue  = r2(items.reduce((s, i) => s + i.costValue, 0));
  const totalRetailValue = r2(items.reduce((s, i) => s + i.retailValue, 0));
  const potentialProfit = r2(totalRetailValue - totalCostValue);

  res.json({
    totalSkus,
    totalUnits,
    totalCostValue,
    totalRetailValue,
    potentialProfit,
    items,
  });
});

/* ── GET /reports/product-performance ────────────────────────────────────── */
router.get("/reports/product-performance", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = DateRangeParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message }); return;
  }
  const { startDate, endDate } = parsed.data;
  const merchantId = req.session.merchantId!;

  const rows = await db.execute<{
    product_id:   string;
    product_name: string;
    sku:          string;
    quantity_sold: string;
    total_revenue: string;
    total_cogs:   string;
    gross_profit: string;
  }>(sql`
    SELECT
      product_id,
      product_name,
      sku,
      SUM(quantity_sold)  AS quantity_sold,
      SUM(total_revenue)  AS total_revenue,
      SUM(total_cogs)     AS total_cogs,
      SUM(gross_profit)   AS gross_profit
    FROM view_product_performance_ledger
    WHERE merchant_id = ${merchantId}
      AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY product_id, product_name, sku
    ORDER BY total_revenue DESC
  `);

  const items = rows.rows.map((r) => {
    const revenue = r2(r.total_revenue);
    const cogs    = r2(r.total_cogs);
    const marginPct = revenue > 0 ? r2((revenue - cogs) / revenue * 100) : 0;
    return {
      productId:    Number(r.product_id),
      name:         r.product_name,
      sku:          r.sku || null,
      quantitySold: r2(r.quantity_sold),
      totalRevenue: revenue,
      totalCogs:    cogs,
      grossProfit:  r2(r.gross_profit),
      marginPct,
    };
  });

  res.json({ startDate, endDate, items });
});

/* ── GET /reports/z-report ───────────────────────────────────────────────── */
router.get("/reports/z-report", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
  const merchantId = req.session.merchantId!;

  const [summary, byMethod, invSummary, invByMethod, laySummary, layByMethod, taxRate] = await Promise.all([
    db.execute<{
      completed_count: string; gross_sales: string; discount_total: string;
      tax_collected: string; refund_count: string; refund_amount: string; refund_tax: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed')                          AS completed_count,
        COALESCE(SUM(total)         FILTER (WHERE status = 'completed'), 0)   AS gross_sales,
        COALESCE(SUM(discount_total) FILTER (WHERE status = 'completed'), 0)  AS discount_total,
        COALESCE(SUM(tax_total)      FILTER (WHERE status = 'completed'), 0)
          - COALESCE(SUM(ABS(tax_total)) FILTER (WHERE status = 'refunded'), 0) AS tax_collected,
        COUNT(*) FILTER (WHERE status = 'refunded')                           AS refund_count,
        COALESCE(SUM(ABS(total))     FILTER (WHERE status = 'refunded'), 0)   AS refund_amount,
        COALESCE(SUM(ABS(tax_total)) FILTER (WHERE status = 'refunded'), 0)   AS refund_tax
      FROM transactions
      WHERE merchant_id = ${merchantId}
        AND created_at::date = ${date}::date
    `),
    db.execute<{ payment_method: string; count: string; total: string }>(sql`
      SELECT payment_method, COUNT(*)::int AS count, COALESCE(SUM(total),0) AS total
      FROM transactions
      WHERE merchant_id = ${merchantId}
        AND status = 'completed'
        AND created_at::date = ${date}::date
      GROUP BY payment_method
      ORDER BY total DESC
    `),
    // Paid invoices count as takings on their settlement date (parity with POS).
    db.execute<{ cnt: string; gross: string; tax: string; disc: string }>(sql`
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total),0) AS gross,
             COALESCE(SUM(tax_total),0) AS tax, COALESCE(SUM(discount_total),0) AS disc
      FROM invoices
      WHERE merchant_id = ${merchantId} AND status = 'paid' AND paid_at::date = ${date}::date
    `),
    // Invoice payment legs settled on this date, summed per method (split-aware).
    db.execute<{ payment_method: string; count: string; total: string }>(sql`
      SELECT method AS payment_method, COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS total
      FROM view_invoice_payment_legs
      WHERE merchant_id = ${merchantId} AND paid_at::date = ${date}::date
      GROUP BY method
    `),
    // Completed laybys count as takings on their completion date (parity with
    // POS + invoices). Laybys carry no GST split, so tax is derived below.
    db.execute<{ cnt: string; gross: string }>(sql`
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_amount),0) AS gross
      FROM laybys l
      WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
        AND COALESCE(l.completed_at, l.updated_at)::date = ${date}::date
    `),
    // Layby payment legs completed on this date, summed per method (split-aware).
    db.execute<{ payment_method: string; count: string; total: string }>(sql`
      SELECT method AS payment_method, COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS total
      FROM view_layby_payment_legs
      WHERE merchant_id = ${merchantId} AND completed_at::date = ${date}::date
      GROUP BY method
    `),
    getDefaultTaxRate(merchantId),
  ]);

  const s = summary.rows[0] ?? { completed_count: "0", gross_sales: "0", discount_total: "0", tax_collected: "0", refund_count: "0", refund_amount: "0", refund_tax: "0" };
  const inv = invSummary.rows[0] ?? { cnt: "0", gross: "0", tax: "0", disc: "0" };
  const lay = laySummary.rows[0] ?? { cnt: "0", gross: "0" };
  // Layby totals are GST-inclusive with no stored split — derive the GST.
  const layGross = Number(lay.gross);
  const layTax   = splitGstInclusive(layGross, taxRate).gst;
  const grossSales    = r2(Number(s.gross_sales) + Number(inv.gross) + layGross);
  const discountTotal = r2(Number(s.discount_total) + Number(inv.disc));
  const refundAmount  = r2(s.refund_amount);
  const taxCollected  = r2(Number(s.tax_collected) + Number(inv.tax) + layTax); // refund GST + invoice GST + layby GST
  // Net Sales = gross less discounts, less refunds, less GST (ex-GST net sales)
  const netSalesExGst = r2(grossSales - discountTotal - refundAmount - taxCollected);

  // Merge invoice + layby payments into the by-method breakdown.
  const methodMap = new Map<string, { method: string; count: number; total: number }>();
  for (const r of byMethod.rows) methodMap.set(r.payment_method, { method: r.payment_method, count: Number(r.count), total: r2(r.total) });
  for (const r of [...invByMethod.rows, ...layByMethod.rows]) {
    const k = r.payment_method;
    const prev = methodMap.get(k) ?? { method: k, count: 0, total: 0 };
    methodMap.set(k, { method: k, count: prev.count + Number(r.count), total: r2(prev.total + Number(r.total)) });
  }
  const mergedByMethod = [...methodMap.values()].sort((a, b) => b.total - a.total);
  res.json({
    date,
    grossSales,
    discountTotal,
    taxCollected,
    netSales:         r2(grossSales - discountTotal - refundAmount),
    netSalesExGst,
    transactionCount: Number(s.completed_count) + Number(inv.cnt) + Number(lay.cnt),
    refundCount:      Number(s.refund_count),
    refundAmount,
    refundTax:        r2(s.refund_tax),
    byPaymentMethod:  mergedByMethod,
  });
});

/* ── GET /reports/staff-leaderboard ─────────────────────────────────────── */
router.get("/reports/staff-leaderboard", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = DateRangeParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { startDate, endDate } = parsed.data;
  const merchantId = req.session.merchantId!;

  // POS sales, paid invoices and completed laybys all credit the attributed staff member.
  const rows = await db.execute<{
    staff_id: string; staff_name: string; staff_role: string;
    transaction_count: string; total_revenue: string; avg_basket: string; total_discounts: string;
  }>(sql`
    WITH sales AS (
      SELECT t.staff_id, t.total::numeric AS total, COALESCE(t.discount_total, 0)::numeric AS discount_total
      FROM transactions t
      WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
        AND t.created_at::date BETWEEN ${startDate}::date AND ${endDate}::date
        AND t.staff_id IS NOT NULL
      UNION ALL
      SELECT i.staff_id, i.total::numeric AS total, COALESCE(i.discount_total, 0)::numeric AS discount_total
      FROM invoices i
      WHERE i.merchant_id = ${merchantId} AND i.status = 'paid' AND i.paid_at IS NOT NULL
        AND i.paid_at::date BETWEEN ${startDate}::date AND ${endDate}::date
        AND i.staff_id IS NOT NULL
      UNION ALL
      SELECT l.staff_id, l.total_amount::numeric AS total, 0::numeric AS discount_total
      FROM laybys l
      WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
        AND COALESCE(l.completed_at, l.updated_at)::date BETWEEN ${startDate}::date AND ${endDate}::date
        AND l.staff_id IS NOT NULL
    )
    SELECT
      sales.staff_id::text,
      COALESCE(s.name, 'Unknown') AS staff_name,
      COALESCE(s.role, 'cashier') AS staff_role,
      COUNT(*)::int               AS transaction_count,
      COALESCE(SUM(sales.total),0)    AS total_revenue,
      COALESCE(AVG(sales.total),0)    AS avg_basket,
      COALESCE(SUM(sales.discount_total),0) AS total_discounts
    FROM sales
    LEFT JOIN staff s ON s.id = sales.staff_id AND s.merchant_id = ${merchantId}
    GROUP BY sales.staff_id, s.name, s.role
    ORDER BY total_revenue DESC
  `);

  res.json({
    startDate, endDate,
    staff: rows.rows.map(r => ({
      staffId:          Number(r.staff_id),
      staffName:        r.staff_name,
      staffRole:        r.staff_role,
      transactionCount: Number(r.transaction_count),
      totalRevenue:     r2(r.total_revenue),
      avgBasket:        r2(r.avg_basket),
      totalDiscounts:   r2(r.total_discounts),
    })),
  });
});

export default router;
