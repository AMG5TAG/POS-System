import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Additional named backup schedules for a merchant, on top of the single
 * frequency in merchant_backup_configs. Lets a merchant run several distinct
 * scheduled backups at once — e.g. "Daily → OneDrive" and "Monthly → S3".
 *
 * Each schedule reuses the merchant's central encryption password and storage
 * destinations (in merchant_backup_configs); `destinationIds` selects which of
 * those configured destinations this schedule copies to (empty = server copy
 * only). Frequency: "daily" | "weekly" | "monthly".
 */
export const merchantBackupSchedulesTable = pgTable("merchant_backup_schedules", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Backup"),
  frequency: text("frequency").notNull().default("daily"),
  destinationIds: jsonb("destination_ids").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  lastBackupAt: timestamp("last_backup_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("merchant_backup_schedules_merchant_id_idx").on(t.merchantId),
]);

export type MerchantBackupSchedule = typeof merchantBackupSchedulesTable.$inferSelect;
