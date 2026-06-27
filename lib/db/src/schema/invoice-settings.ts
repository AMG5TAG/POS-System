import { pgTable, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Per-merchant invoicing configuration surfaced in Management → Invoices &
 * Services → Invoices. One row per merchant; the JSON `config` holds every
 * setting (defaults, payment reminders, overdue notifications, sending
 * options). Absent keys fall back to the defaults defined in the API route, so
 * an empty/missing row means "use the sensible defaults".
 */
export const invoiceSettingsTable = pgTable("invoice_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InvoiceSettingsRow = typeof invoiceSettingsTable.$inferSelect;
