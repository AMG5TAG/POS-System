import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  dateOfBirth: date("date_of_birth"),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  visitCount: integer("visit_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // New fields
  company: text("company"),
  abn: text("abn"),
  referredBy: text("referred_by"),
  whatsappSameAsPhone: text("whatsapp_same_as_phone"),
  billingStreet: text("billing_street"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingPostcode: text("billing_postcode"),
  billingCountry: text("billing_country"),
  shippingStreet: text("shipping_street"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingPostcode: text("shipping_postcode"),
  shippingCountry: text("shipping_country"),
  customerGroup: text("customer_group"),
  warningNote: text("warning_note"),
  agreedToMarketing: text("agreed_to_marketing"),
  portalToken: text("portal_token"),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
