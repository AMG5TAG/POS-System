import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  grantedProducts, GOOGLE_INSIGHTS_SCOPES, GOOGLE_INSIGHTS_SCOPE_STRING, insightsPeriod, dateRange, daysBetween,
  lastFullMonths, cleanSelection, parseSelection, classifyGoogleError, searchRow, mapsSeries, mapsKeywords,
  shapeReview, reviewText, cleanReply, REVIEW_ID_RE, gaDate, gaRows,
} from "../lib/google-insights";

/**
 * Marketing › Google (routes/google-insights.ts, services/googleApi.ts).
 * Pinned: a partial consent is reported per product, each Google failure maps
 * to something the person can act on, Google's sparse series are filled and
 * summed correctly, review text and replies are bounded, and an expired access
 * token is refreshed once while a revoked grant is marked for reconnecting.
 */

describe("scopes", () => {
  it("asks for all three products in one sign-in", () => {
    for (const s of Object.values(GOOGLE_INSIGHTS_SCOPES)) expect(GOOGLE_INSIGHTS_SCOPE_STRING).toContain(s);
  });

  it("reports a partial consent per product", () => {
    const g = grantedProducts(`openid ${GOOGLE_INSIGHTS_SCOPES.analytics} email`);
    expect(g).toEqual({ searchConsole: false, analytics: true, business: false });
    expect(grantedProducts(null)).toEqual({ searchConsole: true, analytics: true, business: true });
  });
});

describe("periods", () => {
  it("accepts only the offered periods", () => {
    expect(insightsPeriod("90")).toBe(90);
    expect(insightsPeriod("13")).toBe(28);
    expect(insightsPeriod(undefined)).toBe(28);
  });

  it("ends on today's Sydney date and spans exactly the period", () => {
    // 2026-10-05 14:30 UTC is already 6 October in Sydney (AEDT, +11).
    const r = dateRange(7, new Date("2026-10-05T14:30:00Z"));
    expect(r).toEqual({ start: "2026-09-30", end: "2026-10-06" });
    expect(daysBetween(r.start, r.end)).toHaveLength(7);
  });

  it("takes keyword months from the last full months, across a year end", () => {
    expect(lastFullMonths(3, new Date("2026-02-10T00:00:00Z"))).toEqual({ start: { year: 2025, month: 11 }, end: { year: 2026, month: 1 } });
  });
});

describe("selection", () => {
  it("keeps well-formed ids and drops anything else", () => {
    expect(cleanSelection({
      searchConsoleSite: "sc-domain:koastal.com.au", ga4Property: "properties/123", ga4PropertyName: "Koastal",
      gbpAccount: "accounts/1", gbpLocation: "locations/2", gbpLocationTitle: "Koastal Kollective",
    })).toEqual({
      searchConsoleSite: "sc-domain:koastal.com.au", ga4Property: "properties/123", ga4PropertyName: "Koastal",
      gbpAccount: "accounts/1", gbpLocation: "locations/2", gbpLocationTitle: "Koastal Kollective",
    });
    expect(cleanSelection({ searchConsoleSite: "https://koastal.com.au/" }).searchConsoleSite).toBe("https://koastal.com.au/");
    expect(cleanSelection({ ga4Property: "properties/../../x", gbpLocation: "locations/2", searchConsoleSite: "javascript:alert(1)" })).toEqual({});
    // A listing needs both its account and its location (reviews are addressed by both).
    expect(cleanSelection({ gbpLocation: "locations/2" })).toEqual({});
  });

  it("reads a missing or corrupt saved selection as nothing chosen", () => {
    expect(parseSelection(null)).toEqual({});
    expect(parseSelection("{not json")).toEqual({});
  });
});

describe("what a Google failure means", () => {
  it("an API not enabled in the Cloud project, with its enable link", () => {
    const e = classifyGoogleError(403, { error: { code: 403, status: "PERMISSION_DENIED", message: "Google Search Console API has not been used in project 123 before or it is disabled.", details: [{ reason: "SERVICE_DISABLED", metadata: { serviceTitle: "Google Search Console API", activationUrl: "https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=123" } }] } });
    expect(e.code).toBe("api_disabled");
    expect(e.activationUrl).toContain("searchconsole.googleapis.com");
    expect(e.message).toContain("Google Search Console API");
  });

  it("Business Profile before Google approves access (quota of 0)", () => {
    const e = classifyGoogleError(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessaccountmanagement.googleapis.com'", details: [{ reason: "RATE_LIMIT_EXCEEDED", metadata: { quota_limit_value: "0" } }] } });
    expect(e.code).toBe("access_pending");
  });

  it("an ordinary rate limit is not mistaken for missing approval", () => {
    expect(classifyGoogleError(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Too many requests", details: [{ reason: "RATE_LIMIT_EXCEEDED", metadata: { quota_limit_value: "300" } }] } }).code).toBe("rate_limited");
  });

  it("an unticked consent box, a revoked grant, and no access to the site", () => {
    expect(classifyGoogleError(403, { error: { message: "Request had insufficient authentication scopes.", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }).code).toBe("scope_missing");
    expect(classifyGoogleError(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }).code).toBe("not_connected");
    expect(classifyGoogleError(403, { error: { message: "User does not have sufficient permission for site 'sc-domain:x.com'." } }).code).toBe("no_permission");
  });
});

describe("shaping figures", () => {
  it("Search Console: CTR as a percentage and position to one decimal", () => {
    expect(searchRow({ keys: ["phone repair"], clicks: 12, impressions: 340, ctr: 0.035294, position: 7.4321 }))
      .toEqual({ key: "phone repair", clicks: 12, impressions: 340, ctr: 3.5, position: 7.4 });
  });

  it("GA4: dates and string metrics", () => {
    expect(gaDate("20261006")).toBe("2026-10-06");
    expect(gaRows({ rows: [{ dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "42" }, { value: "0.5" }] }] }))
      .toEqual([{ dims: ["Organic Search"], m: [42, 0.5] }]);
  });

  it("Business Profile: sums devices into Search vs Maps, fills missing days, and reads an absent value as 0", () => {
    const body = { multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [
      { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: "10" }, { date: { year: 2026, month: 10, day: 2 } }] } },
      { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: "5" }] } },
      { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 3 }, value: "7" }] } },
      { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 3 }, value: "2" }] } },
    ] }] };
    const { series, totals } = mapsSeries(body, daysBetween("2026-10-01", "2026-10-03"));
    expect(series.map((d) => [d.date, d.searchViews, d.mapsViews, d.calls])).toEqual([
      ["2026-10-01", 15, 0, 0], ["2026-10-02", 0, 0, 0], ["2026-10-03", 0, 7, 2],
    ]);
    expect(totals).toMatchObject({ searchViews: 15, mapsViews: 7, calls: 2, directions: 0 });
  });

  it("Business Profile keywords: exact counts first, Google's 'under N' kept as such", () => {
    expect(mapsKeywords({ searchKeywordsCounts: [
      { searchKeyword: "screen repair", insightsValue: { threshold: "15" } },
      { searchKeyword: "phone repair toukley", insightsValue: { value: "61" } },
    ] })).toEqual([
      { keyword: "phone repair toukley", count: 61, under: null },
      { keyword: "screen repair", count: null, under: 15 },
    ]);
  });
});

