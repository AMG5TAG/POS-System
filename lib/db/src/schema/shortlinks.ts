import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const shortlinksTable = pgTable("shortlinks", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  linkId:     text("link_id").notNull(),
  label:      text("label").notNull(),
  longUrl:    text("long_url").notNull(),
  slug:       text("slug").notNull(),
  baseDomain: text("base_domain").notNull().default(""),
  clicks:     integer("clicks").notNull().default(0),
  tags:       text("tags").notNull().default(""),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Shortlink = typeof shortlinksTable.$inferSelect;
export type InsertShortlink = typeof shortlinksTable.$inferInsert;
