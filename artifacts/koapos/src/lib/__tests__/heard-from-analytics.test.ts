import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  computeHeardFromAnalytics,
  type HeardFromCustomer,
} from "../heard-from-analytics";

// Fix "now" to 2024-01-31T00:00:00.000Z for all window calculations.
const NOW = new Date("2024-01-31T00:00:00.000Z").getTime();

// Helpers for building customers with deterministic dates.
const DAY_MS = 86_400_000;
function daysAgo(n: number): string {
  return new Date(NOW - n * DAY_MS).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeCustomer(
  heardFrom: string | null,
  totalSpent: number | string,
  createdAt: string,
): HeardFromCustomer {
  return { heardFrom, totalSpent, createdAt };
}

// ─── computeHeardFromAnalytics – customers metric ─────────────────────────────

describe("computeHeardFromAnalytics – customers metric", () => {
  const customers: HeardFromCustomer[] = [
    makeCustomer("Instagram", 100, daysAgo(5)),
    makeCustomer("Instagram", 50, daysAgo(10)),
    makeCustomer("Google", 200, daysAgo(20)),
  ];

  it("counts customers correctly per source (all time)", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    const ig = result.breakdown.find((s) => s.name === "Instagram");
    const goog = result.breakdown.find((s) => s.name === "Google");
    expect(ig?.customers).toBe(2);
    expect(goog?.customers).toBe(1);
  });

  it("value equals customers count (not revenue) when metric is customers", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    const ig = result.breakdown.find((s) => s.name === "Instagram");
    expect(ig?.value).toBe(ig?.customers);
  });

  it("computes revenue correctly per source", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    const ig = result.breakdown.find((s) => s.name === "Instagram");
    const goog = result.breakdown.find((s) => s.name === "Google");
    expect(ig?.revenue).toBe(150);
    expect(goog?.revenue).toBe(200);
  });

  it("computes avgSpend as revenue/customers rounded to 2dp", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    const ig = result.breakdown.find((s) => s.name === "Instagram");
    expect(ig?.avgSpend).toBe(75); // 150 / 2
    const goog = result.breakdown.find((s) => s.name === "Google");
    expect(goog?.avgSpend).toBe(200); // 200 / 1
  });

  it("avgSpend is 0 when a source has 0 customers (should not occur for breakdown but guards div-by-zero)", () => {
    // This is covered by the code path: customersN ? round2(revenue/customersN) : 0
    const result = computeHeardFromAnalytics([], "all", "customers");
    expect(result.breakdown).toHaveLength(0);
    expect(result.windowTotal).toBe(0);
  });

  it("windowTotal equals total customers across all sources", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    expect(result.windowTotal).toBe(3);
  });

  it("windowRevenue equals sum of all revenue", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    expect(result.windowRevenue).toBe(350); // 100+50+200
  });

  it("breakdown is sorted by value descending (customers)", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    const values = result.breakdown.map((s) => s.value);
    expect(values[0]).toBeGreaterThanOrEqual(values[1] ?? 0);
  });

  it("comparison is null for all-time period", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    expect(result.comparison).toBeNull();
  });

  it("highlights is empty for all-time period (no previous period)", () => {
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    expect(result.highlights).toHaveLength(0);
  });

  it("totalSpent as string is parsed correctly", () => {
    const strCustomers: HeardFromCustomer[] = [
      makeCustomer("Facebook", "123.45", daysAgo(1)),
    ];
    const result = computeHeardFromAnalytics(strCustomers, "all", "customers");
    const fb = result.breakdown.find((s) => s.name === "Facebook");
    expect(fb?.revenue).toBe(123.45);
    expect(fb?.avgSpend).toBe(123.45);
  });

  it("null/empty heardFrom is grouped as Not recorded", () => {
    const mixed: HeardFromCustomer[] = [
      makeCustomer(null, 50, daysAgo(1)),
      makeCustomer("", 30, daysAgo(2)),
    ];
    const result = computeHeardFromAnalytics(mixed, "all", "customers");
    const nr = result.breakdown.find((s) => s.name === "Not recorded");
    expect(nr?.customers).toBe(2);
    expect(nr?.revenue).toBe(80);
  });
});

