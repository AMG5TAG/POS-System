import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/* Physical store/branch locations under a merchant. Multi-location is layered
   beneath the existing merchantId tenancy: merchant → locations → data. Every
   merchant has exactly one isDefault location ("Main"); single-store merchants
   never need to think about it. */
export const locationsTable = pgTable("locations", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:       text("name").notNull(),
  code:       text("code"),
  address:    text("address"),
  phone:      text("phone"),
  isDefault:  text("is_default").notNull().default("false"),
  isActive:   text("is_active").notNull().default("true"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("locations_merchant_idx").on(t.merchantId),
]);

export type Location = typeof locationsTable.$inferSelect;
export type InsertLocation = typeof locationsTable.$inferInsert;
