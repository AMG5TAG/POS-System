import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
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
  isActive: text("is_active").notNull().default("true"),
  // Employment
  defaultRegisterType: text("default_register_type"),
  payRate: text("pay_rate"),
  loadingRate: text("loading_rate"),
  superRate: text("super_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staffTable.$inferSelect;
