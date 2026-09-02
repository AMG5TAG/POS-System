import { boolean, integer, pgTable, serial, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Per-merchant settings for the public, read-only Dashboard app
 * (/b/:username/t/dashboard).
 *
 * `enabled` is the master switch — the shared link only works while it is on.
 * The remaining flags mirror the in-app dashboard widgets (dashboardConfigTable)
 * and control exactly which sections are exposed on the public link. They
 * default conservatively: the most sensitive sections (sticky notes and revenue
 * by channel) are hidden until the owner opts in.
 */
export const dashboardAppSettingsTable = pgTable("dashboard_app_settings", {
  id:                   serial("id").primaryKey(),
  merchantId:           integer("merchant_id").notNull().unique().references(() => merchantsTable.id, { onDelete: "cascade" }),
  enabled:              boolean("enabled").notNull().default(false),
  showStatusTiles:      boolean("show_status_tiles").notNull().default(true),
  showMetricTiles:      boolean("show_metric_tiles").notNull().default(true),
  showOverdueBanner:    boolean("show_overdue_banner").notNull().default(true),
  showNotifications:    boolean("show_notifications").notNull().default(false),
  showServiceJobsPanel: boolean("show_service_jobs_panel").notNull().default(true),
  showCalendar:         boolean("show_calendar").notNull().default(true),
  showReferralRevenue:  boolean("show_referral_revenue").notNull().default(false),
  // Unguessable token that addresses the public link (/d/:token). Replaces the
  // guessable username-based URL so a merchant's shared dashboard can't be found
  // by trying usernames. Nullable until backfilled / lazily generated.
  publicToken:          text("public_token"),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("dashboard_app_settings_public_token_unique").on(t.publicToken),
]);

export type DashboardAppSettings = typeof dashboardAppSettingsTable.$inferSelect;
export type InsertDashboardAppSettings = typeof dashboardAppSettingsTable.$inferInsert;
