import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

export const voidAuditLog = pgTable("void_audit_log", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  staffId:     integer("staff_id"),
  staffName:   text("staff_name"),
  productId:   integer("product_id").references(() => productsTable.id),
  productName: text("product_name").notNull(),
  quantity:    integer("quantity").notNull().default(1),
  unitPrice:   numeric("unit_price", { precision: 10, scale: 2 }),
  action:      text("action").notNull().default("void"), // void | discount_override
  reason:      text("reason"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoidAuditEntry = typeof voidAuditLog.$inferSelect;
export type InsertVoidAuditEntry = typeof voidAuditLog.$inferInsert;
