import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

/* Per-merchant default policies for the sale-adjacent document types, surfaced in
   Management → Staff & Operations → Sales Settings. Laybys keep their own
   `layby_settings` table; this holds the net-new Sales / Invoices / Refunds / Quotes
   defaults. Booleans are stored as "true"/"false" text to match layby_settings. */
export const salesSettingsTable = pgTable("sales_settings", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique().references(() => merchantsTable.id),

  // ── Sales ──
  saleRequireCustomer:      text("sale_require_customer").notNull().default("false"),
  saleReceiptDelivery:      text("sale_receipt_delivery").notNull().default("ask"), // ask | print | email | none
  saleRoundCashTo5c:        text("sale_round_cash_to_5c").notNull().default("false"),
  saleRequireDiscountReason: text("sale_require_discount_reason").notNull().default("false"),
  saleAllowOutOfStock:      text("sale_allow_out_of_stock").notNull().default("true"),
  saleDefaultNote:          text("sale_default_note").notNull().default(""),

  // ── Invoices ──
  invoiceDueDays:        integer("invoice_due_days").notNull().default(14),
  invoiceDefaultTaxRate: numeric("invoice_default_tax_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  invoiceAutoEmail:      text("invoice_auto_email").notNull().default("false"),
  invoiceTerms:          text("invoice_terms").notNull().default(""),

  // ── Refunds ──
  refundWindowDays:        integer("refund_window_days").notNull().default(30),
  refundRequireReason:     text("refund_require_reason").notNull().default("true"),
  refundRequireApproval:   text("refund_require_approval").notNull().default("false"),
  refundRestockingFeePct:  numeric("refund_restocking_fee_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  refundOriginalMethodOnly: text("refund_original_method_only").notNull().default("true"),
  refundDefaultNote:       text("refund_default_note").notNull().default(""),

  // ── Quotes ──
  quoteExpiryDays:       integer("quote_expiry_days").notNull().default(30),
  quoteDefaultTaxRate:   numeric("quote_default_tax_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  quoteAutoEmail:        text("quote_auto_email").notNull().default("false"),
  quoteTerms:            text("quote_terms").notNull().default(""),
  quotePrefix:           text("quote_prefix").notNull().default("QT-"),
  quoteDigits:           integer("quote_digits").notNull().default(4),
  // Default deposit required when a quote/estimate is raised, as a % of the quote
  // total. 0 = no deposit by default. Staff can override the amount per quote.
  quoteDepositPercent:   numeric("quote_deposit_percent", { precision: 5, scale: 2 }).notNull().default("0"),

  // ── Sales Overview defaults (Management → Sales Overview) ──
  // Which period tab opens first for the Sales Overview KPIs (today | month | year)
  overviewDefaultSalesPeriod:    text("overview_default_sales_period").notNull().default("today"),
  // Which period tab opens first for the Activity Overview (day | week | month | year)
  overviewDefaultActivityPeriod: text("overview_default_activity_period").notNull().default("week"),
  // What "Month" means on the overview: rolling last-30-days, or calendar month-to-date
  // (rolling30 | calendar_mtd)
  overviewMonthMode:             text("overview_month_mode").notNull().default("rolling30"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSalesSettingsSchema = createInsertSchema(salesSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalesSettings = z.infer<typeof insertSalesSettingsSchema>;
export type SalesSettings = typeof salesSettingsTable.$inferSelect;
