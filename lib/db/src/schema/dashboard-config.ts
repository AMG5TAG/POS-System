import { boolean, integer, jsonb, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
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
  showReferralRevenue: boolean("show_referral_revenue").notNull().default(true),
  showBirthdayNotifications: boolean("show_birthday_notifications").notNull().default(true),
  // Banner counting completed services/appointments that are past the Follow Up
  // window and still haven't been contacted (Marketing → Follow Up).
  showFollowUpNotifications: boolean("show_follow_up_notifications").notNull().default(true),
  // Custom vertical order of the dashboard's content sections (array of stable
  // section ids). Null = default order. Merchant-wide, so it syncs across devices.
  sectionOrder: jsonb("section_order").$type<string[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export type DashboardConfig = typeof dashboardConfigTable.$inferSelect;
export type InsertDashboardConfig = typeof dashboardConfigTable.$inferInsert;
