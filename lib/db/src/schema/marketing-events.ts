import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Append-only log of public marketing engagements — one row per shortlink click,
 * landing-page view, or QR scan. Powers the Marketing → Analytics screen
 * (engagement over time, by device, by country, unique visitors).
 *
 * Privacy: raw IPs are never stored. `ipHash` is a salted SHA-256 used only to
 * approximate unique visitors; `country`/`region`/`city` come from CDN geo
 * headers when the host provides them. Every enrichment field is best-effort and
 * may be empty.
 */
export const marketingEventsTable = pgTable("marketing_events", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  // What was engaged: "shortlink" | "landing" | "qr".
  kind:       text("kind").notNull(),
  // The id of the shortlink / landing_page / qr_code row, when known.
  targetId:   integer("target_id"),
  // A human-friendly identifier (slug / label) captured for display without a join.
  targetSlug: text("target_slug").notNull().default(""),
  deviceType: text("device_type").notNull().default("unknown"),
  os:         text("os").notNull().default(""),
  browser:    text("browser").notNull().default(""),
  country:    text("country").notNull().default(""),
  region:     text("region").notNull().default(""),
  city:       text("city").notNull().default(""),
  referrer:   text("referrer").notNull().default(""),
  language:   text("language").notNull().default(""),
  ipHash:     text("ip_hash").notNull().default(""),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("marketing_events_merchant_kind_time_idx").on(t.merchantId, t.kind, t.occurredAt),
  index("marketing_events_merchant_target_idx").on(t.merchantId, t.kind, t.targetId),
]);

export type MarketingEvent = typeof marketingEventsTable.$inferSelect;
export type InsertMarketingEvent = typeof marketingEventsTable.$inferInsert;
