import { pgTable, bigserial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Online shop analytics (Management › Online Store › Statistics): one row per
 * thing a shopper did — a page view, a product view, a link click, a search, an
 * add-to-cart. Written by POST /shop/track (routes/shop-stats.ts); created by
 * scripts/src/add-shop-events-table.ts.
 *
 * No IP address is stored. `ip_hash` is an HMAC of it under a server secret,
 * enough to count unique addresses and nothing more. `visitor_id` is a random
 * id the shop keeps in the browser's localStorage, so "visitors" counts
 * browsers and "unique IPs" counts connections — the two numbers the owner
 * asked for, which differ for a household on one connection or a phone moving
 * between networks.
 */
export const shopEventsTable = pgTable("shop_events", {
  id:         bigserial("id", { mode: "number" }).primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
  /** page_view | product_view | link_click | search | add_to_cart */
  type:       text("type").notNull(),
  path:       text("path").notNull().default(""),
  productId:  integer("product_id"),
  /** link_click: the link's address; search: the search text. */
  target:     text("target"),
  /** link_click: the link's visible text. */
  label:      text("label"),
  visitorId:  text("visitor_id").notNull(),
  ipHash:     text("ip_hash").notNull(),
  /** The referring site's host, on a visit's first page view only. */
  referrer:   text("referrer"),
  /** mobile | tablet | desktop, from the user agent. */
  device:     text("device"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("shop_events_merchant_time_idx").on(t.merchantId, t.createdAt),
  index("shop_events_merchant_type_time_idx").on(t.merchantId, t.type, t.createdAt),
]);

export type ShopEvent = typeof shopEventsTable.$inferSelect;
