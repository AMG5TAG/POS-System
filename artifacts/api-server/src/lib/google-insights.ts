/**
 * Google Search Console, Analytics (GA4) and Business Profile — the rules,
 * away from `db` and the network so they can be pinned by tests
 * (`google-insights.test.ts`). The route (`routes/google-insights.ts`) fetches;
 * this decides what the numbers and the errors mean.
 */

/* ── Scopes ───────────────────────────────────────────────────────────────────
   One Google sign-in covers all three products. `openid email` is only for the
   account handle shown on the Integrations page. */
export const GOOGLE_INSIGHTS_SCOPES = {
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  analytics:     "https://www.googleapis.com/auth/analytics.readonly",
  business:      "https://www.googleapis.com/auth/business.manage",
} as const;
export type InsightsProduct = keyof typeof GOOGLE_INSIGHTS_SCOPES;

export const GOOGLE_INSIGHTS_SCOPE_STRING = ["openid", "email", ...Object.values(GOOGLE_INSIGHTS_SCOPES)].join(" ");

/** Which products the stored grant covers. Google lets the person untick any
    scope on the consent screen, so a connection can cover only some of them.
    A grant stored before scopes were recorded (`null`) is assumed complete —
    the API call itself will say otherwise. */
export function grantedProducts(scope: string | null | undefined): Record<InsightsProduct, boolean> {
  if (scope == null) return { searchConsole: true, analytics: true, business: true };
  const have = new Set(scope.split(/\s+/));
  return {
    searchConsole: have.has(GOOGLE_INSIGHTS_SCOPES.searchConsole) || have.has("https://www.googleapis.com/auth/webmasters"),
    analytics:     have.has(GOOGLE_INSIGHTS_SCOPES.analytics) || have.has("https://www.googleapis.com/auth/analytics"),
    business:      have.has(GOOGLE_INSIGHTS_SCOPES.business),
  };
}

/* ── Period ──────────────────────────────────────────────────────────────── */

export const INSIGHTS_PERIODS = [7, 28, 90, 365] as const;

export function insightsPeriod(raw: unknown): number {
  const n = Number(raw);
  return (INSIGHTS_PERIODS as readonly number[]).includes(n) ? n : 28;
}

/** A YYYY-MM-DD day in Sydney. */
export function sydneyDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The last `days` Sydney days, ending today. */
export function dateRange(days: number, now = new Date()): { start: string; end: string } {
  const end = sydneyDay(now);
  return { start: addDays(end, -(days - 1)), end };
}

/** Every day from start to end inclusive. */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Search keyword counts are monthly and only for finished months, so the
    Maps keyword list is always the three full months before this one. */
export function lastFullMonths(count: number, now = new Date()): { start: { year: number; month: number }; end: { year: number; month: number } } {
  const [y, m] = sydneyDay(now).split("-").map(Number) as [number, number];
  const back = (n: number) => {
    const idx = y * 12 + (m - 1) - n;
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
  };
  return { start: back(count), end: back(1) };
}

/* ── Selection ──────────────────────────────────────────────────────────────
   Which site, property and listing the business looks at. Stored as JSON in
   the integration's `merchant_integrations.credentials` (nothing secret in it;
   the tokens are in the vault). Disconnecting clears it with the row. */
export interface InsightsSelection {
  searchConsoleSite?: string;   // "sc-domain:koastal.com.au" or "https://koastal.com.au/"
  ga4Property?: string;         // "properties/123456"
  ga4PropertyName?: string;
  gbpAccount?: string;          // "accounts/123"
  gbpLocation?: string;         // "locations/456"
  gbpLocationTitle?: string;
}

const SITE_RE = /^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s]+\/)$/i;
const PROPERTY_RE = /^properties\/\d+$/;
const ACCOUNT_RE = /^accounts\/\d+$/;
const LOCATION_RE = /^locations\/\d+$/;

export function parseSelection(raw: string | null | undefined): InsightsSelection {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return cleanSelection(o);
  } catch {
    return {};
  }
}

/** Keeps only well-formed ids; a malformed one is dropped, never stored. */
export function cleanSelection(o: Record<string, unknown>): InsightsSelection {
  const str = (v: unknown, max = 200) => (typeof v === "string" && v.length <= max ? v : undefined);
  const out: InsightsSelection = {};
  const site = str(o.searchConsoleSite);
  if (site && SITE_RE.test(site)) out.searchConsoleSite = site;
  const prop = str(o.ga4Property);
  if (prop && PROPERTY_RE.test(prop)) { out.ga4Property = prop; out.ga4PropertyName = str(o.ga4PropertyName); }
  const acc = str(o.gbpAccount), loc = str(o.gbpLocation);
  if (acc && loc && ACCOUNT_RE.test(acc) && LOCATION_RE.test(loc)) { out.gbpAccount = acc; out.gbpLocation = loc; out.gbpLocationTitle = str(o.gbpLocationTitle); }
  return out;
}

