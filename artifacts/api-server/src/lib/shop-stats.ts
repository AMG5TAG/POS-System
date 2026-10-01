import crypto from "node:crypto";
import { z } from "zod/v4";

/**
 * Online shop analytics — what POST /shop/track accepts and how a request is
 * reduced to a stored row (routes/shop-stats.ts). No `db` here; pinned by
 * shop-stats.test.ts.
 *
 *   - Raw IP addresses are never stored: `ipHash` is an HMAC under a server
 *     secret, which counts unique addresses without being reversible.
 *   - Crawlers and link-preview bots are dropped (`isBot`) — they would
 *     otherwise be most of the "visitors".
 *   - Only the referring site's *host* is kept, and only when it is another
 *     site; our own pages are navigation, not referrals.
 */

export const SHOP_EVENT_TYPES = ["page_view", "product_view", "link_click", "search", "add_to_cart"] as const;
export type ShopEventType = (typeof SHOP_EVENT_TYPES)[number];

export const TrackBody = z.object({
  visitorId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  events: z.array(z.object({
    type: z.enum(SHOP_EVENT_TYPES),
    path: z.string().max(300).default(""),
    productId: z.number().int().positive().optional(),
    target: z.string().max(500).optional(),
    label: z.string().max(120).optional(),
    referrer: z.string().max(500).optional(),
  })).min(1).max(20),
});
export type TrackInput = z.infer<typeof TrackBody>;

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch|go-http/i;

/** A crawler, preview fetcher or script rather than a person — or no user agent at all. */
export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

export function deviceOf(userAgent: string | null | undefined): "mobile" | "tablet" | "desktop" {
  const ua = userAgent ?? "";
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** HMAC of the client IP under a server secret: countable, not reversible. */
export function hashIp(ip: string | null | undefined, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`shop-ip:${ip ?? ""}`).digest("hex").slice(0, 32);
}

/** The referring site's host, or null for our own sites, a blank or a junk value. */
export function referrerHost(referrer: string | null | undefined, ownHosts: string[]): string | null {
  if (!referrer) return null;
  let host: string;
  try { host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
  if (!host) return null;
  return ownHosts.some((h) => host === h || host.endsWith(`.${h}`)) ? null : host;
}

/** Search text as counted: trimmed, lower-cased, spaces collapsed. */
export const normaliseSearch = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);

/** Stats periods offered by the page, in days. */
export const STATS_PERIODS = [1, 7, 30, 90, 365] as const;
export function statsPeriod(raw: unknown): number {
  const n = Number(raw);
  return (STATS_PERIODS as readonly number[]).includes(n) ? n : 30;
}

/** Share as a percentage to one decimal place; 0 when there is nothing to divide by. */
export const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
