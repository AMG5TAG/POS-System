import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const taxSettingsTable = pgTable("tax_settings", {
  id:              serial("id").primaryKey(),
  merchantId:      integer("merchant_id").notNull().unique().references(() => merchantsTable.id),
  gstEnabled:      text("gst_enabled").notNull().default("true"),
  gstRate:         numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  gstNumber:       text("gst_number"),         // ABN or GST registration number
  taxInclusive:    text("tax_inclusive").notNull().default("true"), // prices include GST
  showTaxOnReceipt: text("show_tax_on_receipt").notNull().default("true"),
  taxName:         text("tax_name").notNull().default("GST"),
  receiptFooter:   text("receipt_footer"),
  receiptHeader:   text("receipt_header"),
  emailReceiptsEnabled: text("email_receipts_enabled").notNull().default("false"),
  smsReceiptsEnabled:   text("sms_receipts_enabled").notNull().default("false"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaxSettingsSchema = createInsertSchema(taxSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTaxSettings = z.infer<typeof insertTaxSettingsSchema>;
export type TaxSettings = typeof taxSettingsTable.$inferSelect;
