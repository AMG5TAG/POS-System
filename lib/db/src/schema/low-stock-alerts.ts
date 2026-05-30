import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const lowStockAlertSettingsTable = pgTable("low_stock_alert_settings", {
  id:               serial("id").primaryKey(),
  merchantId:       integer("merchant_id").notNull().unique().references(() => merchantsTable.id),
  enabled:          text("enabled").notNull().default("false"),
  emailAddresses:   text("email_addresses").notNull().default("[]"),
  mode:             text("mode").notNull().default("immediate"),
  globalThreshold:  integer("global_threshold"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const lowStockAlertLogTable = pgTable("low_stock_alert_log", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  sentAt:         timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  mode:           text("mode").notNull().default("immediate"),
  itemCount:      integer("item_count").notNull().default(0),
  emailAddresses: text("email_addresses").notNull().default("[]"),
  items:          text("items").notNull().default("[]"),
});

export type LowStockAlertSettings = typeof lowStockAlertSettingsTable.$inferSelect;
export type InsertLowStockAlertSettings = typeof lowStockAlertSettingsTable.$inferInsert;
export type LowStockAlertLog = typeof lowStockAlertLogTable.$inferSelect;
export type InsertLowStockAlertLog = typeof lowStockAlertLogTable.$inferInsert;
