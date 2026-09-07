import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/* Shared report builder — the aggregation behind POST /reports/run, extracted so
 * both the route and the scheduled-reports scheduler produce identical output.
 * Groups completed sales by date/week/month/payment/staff/product over a date
 * range and returns typed columns + rows (renderable, CSV- and PDF-serialisable). */

export type ReportGroupBy = "date" | "week" | "month" | "payment" | "staff" | "product";
export type ReportColumn = { key: string; label: string; type: "text" | "number" | "currency" | "percent" };
export interface ReportResult { columns: ReportColumn[]; rows: Record<string, unknown>[] }

const r2 = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;

export async function runReport(
  merchantId: number,
  groupBy: ReportGroupBy,
  startDate: string,
  endDate: string,
): Promise<ReportResult> {
  let columns: ReportColumn[] = [];
  let rows: Record<string, unknown>[] = [];

  if (groupBy === "date" || groupBy === "week" || groupBy === "month") {
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
    // product: unnest transaction line items (canonical totalPrice/productName keys,
    // at-sale cost snapshot only).
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

  return { columns, rows };
}
