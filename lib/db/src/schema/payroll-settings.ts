import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * payroll_settings — per-merchant payroll provider configuration.
 *
 * One row per merchant. The OAuth tokens themselves live in oauth_token_vault
 * under the provider key (e.g. "xero_payroll"); this table holds the non-secret
 * config: which provider/region is active, the selected pay calendar, and the
 * account/category mappings + sync log (JSON) used when posting journals.
 */
export const payrollSettingsTable = pgTable("payroll_settings", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  providerKey:  text("provider_key").notNull().default("xero_payroll"), // xero_payroll | myob | quickbooks | deputy
  region:       text("region").notNull().default("AU"),                 // AU | NZ | UK
  status:       text("status").notNull().default("disconnected"),       // connected | disconnected
  payCalendarId: text("pay_calendar_id"),                               // provider pay-calendar/run-schedule id
  // JSON: { wagesExpenseAccount, payeLiabilityAccount, superLiabilityAccount, wagesPayableAccount, ... }
  accountMappings: text("account_mappings"),
  // JSON array of { timestamp, type, message, error? } — keep last ~50.
  syncLog:      text("sync_log"),
  lastSyncAt:   timestamp("last_sync_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("payroll_settings_merchant_idx").on(t.merchantId),
]);

export type PayrollSettings       = typeof payrollSettingsTable.$inferSelect;
export type InsertPayrollSettings = typeof payrollSettingsTable.$inferInsert;
