import { boolean, integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const dashboardConfigTable = pgTable("dashboard_config", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique().references(() => merchantsTable.id, { onDelete: "cascade" }),
  showStatusTiles: boolean("show_status_tiles").notNull().default(true),
  showMetricTiles: boolean("show_metric_tiles").notNull().default(true),
  showOverdueBanner: boolean("show_overdue_banner").notNull().default(true),
  showNotifications: boolean("show_notifications").notNull().default(true),
  showServiceJobsPanel: boolean("show_service_jobs_panel").notNull().default(true),
  showCalendar: boolean("show_calendar").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export type DashboardConfig = typeof dashboardConfigTable.$inferSelect;
export type InsertDashboardConfig = typeof dashboardConfigTable.$inferInsert;
