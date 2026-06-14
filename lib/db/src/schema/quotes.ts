import { pgTable, text, serial, timestamp, integer, numeric, json, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";
import { transactionsTable } from "./transactions";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  // Optional link to a repair/service job this quote was raised for.
  serviceJobId: integer("service_job_id"),
  quoteNumber: text("quote_number").notNull(),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  taxTotal: numeric("tax_total", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  items: json("items"),
  discountType:  text("discount_type"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }),
  discountTotal: numeric("discount_total", { precision: 10, scale: 2 }),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  notes: text("notes"),
  events: json("events"),
  // Deposit required to approve this estimate (absolute amount). Defaulted from the
  // merchant's quote deposit %, overridable per quote. null = no deposit required.
  depositRequired: numeric("deposit_required", { precision: 10, scale: 2 }),
  convertedTransactionId: integer("converted_transaction_id").references(() => transactionsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("quotes_merchant_id_idx").on(t.merchantId),
  index("quotes_merchant_id_status_idx").on(t.merchantId, t.status),
]);

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
