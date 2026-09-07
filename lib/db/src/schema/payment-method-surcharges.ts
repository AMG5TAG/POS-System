import { pgTable, text, serial, timestamp, integer, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

/**
 * Per-merchant, per-payment-method surcharge / cost-of-acceptance config.
 *
 * Each enabled payment method can carry a processing cost expressed as a
 * percentage of the sale plus a fixed per-transaction fee. When `passOn` is
 * "true" the cost is added to the customer's bill at checkout (a surcharge);
 * when "false" the merchant absorbs it and it is reported as a cost of business
 * (reducing net profit) across all sales reports. `enabled` "false" disables the
 * row entirely (no surcharge, no reported cost).
 *
 * Booleans are stored as text "true"/"false" to match the convention used by the
 * other *_settings tables in this schema.
 */
export const paymentMethodSurchargesTable = pgTable("payment_method_surcharges", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  paymentMethod: text("payment_method").notNull(),
  percent:       numeric("percent", { precision: 6, scale: 3 }).notNull().default("0"),
  fixed:         numeric("fixed", { precision: 10, scale: 2 }).notNull().default("0"),
  passOn:        text("pass_on").notNull().default("false"),
  enabled:       text("enabled").notNull().default("false"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("payment_method_surcharges_merchant_method_idx").on(t.merchantId, t.paymentMethod),
]);

export const insertPaymentMethodSurchargeSchema = createInsertSchema(paymentMethodSurchargesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaymentMethodSurcharge = z.infer<typeof insertPaymentMethodSurchargeSchema>;
export type PaymentMethodSurcharge = typeof paymentMethodSurchargesTable.$inferSelect;
