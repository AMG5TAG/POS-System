/**
 * Leader Computers' dealer datafeed → product details, with no fetching or
 * `db` here (services/leaderFeed.ts downloads and caches the feed). Pinned by
 * `leader-feed.test.ts` against real feed rows.
 *
 * The feed is the CSV from the Leader dealer portal (Resources › Datafeed,
 * "stock CSV with headings and long description"), one row per stock code:
 * STOCK CODE, CATEGORY NAME, SUBCATEGORY NAME, SHORT DESCRIPTION,
 * LONG DESCRIPTION, BAR CODE, DBP, RRP, IMAGE, MANUFACTURER, MANUFACTURER SKU,
 * WEIGHT (kg), LENGTH/WIDTH/HEIGHT (mm), WARRANTY (months), per-state stock.
 * Its URL is per dealer and secret: LEADER_DATAFEED_URL.
 */

export interface FeedProduct {
  stockCode: string;
  /** A product name made from the short description — the bit before the spec list. */
  name: string;
  shortDescription: string;
  /** Long description as plain text (HTML removed, line breaks tidied). */
  description: string;
  barcode: string;
  brand: string;
  manufCode: string;
  imageUrl: string;
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  warrantyMonths: number | null;
  /** Leader's recommended retail price (inc GST). */
  rrp: number | null;
  category: string;
  subcategory: string;
}

export function normaliseStockCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/** Leader is the supplier when the invoice's or the supplier record's name says so. */
export function isLeaderSupplier(name: string | null | undefined): boolean {
  return /^\s*leader\b/i.test(name ?? "");
}

const NAME_MAX = 90;

/**
 * "Biwin UD150 32GB USB Flash Drive USB 3.2 Gen 1 Type-A/Type-C - 5 Year Warranty"
 *   → "Biwin UD150 32GB USB Flash Drive USB 3.2 Gen 1 Type-A/Type-C"
 * "AOC 27' 4K Monitor U27B35: 27' IPS, 3840×2160 @ 60Hz, …" → "AOC 27' 4K Monitor U27B35"
 * Leader's short descriptions run on into a spec list; the name is the part
 * before the first ": " or ", " after a sensible length, less a trailing
 * "- 5 Year Warranty". " - " alone is not a cut: Leader uses it for colours
 * ("… (1M) - White").
 */
export function feedProductName(short: string): string {
  const s = short.replace(/\s+/g, " ").trim();
  let cut = s.length;
  for (const sep of [": ", ", "]) {
    let from = 0;
    for (;;) {
      const i = s.indexOf(sep, from);
      if (i < 0) break;
      if (i >= 20) { cut = Math.min(cut, i); break; }
      from = i + sep.length;
    }
  }
  let name = s.slice(0, cut).trim().replace(/\s+-\s+\d+\s*(year|yr|month|mth)s?\s+warranty$/i, "").trim();
  if (name.length > NAME_MAX) {
    const head = name.slice(0, NAME_MAX + 1);
    const sp = head.lastIndexOf(" ");
    name = (sp > 40 ? head.slice(0, sp) : head.slice(0, NAME_MAX)).trim();
  }
  return name.replace(/[,;:\-–—\s]+$/, "");
}

/** Feed long descriptions mix HTML, \r\n and runs of blank lines. */
export function cleanFeedDescription(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/(p|div|h\d|li)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\r\n?/g, "\n")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
}

function num(s: string | undefined): number | null {
  const n = parseFloat((s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
const mmToCm = (s: string | undefined) => { const n = num(s); return n == null ? null : Math.round(n) / 10; };

/** One CSV row (keyed by header) → product details. Null for a row with no stock code. */
export function feedRowToProduct(row: Record<string, string>): FeedProduct | null {
  const get = (k: string) => (row[k] ?? "").trim();
  const stockCode = get("STOCK CODE");
  if (!stockCode) return null;
  const short = get("SHORT DESCRIPTION");
  const image = get("IMAGE");
  const warranty = num(get("WARRANTY"));
  return {
    stockCode,
    name: feedProductName(short) || stockCode,
    shortDescription: short,
    description: cleanFeedDescription(get("LONG DESCRIPTION") || short),
    barcode: /^\d{8,14}$/.test(get("BAR CODE")) ? get("BAR CODE") : "",
    brand: get("MANUFACTURER"),
    manufCode: get("MANUFACTURER SKU"),
    imageUrl: /^https:\/\//i.test(image) ? image : "",
    weightKg: num(get("WEIGHT")),
    lengthCm: mmToCm(get("LENGTH")),
    widthCm: mmToCm(get("WIDTH")),
    heightCm: mmToCm(get("HEIGHT")),
    warrantyMonths: warranty != null ? Math.round(warranty) : null,
    rrp: num(get("RRP")),
    category: get("CATEGORY NAME"),
    subcategory: get("SUBCATEGORY NAME"),
  };
}

/** Months → the product form's warranty: whole years when it divides, else months. */
export function warrantyFromMonths(months: number | null | undefined): { warrantyDuration: number; warrantyUnit: "months" | "years" } | null {
  if (!months || months <= 0) return null;
  return months % 12 === 0 ? { warrantyDuration: months / 12, warrantyUnit: "years" } : { warrantyDuration: months, warrantyUnit: "months" };
}

/** Feed image URLs are only ever fetched from Leader's own site. */
export function isLeaderImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)leadersystems\.com\.au$/i.test(u.hostname);
  } catch { return false; }
}
