import { pgTable, text, serial, timestamp, integer, numeric, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

export const laybysTable = pgTable("laybys", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  reference: text("reference").notNull(),
  items: jsonb("items").notNull().default([]),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("active"),
  dueDate: text("due_date"),
  notes: text("notes"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("laybys_merchant_id_idx").on(t.merchantId),
  index("laybys_customer_id_idx").on(t.customerId),
]);

export const laybyPaymentsTable = pgTable("layby_payments", {
  id: serial("id").primaryKey(),
  laybyId: integer("layby_id").notNull().references(() => laybysTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLaybySchema = createInsertSchema(laybysTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLaybyPaymentSchema = createInsertSchema(laybyPaymentsTable).omit({ id: true, createdAt: true });
export type InsertLayby = z.infer<typeof insertLaybySchema>;
export type Layby = typeof laybysTable.$inferSelect;
export type LaybyPayment = typeof laybyPaymentsTable.$inferSelect;
