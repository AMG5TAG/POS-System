import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { brandsTable } from "./brands";
import { productTypesTable } from "./product-types";

export const categoriesTable = pgTable("categories", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:       text("name").notNull(),
  color:      text("color"),
  icon:       text("icon"),
  parentId:   integer("parent_id").references((): AnyPgColumn => categoriesTable.id),
  sortOrder:  integer("sort_order").notNull().default(0),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("categories_merchant_id_idx").on(t.merchantId),
]);

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
  brandId:           integer("brand_id").references(() => brandsTable.id),
  imageUrl:          text("image_url"),
  productTypeId:     integer("product_type_id").references(() => productTypesTable.id),
  trackInventory:    text("track_inventory").notNull().default("true"),
  stockQuantity:     integer("stock_quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").default(5),
  taxRate:           numeric("tax_rate", { precision: 5, scale: 2 }).default("10"),
  isActive:          text("is_active").notNull().default("true"),
  excludeFromLoyalty: text("exclude_from_loyalty").notNull().default("false"),
  groupPrices:        text("group_prices"),
  supplier:           text("supplier"),
  supplierCode:       text("supplier_code"),
  isEpay:             text("is_epay").notNull().default("false"),
  tagsJson:           text("tags_json"),
  stockLocation:      text("stock_location"),
  overflowLocation:   text("overflow_location"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("products_merchant_id_idx").on(t.merchantId),
]);

export const digitalCodesTable = pgTable("digital_codes", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:  integer("product_id").notNull().references(() => productsTable.id),
  code:       text("code").notNull(),
  isUsed:     text("is_used").notNull().default("false"),
  usedAt:     timestamp("used_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("digital_codes_merchant_id_idx").on(t.merchantId),
  index("digital_codes_product_id_idx").on(t.productId),
]);

export const productVariantsTable = pgTable("product_variants", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:     integer("product_id").notNull().references(() => productsTable.id),
  name:          text("name").notNull(),
  sku:           text("sku"),
  barcode:       text("barcode"),
  price:         numeric("price", { precision: 10, scale: 2 }),
  costPrice:     numeric("cost_price", { precision: 10, scale: 2 }),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  attributes:    text("attributes"),
  imageUrl:      text("image_url"),
  isActive:      text("is_active").notNull().default("true"),
  sortOrder:     integer("sort_order").notNull().default(0),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("product_variants_product_id_idx").on(t.productId),
  index("product_variants_merchant_id_idx").on(t.merchantId),
]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct   = z.infer<typeof insertProductSchema>;
export type Product         = typeof productsTable.$inferSelect;
export type Category        = typeof categoriesTable.$inferSelect;
export type DigitalCode     = typeof digitalCodesTable.$inferSelect;
export type ProductVariant  = typeof productVariantsTable.$inferSelect;
