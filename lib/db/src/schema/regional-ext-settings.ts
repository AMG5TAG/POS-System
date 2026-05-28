import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const regionalExtSettingsTable = pgTable("regional_ext_settings", {
  id:                  serial("id").primaryKey(),
  merchantId:          integer("merchant_id").notNull().references(() => merchantsTable.id),
  abn:                 text("abn").notNull().default(""),
  taxRates:            text("tax_rates").notNull().default("[]"),
  defaultTaxRate:      text("default_tax_rate").notNull().default("10"),
  receiptPaperSize:    text("receipt_paper_size").notNull().default("80mm"),
  language:            text("language").notNull().default("en-AU"),
  dateFormat:          text("date_format").notNull().default("DD/MM/YYYY"),
  timeFormat:          text("time_format").notNull().default("24"),
  decimalSeparator:    text("decimal_separator").notNull().default("."),
  thousandsSeparator:  text("thousands_separator").notNull().default(","),
  measurementSystem:   text("measurement_system").notNull().default("metric"),
  paperSize:           text("paper_size").notNull().default("A4"),
  firstDayOfWeek:      text("first_day_of_week").notNull().default("monday"),
  fiscalYearStart:     integer("fiscal_year_start").notNull().default(7),
  taxLabel:            text("tax_label").notNull().default("GST"),
  customTaxLabel:      text("custom_tax_label").notNull().default(""),
  taxNumberLabel:      text("tax_number_label").notNull().default("ABN"),
});

export type RegionalExtSettings = typeof regionalExtSettingsTable.$inferSelect;
export type InsertRegionalExtSettings = typeof regionalExtSettingsTable.$inferInsert;
