import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/** Per-merchant settings for the technician web app (/b/:username/t/webapp). */
export const techAppSettingsTable = pgTable("tech_app_settings", {
  id:                  serial("id").primaryKey(),
  merchantId:          integer("merchant_id").notNull().references(() => merchantsTable.id),
  /** Master switch — when "false" technicians cannot sign in. */
  enabled:             text("enabled").notNull().default("true"),
  /** Show customer phone/email on job details in the tech app. */
  showCustomerContact: text("show_customer_contact").notNull().default("true"),
  /** Show device logins / PINs / accounts on job details in the tech app. */
  showCredentials:     text("show_credentials").notNull().default("true"),
  /** Let technicians change a job's status from the tech app. */
  allowStatusChange:   text("allow_status_change").notNull().default("true"),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Moderation trail — one row per tech-app user action (login, job view, scan…). */
export const techAppEventsTable = pgTable("tech_app_events", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  staffId:    integer("staff_id"),
  /** Snapshotted so the trail survives staff renames/deletions. */
  staffName:  text("staff_name").notNull().default(""),
  action:     text("action").notNull(),
  detail:     text("detail").notNull().default(""),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tech_app_events_merchant_created_idx").on(t.merchantId, t.createdAt),
]);

export type TechAppSettings = typeof techAppSettingsTable.$inferSelect;
export type TechAppEvent = typeof techAppEventsTable.$inferSelect;
