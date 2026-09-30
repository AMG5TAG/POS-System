import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

/*
 * Product reviews on the online shop (shop.koastal.com.au, routes/shop.ts).
 * Only a signed-in customer who has bought the product can write one, one per
 * customer per product (a second submission edits the first). `customer_id`
 * (scripts/src/add-product-specs.ts) is that customer; rows from the removed
 * old storefront have none. Shown when status = "approved".
 */
export const productReviewsTable = pgTable("product_reviews", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:   integer("product_id").notNull().references(() => productsTable.id),
  authorName:  text("author_name").notNull().default(""),
  authorEmail: text("author_email").notNull().default(""),
  rating:      integer("rating").notNull().default(5),
  title:       text("title").notNull().default(""),
  body:        text("body").notNull().default(""),
  /** approved (shown publicly) | hidden (kept but not shown). */
  status:      text("status").notNull().default("approved"),
  verified:    text("verified").notNull().default("false"),
  customerId:  integer("customer_id"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("product_reviews_merchant_id_idx").on(t.merchantId),
  index("product_reviews_merchant_product_idx").on(t.merchantId, t.productId),
]);

export type ProductReview = typeof productReviewsTable.$inferSelect;
export type InsertProductReview = typeof productReviewsTable.$inferInsert;
