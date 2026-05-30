export type HeardFromPeriod = "all" | "30d" | "90d" | "12m";

export const HEARD_FROM_PERIODS: { value: HeardFromPeriod; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
];

export type HeardFromCustomer = {
  heardFrom?: string | null;
  createdAt: string;
};

export type HeardFromSlice = {
  name: string;
  value: number;
  fill: string;
};

export type HeardFromComparison = {
  name: string;
  fill: string;
  current: number;
  previous: number;
  delta: number;
};

export type HeardFromTrendPoint = {
  label: string;
} & Record<string, number | string>;

export type HeardFromHighlight = {
  kind: "gainer" | "decliner";
  name: string;
  current: number;
  previous: number;
  delta: number;
  /** Percent change vs the previous period; null when there was nothing previously. */
  pctChange: number | null;
  fill: string;
};

export type HeardFromAnalytics = {
  /** Distribution within the selected window (drives the pie + legend). */
  breakdown: HeardFromSlice[];
  /** Per-source current vs previous equal-length period (null for "all time"). */
  comparison: HeardFromComparison[] | null;
  /** Stacked-bar trend data across time buckets. */
  trend: { data: HeardFromTrendPoint[]; sources: string[] };
  /** Stable colour per source, keyed by source name. */
  colorMap: Record<string, string>;
  /** Number of customers counted within the selected window. */
  windowTotal: number;
  /** Plain-language callouts for the biggest gainer/decliner (empty for "all time"). */
  highlights: HeardFromHighlight[];
};

const NOT_RECORDED = "Not recorded";
const NOT_RECORDED_COLOR = "#9ca3af";
const PALETTE = [
  "#3b82f6", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444",
  "#ec4899", "#f97316", "#14b8a6", "#6366f1",
];

const DAY_MS = 86_400_000;

function sourceName(c: HeardFromCustomer): string {
  return (c.heardFrom ?? "").trim() || NOT_RECORDED;
}

function windowDaysFor(period: HeardFromPeriod): number | null {
  switch (period) {
    case "30d": return 30;
    case "90d": return 90;
    case "12m": return 365;
    case "all": return null;
  }
}

type Bucket = { label: string; start: number; end: number };

function buildBuckets(period: HeardFromPeriod, earliest: number, now: number): Bucket[] {
  if (period === "30d" || period === "90d") {
    const totalDays = period === "30d" ? 30 : 90;
    const numBuckets = 6;
    const stepDays = totalDays / numBuckets;
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const startWindow = end.getTime() - totalDays * DAY_MS;
    const buckets: Bucket[] = [];
    for (let i = 0; i < numBuckets; i++) {
      const s = startWindow + i * stepDays * DAY_MS;
      const e = startWindow + (i + 1) * stepDays * DAY_MS;
      buckets.push({
        start: s,
        end: e,
        label: new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      });
    }
    return buckets;
  }

  // Monthly buckets for "12m" and "all".
  let numMonths: number;
  if (period === "12m") {
    numMonths = 12;
  } else {
    const e = new Date(now);
    const s = new Date(earliest);
    numMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    numMonths = Math.max(3, Math.min(24, numMonths));
  }

  const base = new Date(now);
  base.setDate(1);
  base.setHours(0, 0, 0, 0);
  const buckets: Bucket[] = [];
  for (let i = numMonths - 1; i >= 0; i--) {
    const s = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const e = new Date(base.getFullYear(), base.getMonth() - i + 1, 1);
    const label = s.getMonth() === 0 || i === numMonths - 1
      ? s.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
      : s.toLocaleDateString(undefined, { month: "short" });
    buckets.push({ start: s.getTime(), end: e.getTime(), label });
  }
  return buckets;
}

