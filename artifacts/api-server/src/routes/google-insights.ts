import { Router, type IRouter, type Request, type Response } from "express";
import { db, merchantIntegrationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { readVaultGrant } from "../services/tokenVault";
import { googleJson, cached, clearGoogleCache, GoogleApiError, GOOGLE_INSIGHTS_PROVIDER } from "../services/googleApi";
import {
  grantedProducts, insightsPeriod, dateRange, daysBetween, lastFullMonths,
  parseSelection, cleanSelection, type InsightsSelection, type InsightsProduct,
  searchRow, fillDaily, gaDate, gaRows, GBP_DAILY_METRICS, mapsSeries, mapsKeywords,
  shapeReview, type GbpReview, REVIEW_ID_RE, cleanReply,
} from "../lib/google-insights";

/**
 * Marketing › Google — Search Console, Analytics (GA4) and Business Profile
 * figures for the business, read with the owner's own Google sign-in (the
 * `google_insights` integration; services/googleApi.ts holds the tokens).
 *
 *   GET    /google-insights/status                    connection, granted products, selection
 *   GET    /google-insights/options                   sites / properties / listings to choose from
 *   PUT    /google-insights/selection                 save the choice
 *   GET    /google-insights/search?days=              Search Console
 *   GET    /google-insights/analytics?days=           Google Analytics
 *   GET    /google-insights/maps?days=                Business Profile performance + search keywords
 *   GET    /google-insights/reviews?pageToken=        Business Profile reviews
 *   PUT    /google-insights/reviews/:reviewId/reply   reply (public on Google)
 *   DELETE /google-insights/reviews/:reviewId/reply
 *
 * Nothing is stored but the selection: every figure is Google's, fetched on
 * demand and cached for ten minutes. Failures carry a `code` saying what the
 * person can do about it (lib/google-insights.ts `classifyGoogleError`).
 */

const router: IRouter = Router();
const KEY = GOOGLE_INSIGHTS_PROVIDER;

const SC = "https://www.googleapis.com/webmasters/v3";
const GA_ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const GA_DATA = "https://analyticsdata.googleapis.com/v1beta";
const GBP_ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const GBP_INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const GBP_PERF = "https://businessprofileperformance.googleapis.com/v1";
const GBP_V4 = "https://mybusiness.googleapis.com/v4";

const guard = [requireAuth, requireManagerOrOwner];

async function integrationRow(merchantId: number) {
  const [row] = await db.select().from(merchantIntegrationsTable)
    .where(and(eq(merchantIntegrationsTable.merchantId, merchantId), eq(merchantIntegrationsTable.integrationKey, KEY)))
    .limit(1);
  return row ?? null;
}

async function selectionOf(merchantId: number): Promise<InsightsSelection> {
  return parseSelection((await integrationRow(merchantId))?.credentials);
}

function sendError(res: Response, err: unknown, req: Request): void {
  if (err instanceof GoogleApiError) {
    res.status(err.info.status).json({ error: err.info.message, code: err.info.code, activationUrl: err.info.activationUrl });
    return;
  }
  req.log.error({ err }, "Google insights request failed");
  res.status(502).json({ error: "Couldn't reach Google. Try again shortly.", code: "google_error" });
}

/** Refuses up front when the grant doesn't cover the product, rather than
    letting Google answer with a scope error per call. */
async function requireProduct(merchantId: number, product: InsightsProduct): Promise<void> {
  const grant = await readVaultGrant(merchantId, KEY);
  if (!grant) throw new GoogleApiError({ code: "not_connected", status: 409, message: "Google isn't connected. Connect it under Management › Integrations." });
  if (!grantedProducts(grant.scope)[product]) {
    throw new GoogleApiError({ code: "scope_missing", status: 403, message: "Google wasn't given access to this. Reconnect Google and leave every box ticked." });
  }
}

const notSelected = (what: string) => new GoogleApiError({ code: "no_permission", status: 409, message: `Choose ${what} first.` });

/* ── Status ─────────────────────────────────────────────────────────────── */

router.get("/google-insights/status", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  let grant: Awaited<ReturnType<typeof readVaultGrant>> = null;
  try { grant = await readVaultGrant(merchantId, KEY); } catch { grant = null; }
  res.json({
    configured,
    connected: !!grant,
    account: grant?.accountHandle ?? null,
    products: grant ? grantedProducts(grant.scope) : { searchConsole: false, analytics: false, business: false },
    selection: grant ? await selectionOf(merchantId) : {},
  });
});

