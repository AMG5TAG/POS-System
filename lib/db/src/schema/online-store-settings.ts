import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const onlineStoreSettingsTable = pgTable("online_store_settings", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  mode:       text("mode").notNull().default("builder"),
  storeName:  text("store_name").notNull().default(""),
  tagline:    text("tagline").notNull().default(""),
  logoUrl:    text("logo_url").notNull().default(""),
  faviconUrl: text("favicon_url").notNull().default(""),
  domain:     text("domain").notNull().default(""),
  published:  text("published").notNull().default("false"),
  theme:      text("theme").notNull().default("{}"),
  payments:   text("payments").notNull().default("{}"),
  features:   text("features").notNull().default("{}"),
  pages:      text("pages").notNull().default("[]"),
  quickCodes: text("quick_codes").notNull().default("[]"),
});

export type OnlineStoreSettings = typeof onlineStoreSettingsTable.$inferSelect;
export type InsertOnlineStoreSettings = typeof onlineStoreSettingsTable.$inferInsert;
