import { pgTable, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";
import { productsTable } from "./products";

/*
 * Online shop wishlist (shop.koastal.com.au, routes/shop.ts): the heart on a
 * product image. One row per customer per product. Created by
 * scripts/src/add-customer-wishlist-table.ts.
 */
export const customerWishlistItemsTable = pgTable("customer_wishlist_items", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  productId:  integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("customer_wishlist_items_customer_product_uniq").on(t.customerId, t.productId),
  index("customer_wishlist_items_merchant_id_idx").on(t.merchantId),
]);

export type CustomerWishlistItem = typeof customerWishlistItemsTable.$inferSelect;
