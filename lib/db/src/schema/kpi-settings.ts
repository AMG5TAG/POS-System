import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const kpiSettingsTable = pgTable("kpi_settings", {
  id:                  serial("id").primaryKey(),
  merchantId:          integer("merchant_id").notNull().references(() => merchantsTable.id),
  trackCategories:     text("track_categories").notNull().default("true"),
  trackAppointments:   text("track_appointments").notNull().default("true"),
  trackServices:       text("track_services").notNull().default("true"),
  trackSuppliers:      text("track_suppliers").notNull().default("false"),
  trackWastage:        text("track_wastage").notNull().default("false"),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KpiSettings = typeof kpiSettingsTable.$inferSelect;
export type InsertKpiSettings = typeof kpiSettingsTable.$inferInsert;
