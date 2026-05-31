import { pgTable, text, serial, timestamp, integer, numeric, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  staffId: integer("staff_id"),
  receiptNumber: text("receipt_number").notNull(),
  status: text("status").notNull().default("completed"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  taxTotal: numeric("tax_total", { precision: 10, scale: 2 }).notNull().default("0"),
  discountTotal: numeric("discount_total", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method").notNull().default("cash"),
  amountTendered: numeric("amount_tendered", { precision: 10, scale: 2 }),
  changeDue: numeric("change_due", { precision: 10, scale: 2 }),
  notes: text("notes"),
  loyaltyEarned: numeric("loyalty_earned", { precision: 10, scale: 2 }),
  items: jsonb("items").notNull().default([]),
  // Optional client-supplied key that makes POST /transactions idempotent: a
  // retry (e.g. after a network drop following a successful commit) carrying the
  // same key returns the original transaction instead of creating a duplicate.
  idempotencyKey: text("idempotency_key"),
  // Set to "true" when the cashier attempted a discount that exceeded their role
  // limit and it was silently clamped to the maximum allowed. Managers can filter
  // the transaction list to review these override attempts.
  discountCapped: text("discount_capped"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("transactions_merchant_id_idx").on(t.merchantId),
  index("transactions_merchant_id_created_at_idx").on(t.merchantId, t.createdAt),
  index("transactions_merchant_id_status_idx").on(t.merchantId, t.status),
  // Postgres treats NULLs as distinct, so rows without an idempotency key never
  // collide; only repeated keys for the same merchant are deduplicated.
  uniqueIndex("transactions_merchant_idempotency_idx").on(t.merchantId, t.idempotencyKey),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
