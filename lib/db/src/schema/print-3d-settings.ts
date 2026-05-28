import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const print3dSettingsTable = pgTable("print_3d_settings", {
  id:                    serial("id").primaryKey(),
  merchantId:            integer("merchant_id").notNull().references(() => merchantsTable.id),
  printerId:             text("printer_id").notNull().default(""),
  customPrinterName:     text("custom_printer_name").notNull().default(""),
  printerWattage:        integer("printer_wattage").notNull().default(120),
  purchasePrice:         numeric("purchase_price", { precision: 10, scale: 2 }).notNull().default("0"),
  lifetimeHours:         integer("lifetime_hours").notNull().default(5000),
  profitMargin:          numeric("profit_margin", { precision: 6, scale: 2 }).notNull().default("30"),
  electricityRate:       numeric("electricity_rate", { precision: 8, scale: 4 }).notNull().default("0.30"),
  overheadPerHour:       numeric("overhead_per_hour", { precision: 10, scale: 2 }).notNull().default("0"),
  laborRate:             numeric("labor_rate", { precision: 10, scale: 2 }).notNull().default("60"),
  setupTimeMinutes:      integer("setup_time_minutes").notNull().default(10),
  failureRate:           numeric("failure_rate", { precision: 6, scale: 2 }).notNull().default("5"),
  filamentWastePercent:  numeric("filament_waste_percent", { precision: 6, scale: 2 }).notNull().default("5"),
  postProcessingMinutes: integer("post_processing_minutes").notNull().default(0),
  coolingFactor:         numeric("cooling_factor", { precision: 6, scale: 3 }).notNull().default("1"),
  roundingMode:          text("rounding_mode").notNull().default("none"),
  roundingValue:         numeric("rounding_value", { precision: 10, scale: 2 }).notNull().default("0"),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Print3dSettings = typeof print3dSettingsTable.$inferSelect;
export type InsertPrint3dSettings = typeof print3dSettingsTable.$inferInsert;
