import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const regionalExtSettingsTable = pgTable("regional_ext_settings", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  abn:        text("abn").notNull().default(""),
  taxRates:   text("tax_rates").notNull().default("[]"),
  defaultTaxRate: text("default_tax_rate").notNull().default("10"),
  receiptPaperSize: text("receipt_paper_size").notNull().default("80mm"),
});

export type RegionalExtSettings = typeof regionalExtSettingsTable.$inferSelect;
export type InsertRegionalExtSettings = typeof regionalExtSettingsTable.$inferInsert;
