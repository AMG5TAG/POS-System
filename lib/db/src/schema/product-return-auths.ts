import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const productReturnAuthsTable = pgTable("product_return_auths", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  raNumber:     text("ra_number").notNull(),
  customerId:   integer("customer_id"),
  customerName: text("customer_name").notNull(),
  reason:       text("reason"),
  items:        text("items").notNull(),
  refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status:       text("status").notNull().default("Pending"),
  notes:        text("notes"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductReturnAuth = typeof productReturnAuthsTable.$inferSelect;
export type InsertProductReturnAuth = typeof productReturnAuthsTable.$inferInsert;
