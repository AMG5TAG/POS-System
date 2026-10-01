import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Online shop options set under Management › Online Store. (Not the retained,
 * unused `online_store_settings` of the old store builder.) Created by
 * scripts/src/add-shop-settings-table.ts.
 *
 * hideOutOfStock: leave out-of-stock products out of the shop's listings —
 * catalogue, search, category counts, related products and "Just purchased".
 * A product page, cart or wishlist reached directly still shows the product,
 * marked out of stock, so no link a shopper already has goes dead.
 */
export const shopSettingsTable = pgTable("shop_settings", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().unique().references(() => merchantsTable.id, { onDelete: "cascade" }),
  hideOutOfStock: text("hide_out_of_stock").notNull().default("false"),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ShopSettings = typeof shopSettingsTable.$inferSelect;