// ─── computeHeardFromAnalytics – revenue metric ───────────────────────────────

describe("computeHeardFromAnalytics – revenue metric", () => {
  const customers: HeardFromCustomer[] = [
    makeCustomer("Instagram", 100, daysAgo(5)),
    makeCustomer("Instagram", 50, daysAgo(10)),
    makeCustomer("Google", 200, daysAgo(20)),
  ];

  it("value equals revenue (not count) when metric is revenue", () => {
    const result = computeHeardFromAnalytics(customers, "all", "revenue");
    const ig = result.breakdown.find((s) => s.name === "Instagram");
    expect(ig?.value).toBe(150);
    const goog = result.breakdown.find((s) => s.name === "Google");
    expect(goog?.value).toBe(200);
  });

  it("breakdown sorted by revenue descending", () => {
    const result = computeHeardFromAnalytics(customers, "all", "revenue");
    expect(result.breakdown[0].name).toBe("Google");
    expect(result.breakdown[1].name).toBe("Instagram");
  });

  it("windowRevenue is the same regardless of active metric", () => {
    const r1 = computeHeardFromAnalytics(customers, "all", "customers");
    const r2 = computeHeardFromAnalytics(customers, "all", "revenue");
    expect(r2.windowRevenue).toBe(r1.windowRevenue);
  });

  it("windowTotal (customer count) is the same regardless of active metric", () => {
    const r1 = computeHeardFromAnalytics(customers, "all", "customers");
    const r2 = computeHeardFromAnalytics(customers, "all", "revenue");
    expect(r2.windowTotal).toBe(r1.windowTotal);
  });

  it("comparison current/previous use revenue when metric is revenue", () => {
    const mixed: HeardFromCustomer[] = [
      makeCustomer("Instagram", 80, daysAgo(5)),   // current window
      makeCustomer("Instagram", 40, daysAgo(45)),  // previous 30d window
      makeCustomer("Google",   100, daysAgo(5)),   // current window
    ];
    const result = computeHeardFromAnalytics(mixed, "30d", "revenue");
    const igCmp = result.comparison?.find((c) => c.name === "Instagram");
    expect(igCmp?.current).toBe(80);
    expect(igCmp?.previous).toBe(40);
    expect(igCmp?.delta).toBe(40);
  });
});

// ─── window filtering by createdAt ───────────────────────────────────────────

describe("computeHeardFromAnalytics – window filtering", () => {
  it("30d: customers with createdAt ≥ curStart are in the current window", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Referral", 10, daysAgo(1)),   // in current 30d
      makeCustomer("Referral", 20, daysAgo(29)),  // in current 30d (just inside)
      makeCustomer("Referral", 30, daysAgo(31)),  // in previous 30d
      makeCustomer("Referral", 40, daysAgo(61)),  // outside both windows
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const ref = result.breakdown.find((s) => s.name === "Referral");
    expect(ref?.customers).toBe(2);
    expect(result.windowTotal).toBe(2);
  });

  it("30d: customers in previous window appear in comparison but not breakdown", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Referral", 10, daysAgo(1)),   // current
      makeCustomer("Referral", 20, daysAgo(45)),  // previous
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const ref = result.breakdown.find((s) => s.name === "Referral");
    expect(ref?.customers).toBe(1); // only current
    const cmp = result.comparison?.find((c) => c.name === "Referral");
    expect(cmp?.current).toBe(1);
    expect(cmp?.previous).toBe(1);
  });

  it("90d: customers outside the 90d window are excluded from breakdown", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Email", 50, daysAgo(10)),   // in 90d window
      makeCustomer("Email", 60, daysAgo(100)),  // outside 90d window
    ];
    const result = computeHeardFromAnalytics(customers, "90d", "customers");
    const em = result.breakdown.find((s) => s.name === "Email");
    expect(em?.customers).toBe(1);
    expect(result.windowTotal).toBe(1);
  });

  it("12m: uses 365-day window", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("TikTok", 100, daysAgo(364)),  // just inside 12m
      makeCustomer("TikTok", 200, daysAgo(366)),  // just outside 12m
    ];
    const result = computeHeardFromAnalytics(customers, "12m", "customers");
    const tk = result.breakdown.find((s) => s.name === "TikTok");
    expect(tk?.customers).toBe(1);
  });

  it("all: includes customers with no parseable date", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Print", 50, "invalid-date"),
      makeCustomer("Print", 30, daysAgo(5)),
    ];
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    const p = result.breakdown.find((s) => s.name === "Print");
    expect(p?.customers).toBe(2);
  });

  it("windowed periods exclude customers with invalid createdAt", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Print", 50, "bad-date"),
      makeCustomer("Print", 30, daysAgo(5)),
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const p = result.breakdown.find((s) => s.name === "Print");
    expect(p?.customers).toBe(1); // only the valid-date one
  });
});