/* ── Errors ─────────────────────────────────────────────────────────────────
   What a Google API failure means for the person looking at the page. Each
   code maps to a specific thing they can do (see the Marketing › Google page). */
export type InsightsErrorCode =
  | "not_connected"     // no Google connection, or the grant was revoked
  | "scope_missing"     // connected, but this product's box was unticked
  | "api_disabled"      // the API isn't enabled in the Google Cloud project
  | "access_pending"    // Business Profile: quota 0 until Google approves access
  | "no_permission"     // the signed-in Google account can't see that site/property/listing
  | "rate_limited"
  | "google_error";

export interface ClassifiedError { code: InsightsErrorCode; status: number; message: string; activationUrl?: string }

interface GoogleErrorBody {
  error?: {
    code?: number; message?: string; status?: string;
    details?: { "@type"?: string; reason?: string; metadata?: Record<string, string> }[];
  } | string;
  error_description?: string;
}

export function classifyGoogleError(httpStatus: number, body: unknown): ClassifiedError {
  const b = (body ?? {}) as GoogleErrorBody;
  if (typeof b.error === "string") {
    // OAuth token endpoint shape: { error: "invalid_grant", error_description }
    if (b.error === "invalid_grant" || b.error === "unauthorized_client") {
      return { code: "not_connected", status: 409, message: "Google access was revoked or has expired. Reconnect Google." };
    }
    return { code: "google_error", status: 502, message: b.error_description || b.error };
  }
  const e = b.error ?? {};
  const message = e.message ?? `Google returned ${httpStatus}`;
  const info = (e.details ?? []).find((d) => d.reason);
  const reason = info?.reason ?? "";
  const meta = info?.metadata ?? {};

  if (httpStatus === 401) return { code: "not_connected", status: 409, message: "Google access was revoked or has expired. Reconnect Google." };
  if (reason === "SERVICE_DISABLED" || /has not been used in project|is disabled/i.test(message)) {
    const activationUrl = meta.activationUrl ?? message.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/\S+/)?.[0]?.replace(/[.,]$/, "");
    return { code: "api_disabled", status: 503, message: `${meta.serviceTitle ?? "This Google API"} is not enabled in your Google Cloud project.`, activationUrl };
  }
  if (reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || /insufficient authentication scopes/i.test(message)) {
    return { code: "scope_missing", status: 403, message: "Google wasn't given access to this. Reconnect Google and leave every box ticked." };
  }
  if (httpStatus === 429 || e.status === "RESOURCE_EXHAUSTED") {
    // A Business Profile project Google hasn't approved has a quota of 0 —
    // the only Google APIs used here whose default quota is zero.
    const quotaZero = meta.quota_limit_value === "0" || /limit '0'|quota_limit_value.{0,5}\b0\b/i.test(message);
    if (quotaZero) {
      return { code: "access_pending", status: 503, message: "Google hasn't approved Business Profile API access for your Google Cloud project yet." };
    }
    return { code: "rate_limited", status: 429, message: "Google is limiting requests right now. Try again in a minute." };
  }
  if (httpStatus === 403 || httpStatus === 404) {
    return { code: "no_permission", status: 403, message: "The connected Google account can't see this. Check it has access, or pick another." };
  }
  return { code: "google_error", status: 502, message };
}

/* ── Shaping responses ──────────────────────────────────────────────────── */

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Search Console row → numbers, CTR as a percentage, position to 1dp. */
export function searchRow(row: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number } | undefined) {
  return {
    key: row?.keys?.[0] ?? "",
    clicks: n(row?.clicks),
    impressions: n(row?.impressions),
    ctr: r1(n(row?.ctr) * 100),
    position: r1(n(row?.position)),
  };
}

/** A daily series with every day present (Google omits days with nothing). */
export function fillDaily<T extends object>(days: string[], rows: Map<string, T>, zero: T): ({ date: string } & T)[] {
  return days.map((date) => ({ date, ...(rows.get(date) ?? zero) }));
}

/** GA4 dates come back as YYYYMMDD. */
export function gaDate(v: string): string {
  return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
}

