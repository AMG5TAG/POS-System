import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Per-merchant settings for the Mobile POS web app (/b/:username/t/posapp).
 * A slimmed, PIN-authed companion that exposes only Sell, Invoices and
 * Products. Each tab can be toggled off; `enabled` is the master switch.
 * Mirrors tech_app_settings (text "true"/"false" booleans).
 */
export const mobilePosAppSettingsTable = pgTable("mobile_pos_app_settings", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  /** Master switch — when "false" staff cannot sign in. */
  enabled:       text("enabled").notNull().default("true"),
  /** Show the Sell (ring-up) tab. */
  showSell:      text("show_sell").notNull().default("true"),
  /** Show the Invoices tab. */
  showInvoices:  text("show_invoices").notNull().default("true"),
  /** Show the Products tab. */
  showProducts:  text("show_products").notNull().default("true"),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MobilePosAppSettings = typeof mobilePosAppSettingsTable.$inferSelect;