/* ── Options ────────────────────────────────────────────────────────────────
   Each product is listed independently: one failing (Business Profile access
   not approved yet, say) must not hide the other two. */

async function listSites(merchantId: number) {
  await requireProduct(merchantId, "searchConsole");
  const d = await googleJson<{ siteEntry?: { siteUrl?: string; permissionLevel?: string }[] }>(merchantId, `${SC}/sites`);
  return (d.siteEntry ?? [])
    .filter((s) => s.siteUrl && s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ id: s.siteUrl!, name: s.siteUrl!.replace(/^sc-domain:/, "") + (s.siteUrl!.startsWith("sc-domain:") ? " (domain)" : "") }));
}

async function listProperties(merchantId: number) {
  await requireProduct(merchantId, "analytics");
  const d = await googleJson<{ accountSummaries?: { displayName?: string; propertySummaries?: { property?: string; displayName?: string }[] }[] }>(merchantId, `${GA_ADMIN}/accountSummaries?pageSize=200`);
  return (d.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? [])
    .filter((p) => p.property)
    .map((p) => ({ id: p.property!, name: `${p.displayName ?? p.property}${a.displayName ? ` — ${a.displayName}` : ""}` })));
}

async function listLocations(merchantId: number) {
  await requireProduct(merchantId, "business");
  const accounts = await googleJson<{ accounts?: { name?: string; accountName?: string }[] }>(merchantId, `${GBP_ACCOUNTS}/accounts?pageSize=20`);
  const out: { id: string; account: string; name: string }[] = [];
  for (const acc of (accounts.accounts ?? []).slice(0, 10)) {
    if (!acc.name) continue;
    const locs = await googleJson<{ locations?: { name?: string; title?: string; storefrontAddress?: { locality?: string } }[] }>(
      merchantId, `${GBP_INFO}/${acc.name}/locations?${new URLSearchParams({ readMask: "name,title,storefrontAddress", pageSize: "100" })}`,
    );
    for (const l of locs.locations ?? []) {
      if (!l.name) continue;
      const town = l.storefrontAddress?.locality;
      out.push({ id: l.name, account: acc.name, name: `${l.title ?? l.name}${town ? ` — ${town}` : ""}` });
    }
  }
  return out;
}

async function settle<T>(p: Promise<T>) {
  try { return { items: await p }; }
  catch (err) {
    if (err instanceof GoogleApiError) return { items: [] as never[], error: { code: err.info.code, message: err.info.message, activationUrl: err.info.activationUrl } };
    return { items: [] as never[], error: { code: "google_error", message: "Couldn't reach Google." } };
  }
}

router.get("/google-insights/options", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  if (!(await readVaultGrant(merchantId, KEY).catch(() => null))) { res.status(409).json({ error: "Google isn't connected.", code: "not_connected" }); return; }
  const [sites, properties, locations] = await Promise.all([
    settle(listSites(merchantId)), settle(listProperties(merchantId)), settle(listLocations(merchantId)),
  ]);
  res.json({ sites, properties, locations });
});

router.put("/google-insights/selection", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const row = await integrationRow(merchantId);
  if (!row || !(await readVaultGrant(merchantId, KEY).catch(() => null))) { res.status(409).json({ error: "Google isn't connected.", code: "not_connected" }); return; }
  // Merge over what is saved, so choosing a property leaves the site alone.
  const next = cleanSelection({ ...parseSelection(row.credentials), ...((req.body ?? {}) as Record<string, unknown>) });
  await db.update(merchantIntegrationsTable).set({ credentials: JSON.stringify(next) }).where(eq(merchantIntegrationsTable.id, row.id));
  clearGoogleCache(merchantId);
  res.json(next);
});

