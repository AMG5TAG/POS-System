import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const productPreOrdersTable = pgTable("product_pre_orders", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  poNumber:      text("po_number").notNull(),
  customerId:    integer("customer_id"),
  customerName:  text("customer_name").notNull(),
  productId:     integer("product_id"),
  productName:   text("product_name").notNull(),
  quantity:      integer("quantity").notNull().default(1),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status:        text("status").notNull().default("Pending"),
  expectedDate:  text("expected_date"),
  notes:         text("notes"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductPreOrder = typeof productPreOrdersTable.$inferSelect;
export type InsertProductPreOrder = typeof productPreOrdersTable.$inferInsert;