export function computeHeardFromAnalytics(
  customers: HeardFromCustomer[],
  period: HeardFromPeriod,
): HeardFromAnalytics {
  // Parse once; drop records with unparseable dates from time-based views.
  const parsed = customers.map((c) => ({
    source: sourceName(c),
    ts: new Date(c.createdAt).getTime(),
  }));
  const dated = parsed.filter((c) => !Number.isNaN(c.ts));

  // Stable colour per source, ordered by all-time frequency.
  const allCounts = new Map<string, number>();
  for (const c of parsed) allCounts.set(c.source, (allCounts.get(c.source) ?? 0) + 1);
  const orderedSources = [...allCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const colorMap: Record<string, string> = {};
  let paletteIdx = 0;
  for (const name of orderedSources) {
    colorMap[name] = name === NOT_RECORDED ? NOT_RECORDED_COLOR : PALETTE[paletteIdx++ % PALETTE.length];
  }

  const now = Date.now();
  const windowDays = windowDaysFor(period);
  const curStart = windowDays === null ? -Infinity : now - windowDays * DAY_MS;
  const prevStart = windowDays === null ? -Infinity : now - 2 * windowDays * DAY_MS;
  const prevEnd = curStart;

  // For "all time" we still want the breakdown to count records with no date.
  const curCounts = new Map<string, number>();
  const prevCounts = new Map<string, number>();
  if (windowDays === null) {
    for (const c of parsed) curCounts.set(c.source, (curCounts.get(c.source) ?? 0) + 1);
  } else {
    for (const c of dated) {
      if (c.ts >= curStart) {
        curCounts.set(c.source, (curCounts.get(c.source) ?? 0) + 1);
      } else if (c.ts >= prevStart && c.ts < prevEnd) {
        prevCounts.set(c.source, (prevCounts.get(c.source) ?? 0) + 1);
      }
    }
  }

  const breakdown: HeardFromSlice[] = [...curCounts.entries()]
    .map(([name, value]) => ({ name, value, fill: colorMap[name] ?? NOT_RECORDED_COLOR }))
    .sort((a, b) => b.value - a.value);

  const windowTotal = breakdown.reduce((sum, s) => sum + s.value, 0);

  let comparison: HeardFromComparison[] | null = null;
  if (windowDays !== null) {
    const names = new Set<string>([...curCounts.keys(), ...prevCounts.keys()]);
    comparison = [...names]
      .map((name) => {
        const current = curCounts.get(name) ?? 0;
        const previous = prevCounts.get(name) ?? 0;
        return { name, current, previous, delta: current - previous, fill: colorMap[name] ?? NOT_RECORDED_COLOR };
      })
      .sort((a, b) => b.current - a.current || b.delta - a.delta);
  }

  // Trend buckets.
  const earliest = dated.length ? Math.min(...dated.map((c) => c.ts)) : now;
  const buckets = buildBuckets(period, earliest, now);

  // Which sources appear within the charted buckets (cap to keep the chart readable).
  const windowStart = buckets.length ? buckets[0].start : -Infinity;
  const inWindow = dated.filter((c) => c.ts >= windowStart);
  const windowSourceCounts = new Map<string, number>();
  for (const c of inWindow) windowSourceCounts.set(c.source, (windowSourceCounts.get(c.source) ?? 0) + 1);
  const trendSources = [...windowSourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name);
  const trendSourceSet = new Set(trendSources);

  const trendData: HeardFromTrendPoint[] = buckets.map((b) => {
    const point: HeardFromTrendPoint = { label: b.label };
    for (const s of trendSources) point[s] = 0;
    return point;
  });
  for (const c of inWindow) {
    if (!trendSourceSet.has(c.source)) continue;
    const idx = buckets.findIndex((b) => c.ts >= b.start && c.ts < b.end);
    if (idx >= 0) {
      trendData[idx][c.source] = (trendData[idx][c.source] as number) + 1;
    }
  }

  return {
    breakdown,
    comparison,
    trend: { data: trendData, sources: trendSources },
    colorMap,
    windowTotal,
    highlights: computeHighlights(comparison),
  };
}

/**
 * Pick the standout gainer and decliner from the per-source comparison so a
 * merchant can spot fading channels without scanning the list. Returns an empty
 * array for "all time" (no previous period) or when nothing is moving.
 * "Not recorded" is excluded — it isn't a real referral channel.
 */
function computeHighlights(comparison: HeardFromComparison[] | null): HeardFromHighlight[] {
  if (!comparison) return [];

  const real = comparison.filter((c) => c.name !== NOT_RECORDED);
  const highlights: HeardFromHighlight[] = [];

  const pctChange = (c: HeardFromComparison): number | null =>
    c.previous > 0 ? Math.round((c.delta / c.previous) * 100) : null;

  const gainers = real.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
  if (gainers.length) {
    const g = gainers[0];
    highlights.push({
      kind: "gainer",
      name: g.name,
      current: g.current,
      previous: g.previous,
      delta: g.delta,
      pctChange: pctChange(g),
      fill: g.fill,
    });
  }

  const decliners = real.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta);
  if (decliners.length) {
    const d = decliners[0];
    // Avoid pointing at the same channel twice in the rare single-source case.
    if (d.name !== highlights[0]?.name) {
      highlights.push({
        kind: "decliner",
        name: d.name,
        current: d.current,
        previous: d.previous,
        delta: d.delta,
        pctChange: pctChange(d),
        fill: d.fill,
      });
    }
  }

  return highlights;
}
