import type { Request } from "express";
import crypto from "node:crypto";
import { db, marketingEventsTable } from "@workspace/db";

/**
 * Best-effort capture of public marketing engagements (shortlink clicks,
 * landing-page views, QR scans) into `marketing_events`. Everything here is
 * fire-and-forget and defensive: a failure to derive a field, or to insert the
 * row, must never break the redirect / page the visitor actually asked for.
 *
 * Privacy: raw IPs are never persisted — only a salted hash, used to approximate
 * unique visitors. Geo comes from CDN headers when present (no IP lookup here).
 */

export type MarketingEventKind = "shortlink" | "landing" | "qr";

// Salt for the unique-visitor hash. A dedicated var is preferred; we fall back to
// the session secret so uniqueness still works without extra config.
const IP_SALT = process.env.ANALYTICS_IP_SALT ?? process.env.SESSION_SECRET ?? "koapos-analytics-salt";

const MAX_LEN = 300;
const clip = (v: string, n = 80) => (v.length > n ? v.slice(0, n) : v);

function header(req: Request, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** First non-empty header from a candidate list (different CDNs use different names). */
function firstHeader(req: Request, names: string[]): string {
  for (const n of names) {
    const v = header(req, n).trim();
    if (v) return v;
  }
  return "";
}

/** Coarse device class from the User-Agent string. */
function deviceTypeFromUA(ua: string): string {
  const s = ua.toLowerCase();
  if (!s) return "unknown";
  if (/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|monitor/.test(s)) return "bot";
  if (/ipad|tablet|kindle|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|phone/.test(s)) return "mobile";
  return "desktop";
}

function osFromUA(ua: string): string {
  const s = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return "iOS";
  if (/android/.test(s)) return "Android";
  if (/windows nt|windows phone/.test(s)) return "Windows";
  if (/mac os x|macintosh/.test(s)) return "macOS";
  if (/cros/.test(s)) return "Chrome OS";
  if (/linux/.test(s)) return "Linux";
  return "";
}

function browserFromUA(ua: string): string {
  const s = ua.toLowerCase();
  // Order matters: Edge/Opera/Chrome all contain "chrome"/"safari".
  if (/edg(a|ios|e)?\//.test(s)) return "Edge";
  if (/opr\/|opera/.test(s)) return "Opera";
  if (/samsungbrowser/.test(s)) return "Samsung Internet";
  if (/firefox|fxios/.test(s)) return "Firefox";
  if (/chrome|crios|chromium/.test(s)) return "Chrome";
  if (/safari/.test(s)) return "Safari";
  return "";
}

/** Best-effort referrer host (drops query/path for privacy + cleaner grouping). */
function referrerHost(req: Request): string {
  const raw = firstHeader(req, ["referer", "referrer"]);
  if (!raw) return "";
  try { return clip(new URL(raw).hostname, 120); } catch { return clip(raw, 120); }
}

/** Primary language tag, e.g. "en-AU" → "en-AU". */
function primaryLanguage(req: Request): string {
  const raw = firstHeader(req, ["accept-language"]);
  if (!raw) return "";
  return clip(raw.split(",")[0]?.trim() ?? "", 16);
}

interface GeoFields { country: string; region: string; city: string; }

/** Geo from CDN headers (Cloudflare / Vercel / GAE / Fly / generic). */
function geoFromHeaders(req: Request): GeoFields {
  const country = firstHeader(req, [
    "cf-ipcountry", "x-vercel-ip-country", "x-appengine-country",
    "fly-client-country", "x-geo-country", "x-country-code",
  ]);
  const region = firstHeader(req, [
    "x-vercel-ip-country-region", "cf-region-code", "cf-region",
    "x-appengine-region", "fly-client-region", "x-geo-region",
  ]);
  const cityRaw = firstHeader(req, [
    "cf-ipcity", "x-vercel-ip-city", "x-appengine-city", "x-geo-city",
  ]);
  // Some CDNs URL-encode the city ("New%20York").
  let city = cityRaw;
  try { city = decodeURIComponent(cityRaw); } catch { /* keep raw */ }
  // "XX"/"T1" are CDN placeholders for unknown/Tor — treat as empty.
  const norm = (c: string) => (c && c.toUpperCase() !== "XX" && c.toUpperCase() !== "T1" ? c : "");
  return { country: clip(norm(country), 8), region: clip(region, 64), city: clip(city, 80) };
}

/** Salted hash of the client IP — for unique counts only; never reversible to an IP. */
function ipHash(req: Request): string {
  const ip = (req.ip ?? firstHeader(req, ["x-forwarded-for"]).split(",")[0] ?? "").trim();
  if (!ip) return "";
  return crypto.createHash("sha256").update(`${IP_SALT}:${ip}`).digest("hex").slice(0, 40);
}

/** Derive all enrichment fields from the request. Exported for testing. */
export function deriveClient(req: Request) {
  const ua = header(req, "user-agent");
  const geo = geoFromHeaders(req);
  return {
    deviceType: deviceTypeFromUA(ua),
    os: osFromUA(ua),
    browser: browserFromUA(ua),
    country: geo.country,
    region: geo.region,
    city: geo.city,
    referrer: referrerHost(req),
    language: primaryLanguage(req),
    ipHash: ipHash(req),
  };
}

/**
 * Record one marketing engagement. Fire-and-forget: returns immediately and
 * swallows all errors so it can never delay or fail the visitor's request.
 */
export function recordMarketingEvent(
  req: Request,
  opts: { merchantId: number; kind: MarketingEventKind; targetId?: number | null; targetSlug?: string },
): void {
  try {
    const c = deriveClient(req);
    void db
      .insert(marketingEventsTable)
      .values({
        merchantId: opts.merchantId,
        kind: opts.kind,
        targetId: opts.targetId ?? null,
        targetSlug: clip(opts.targetSlug ?? "", MAX_LEN),
        ...c,
      })
      .catch(() => { /* analytics is best-effort */ });
  } catch {
    /* never throw from the capture path */
  }
}
