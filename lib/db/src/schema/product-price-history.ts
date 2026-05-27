import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";
import { purchaseOrdersTable } from "./purchase-orders";

export const productPriceHistoryTable = pgTable("product_price_history", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:    integer("product_id").notNull().references(() => productsTable.id),
  costPrice:    numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
  supplierName: text("supplier_name"),
  poNumber:     text("po_number"),
  poId:         integer("po_id").references(() => purchaseOrdersTable.id),
  changedAt:    timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("pph_merchant_product_idx").on(t.merchantId, t.productId),
]);

export type ProductPriceHistory = typeof productPriceHistoryTable.$inferSelect;
