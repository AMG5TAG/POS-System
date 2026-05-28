import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const pcBuilderSettingsTable = pgTable("pc_builder_settings", {
  id:                  serial("id").primaryKey(),
  merchantId:          integer("merchant_id").notNull().references(() => merchantsTable.id),
  applyDefaultMarkup:  text("apply_default_markup").notNull().default("true"),
  defaultMarkup:       numeric("default_markup", { precision: 6, scale: 2 }).notNull().default("30"),
  laborRate:           numeric("labor_rate", { precision: 10, scale: 2 }).notNull().default("80"),
  assemblyTimeMinutes: integer("assembly_time_minutes").notNull().default(60),
  includeGst:          text("include_gst").notNull().default("true"),
  showCompatWarnings:  text("show_compat_warnings").notNull().default("true"),
  enabledSlots:        text("enabled_slots").notNull().default("[]"),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PcBuilderSettings = typeof pcBuilderSettingsTable.$inferSelect;
export type InsertPcBuilderSettings = typeof pcBuilderSettingsTable.$inferInsert;
