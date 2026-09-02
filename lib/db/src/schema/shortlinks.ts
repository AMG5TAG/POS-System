import { pgTable, text, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
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
}, (table) => [
  // A shortlink ending is unique per merchant — enforced at the DB level so
  // concurrent create/update requests can't race past the application check.
  uniqueIndex("shortlinks_merchant_slug_unique").on(table.merchantId, table.slug),
  // The public redirect resolver looks up by slug alone (no merchantId), which
  // the composite unique above can't serve — index slug for the hot path.
  index("shortlinks_slug_idx").on(table.slug),
]);

export type Shortlink = typeof shortlinksTable.$inferSelect;
export type InsertShortlink = typeof shortlinksTable.$inferInsert;
