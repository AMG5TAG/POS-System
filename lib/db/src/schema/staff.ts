import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  name: text("name").notNull(),
  // Personal
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"),
  company: text("company"),
  abn: text("abn"),
  // Address (stored as JSON)
  billingAddress: text("billing_address"),
  postalAddress: text("postal_address"),
  // Account
  role: text("role").notNull().default("cashier"),
  pin: text("pin"),
  // Optional email+password login (hybrid auth): the PIN stays the primary
  // register login; a passwordHash is only set once a staff member is invited
  // to email sign-in for remote/management access.
  passwordHash: text("password_hash"),
  isActive: text("is_active").notNull().default("true"),
  // Per-staff POS preferences (JSON: gridColumns, tileSize, showPrices,
  // showStockBadges, cartPosition) — overrides the account-level POS settings
  // on whatever terminal this staff member signs in for the day.
  posPrefs: text("pos_prefs"),
  // Employment
  defaultRegisterType: text("default_register_type"),
  payRate: text("pay_rate"),
  loadingRate: text("loading_rate"),
  superRate: text("super_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("staff_merchant_id_idx").on(t.merchantId),
]);

export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staffTable.$inferSelect;
