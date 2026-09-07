import { pgTable, text, serial, timestamp, integer, numeric, index, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
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
  costPrice:         numeric("cost_price", { precision: 10, scale: 2 }).default("0"),
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
  groupPrices:        jsonb("group_prices").$type<Record<string, number>>(),
  supplier:           text("supplier"),
  supplierCode:       text("supplier_code"),
  isEpay:             text("is_epay").notNull().default("false"),
  // Second-hand / refurbished stock (e.g. created from a trade-in).
  isRefurbished:      text("is_refurbished").notNull().default("false"),
  // When "true", each unit carries a Serial Number / IMEI captured at PO
  // receiving and consumed at the point of sale (see productSerialsTable).
  tracksSerial:       text("tracks_serial").notNull().default("false"),
  tags:               jsonb("tags_json").$type<string[]>(),
  stockLocation:      text("stock_location"),
  overflowLocation:   text("overflow_location"),
  notification:       text("notification"),
  // Warranty offered from the sale date. 0 = no warranty. Unit is "months" or "years".
  warrantyDuration:   integer("warranty_duration").notNull().default(0),
  warrantyUnit:       text("warranty_unit").notNull().default("months"),
  // For "time_card" products: prepaid duration in minutes that the card grants.
  timeCardMinutes:    integer("time_card_minutes").notNull().default(0),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("products_merchant_id_idx").on(t.merchantId),
  index("products_merchant_id_category_id_idx").on(t.merchantId, t.categoryId),
  index("products_merchant_id_brand_id_idx").on(t.merchantId, t.brandId),
  index("products_merchant_id_product_type_id_idx").on(t.merchantId, t.productTypeId),
  index("products_tags_gin_idx").using("gin", t.tags),
]);

// Per-unit serial numbers for serial-tracked products (products.tracksSerial).
// Captured at purchase-order receiving and consumed (status → "sold") at the
// point of sale, mirroring the digital-codes pool pattern.
export const productSerialsTable = pgTable("product_serials", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:     integer("product_id").notNull().references(() => productsTable.id),
  serial:        text("serial").notNull(),
  status:        text("status").notNull().default("available"), // "available" | "sold"
  transactionId: integer("transaction_id"),
  soldAt:        timestamp("sold_at", { withTimezone: true }),
  poItemId:      integer("po_item_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("product_serials_merchant_id_idx").on(t.merchantId),
  index("product_serials_product_id_idx").on(t.productId),
  index("product_serials_transaction_id_idx").on(t.transactionId),
  // A serial is unique within a merchant so it can't be received or sold twice.
  uniqueIndex("product_serials_merchant_serial_unique").on(t.merchantId, t.serial),
]);

export const digitalCodesTable = pgTable("digital_codes", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:     integer("product_id").notNull().references(() => productsTable.id),
  code:          text("code").notNull(),
  isUsed:        text("is_used").notNull().default("false"),
  usedAt:        timestamp("used_at", { withTimezone: true }),
  transactionId: integer("transaction_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("digital_codes_merchant_id_idx").on(t.merchantId),
  index("digital_codes_product_id_idx").on(t.productId),
  index("digital_codes_transaction_id_idx").on(t.transactionId),
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
  attributes:    jsonb("attributes").$type<Record<string, string>>(),
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
export type ProductSerial   = typeof productSerialsTable.$inferSelect;
export type ProductVariant  = typeof productVariantsTable.$inferSelect;
