import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, shopEventsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { soleMerchantId } from "../lib/sole-merchant";
import { siteDomain } from "../lib/publicUrl";
import { shopVisible } from "../lib/shop-visibility";
import { TrackBody, isBot, deviceOf, hashIp, referrerHost, normaliseSearch, statsPeriod, rate } from "../lib/shop-stats";

/**
 * Online shop statistics.
 *
 *   POST /shop/track               public; the shop reports what shoppers do (lib/shop-stats.ts)
 *   GET  /online-store/stats/live  running counters, polled by the Statistics page
 *   GET  /online-store/stats?days= everything else, for the chosen period
 *
 * Days are Sydney days. Visitors are distinct browsers (`visitor_id`), unique
 * IPs distinct connections (`ip_hash` — never the address itself).
 */

const router: IRouter = Router();

const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const trackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 600,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests" },
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  skip: (req) => LOCALHOST.has(req.ip ?? ""),
});

const ipSecret = () => process.env.SESSION_SECRET || "koapos-shop-stats-dev";
const ownHosts = () => [siteDomain(), "koastal.com.au", "koastalkollective.com.au", "pos.koastal.com.au"];

router.post("/shop/track", trackLimiter, async (req, res): Promise<void> => {
  // Always 204: a tracking failure must never surface to a shopper.
  res.status(204).end();
  const ua = req.get("user-agent");
  if (isBot(ua)) return;
  const parsed = TrackBody.safeParse(typeof req.body === "string" ? safeJson(req.body) : req.body);
  if (!parsed.success) return;
  const merchantId = await soleMerchantId();
  if (merchantId == null) return;
  const ipHash = hashIp(req.ip, ipSecret());
  const device = deviceOf(ua);
  const rows = parsed.data.events.map((e) => ({
    merchantId,
    type: e.type,
    path: e.path.slice(0, 300),
    productId: e.productId ?? null,
    target: e.type === "search" && e.target ? normaliseSearch(e.target) : (e.target ?? null),
    label: e.label?.trim().slice(0, 120) || null,
    visitorId: parsed.data.visitorId,
    ipHash,
    referrer: e.type === "page_view" ? referrerHost(e.referrer, ownHosts()) : null,
    device,
  }));
  try {
    await db.insert(shopEventsTable).values(rows);
  } catch (err) {
    req.log?.warn?.({ err }, "shop track insert failed");
  }
});

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }

/* ── Live counters ───────────────────────────────────────────────────────── */

const TZ = "Australia/Sydney";

router.get("/online-store/stats/live", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const r = await db.execute<Record<string, number>>(sql`
    SELECT
      count(*) FILTER (WHERE type = 'page_view')::int AS "allViews",
      count(DISTINCT visitor_id)::int AS "allVisitors",
      count(DISTINCT ip_hash)::int AS "allIps",
      count(*) FILTER (WHERE type = 'page_view' AND (created_at AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date)::int AS "todayViews",
      count(DISTINCT visitor_id) FILTER (WHERE (created_at AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date)::int AS "todayVisitors",
      count(DISTINCT ip_hash) FILTER (WHERE (created_at AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date)::int AS "todayIps",
      count(DISTINCT visitor_id) FILTER (WHERE created_at > now() - interval '5 minutes')::int AS "onlineNow",
      min(created_at) AS "since"
    FROM shop_events WHERE merchant_id = ${merchantId}`);
  const row = r.rows[0] ?? {};
  res.json({
    allTime: { pageViews: row.allViews ?? 0, visitors: row.allVisitors ?? 0, uniqueIps: row.allIps ?? 0 },
    today: { pageViews: row.todayViews ?? 0, visitors: row.todayVisitors ?? 0, uniqueIps: row.todayIps ?? 0 },
    onlineNow: row.onlineNow ?? 0,
    since: row.since ? new Date(row.since as unknown as string).toISOString() : null,
  });
});

/* ── The period report ───────────────────────────────────────────────────── */

type Rows<T> = { rows: T[] };
const n = (v: unknown) => Number(v ?? 0) || 0;

