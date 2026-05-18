import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

export const priceTiersTable = pgTable("price_tiers", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:           text("name").notNull(),    // e.g. Wholesale, Staff, VIP
  description:    text("description"),
  discountType:   text("discount_type").notNull().default("percentage"), // percentage|fixed
  discountValue:  numeric("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive:       text("is_active").notNull().default("true"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Optional per-product price override within a tier
export const productPriceTiersTable = pgTable("product_price_tiers", {
  id:        serial("id").primaryKey(),
  tierId:    integer("tier_id").notNull().references(() => priceTiersTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  price:     numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const insertPriceTierSchema = createInsertSchema(priceTiersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductPriceTierSchema = createInsertSchema(productPriceTiersTable).omit({ id: true });
export type InsertPriceTier = z.infer<typeof insertPriceTierSchema>;
export type InsertProductPriceTier = z.infer<typeof insertProductPriceTierSchema>;
export type PriceTier = typeof priceTiersTable.$inferSelect;
export type ProductPriceTier = typeof productPriceTiersTable.$inferSelect;
