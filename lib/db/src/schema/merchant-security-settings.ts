import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const merchantSecuritySettingsTable = pgTable("merchant_security_settings", {
  id:                 serial("id").primaryKey(),
  merchantId:         integer("merchant_id").notNull().unique().references(() => merchantsTable.id),
  anomalyIpThreshold: integer("anomaly_ip_threshold").notNull().default(3),
  anomalyWindowMinutes: integer("anomaly_window_minutes").notNull().default(10),
  anomalyHoldHours:   integer("anomaly_hold_hours").notNull().default(24),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MerchantSecuritySettings = typeof merchantSecuritySettingsTable.$inferSelect;
export type InsertMerchantSecuritySettings = typeof merchantSecuritySettingsTable.$inferInsert;
