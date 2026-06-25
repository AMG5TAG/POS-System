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
    surcharge_cost:    string;
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
      refund_total,
      surcharge_cost
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
    surchargeCost:    r2(r.surcharge_cost),
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
    surchargeCost:    acc.surchargeCost    + d.surchargeCost,
    transactionCount: acc.transactionCount + d.transactionCount,
  }), { grossRevenue: 0, exGstRevenue: 0, taxCollected: 0, discountTotal: 0, totalCogs: 0, netProfit: 0, refundTotal: 0, surchargeCost: 0, transactionCount: 0 });

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
    surchargeCost:    r2(totals.surchargeCost),
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

/* ── GET /reports/cost-of-goods ──────────────────────────────────────────── */
// Monthly cost of goods: COGS actually sold (POS + paid invoices + completed
// laybys, using the at-sale cost snapshot only) plus procurement spend from
// purchase orders, broken down by supplier and split into goods vs shipping.
// Shipping is the PO's recorded delivery charge (GST-grossed to match how it is
// folded into total_cost); goods is the remainder (total_cost − shipping) so the
// two reconcile to purchase spend even for POs with no captured line items. Draft
// and Cancelled POs are excluded — they are not committed spend.
router.get("/reports/cost-of-goods", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = DateRangeParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { startDate, endDate } = parsed.data;
  const merchantId = req.session.merchantId!;

  // ePay / digital top-up products are pass-through (you don't hold them as
  // stock), so they don't belong in cost of goods — a large ePay catalogue would
  // otherwise dominate sold COGS. Scoped to the isEpay product flag only, so a
  // physical product that merely carries an "ePay" supplier name still counts.
  const notEpay = sql`COALESCE(p.is_epay, 'false') <> 'true'`;

  const [cogsRows, poRows, soldRows] = await Promise.all([
    db.execute<{ month: string; cogs_pos: string; cogs_invoice: string; cogs_layby: string }>(sql`
      WITH cogs AS (
        SELECT to_char((t.created_at)::date, 'YYYY-MM') AS month, 'pos' AS src,
          SUM((item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, 0)) AS cogs
        FROM transactions t
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) AS item
        LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = t.merchant_id
        WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
          AND (t.created_at)::date BETWEEN ${startDate}::date AND ${endDate}::date
          AND ${notEpay}
        GROUP BY 1, 2
        UNION ALL
        SELECT to_char((i.paid_at)::date, 'YYYY-MM'), 'invoice',
          SUM((item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, 0))
        FROM invoices i
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.items::jsonb) = 'array' THEN i.items::jsonb ELSE '[]'::jsonb END) AS item
        LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = i.merchant_id
        WHERE i.merchant_id = ${merchantId} AND i.status = 'paid' AND i.paid_at IS NOT NULL
          AND (i.paid_at)::date BETWEEN ${startDate}::date AND ${endDate}::date
          AND ${notEpay}
        GROUP BY 1, 2
        UNION ALL
        SELECT to_char((COALESCE(l.completed_at, l.updated_at))::date, 'YYYY-MM'), 'layby',
          SUM((item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, 0))
        FROM laybys l
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(l.items) = 'array' THEN l.items ELSE '[]'::jsonb END) AS item
        LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = l.merchant_id
        WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
          AND (COALESCE(l.completed_at, l.updated_at))::date BETWEEN ${startDate}::date AND ${endDate}::date
          AND ${notEpay}
        GROUP BY 1, 2
      )
      SELECT month,
        COALESCE(SUM(cogs) FILTER (WHERE src = 'pos'), 0)     AS cogs_pos,
        COALESCE(SUM(cogs) FILTER (WHERE src = 'invoice'), 0) AS cogs_invoice,
        COALESCE(SUM(cogs) FILTER (WHERE src = 'layby'), 0)   AS cogs_layby
      FROM cogs
      GROUP BY month
    `),
    db.execute<{
      supplier_id: string | null; supplier_name: string | null; month: string;
      total_cost: string; delivery_charge: string; delivery_tax_mode: string; items_ordered: string;
    }>(sql`
      SELECT
        p.supplier_id,
        s.name AS supplier_name,
        to_char(LEFT(p.order_date, 10)::date, 'YYYY-MM') AS month,
        p.total_cost::numeric AS total_cost,
        p.delivery_charge::numeric AS delivery_charge,
        p.delivery_tax_mode AS delivery_tax_mode,
        COALESCE((SELECT SUM(pi.quantity) FROM purchase_order_items pi WHERE pi.po_id = p.id), 0) AS items_ordered
      FROM purchase_orders p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.merchant_id = ${merchantId}
        AND p.status NOT IN ('Draft', 'Cancelled')
        AND p.order_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        AND LEFT(p.order_date, 10)::date BETWEEN ${startDate}::date AND ${endDate}::date
    `),
    // Sold COGS attributed to each product's supplier (products.supplier is a
    // free-text name on the product). Lines with no matching product or a blank
    // supplier fall into "Unassigned" so the rows reconcile to total cogsSold.
    db.execute<{ supplier: string; sold_cogs: string }>(sql`
      SELECT COALESCE(NULLIF(TRIM(x.supplier), ''), 'Unassigned') AS supplier, SUM(x.cogs) AS sold_cogs
      FROM (
        SELECT p.supplier AS supplier,
          (item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, 0) AS cogs
        FROM transactions t
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) AS item
        LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = t.merchant_id
        WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
          AND (t.created_at)::date BETWEEN ${startDate}::date AND ${endDate}::date
          AND ${notEpay}
        UNION ALL
        SELECT p.supplier,
          (item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, 0)
        FROM invoices i
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.items::jsonb) = 'array' THEN i.items::jsonb ELSE '[]'::jsonb END) AS item
        LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = i.merchant_id
        WHERE i.merchant_id = ${merchantId} AND i.status = 'paid' AND i.paid_at IS NOT NULL
          AND (i.paid_at)::date BETWEEN ${startDate}::date AND ${endDate}::date
          AND ${notEpay}
        UNION ALL
        SELECT p.supplier,
          (item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, 0)
        FROM laybys l
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(l.items) = 'array' THEN l.items ELSE '[]'::jsonb END) AS item
        LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = l.merchant_id
        WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
          AND (COALESCE(l.completed_at, l.updated_at))::date BETWEEN ${startDate}::date AND ${endDate}::date
          AND ${notEpay}
      ) x
      GROUP BY 1
    `),
  ]);

  // Merge COGS-sold months and purchase-order months into one monthly series.
  type MonthAgg = {
    month: string; cogsPos: number; cogsInvoice: number; cogsLayby: number;
    purchaseSpend: number; goodsSpend: number; shippingCost: number; purchaseOrderCount: number;
  };
  const months = new Map<string, MonthAgg>();
  const getMonth = (m: string): MonthAgg => {
    let row = months.get(m);
    if (!row) {
      row = { month: m, cogsPos: 0, cogsInvoice: 0, cogsLayby: 0, purchaseSpend: 0, goodsSpend: 0, shippingCost: 0, purchaseOrderCount: 0 };
      months.set(m, row);
    }
    return row;
  };

  for (const r of cogsRows.rows) {
    const m = getMonth(r.month);
    m.cogsPos     += r2(r.cogs_pos);
    m.cogsInvoice += r2(r.cogs_invoice);
    m.cogsLayby   += r2(r.cogs_layby);
  }

  // Supplier breakdown — keyed by normalised supplier name so purchase-order
  // spend (suppliers.name) and sold COGS (products.supplier free text) merge
  // into one row per supplier. Also folds the PO figures into the monthly series.
  type SupAgg = {
    supplierId: number | null; supplierName: string; purchaseSpend: number;
    goodsSpend: number; shippingCost: number; purchaseOrderCount: number;
    itemsOrdered: number; soldCogs: number;
  };
  const suppliers = new Map<string, SupAgg>();
  const getSupplier = (name: string, supplierId: number | null): SupAgg => {
    const key = name.trim().toLowerCase() || "unassigned";
    let sup = suppliers.get(key);
    if (!sup) {
      sup = {
        supplierId, supplierName: name,
        purchaseSpend: 0, goodsSpend: 0, shippingCost: 0, purchaseOrderCount: 0,
        itemsOrdered: 0, soldCogs: 0,
      };
      suppliers.set(key, sup);
    } else if (sup.supplierId == null && supplierId != null) {
      sup.supplierId = supplierId; // backfill the id if a later row carries it
    }
    return sup;
  };

  for (const r of poRows.rows) {
    const totalCost = Number(r.total_cost ?? 0);
    // Shipping is the delivery charge actually recorded on the PO, grossed for
    // GST the same way it was folded into total_cost (exclusive → ×1.1). Deriving
    // it as total_cost − line-item goods was unsafe: POs with no captured line
    // items (goods = 0) reported the ENTIRE order total as shipping. Goods is the
    // remainder so goods + shipping always reconcile to the purchase spend.
    const deliveryCharge = Number(r.delivery_charge ?? 0);
    const shipping = Math.max(0, r2(r.delivery_tax_mode === "exclusive" ? deliveryCharge * 1.1 : deliveryCharge));
    const goods    = Math.max(0, r2(totalCost - shipping));

    const m = getMonth(r.month);
    m.purchaseSpend      += totalCost;
    m.goodsSpend         += goods;
    m.shippingCost       += shipping;
    m.purchaseOrderCount += 1;

    const name = r.supplier_name ?? (r.supplier_id != null ? `Supplier #${r.supplier_id}` : "Unassigned");
    const sup = getSupplier(name, r.supplier_id != null ? Number(r.supplier_id) : null);
    sup.purchaseSpend      += totalCost;
    sup.goodsSpend         += goods;
    sup.shippingCost       += shipping;
    sup.purchaseOrderCount += 1;
    sup.itemsOrdered       += Number(r.items_ordered ?? 0);
  }

  for (const r of soldRows.rows) {
    getSupplier(r.supplier || "Unassigned", null).soldCogs += r2(r.sold_cogs);
  }

  const monthly = [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month:              m.month,
      cogsSold:           r2(m.cogsPos + m.cogsInvoice + m.cogsLayby),
      cogsPos:            r2(m.cogsPos),
      cogsInvoice:        r2(m.cogsInvoice),
      cogsLayby:          r2(m.cogsLayby),
      purchaseSpend:      r2(m.purchaseSpend),
      goodsSpend:         r2(m.goodsSpend),
      shippingCost:       r2(m.shippingCost),
      purchaseOrderCount: m.purchaseOrderCount,
    }));

  const supplierList = [...suppliers.values()]
    .map((s) => ({
      supplierId:         s.supplierId,
      supplierName:       s.supplierName,
      purchaseSpend:      r2(s.purchaseSpend),
      goodsSpend:         r2(s.goodsSpend),
      shippingCost:       r2(s.shippingCost),
      purchaseOrderCount: s.purchaseOrderCount,
      itemsOrdered:       s.itemsOrdered,
      soldCogs:           r2(s.soldCogs),
    }))
    .sort((a, b) => (b.purchaseSpend + b.soldCogs) - (a.purchaseSpend + a.soldCogs));

  const totals = {
    cogsSold:           r2(monthly.reduce((s, m) => s + m.cogsSold, 0)),
    cogsPos:            r2(monthly.reduce((s, m) => s + m.cogsPos, 0)),
    cogsInvoice:        r2(monthly.reduce((s, m) => s + m.cogsInvoice, 0)),
    cogsLayby:          r2(monthly.reduce((s, m) => s + m.cogsLayby, 0)),
    purchaseSpend:      r2(supplierList.reduce((s, x) => s + x.purchaseSpend, 0)),
    goodsSpend:         r2(supplierList.reduce((s, x) => s + x.goodsSpend, 0)),
    shippingCost:       r2(supplierList.reduce((s, x) => s + x.shippingCost, 0)),
    purchaseOrderCount: supplierList.reduce((s, x) => s + x.purchaseOrderCount, 0),
    soldCogs:           r2(supplierList.reduce((s, x) => s + x.soldCogs, 0)),
  };

  res.json({ startDate, endDate, totals, monthly, suppliers: supplierList });
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

