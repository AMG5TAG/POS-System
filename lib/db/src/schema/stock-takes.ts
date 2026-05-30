import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

export const stockTakesTable = pgTable("stock_takes", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  staffId:     integer("staff_id"),
  status:      text("status").notNull().default("open"),
  notes:       text("notes"),
  startedAt:   timestamp("started_at",  { withTimezone: true }).notNull().defaultNow(),
  appliedAt:   timestamp("applied_at",  { withTimezone: true }),
}, (t) => [
  index("stock_takes_merchant_id_idx").on(t.merchantId),
]);

export const stockTakeLinesTable = pgTable("stock_take_lines", {
  id:           serial("id").primaryKey(),
  stockTakeId:  integer("stock_take_id").notNull().references(() => stockTakesTable.id),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:    integer("product_id").notNull().references(() => productsTable.id),
  productName:  text("product_name").notNull(),
  sku:          text("sku"),
  categoryId:   integer("category_id"),
  categoryName: text("category_name"),
  systemQty:    integer("system_qty").notNull(),
  countedQty:   integer("counted_qty"),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("stock_take_lines_take_id_idx").on(t.stockTakeId),
  index("stock_take_lines_merchant_id_idx").on(t.merchantId),
]);

export type StockTake      = typeof stockTakesTable.$inferSelect;
export type StockTakeLine  = typeof stockTakeLinesTable.$inferSelect;
