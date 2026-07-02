/**
 * Drizzle declarations for the report-only PostgreSQL views whose SQL lives in
 * `../report-views.ts` and is applied by `setup-report-views` (and re-applied on
 * every server boot). These are declared with `.existing()` so drizzle-kit
 * treats them as externally-managed: it emits NO create/drop/alter DDL for them.
 *
 * Without these declarations, `drizzle-kit push` introspects the live views,
 * finds them absent from the schema, and emits a bare `DROP VIEW` that fails on
 * the dependency chain (view_payment_method_breakdown depends on
 * view_invoice_payment_legs / view_layby_payment_legs), breaking `db:push`.
 *
 * The column lists below are for type-safe querying only; `.existing()` means
 * their exact shape never drives migrations.
 */
import { pgView, integer, text, numeric, date, timestamp } from "drizzle-orm/pg-core";

export const viewDailySalesSummary = pgView("view_daily_sales_summary", {
  merchantId:       integer("merchant_id"),
  saleDate:         date("sale_date"),
  transactionCount: integer("transaction_count"),
  grossRevenue:     numeric("gross_revenue"),
  exGstRevenue:     numeric("ex_gst_revenue"),
  taxCollected:     numeric("tax_collected"),
  discountTotal:    numeric("discount_total"),
  totalCogs:        numeric("total_cogs"),
  netProfit:        numeric("net_profit"),
  refundTotal:      numeric("refund_total"),
}).existing();

export const viewInvoicePaymentLegs = pgView("view_invoice_payment_legs", {
  merchantId: integer("merchant_id"),
  paidAt:     timestamp("paid_at", { withTimezone: true }),
  method:     text("method"),
  amount:     numeric("amount"),
}).existing();

export const viewLaybyPaymentLegs = pgView("view_layby_payment_legs", {
  merchantId:  integer("merchant_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  method:      text("method"),
  amount:      numeric("amount"),
}).existing();

export const viewDailySurchargeCost = pgView("view_daily_surcharge_cost", {
  merchantId:    integer("merchant_id"),
  saleDate:      date("sale_date"),
  surchargeCost: numeric("surcharge_cost"),
}).existing();

export const viewPaymentMethodBreakdown = pgView("view_payment_method_breakdown", {
  merchantId:          integer("merchant_id"),
  saleDate:            date("sale_date"),
  paymentMethod:       text("payment_method"),
  transactionCount:    integer("transaction_count"),
  totalAmount:         numeric("total_amount"),
  avgTransactionValue: numeric("avg_transaction_value"),
}).existing();

export const viewProductPerformanceLedger = pgView("view_product_performance_ledger", {
  merchantId:   integer("merchant_id"),
  saleDate:     date("sale_date"),
  productId:    integer("product_id"),
  productName:  text("product_name"),
  sku:          text("sku"),
  quantitySold: numeric("quantity_sold"),
  totalRevenue: numeric("total_revenue"),
  totalCogs:    numeric("total_cogs"),
  grossProfit:  numeric("gross_profit"),
}).existing();
