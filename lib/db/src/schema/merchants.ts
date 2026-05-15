import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const merchantsTable = pgTable("merchants", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  country: text("country").default("AU"),
  currency: text("currency").notNull().default("AUD"),
  timezone: text("timezone").default("Australia/Sydney"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  priceMonthly: text("price_monthly").notNull().default("0"),
  priceYearly: text("price_yearly").notNull().default("0"),
  maxRegisters: integer("max_registers"),
  maxStaff: integer("max_staff"),
  features: text("features").array().notNull().default([]),
  isPopular: text("is_popular").notNull().default("false"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modulesTable = pgTable("modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  priceMonthly: text("price_monthly").notNull().default("0"),
  category: text("category").notNull(),
  icon: text("icon").notNull().default("Package"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  planId: integer("plan_id").notNull().references(() => plansTable.id),
  status: text("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: text("cancel_at_period_end").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchantModulesTable = pgTable("merchant_modules", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  moduleId: integer("module_id").notNull().references(() => modulesTable.id),
  enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMerchantSchema = createInsertSchema(merchantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchantsTable.$inferSelect;
export type Plan = typeof plansTable.$inferSelect;
export type Module = typeof modulesTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type MerchantModule = typeof merchantModulesTable.$inferSelect;
