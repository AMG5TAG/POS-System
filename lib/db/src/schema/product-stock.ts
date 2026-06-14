import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";
import { locationsTable } from "./locations";

/* Per-location stock for NON-default locations. The default location's quantity
   is derived as products.stockQuantity (the maintained total) minus the sum of
   these rows — so the existing checkout/PO/wastage paths (which update the total)
   need no changes. Stock reaches a branch via a transfer from the default pool. */
export const productStockTable = pgTable("product_stock", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:  integer("product_id").notNull().references(() => productsTable.id),
  locationId: integer("location_id").notNull().references(() => locationsTable.id),
  quantity:   integer("quantity").notNull().default(0),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("product_stock_product_location_unique").on(t.productId, t.locationId),
  index("product_stock_merchant_idx").on(t.merchantId),
  index("product_stock_location_idx").on(t.locationId),
]);

export type ProductStock = typeof productStockTable.$inferSelect;
export type InsertProductStock = typeof productStockTable.$inferInsert;
