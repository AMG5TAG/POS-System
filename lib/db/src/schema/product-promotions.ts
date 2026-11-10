import { pgTable, serial, timestamp, integer, jsonb, text, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

/**
 * Promotional print copy per product — Inventory › Promotions
 * (`routes/promotions.ts`). One row per product: the template it prints on and
 * the copy (features, pitch, PC specs…) staff kept for it. Name and price are
 * NOT stored — they are read live from the product, so a price change is on
 * the next print without anyone re-saving the copy.
 *
 * Created by `scripts/src/add-product-promotions-table.ts`.
 */
export const productPromotionsTable = pgTable("product_promotions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  /** `classic` (6×4 portrait), `products` or `computers` (square). */
  template: text("template").notNull().default("classic"),
  /**
   * The card's words: { headline, subtitle, banner, features[5], pitch, blurb,
   * specs{cpu,ram,storage,gpu,display,os,warranty,grade} }. JSON because each
   * template prints a different subset, and every field is cleaned on read by
   * `cleanPromoCopy` (`api-server/src/lib/product-promo.ts`).
   */
  copy: jsonb("copy").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("product_promotions_merchant_product_unique").on(t.merchantId, t.productId),
]);

export type ProductPromotionRow = typeof productPromotionsTable.$inferSelect;