/* ── Search Console ─────────────────────────────────────────────────────── */

interface ScRows { rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[] }

router.get("/google-insights/search", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const days = insightsPeriod(req.query.days);
  try {
    await requireProduct(merchantId, "searchConsole");
    const { searchConsoleSite: site } = await selectionOf(merchantId);
    if (!site) throw notSelected("a Search Console site");
    const data = await cached(merchantId, `search:${site}:${days}`, async () => {
      const { start, end } = dateRange(days);
      const url = `${SC}/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
      // `dataState: all` includes the last two or three days, which Google
      // marks preliminary — otherwise the chart always ends early.
      const q = (dimensions: string[], rowLimit = 25) => googleJson<ScRows>(merchantId, url, { body: { startDate: start, endDate: end, dimensions, rowLimit, dataState: "all" } });
      const [total, byDate, queries, pages, devices, sitemaps] = await Promise.all([
        q([], 1), q(["date"], 500), q(["query"]), q(["page"]), q(["device"], 5),
        googleJson<{ sitemap?: { path?: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { submitted?: string; indexed?: string }[] }[] }>(
          merchantId, `${SC}/sites/${encodeURIComponent(site)}/sitemaps`,
        ).catch(() => ({ sitemap: [] })),
      ]);
      const daily = new Map((byDate.rows ?? []).map((r) => {
        const x = searchRow(r);
        return [x.key, { clicks: x.clicks, impressions: x.impressions }];
      }));
      const t = searchRow(total.rows?.[0]);
      return {
        site, start, end,
        totals: { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position },
        series: fillDaily(daysBetween(start, end), daily, { clicks: 0, impressions: 0 }),
        queries: (queries.rows ?? []).map(searchRow),
        pages: (pages.rows ?? []).map(searchRow),
        devices: (devices.rows ?? []).map(searchRow),
        sitemaps: (sitemaps.sitemap ?? []).map((s) => ({
          path: s.path ?? "",
          lastSubmitted: s.lastSubmitted ?? null,
          lastDownloaded: s.lastDownloaded ?? null,
          pending: !!s.isPending,
          errors: Number(s.errors ?? 0),
          warnings: Number(s.warnings ?? 0),
          submitted: (s.contents ?? []).reduce((a, c) => a + Number(c.submitted ?? 0), 0),
        })),
      };
    });
    res.json(data);
  } catch (err) { sendError(res, err, req); }
});

/* ── Google Analytics (GA4) ─────────────────────────────────────────────── */

interface GaBatch { reports?: Parameters<typeof gaRows>[0][] }

router.get("/google-insights/analytics", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const days = insightsPeriod(req.query.days);
  try {
    await requireProduct(merchantId, "analytics");
    const { ga4Property: property } = await selectionOf(merchantId);
    if (!property) throw notSelected("a Google Analytics property");
    const data = await cached(merchantId, `analytics:${property}:${days}`, async () => {
      const { start, end } = dateRange(days);
      const dateRanges = [{ startDate: start, endDate: end }];
      const metric = (...names: string[]) => names.map((name) => ({ name }));
      const dim = (...names: string[]) => names.map((name) => ({ name }));
      const top = (m: string, limit: number) => ({ orderBys: [{ metric: { metricName: m }, desc: true }], limit });
      const [a, b] = await Promise.all([
        googleJson<GaBatch>(merchantId, `${GA_DATA}/${property}:batchRunReports`, { body: { requests: [
          { dateRanges, metrics: metric("activeUsers", "newUsers", "sessions", "screenPageViews", "engagementRate", "averageSessionDuration") },
          { dateRanges, dimensions: dim("date"), metrics: metric("activeUsers", "sessions", "screenPageViews"), orderBys: [{ dimension: { dimensionName: "date" } }], limit: 500 },
          { dateRanges, dimensions: dim("sessionDefaultChannelGroup"), metrics: metric("sessions", "activeUsers"), ...top("sessions", 10) },
          { dateRanges, dimensions: dim("pagePath"), metrics: metric("screenPageViews", "activeUsers"), ...top("screenPageViews", 20) },
          { dateRanges, dimensions: dim("deviceCategory"), metrics: metric("activeUsers"), ...top("activeUsers", 5) },
        ] } }),
        googleJson<GaBatch>(merchantId, `${GA_DATA}/${property}:batchRunReports`, { body: { requests: [
          { dateRanges, dimensions: dim("city"), metrics: metric("activeUsers"), ...top("activeUsers", 15) },
          { dateRanges, dimensions: dim("sessionSource"), metrics: metric("sessions"), ...top("sessions", 15) },
        ] } }),
      ]);
      const [totals, byDate, channels, pages, devices] = (a.reports ?? []).map(gaRows);
      const [cities, sources] = (b.reports ?? []).map(gaRows);
      const t = totals?.[0]?.m ?? [];
      const daily = new Map((byDate ?? []).map((r) => [gaDate(r.dims[0] ?? ""), { users: r.m[0] ?? 0, sessions: r.m[1] ?? 0, views: r.m[2] ?? 0 }]));
      return {
        property, start, end,
        totals: {
          users: t[0] ?? 0, newUsers: t[1] ?? 0, sessions: t[2] ?? 0, views: t[3] ?? 0,
          engagementRate: Math.round((t[4] ?? 0) * 1000) / 10,
          avgSessionSeconds: Math.round(t[5] ?? 0),
        },
        series: fillDaily(daysBetween(start, end), daily, { users: 0, sessions: 0, views: 0 }),
        channels: (channels ?? []).map((r) => ({ name: r.dims[0] ?? "", sessions: r.m[0] ?? 0, users: r.m[1] ?? 0 })),
        pages: (pages ?? []).map((r) => ({ path: r.dims[0] ?? "", views: r.m[0] ?? 0, users: r.m[1] ?? 0 })),
        devices: (devices ?? []).map((r) => ({ name: r.dims[0] ?? "", users: r.m[0] ?? 0 })),
        cities: (cities ?? []).filter((r) => r.dims[0] && r.dims[0] !== "(not set)").map((r) => ({ name: r.dims[0]!, users: r.m[0] ?? 0 })),
        sources: (sources ?? []).map((r) => ({ name: r.dims[0] ?? "", sessions: r.m[0] ?? 0 })),
      };
    });
    // Realtime is never cached — it is the one live number on the page.
    const realtime = await googleJson<Parameters<typeof gaRows>[0]>(merchantId, `${GA_DATA}/${property}:runRealtimeReport`, { body: { metrics: [{ name: "activeUsers" }] } })
      .then((r) => gaRows(r)[0]?.m[0] ?? 0).catch(() => null);
    res.json({ ...data, activeNow: realtime });
  } catch (err) { sendError(res, err, req); }
});

/* ── Business Profile (Maps) ────────────────────────────────────────────── */

router.get("/google-insights/maps", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const days = insightsPeriod(req.query.days);
  try {
    await requireProduct(merchantId, "business");
    const { gbpLocation: location, gbpLocationTitle: title } = await selectionOf(merchantId);
    if (!location) throw notSelected("a Business Profile listing");
    const data = await cached(merchantId, `maps:${location}:${days}`, async () => {
      const { start, end } = dateRange(days);
      const [sy, sm, sd] = start.split("-");
      const [ey, em, ed] = end.split("-");
      const p = new URLSearchParams();
      for (const m of GBP_DAILY_METRICS) p.append("dailyMetrics", m);
      p.set("dailyRange.start_date.year", String(Number(sy))); p.set("dailyRange.start_date.month", String(Number(sm))); p.set("dailyRange.start_date.day", String(Number(sd)));
      p.set("dailyRange.end_date.year", String(Number(ey)));   p.set("dailyRange.end_date.month", String(Number(em)));   p.set("dailyRange.end_date.day", String(Number(ed)));
      const months = lastFullMonths(3);
      const k = new URLSearchParams({
        "monthlyRange.start_month.year": String(months.start.year), "monthlyRange.start_month.month": String(months.start.month),
        "monthlyRange.end_month.year": String(months.end.year), "monthlyRange.end_month.month": String(months.end.month),
        pageSize: "50",
      });
      const [perf, keywords] = await Promise.all([
        googleJson<Parameters<typeof mapsSeries>[0]>(merchantId, `${GBP_PERF}/${location}:fetchMultiDailyMetricsTimeSeries?${p}`),
        googleJson<Parameters<typeof mapsKeywords>[0]>(merchantId, `${GBP_PERF}/${location}/searchkeywords/impressions/monthly?${k}`).catch(() => ({ searchKeywordsCounts: [] })),
      ]);
      const { series, totals } = mapsSeries(perf, daysBetween(start, end));
      return { location, title: title ?? null, start, end, series, totals, keywords: mapsKeywords(keywords), keywordMonths: months };
    });
    res.json(data);
  } catch (err) { sendError(res, err, req); }
});

/* ── Reviews ────────────────────────────────────────────────────────────── */

async function reviewBase(merchantId: number): Promise<string> {
  await requireProduct(merchantId, "business");
  const { gbpAccount, gbpLocation } = await selectionOf(merchantId);
  if (!gbpAccount || !gbpLocation) throw notSelected("a Business Profile listing");
  return `${GBP_V4}/${gbpAccount}/${gbpLocation}/reviews`;
}

router.get("/google-insights/reviews", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const pageToken = typeof req.query.pageToken === "string" && /^[A-Za-z0-9_\-=.]{1,500}$/.test(req.query.pageToken) ? req.query.pageToken : "";
  try {
    const base = await reviewBase(merchantId);
    const data = await cached(merchantId, `reviews:${base}:${pageToken}`, async () => {
      const q = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc", ...(pageToken ? { pageToken } : {}) });
      const d = await googleJson<{ reviews?: GbpReview[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string }>(merchantId, `${base}?${q}`);
      return {
        averageRating: d.averageRating != null ? Math.round(d.averageRating * 10) / 10 : null,
        totalReviewCount: d.totalReviewCount ?? 0,
        reviews: (d.reviews ?? []).map(shapeReview),
        nextPageToken: d.nextPageToken ?? null,
      };
    });
    res.json(data);
  } catch (err) { sendError(res, err, req); }
});

router.put("/google-insights/reviews/:reviewId/reply", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const reviewId = String(req.params.reviewId);
  const comment = cleanReply((req.body as { comment?: unknown } | undefined)?.comment);
  if (!REVIEW_ID_RE.test(reviewId)) { res.status(400).json({ error: "Unknown review." }); return; }
  if (!comment) { res.status(400).json({ error: "Write a reply (up to about 4,000 characters)." }); return; }
  try {
    const base = await reviewBase(merchantId);
    const d = await googleJson<{ comment?: string; updateTime?: string }>(merchantId, `${base}/${reviewId}/reply`, { method: "PUT", body: { comment } });
    clearGoogleCache(merchantId, "reviews:");
    req.log.info({ merchantId, reviewId, staffId: req.session.loginStaffId ?? null }, "Replied to a Google review");
    res.json({ comment: d.comment ?? comment, updatedAt: d.updateTime ?? new Date().toISOString() });
  } catch (err) { sendError(res, err, req); }
});

router.delete("/google-insights/reviews/:reviewId/reply", ...guard, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const reviewId = String(req.params.reviewId);
  if (!REVIEW_ID_RE.test(reviewId)) { res.status(400).json({ error: "Unknown review." }); return; }
  try {
    const base = await reviewBase(merchantId);
    await googleJson(merchantId, `${base}/${reviewId}/reply`, { method: "DELETE" });
    clearGoogleCache(merchantId, "reviews:");
    req.log.info({ merchantId, reviewId, staffId: req.session.loginStaffId ?? null }, "Deleted a Google review reply");
    res.json({ ok: true });
  } catch (err) { sendError(res, err, req); }
});

export default router;
