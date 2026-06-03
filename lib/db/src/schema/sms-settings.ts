import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const smsSettingsTable = pgTable("sms_settings", {
  id:                     serial("id").primaryKey(),
  merchantId:             integer("merchant_id").notNull().unique().references(() => merchantsTable.id, { onDelete: "cascade" }),
  smsEnabled:             boolean("sms_enabled").notNull().default(false),
  autoNotifyOnStatus:     boolean("auto_notify_on_status").notNull().default(false),
  createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SmsSettings       = typeof smsSettingsTable.$inferSelect;
export type InsertSmsSettings = typeof smsSettingsTable.$inferInsert;