interface GaReport { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] }
/** GA4 report rows as { dims, metrics } with metrics as numbers. */
export function gaRows(report: GaReport | undefined): { dims: string[]; m: number[] }[] {
  return (report?.rows ?? []).map((r) => ({
    dims: (r.dimensionValues ?? []).map((d) => d.value ?? ""),
    m: (r.metricValues ?? []).map((v) => n(v.value)),
  }));
}

/* Business Profile daily metrics. Impressions are split by surface and
   device; the page shows Search vs Maps, which is the split people ask about. */
export const GBP_DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "CALL_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "WEBSITE_CLICKS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
] as const;

export interface MapsDay { searchViews: number; mapsViews: number; calls: number; directions: number; websiteClicks: number; messages: number; bookings: number }
const MAPS_ZERO: MapsDay = { searchViews: 0, mapsViews: 0, calls: 0, directions: 0, websiteClicks: 0, messages: 0, bookings: 0 };

const METRIC_FIELD: Record<string, keyof MapsDay> = {
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "mapsViews",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "mapsViews",
  CALL_CLICKS: "calls",
  BUSINESS_DIRECTION_REQUESTS: "directions",
  WEBSITE_CLICKS: "websiteClicks",
  BUSINESS_CONVERSATIONS: "messages",
  BUSINESS_BOOKINGS: "bookings",
};

interface GbpSeriesBody {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: {
      dailyMetric?: string;
      timeSeries?: { datedValues?: { date?: { year?: number; month?: number; day?: number }; value?: string }[] };
    }[];
  }[];
}

/** Folds the Business Profile time series into one row per day plus totals.
    A missing `value` means zero — Google leaves it out rather than send "0". */
export function mapsSeries(body: GbpSeriesBody, days: string[]): { series: ({ date: string } & MapsDay)[]; totals: MapsDay } {
  const byDay = new Map<string, MapsDay>();
  for (const group of body.multiDailyMetricTimeSeries ?? []) {
    for (const s of group.dailyMetricTimeSeries ?? []) {
      const field = METRIC_FIELD[s.dailyMetric ?? ""];
      if (!field) continue;
      for (const dv of s.timeSeries?.datedValues ?? []) {
        const d = dv.date;
        if (!d?.year || !d.month || !d.day) continue;
        const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
        const row = byDay.get(key) ?? { ...MAPS_ZERO };
        row[field] += n(dv.value);
        byDay.set(key, row);
      }
    }
  }
  const series = fillDaily(days, byDay, MAPS_ZERO);
  const totals = { ...MAPS_ZERO };
  for (const row of series) for (const k of Object.keys(MAPS_ZERO) as (keyof MapsDay)[]) totals[k] += row[k];
  return { series, totals };
}

/** Search keyword counts: Google reports small numbers only as "under N". */
export function mapsKeywords(body: { searchKeywordsCounts?: { searchKeyword?: string; insightsValue?: { value?: string; threshold?: string } }[] }) {
  return (body.searchKeywordsCounts ?? [])
    .map((k) => ({
      keyword: k.searchKeyword ?? "",
      count: k.insightsValue?.value != null ? n(k.insightsValue.value) : null,
      under: k.insightsValue?.value == null && k.insightsValue?.threshold != null ? n(k.insightsValue.threshold) : null,
    }))
    .filter((k) => k.keyword)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || (b.under ?? 0) - (a.under ?? 0));
}

export const STAR_RATING: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export interface GbpReview {
  reviewId?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

/** Google appends a machine translation to some review text:
    "(Translated by Google) …\n\n(Original)\n…". Show the original. */
export function reviewText(comment: string | undefined): string {
  if (!comment) return "";
  const orig = comment.split("(Original)\n");
  if (orig.length > 1 && comment.startsWith("(Translated by Google)")) return orig[orig.length - 1]!.trim();
  return comment.trim();
}

export function shapeReview(r: GbpReview) {
  return {
    id: r.reviewId ?? "",
    reviewer: r.reviewer?.isAnonymous ? "A Google user" : (r.reviewer?.displayName ?? "A Google user"),
    photo: r.reviewer?.profilePhotoUrl ?? null,
    rating: STAR_RATING[r.starRating ?? ""] ?? null,
    comment: reviewText(r.comment),
    createdAt: r.createTime ?? null,
    updatedAt: r.updateTime ?? null,
    reply: r.reviewReply?.comment ? { comment: r.reviewReply.comment, updatedAt: r.reviewReply.updateTime ?? null } : null,
  };
}

/** Review ids are opaque base64-ish strings; refuse anything that could walk the path. */
export const REVIEW_ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

/** Google limits a reply to 4,096 bytes. */
export function cleanReply(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || Buffer.byteLength(s, "utf8") > 4096) return null;
  return s;
}