describe("reviews", () => {
  it("shows the original text rather than Google's translation, and hides an anonymous reviewer", () => {
    expect(reviewText("(Translated by Google) Great service\n\n(Original)\nServicio genial")).toBe("Servicio genial");
    const r = shapeReview({ reviewId: "abc123", reviewer: { displayName: "Jo", isAnonymous: true }, starRating: "FOUR", comment: "Good" });
    expect(r).toMatchObject({ id: "abc123", reviewer: "A Google user", rating: 4, comment: "Good", reply: null });
  });

  it("bounds a reply and the review id it is addressed to", () => {
    expect(cleanReply("  Thanks!  ")).toBe("Thanks!");
    expect(cleanReply("   ")).toBeNull();
    expect(cleanReply("x".repeat(4097))).toBeNull();
    expect(REVIEW_ID_RE.test("AbC-123_xyz")).toBe(true);
    expect(REVIEW_ID_RE.test("../../accounts/1")).toBe(false);
  });
});

/* ── Token handling (services/googleApi.ts) ──────────────────────────────── */

const vault = vi.hoisted(() => ({
  grant: null as null | { accessToken: string; refreshToken: string; tokenExpiresAt: Date | null; scope: string | null; accountHandle: string | null },
  updated: [] as { accessToken: string }[],
  disconnected: [] as string[],
}));
vi.mock("../services/tokenVault", () => ({
  readVaultGrant: async () => vault.grant,
  updateVaultAccessToken: async (_m: number, _p: string, accessToken: string) => { vault.updated.push({ accessToken }); if (vault.grant) vault.grant = { ...vault.grant, accessToken, tokenExpiresAt: new Date(Date.now() + 3600_000) }; },
  markVaultDisconnected: async (_m: number, _p: string, reason: string) => { vault.disconnected.push(reason); },
}));
const { googleJson, GoogleApiError } = await import("../services/googleApi");

describe("access tokens", () => {
  beforeEach(() => { vault.updated = []; vault.disconnected = []; vi.unstubAllGlobals(); });

  it("uses a fresh token as is", async () => {
    vault.grant = { accessToken: "fresh", refreshToken: "r", tokenExpiresAt: new Date(Date.now() + 30 * 60_000), scope: null, accountHandle: null };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(googleJson(1, "https://example.test/x")).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "Bearer fresh" });
  });

  it("refreshes an expired token once, even for parallel calls", async () => {
    vault.grant = { accessToken: "old", refreshToken: "r", tokenExpiresAt: new Date(Date.now() - 1000), scope: null, accountHandle: null };
    let refreshes = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) { refreshes++; return new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }), { status: 200 }); }
      return new Response("{}", { status: 200 });
    }));
    await Promise.all([googleJson(1, "https://example.test/a"), googleJson(1, "https://example.test/b")]);
    expect(refreshes).toBe(1);
    expect(vault.updated).toEqual([{ accessToken: "new" }]);
  });

  it("marks a revoked grant for reconnecting", async () => {
    vault.grant = { accessToken: "old", refreshToken: "r", tokenExpiresAt: new Date(Date.now() - 1000), scope: null, accountHandle: null };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
    const err = await googleJson(1, "https://example.test/a").catch((e: InstanceType<typeof GoogleApiError>) => e) as InstanceType<typeof GoogleApiError>;
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(err.info.code).toBe("not_connected");
    expect(vault.disconnected).toEqual(["google_revoked"]);
  });

  it("says 'not connected' when there is no grant", async () => {
    vault.grant = null;
    const err = await googleJson(1, "https://example.test/a").catch((e: InstanceType<typeof GoogleApiError>) => e) as InstanceType<typeof GoogleApiError>;
    expect(err.info.code).toBe("not_connected");
  });
});
