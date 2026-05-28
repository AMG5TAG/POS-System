import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const posFavouritesTable = pgTable("pos_favourites", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  registerId: text("register_id").notNull().default("default"),
  productIds: text("product_ids").notNull().default("[]"),
});

export type PosFavourites = typeof posFavouritesTable.$inferSelect;
export type InsertPosFavourites = typeof posFavouritesTable.$inferInsert;