router.get("/online-store/stats", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const days = statsPeriod(req.query.days);
  const since = sql`now() - make_interval(days => ${days})`;
  const inPeriod = sql`merchant_id = ${merchantId} AND created_at >= ${since}`;
  const hourly = days === 1;

  const [summary, series, products, carts, links, pages, searches, referrers, devices,
    soldOnline, soldInStore, wishlisted, reviews, orders] = await Promise.all([
    db.execute(sql`
      SELECT count(*) FILTER (WHERE type = 'page_view')::int AS views,
             count(DISTINCT visitor_id)::int AS visitors,
             count(DISTINCT ip_hash)::int AS ips,
             count(*) FILTER (WHERE type = 'product_view')::int AS "productViews",
             count(*) FILTER (WHERE type = 'add_to_cart')::int AS "addToCarts",
             count(DISTINCT visitor_id) FILTER (WHERE type = 'add_to_cart')::int AS "cartVisitors",
             count(*) FILTER (WHERE type = 'search')::int AS searches,
             count(*) FILTER (WHERE type = 'link_click')::int AS clicks
      FROM shop_events WHERE ${inPeriod}`),
    db.execute(sql`
      SELECT to_char(date_trunc(${hourly ? "hour" : "day"}, created_at AT TIME ZONE ${TZ}), ${hourly ? "YYYY-MM-DD\"T\"HH24" : "YYYY-MM-DD"}) AS bucket,
             count(*) FILTER (WHERE type = 'page_view')::int AS views,
             count(DISTINCT visitor_id)::int AS visitors,
             count(DISTINCT ip_hash)::int AS ips
      FROM shop_events WHERE ${inPeriod} GROUP BY 1 ORDER BY 1`),
    db.execute(sql`
      SELECT e.product_id AS id, p.name, count(*)::int AS views, count(DISTINCT e.visitor_id)::int AS visitors
      FROM shop_events e JOIN products p ON p.id = e.product_id
      WHERE e.merchant_id = ${merchantId} AND e.created_at >= ${since} AND e.type = 'product_view'
      GROUP BY 1, 2 ORDER BY views DESC LIMIT 15`),
    db.execute(sql`
      SELECT e.product_id AS id, p.name, count(*)::int AS adds
      FROM shop_events e JOIN products p ON p.id = e.product_id
      WHERE e.merchant_id = ${merchantId} AND e.created_at >= ${since} AND e.type = 'add_to_cart'
      GROUP BY 1, 2 ORDER BY adds DESC LIMIT 15`),
    db.execute(sql`
      SELECT target, (array_agg(label ORDER BY created_at DESC) FILTER (WHERE label IS NOT NULL))[1] AS label, count(*)::int AS clicks
      FROM shop_events WHERE ${inPeriod} AND type = 'link_click' AND target IS NOT NULL
      GROUP BY 1 ORDER BY clicks DESC LIMIT 15`),
    db.execute(sql`
      SELECT path, count(*)::int AS views, count(DISTINCT visitor_id)::int AS visitors
      FROM shop_events WHERE ${inPeriod} AND type = 'page_view'
      GROUP BY 1 ORDER BY views DESC LIMIT 15`),
    db.execute(sql`
      SELECT target AS term, count(*)::int AS searches
      FROM shop_events WHERE ${inPeriod} AND type = 'search' AND target IS NOT NULL AND target <> ''
      GROUP BY 1 ORDER BY searches DESC LIMIT 15`),
    db.execute(sql`
      SELECT referrer AS host, count(DISTINCT visitor_id)::int AS visitors
      FROM shop_events WHERE ${inPeriod} AND referrer IS NOT NULL
      GROUP BY 1 ORDER BY visitors DESC LIMIT 10`),
    db.execute(sql`
      SELECT coalesce(device, 'desktop') AS device, count(DISTINCT visitor_id)::int AS visitors
      FROM shop_events WHERE ${inPeriod} GROUP BY 1 ORDER BY visitors DESC`),
    // Best sellers online: the shop's orders (not cancelled), from their lines.
    db.execute(sql`
      SELECT (l->>'productId')::int AS id, max(coalesce(p.name, l->>'name')) AS name,
             sum(greatest(1, coalesce((l->>'qty')::numeric, 1)))::int AS units,
             round(sum(coalesce((l->>'lineTotal')::numeric, coalesce((l->>'price')::numeric, 0) * coalesce((l->>'qty')::numeric, 1))), 2)::float AS revenue
      FROM delivery_orders o
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN o.items ~ '^\\s*\\[' THEN o.items::jsonb ELSE '[]'::jsonb END) l
      LEFT JOIN products p ON p.id = (l->>'productId')::int
      WHERE o.merchant_id = ${merchantId} AND o.created_at >= ${since} AND o.status <> 'cancelled'
        AND (l->>'productId') ~ '^[1-9][0-9]{0,9}$'
      GROUP BY 1 ORDER BY units DESC LIMIT 15`),
    // Best sellers in store, among the products the shop lists.
    db.execute(sql`
      SELECT products.id, products.name, sum(greatest(1, coalesce((i->>'quantity')::numeric, 1)))::int AS units,
             round(sum(coalesce((i->>'totalPrice')::numeric, 0)), 2)::float AS revenue
      FROM transactions t
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) i
      -- Not aliased: shopVisible names the products table in full.
      JOIN products ON products.id = (i->>'productId')::int
      WHERE t.merchant_id = ${merchantId} AND t.created_at >= ${since} AND t.status = 'completed'
        AND (t.idempotency_key IS NULL OR t.idempotency_key NOT LIKE 'delivery-order:%')
        AND (i->>'productId') ~ '^[1-9][0-9]{0,9}$'
        AND ${shopVisible(merchantId)}
      GROUP BY 1, 2 ORDER BY units DESC LIMIT 15`),
    db.execute(sql`
      SELECT w.product_id AS id, p.name, count(*)::int AS wishlists
      FROM customer_wishlist_items w JOIN products p ON p.id = w.product_id
      WHERE w.merchant_id = ${merchantId}
      GROUP BY 1, 2 ORDER BY wishlists DESC LIMIT 10`),
    db.execute(sql`
      SELECT count(*)::int AS count, round(avg(rating)::numeric, 1)::float AS average
      FROM product_reviews WHERE merchant_id = ${merchantId} AND created_at >= ${since} AND status <> 'hidden'`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE status <> 'cancelled')::int AS orders,
             coalesce(round(sum(total) FILTER (WHERE payment_status = 'paid'), 2), 0)::float AS revenue
      FROM delivery_orders WHERE merchant_id = ${merchantId} AND created_at >= ${since}`),
  ]) as Rows<Record<string, unknown>>[];

  const s = summary.rows[0] ?? {};
  const visitors = n(s.visitors);
  const ord = orders.rows[0] ?? {};
  res.json({
    days,
    bucket: hourly ? "hour" : "day",
    summary: {
      pageViews: n(s.views), visitors, uniqueIps: n(s.ips),
      productViews: n(s.productViews), addToCarts: n(s.addToCarts), searches: n(s.searches), linkClicks: n(s.clicks),
      pagesPerVisitor: visitors ? Math.round((n(s.views) / visitors) * 10) / 10 : 0,
      cartRate: rate(n(s.cartVisitors), visitors),
      orders: n(ord.orders), orderRevenue: n(ord.revenue),
      conversionRate: rate(n(ord.orders), visitors),
    },
    series: fillSeries(series.rows.map((r) => ({ bucket: String(r.bucket), pageViews: n(r.views), visitors: n(r.visitors), uniqueIps: n(r.ips) })), days, hourly),
    mostViewed: products.rows.map((r) => {
      const adds = n(carts.rows.find((c) => n(c.id) === n(r.id))?.adds);
      return { id: n(r.id), name: String(r.name), views: n(r.views), visitors: n(r.visitors), addToCarts: adds, cartRate: rate(adds, n(r.views)) };
    }),
    mostAddedToCart: carts.rows.map((r) => ({ id: n(r.id), name: String(r.name), addToCarts: n(r.adds) })),
    mostClicked: links.rows.map((r) => ({ target: String(r.target), label: r.label ? String(r.label) : null, clicks: n(r.clicks) })),
    topPages: pages.rows.map((r) => ({ path: String(r.path), views: n(r.views), visitors: n(r.visitors) })),
    topSearches: searches.rows.map((r) => ({ term: String(r.term), searches: n(r.searches) })),
    referrers: referrers.rows.map((r) => ({ host: String(r.host), visitors: n(r.visitors) })),
    devices: devices.rows.map((r) => ({ device: String(r.device), visitors: n(r.visitors) })),
    bestSellersOnline: soldOnline.rows.map((r) => ({ id: n(r.id), name: String(r.name ?? "Item"), units: n(r.units), revenue: n(r.revenue) })),
    bestSellersInStore: soldInStore.rows.map((r) => ({ id: n(r.id), name: String(r.name), units: n(r.units), revenue: n(r.revenue) })),
    mostWishlisted: wishlisted.rows.map((r) => ({ id: n(r.id), name: String(r.name), wishlists: n(r.wishlists) })),
    reviews: { count: n(reviews.rows[0]?.count), average: reviews.rows[0]?.average == null ? null : n(reviews.rows[0]?.average) },
  });
});

/** Every bucket in the period, zero-filled, so the chart's x-axis is time and not "days that had traffic". */
export function fillSeries<T extends { bucket: string; pageViews: number; visitors: number; uniqueIps: number }>(
  rows: T[], days: number, hourly: boolean, now = new Date(),
): { bucket: string; pageViews: number; visitors: number; uniqueIps: number }[] {
  const by = new Map(rows.map((r) => [r.bucket, r]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const key = (d: Date) => {
    const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    return hourly ? `${p.year}-${p.month}-${p.day}T${p.hour}` : `${p.year}-${p.month}-${p.day}`;
  };
  const step = hourly ? 3600_000 : 86_400_000;
  const count = hourly ? 24 : days;
  const out: { bucket: string; pageViews: number; visitors: number; uniqueIps: number }[] = [];
  const seen = new Set<string>();
  for (let i = count - 1; i >= 0; i--) {
    const k = key(new Date(now.getTime() - i * step));
    if (seen.has(k)) continue; // a daylight-saving day
    seen.add(k);
    const r = by.get(k);
    out.push({ bucket: k, pageViews: r?.pageViews ?? 0, visitors: r?.visitors ?? 0, uniqueIps: r?.uniqueIps ?? 0 });
  }
  return out;
}

export default router;
