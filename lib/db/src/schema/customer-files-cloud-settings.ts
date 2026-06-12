import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Per-merchant preference for mirroring every customer file upload to a folder
 * on a connected cloud storage provider (Sync → Cloud Files & Folders).
 *
 * When `enabled`, files uploaded to any customer are also pushed to `folder`
 * on the `storageKey` provider (e.g. "onedrive", "google_drive", "dropbox").
 */
export const customerFilesCloudSettingsTable = pgTable("customer_files_cloud_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique().references(() => merchantsTable.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  storageKey: text("storage_key").notNull().default(""),
  folder: text("folder").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CustomerFilesCloudSettings = typeof customerFilesCloudSettingsTable.$inferSelect;
