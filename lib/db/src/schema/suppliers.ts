import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),

  // Step 1 – Basic Info
  name: text("name").notNull(),
  accountNumber: text("account_number"),
  website: text("website"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),

  // Step 2 – Address & Logo
  logoUrl: text("logo_url"),
  street: text("street"),
  city: text("city"),
  state: text("state"),
  postcode: text("postcode"),
  country: text("country"),
  address: text("address"),

  // Step 3 – Contacts (JSON array)
  contacts: text("contacts"),

  // Step 4 – Return Auth
  raPortalLink: text("ra_portal_link"),
  raProcedure: text("ra_procedure"),

  // Step 5 – Credit Account
  creditAccountNumber: text("credit_account_number"),
  creditLimit: text("credit_limit"),
  creditTerms: text("credit_terms"),
  creditContactName: text("credit_contact_name"),

  // Legacy fields (kept for backward compat)
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Supplier = typeof suppliersTable.$inferSelect;
export type InsertSupplier = typeof suppliersTable.$inferInsert;