// ─── comparison deltas ────────────────────────────────────────────────────────

describe("computeHeardFromAnalytics – comparison deltas", () => {
  it("delta = current − previous (customers metric)", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("SEO", 10, daysAgo(5)),    // current
      makeCustomer("SEO", 20, daysAgo(5)),    // current
      makeCustomer("SEO", 30, daysAgo(45)),   // previous
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const seo = result.comparison?.find((c) => c.name === "SEO");
    expect(seo?.current).toBe(2);
    expect(seo?.previous).toBe(1);
    expect(seo?.delta).toBe(1);
  });

  it("delta = current − previous (revenue metric)", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("SEO", 75, daysAgo(5)),    // current
      makeCustomer("SEO", 25, daysAgo(45)),   // previous
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "revenue");
    const seo = result.comparison?.find((c) => c.name === "SEO");
    expect(seo?.current).toBe(75);
    expect(seo?.previous).toBe(25);
    expect(seo?.delta).toBe(50);
  });

  it("sources only in the previous window appear in comparison with current=0", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Radio", 50, daysAgo(45)), // previous window only
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const radio = result.comparison?.find((c) => c.name === "Radio");
    expect(radio?.current).toBe(0);
    expect(radio?.previous).toBe(1);
    expect(radio?.delta).toBe(-1);
  });

  it("comparison is null for all-time period", () => {
    const result = computeHeardFromAnalytics(
      [makeCustomer("TV", 100, daysAgo(10))],
      "all",
      "customers",
    );
    expect(result.comparison).toBeNull();
  });

  it("revenue delta is rounded to 2 decimal places", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Email", "33.333", daysAgo(5)),
      makeCustomer("Email", "11.111", daysAgo(45)),
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "revenue");
    const em = result.comparison?.find((c) => c.name === "Email");
    expect(em?.current).toBeCloseTo(33.33, 1);
    expect(em?.delta).toBeCloseTo(22.22, 1);
  });
});

// ─── trend bucketing ──────────────────────────────────────────────────────────

describe("computeHeardFromAnalytics – trend bucketing", () => {
  it("30d period produces 6 trend buckets", () => {
    const result = computeHeardFromAnalytics(
      [makeCustomer("Web", 10, daysAgo(1))],
      "30d",
      "customers",
    );
    expect(result.trend.data).toHaveLength(6);
  });

  it("90d period produces 6 trend buckets", () => {
    const result = computeHeardFromAnalytics(
      [makeCustomer("Web", 10, daysAgo(1))],
      "90d",
      "customers",
    );
    expect(result.trend.data).toHaveLength(6);
  });

  it("12m period produces 12 monthly trend buckets", () => {
    const result = computeHeardFromAnalytics(
      [makeCustomer("Web", 10, daysAgo(1))],
      "12m",
      "customers",
    );
    expect(result.trend.data).toHaveLength(12);
  });

  it("a customer falls into a bucket and increments the count", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Instagram", 10, daysAgo(2)),
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const total = result.trend.data.reduce(
      (sum, p) => sum + ((p["Instagram"] as number) ?? 0),
      0,
    );
    expect(total).toBe(1);
  });

  it("trend values reflect revenue (not count) when metric is revenue", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Instagram", 123.45, daysAgo(2)),
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "revenue");
    const total = result.trend.data.reduce(
      (sum, p) => sum + ((p["Instagram"] as number) ?? 0),
      0,
    );
    expect(total).toBeCloseTo(123.45, 2);
  });

  it("trend sources list includes sources that appear in the trend window", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Instagram", 10, daysAgo(2)),
      makeCustomer("Google", 20, daysAgo(3)),
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    expect(result.trend.sources).toContain("Instagram");
    expect(result.trend.sources).toContain("Google");
  });
});

