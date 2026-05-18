import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

export const productBundlesTable = pgTable("product_bundles", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:        text("name").notNull(),
  description: text("description"),
  price:       numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  sku:         text("sku"),
  isActive:    text("is_active").notNull().default("true"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const productBundleItemsTable = pgTable("product_bundle_items", {
  id:          serial("id").primaryKey(),
  bundleId:    integer("bundle_id").notNull().references(() => productBundlesTable.id),
  productId:   integer("product_id").notNull().references(() => productsTable.id),
  productName: text("product_name").notNull(),
  quantity:    integer("quantity").notNull().default(1),
});

export const insertProductBundleSchema = createInsertSchema(productBundlesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductBundleItemSchema = createInsertSchema(productBundleItemsTable).omit({ id: true });
export type InsertProductBundle = z.infer<typeof insertProductBundleSchema>;
export type InsertProductBundleItem = z.infer<typeof insertProductBundleItemSchema>;
export type ProductBundle = typeof productBundlesTable.$inferSelect;
export type ProductBundleItem = typeof productBundleItemsTable.$inferSelect;
