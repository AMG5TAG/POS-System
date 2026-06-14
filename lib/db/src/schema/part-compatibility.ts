import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

/* Maps a part (product) to the device models it fits (e.g. "iPhone 13" screen),
   so staff can find the right part fast during a repair. One row per (part, model). */
export const partCompatibilityTable = pgTable("part_compatibility", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:  integer("product_id").notNull().references(() => productsTable.id),
  model:      text("model").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("part_compatibility_merchant_idx").on(t.merchantId),
  index("part_compatibility_product_idx").on(t.productId),
  uniqueIndex("part_compatibility_unique").on(t.productId, t.model),
]);

export type PartCompatibility = typeof partCompatibilityTable.$inferSelect;
export type InsertPartCompatibility = typeof partCompatibilityTable.$inferInsert;
