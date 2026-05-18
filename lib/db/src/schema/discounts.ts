import { pgTable, text, serial, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const discountsTable = pgTable("discounts", {
  id:               serial("id").primaryKey(),
  merchantId:       integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:             text("name").notNull(),
  code:             text("code"), // coupon code (null = automatic/no code required)
  type:             text("type").notNull().default("percentage"), // percentage|fixed|bogo
  value:            numeric("value", { precision: 10, scale: 2 }).notNull().default("0"),
  minOrderAmount:   numeric("min_order_amount", { precision: 10, scale: 2 }),
  maxUses:          integer("max_uses"), // null = unlimited
  usedCount:        integer("used_count").notNull().default(0),
  applicableTo:     text("applicable_to").notNull().default("all"), // all|categories|products
  productIds:       jsonb("product_ids").default([]),
  categoryIds:      jsonb("category_ids").default([]),
  startDate:        text("start_date"),  // ISO date string
  endDate:          text("end_date"),    // ISO date string
  isActive:         text("is_active").notNull().default("true"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDiscountSchema = createInsertSchema(discountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDiscount = z.infer<typeof insertDiscountSchema>;
export type Discount = typeof discountsTable.$inferSelect;