/* ── POST /reports/run — flexible report builder ─────────────────────────────
   Aggregates sales data grouped by date/week/month/payment/staff/product over a
   date range, returning typed columns + rows the UI can render and export. */
const RunReportBody = DateRangeParams.extend({
  groupBy: z.enum(["date", "week", "month", "payment", "staff", "product"]),
});

type Col = { key: string; label: string; type: "text" | "number" | "currency" | "percent" };

router.post("/reports/run", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = RunReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { startDate, endDate, groupBy } = parsed.data;
  const merchantId = req.session.merchantId!;

  let columns: Col[] = [];
  let rows: Record<string, unknown>[] = [];

  if (groupBy === "date" || groupBy === "week" || groupBy === "month") {
    // Bucket the daily-summary view by the chosen period.
    const bucket = groupBy === "week" ? sql`to_char(date_trunc('week', sale_date), 'IYYY-"W"IW')`
      : groupBy === "month" ? sql`to_char(date_trunc('month', sale_date), 'YYYY-MM')`
      : sql`sale_date::text`;
    const result = await db.execute<Record<string, string>>(sql`
      SELECT ${bucket} AS period,
        SUM(gross_revenue)     AS revenue,
        SUM(ex_gst_revenue)    AS ex_gst,
        SUM(tax_collected)     AS gst,
        SUM(discount_total)    AS discounts,
        SUM(refund_total)      AS refunds,
        SUM(total_cogs)        AS cogs,
        SUM(net_profit)        AS gross_profit,
        SUM(transaction_count)::int AS transactions
      FROM view_daily_sales_summary
      WHERE merchant_id = ${merchantId} AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY period ORDER BY period
    `);
    columns = [
      { key: "period", label: groupBy === "week" ? "Week" : groupBy === "month" ? "Month" : "Date", type: "text" },
      { key: "revenue", label: "Revenue", type: "currency" },
      { key: "transactions", label: "Transactions", type: "number" },
      { key: "avgSale", label: "Avg Sale", type: "currency" },
      { key: "discounts", label: "Discounts", type: "currency" },
      { key: "refunds", label: "Refunds", type: "currency" },
      { key: "gst", label: "GST", type: "currency" },
      { key: "grossProfit", label: "Gross Profit", type: "currency" },
      { key: "grossMargin", label: "Gross Margin", type: "percent" },
    ];
    rows = result.rows.map((r) => {
      const revenue = r2(r.revenue), exGst = r2(r.ex_gst), txns = Number(r.transactions);
      const grossProfit = r2(r.gross_profit);
      return {
        period: r.period, revenue, transactions: txns,
        avgSale: txns > 0 ? r2(revenue / txns) : 0,
        discounts: r2(r.discounts), refunds: r2(r.refunds), gst: r2(r.gst),
        grossProfit, grossMargin: exGst > 0 ? r2((grossProfit / exGst) * 100) : 0,
      };
    });
  } else if (groupBy === "payment") {
    const result = await db.execute<Record<string, string>>(sql`
      SELECT payment_method,
        SUM(transaction_count)::int AS transactions,
        SUM(total_amount) AS revenue
      FROM view_payment_method_breakdown
      WHERE merchant_id = ${merchantId} AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY payment_method ORDER BY revenue DESC
    `);
    columns = [
      { key: "period", label: "Payment Method", type: "text" },
      { key: "revenue", label: "Revenue", type: "currency" },
      { key: "transactions", label: "Transactions", type: "number" },
      { key: "avgSale", label: "Avg Sale", type: "currency" },
    ];
    rows = result.rows.map((r) => {
      const revenue = r2(r.revenue), txns = Number(r.transactions);
      return { period: (r.payment_method ?? "").replace(/_/g, " "), revenue, transactions: txns, avgSale: txns > 0 ? r2(revenue / txns) : 0 };
    });
  } else if (groupBy === "staff") {
    const result = await db.execute<Record<string, string>>(sql`
      SELECT COALESCE(s.first_name || ' ' || s.last_name, 'Unassigned') AS staff_name,
        COUNT(*)::int AS transactions,
        SUM(t.total::numeric) AS revenue
      FROM transactions t
      LEFT JOIN staff s ON s.id = t.staff_id
      WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
        AND t.created_at::date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY staff_name ORDER BY revenue DESC
    `);
    columns = [
      { key: "period", label: "Staff Member", type: "text" },
      { key: "revenue", label: "Revenue", type: "currency" },
      { key: "transactions", label: "Transactions", type: "number" },
      { key: "avgSale", label: "Avg Sale", type: "currency" },
    ];
    rows = result.rows.map((r) => {
      const revenue = r2(r.revenue), txns = Number(r.transactions);
      return { period: r.staff_name, revenue, transactions: txns, avgSale: txns > 0 ? r2(revenue / txns) : 0 };
    });
  } else {
    // product: unnest transaction line items. Revenue uses the canonical
    // `totalPrice`/`productName` keys (not `price`/`name`), and COGS uses only
    // the at-sale cost snapshot (no current-cost fallback).
    const result = await db.execute<Record<string, string>>(sql`
      SELECT COALESCE(p.name, item->>'productName', 'Unknown') AS product,
        SUM((item->>'quantity')::numeric)::int AS qty_sold,
        COALESCE(SUM((item->>'totalPrice')::numeric), 0) AS revenue,
        COALESCE(SUM((item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, 0)), 0) AS cogs
      FROM transactions t
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) AS item
      LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = t.merchant_id
      WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
        AND t.created_at::date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY product ORDER BY revenue DESC LIMIT 200
    `);
    columns = [
      { key: "period", label: "Product", type: "text" },
      { key: "qtySold", label: "Qty Sold", type: "number" },
      { key: "revenue", label: "Revenue", type: "currency" },
      { key: "cogs", label: "COGS", type: "currency" },
      { key: "grossProfit", label: "Gross Profit", type: "currency" },
      { key: "marginPct", label: "Margin %", type: "number" },
    ];
    rows = result.rows.map((r) => {
      const revenue = r2(r.revenue);
      const cogs = r2(r.cogs);
      const grossProfit = r2(String(revenue - cogs));
      return {
        period: r.product,
        qtySold: Number(r.qty_sold),
        revenue,
        cogs,
        grossProfit,
        marginPct: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
      };
    });
  }

  res.json({ groupBy, startDate, endDate, columns, rows });
});

export default router;
