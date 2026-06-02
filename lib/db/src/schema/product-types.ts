import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const productTypesTable = pgTable("product_types", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().default(""),
  description: text("description").notNull().default(""),
  trackStock: boolean("track_stock").notNull().default(true),
  printCode: boolean("print_code").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  requiresShipping: boolean("requires_shipping").notNull().default(true),
  hasVariants: boolean("has_variants").notNull().default(false),
  isDigital: boolean("is_digital").notNull().default(false),
  isService: boolean("is_service").notNull().default(false),
  isComposite: boolean("is_composite").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductType = typeof productTypesTable.$inferSelect;
export type InsertProductType = typeof productTypesTable.$inferInsert;
