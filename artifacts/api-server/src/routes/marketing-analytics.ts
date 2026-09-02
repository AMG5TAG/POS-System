import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * Marketing engagement analytics, aggregated from `marketing_events`
 * (shortlink clicks, landing-page views, QR scans). Merchant-scoped and
 * windowed to the last `days` days (default 30, capped at 365).
 */
router.get("/marketing-analytics", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const daysRaw = parseInt(String(req.query.days ?? "30"), 10);
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
  const scope = sql`merchant_id = ${merchantId} AND occurred_at >= now() - (${days} || ' days')::interval`;

  const [perKind, overall, byDay, byDevice, byCountry, topTargets] = await Promise.all([
    db.execute<{ kind: string; total: string }>(sql`
      SELECT kind, count(*)::text AS total FROM marketing_events WHERE ${scope} GROUP BY kind`),
    db.execute<{ total: string; uniques: string }>(sql`
      SELECT count(*)::text AS total, count(DISTINCT NULLIF(ip_hash, ''))::text AS uniques
      FROM marketing_events WHERE ${scope}`),
    db.execute<{ day: string; kind: string; total: string }>(sql`
      SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day, kind, count(*)::text AS total
      FROM marketing_events WHERE ${scope} GROUP BY day, kind ORDER BY day`),
    db.execute<{ device_type: string; total: string }>(sql`
      SELECT device_type, count(*)::text AS total FROM marketing_events WHERE ${scope}
      GROUP BY device_type ORDER BY count(*) DESC`),
    db.execute<{ country: string; total: string }>(sql`
      SELECT NULLIF(country, '') AS country, count(*)::text AS total FROM marketing_events WHERE ${scope}
      GROUP BY country ORDER BY count(*) DESC LIMIT 12`),
    db.execute<{ kind: string; target_slug: string; total: string }>(sql`
      SELECT kind, target_slug, count(*)::text AS total FROM marketing_events WHERE ${scope}
      GROUP BY kind, target_slug ORDER BY count(*) DESC LIMIT 10`),
  ]);

  const n = (v?: string | null) => Number(v ?? 0) || 0;
  const kindCount = { shortlink: 0, landing: 0, qr: 0 } as Record<string, number>;
  for (const r of perKind.rows) if (r.kind in kindCount) kindCount[r.kind] = n(r.total);

  // Pivot per-day rows into one entry per date: { date, shortlink, landing, qr }.
  const dayMap = new Map<string, { date: string; shortlink: number; landing: number; qr: number }>();
  for (const r of byDay.rows) {
    const e = dayMap.get(r.day) ?? { date: r.day, shortlink: 0, landing: 0, qr: 0 };
    if (r.kind === "shortlink" || r.kind === "landing" || r.kind === "qr") e[r.kind] = n(r.total);
    dayMap.set(r.day, e);
  }

  res.json({
    days,
    totals: {
      total:     n(overall.rows[0]?.total),
      unique:    n(overall.rows[0]?.uniques),
      shortlink: kindCount.shortlink,
      landing:   kindCount.landing,
      qr:        kindCount.qr,
    },
    byDay:     Array.from(dayMap.values()),
    byDevice:  byDevice.rows.map((r) => ({ name: r.device_type || "unknown", value: n(r.total) })),
    byCountry: byCountry.rows.map((r) => ({ name: r.country || "Unknown", value: n(r.total) })),
    topTargets: topTargets.rows.map((r) => ({ kind: r.kind, slug: r.target_slug || "—", count: n(r.total) })),
  });
});

export default router;
