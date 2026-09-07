import { pgTable, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Per-merchant toggles for which sections appear in the service job menu
 * (ServiceJobDetailDialog). One row per merchant; the JSON `config` holds the
 * eight section booleans. Absent keys default to visible, so an empty/missing
 * row means "show everything" (the pre-feature behaviour).
 */
export const serviceSettingsTable = pgTable("service_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ServiceSettingsRow = typeof serviceSettingsTable.$inferSelect;
