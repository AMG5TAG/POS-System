import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const kpiSettingsTable = pgTable("kpi_settings", {
  id:                  serial("id").primaryKey(),
  merchantId:          integer("merchant_id").notNull().references(() => merchantsTable.id),
  trackCategories:     text("track_categories").notNull().default("true"),
  trackAppointments:   text("track_appointments").notNull().default("true"),
  trackServices:       text("track_services").notNull().default("true"),
});

export type KpiSettings = typeof kpiSettingsTable.$inferSelect;
export type InsertKpiSettings = typeof kpiSettingsTable.$inferInsert;
