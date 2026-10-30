import { pgTable, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Per-merchant service job settings, edited under Management › Invoices &
 * Services › Services (`routes/service-settings.ts`). The JSON `config` holds
 * `customNotes` — the preset notes offered in a job's Notes section.
 *
 * Rows may also still carry the eight section booleans of the removed Service
 * Options page. Nothing reads them (sections are fixed in code,
 * `SERVICE_JOB_SECTIONS`); a save merges over them rather than dropping them.
 */
export const serviceSettingsTable = pgTable("service_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ServiceSettingsRow = typeof serviceSettingsTable.$inferSelect;