// ─── highlights (gainer / decliner) ──────────────────────────────────────────

describe("computeHeardFromAnalytics – highlights", () => {
  it("identifies the top gainer and top decliner", () => {
    const customers: HeardFromCustomer[] = [
      // Gainer: Email – 3 current, 1 previous
      makeCustomer("Email", 10, daysAgo(5)),
      makeCustomer("Email", 10, daysAgo(6)),
      makeCustomer("Email", 10, daysAgo(7)),
      makeCustomer("Email", 10, daysAgo(45)),
      // Decliner: Referral – 0 current, 2 previous
      makeCustomer("Referral", 20, daysAgo(35)),
      makeCustomer("Referral", 20, daysAgo(40)),
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const gainer = result.highlights.find((h) => h.kind === "gainer");
    const decliner = result.highlights.find((h) => h.kind === "decliner");
    expect(gainer?.name).toBe("Email");
    expect(decliner?.name).toBe("Referral");
  });

  it("pctChange is null when previous is 0", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("NewChannel", 10, daysAgo(5)), // current only
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const gainer = result.highlights.find((h) => h.kind === "gainer");
    expect(gainer?.pctChange).toBeNull();
  });

  it("pctChange is computed as percent when previous > 0", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Email", 10, daysAgo(5)),  // current
      makeCustomer("Email", 10, daysAgo(5)),  // current → 2 current
      makeCustomer("Email", 10, daysAgo(45)), // previous → 1 prev
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const gainer = result.highlights.find((h) => h.kind === "gainer");
    expect(gainer?.pctChange).toBe(100); // (2-1)/1 * 100 = 100%
  });

  it("Not recorded source is excluded from highlights", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer(null, 10, daysAgo(5)),   // current
      makeCustomer(null, 10, daysAgo(5)),   // current
      makeCustomer(null, 10, daysAgo(45)), // previous – creates big delta
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    const hasNR = result.highlights.some((h) => h.name === "Not recorded");
    expect(hasNR).toBe(false);
  });

  it("highlights is empty when there are no movers", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Email", 10, daysAgo(5)),
      makeCustomer("Email", 10, daysAgo(45)),
    ];
    const result = computeHeardFromAnalytics(customers, "30d", "customers");
    // 1 current, 1 previous → delta = 0 for Email → no movers
    expect(result.highlights).toHaveLength(0);
  });
});

// ─── colorMap ─────────────────────────────────────────────────────────────────

describe("computeHeardFromAnalytics – colorMap", () => {
  it("Not recorded always gets the grey #9ca3af color", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer(null, 10, daysAgo(1)),
    ];
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    expect(result.colorMap["Not recorded"]).toBe("#9ca3af");
  });

  it("named sources get a palette color (not grey)", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Instagram", 10, daysAgo(1)),
    ];
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    expect(result.colorMap["Instagram"]).not.toBe("#9ca3af");
    expect(result.colorMap["Instagram"]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("same source keeps the same fill color in breakdown and colorMap", () => {
    const customers: HeardFromCustomer[] = [
      makeCustomer("Google", 10, daysAgo(1)),
    ];
    const result = computeHeardFromAnalytics(customers, "all", "customers");
    const slice = result.breakdown.find((s) => s.name === "Google");
    expect(slice?.fill).toBe(result.colorMap["Google"]);
  });
});
