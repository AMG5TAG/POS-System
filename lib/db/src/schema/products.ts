import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const categoriesTable = pgTable("categories", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:       text("name").notNull(),
  color:      text("color"),
  icon:       text("icon"),
  parentId:   integer("parent_id").references((): AnyPgColumn => categoriesTable.id),
  sortOrder:  integer("sort_order").notNull().default(0),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productsTable = pgTable("products", {
  id:                serial("id").primaryKey(),
  merchantId:        integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:              text("name").notNull(),
  description:       text("description"),
  price:             numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  costPrice:         numeric("cost_price", { precision: 10, scale: 2 }),
  sku:               text("sku"),
  barcode:           text("barcode"),
  categoryId:        integer("category_id").references(() => categoriesTable.id),
  imageUrl:          text("image_url"),
  productType:       text("product_type").notNull().default("standard"),
  trackInventory:    text("track_inventory").notNull().default("true"),
  stockQuantity:     integer("stock_quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").default(5),
  taxRate:           numeric("tax_rate", { precision: 5, scale: 2 }).default("10"),
  isActive:          text("is_active").notNull().default("true"),
  excludeFromLoyalty: text("exclude_from_loyalty").notNull().default("false"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const digitalCodesTable = pgTable("digital_codes", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:  integer("product_id").notNull().references(() => productsTable.id),
  code:       text("code").notNull(),
  isUsed:     text("is_used").notNull().default("false"),
  usedAt:     timestamp("used_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product     = typeof productsTable.$inferSelect;
export type Category    = typeof categoriesTable.$inferSelect;
export type DigitalCode = typeof digitalCodesTable.$inferSelect;
