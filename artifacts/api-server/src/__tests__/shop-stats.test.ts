import { describe, it, expect, vi } from "vitest";
import { isBot, deviceOf, hashIp, referrerHost, normaliseSearch, statsPeriod, rate, TrackBody } from "../lib/shop-stats";

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  return importOriginal();
});
const { fillSeries, takeEventBudget, EVENTS_PER_IP_PER_HOUR } = await import("../routes/shop-stats");

/**
 * Online shop statistics. Pinned: raw IPs are never stored (only a keyed,
 * non-reversible hash), bots are not visitors, referrals exclude our own
 * sites, the tracking input is bounded, and the chart series covers every
 * bucket in the period.
 */

describe("privacy", () => {
  it("stores a keyed hash of the IP, never the address", () => {
    const h = hashIp("203.0.113.7", "secret");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain("203");
    expect(hashIp("203.0.113.7", "secret")).toBe(h);           // same address → same count
    expect(hashIp("203.0.113.8", "secret")).not.toBe(h);
    expect(hashIp("203.0.113.7", "other-secret")).not.toBe(h); // not guessable without the key
  });
});

describe("who counts", () => {
  it("drops crawlers, preview fetchers, scripts and blank user agents", () => {
    for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "curl/8.0", "HeadlessChrome", "", undefined]) expect(isBot(ua)).toBe(true);
    expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe(false);
  });

  it("tells phones, tablets and desktops apart", () => {
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile")).toBe("mobile");
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 14; SM-X200)")).toBe("tablet");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile")).toBe("mobile");
    expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("desktop");
  });
});

describe("referrers and searches", () => {
  it("keeps another site's host and drops our own", () => {
    const own = ["koastal.com.au"];
    expect(referrerHost("https://www.google.com/search?q=x", own)).toBe("google.com");
    expect(referrerHost("https://koastal.com.au/about", own)).toBeNull();
    expect(referrerHost("https://www.koastal.com.au/", own)).toBeNull();
    expect(referrerHost("not a url", own)).toBeNull();
  });

  it("counts searches case- and space-insensitively", () => {
    expect(normaliseSearch("  iPhone   Case ")).toBe("iphone case");
  });
});

describe("input", () => {
  it("accepts a bounded batch and refuses anything else", () => {
    expect(TrackBody.safeParse({ visitorId: "abcd1234", events: [{ type: "page_view", path: "/" }] }).success).toBe(true);
    expect(TrackBody.safeParse({ visitorId: "abcd1234", events: [{ type: "purchase", path: "/" }] }).success).toBe(false);
    expect(TrackBody.safeParse({ visitorId: "x", events: [{ type: "page_view" }] }).success).toBe(false);
    expect(TrackBody.safeParse({ visitorId: "abcd1234", events: Array(21).fill({ type: "page_view" }) }).success).toBe(false);
  });

  it("offers fixed periods and safe percentages", () => {
    expect(statsPeriod("7")).toBe(7);
    expect(statsPeriod("13")).toBe(30);
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(5, 0)).toBe(0);
  });
});

describe("chart series", () => {
  it("has every day of the period, zero-filled, ending today (Sydney)", () => {
    const now = new Date("2026-10-01T02:00:00Z"); // 12pm in Sydney
    const s = fillSeries([{ bucket: "2026-09-30", pageViews: 4, visitors: 2, uniqueIps: 2 }], 7, false, now);
    expect(s).toHaveLength(7);
    expect(s[0].bucket).toBe("2026-09-25");
    expect(s.at(-1)!.bucket).toBe("2026-10-01");
    expect(s.find((x) => x.bucket === "2026-09-30")!.pageViews).toBe(4);
    expect(s.filter((x) => x.pageViews === 0)).toHaveLength(6);
  });

  it("has 24 hours for the one-day view", () => {
    expect(fillSeries([], 1, true, new Date("2026-10-01T02:00:00Z"))).toHaveLength(24);
  });
});

describe("tracking budget per IP", () => {
  it("stores up to the hourly cap, then drops, and starts again next hour", () => {
    const t0 = Date.UTC(2026, 9, 2, 5, 0, 0);
    expect(takeEventBudget("ip-a", EVENTS_PER_IP_PER_HOUR - 5, t0)).toBe(EVENTS_PER_IP_PER_HOUR - 5);
    expect(takeEventBudget("ip-a", 20, t0 + 1000)).toBe(5);
    expect(takeEventBudget("ip-a", 20, t0 + 2000)).toBe(0);
    expect(takeEventBudget("ip-b", 20, t0 + 2000)).toBe(20);
    expect(takeEventBudget("ip-a", 20, t0 + 3_600_000)).toBe(20);
  });
});
