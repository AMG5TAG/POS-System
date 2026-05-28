import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const shortlinkSettingsTable = pgTable("shortlink_settings", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  baseDomain: text("base_domain").notNull().default("koapos.com"),
  prefix:     text("prefix").notNull().default("s"),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ShortlinkSettings = typeof shortlinkSettingsTable.$inferSelect;
export type InsertShortlinkSettings = typeof shortlinkSettingsTable.$inferInsert;
