import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const shortlinkSettingsTable = pgTable("shortlink_settings", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  baseDomain: text("base_domain").notNull().default("koapos.com"),
  prefix:     text("prefix").notNull().default("s"),
});

export type ShortlinkSettings = typeof shortlinkSettingsTable.$inferSelect;
export type InsertShortlinkSettings = typeof shortlinkSettingsTable.$inferInsert;
