import { describe, it, expect } from "vitest";
import { getDatedWindow, advanceDatedWindow } from "../routes/kpi-calc";

/**
 * Window math for repeating KPI budget windows — the calendar arithmetic behind
 * "at the end of the month, archive it and start the next one with the same
 * target". All pure; no DB involved.
 */

const SYD = "Australia/Sydney";

describe("getDatedWindow", () => {
  it("derives a one-period window when no end date is set", () => {
    const w = getDatedWindow("monthly", "2026-08-01", null, SYD)!;
    expect(w.startDate).toBe("2026-08-01");
    expect(w.endDate).toBe("2026-08-31");
    expect(w.label).toBe("August 2026");
  });

  it("honours an explicit end date", () => {
    const w = getDatedWindow("monthly", "2026-08-01", "2026-08-15", SYD)!;
    expect(w.endDate).toBe("2026-08-15");
    expect(w.label).toBe("1 Aug – 15 Aug 2026");
  });

  it("falls back to the implicit end when the end date precedes the start", () => {
    const w = getDatedWindow("monthly", "2026-08-01", "2026-07-01", SYD)!;
    expect(w.endDate).toBe("2026-08-31");
  });

  it("returns null for a missing or unparseable start date", () => {
    expect(getDatedWindow("monthly", null, null, SYD)).toBeNull();
    expect(getDatedWindow("monthly", "", null, SYD)).toBeNull();
    expect(getDatedWindow("monthly", "not-a-date", null, SYD)).toBeNull();
    expect(getDatedWindow("monthly", "2026-02-30", null, SYD)).toBeNull();
    expect(getDatedWindow("monthly", "2026-13-01", null, SYD)).toBeNull();
  });

  it("anchors the window to the merchant's local midnight, not the server's", () => {
    // Sydney is UTC+10 in August, so local 1 Aug 00:00 is 31 Jul 14:00 UTC.
    const w = getDatedWindow("monthly", "2026-08-01", "2026-08-31", SYD)!;
    expect(w.start.toISOString()).toBe("2026-07-31T14:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-08-31T13:59:59.999Z");
  });

  it("labels windows that line up with a calendar period the same way the rolling path does", () => {
    expect(getDatedWindow("monthly", "2026-08-01", "2026-08-31", SYD)!.label).toBe("August 2026");
    expect(getDatedWindow("quarterly", "2026-07-01", "2026-09-30", SYD)!.label).toBe("Q3 2026");
    expect(getDatedWindow("annual", "2026-01-01", "2026-12-31", SYD)!.label).toBe("2026");
    expect(getDatedWindow("weekly", "2026-08-03", "2026-08-09", SYD)!.label).toBe("Week of 3 Aug 2026");
    expect(getDatedWindow("daily", "2026-08-05", "2026-08-05", SYD)!.label).toBe("5 Aug 2026");
  });

  it("labels an offset window as a date range, including across a year boundary", () => {
    expect(getDatedWindow("monthly", "2026-07-15", "2026-08-14", SYD)!.label).toBe("15 Jul – 14 Aug 2026");
    expect(getDatedWindow("monthly", "2026-12-15", "2027-01-14", SYD)!.label).toBe("15 Dec 2026 – 14 Jan 2027");
  });
});

describe("advanceDatedWindow", () => {
  it("rolls a whole calendar month onto the next whole month", () => {
    expect(advanceDatedWindow("monthly", "2026-07-01", "2026-07-31", SYD))
      .toEqual({ startDate: "2026-08-01", endDate: "2026-08-31" });
  });

  it("respects differing month lengths rather than shifting the end date by a fixed span", () => {
    // Feb (28 days) -> Mar (31), not 1–28 Mar.
    expect(advanceDatedWindow("monthly", "2026-02-01", "2026-02-28", SYD))
      .toEqual({ startDate: "2026-03-01", endDate: "2026-03-31" });
    // 30-day month -> 31-day month.
    expect(advanceDatedWindow("monthly", "2026-04-01", "2026-04-30", SYD))
      .toEqual({ startDate: "2026-05-01", endDate: "2026-05-31" });
    // Into a leap February.
    expect(advanceDatedWindow("monthly", "2028-01-01", "2028-01-31", SYD))
      .toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
  });

  it("crosses the year boundary", () => {
    expect(advanceDatedWindow("monthly", "2026-12-01", "2026-12-31", SYD))
      .toEqual({ startDate: "2027-01-01", endDate: "2027-01-31" });
  });

  it("keeps an offset window on its own day-of-month cycle", () => {
    expect(advanceDatedWindow("monthly", "2026-07-15", "2026-08-14", SYD))
      .toEqual({ startDate: "2026-08-15", endDate: "2026-09-14" });
  });

  it("leaves the end date null when the merchant never set one", () => {
    expect(advanceDatedWindow("monthly", "2026-08-01", null, SYD))
      .toEqual({ startDate: "2026-09-01", endDate: null });
  });

  it("handles the non-monthly periods", () => {
    expect(advanceDatedWindow("daily", "2026-08-05", "2026-08-05", SYD))
      .toEqual({ startDate: "2026-08-06", endDate: "2026-08-06" });
    expect(advanceDatedWindow("weekly", "2026-08-03", "2026-08-09", SYD))
      .toEqual({ startDate: "2026-08-10", endDate: "2026-08-16" });
    expect(advanceDatedWindow("quarterly", "2026-07-01", "2026-09-30", SYD))
      .toEqual({ startDate: "2026-10-01", endDate: "2026-12-31" });
    expect(advanceDatedWindow("annual", "2026-01-01", "2026-12-31", SYD))
      .toEqual({ startDate: "2027-01-01", endDate: "2027-12-31" });
  });

  it("returns null when there is no window to advance", () => {
    expect(advanceDatedWindow("monthly", "", null, SYD)).toBeNull();
  });

  it("produces contiguous windows with no gap or overlap over a full year", () => {
    let start = "2026-01-01";
    let end: string | null = "2026-01-31";
    const labels: string[] = [];

    for (let i = 0; i < 12; i++) {
      const win = getDatedWindow("monthly", start, end, SYD)!;
      labels.push(win.label);
      const next: { startDate: string; endDate: string | null } =
        advanceDatedWindow("monthly", start, end, SYD)!;
      // The next window must begin the instant this one ends.
      const nextWin = getDatedWindow("monthly", next.startDate, next.endDate, SYD)!;
      expect(nextWin.start.getTime()).toBe(win.end.getTime() + 1);
      start = next.startDate;
      end = next.endDate;
    }

    expect(labels).toEqual([
      "January 2026", "February 2026", "March 2026", "April 2026",
      "May 2026", "June 2026", "July 2026", "August 2026",
      "September 2026", "October 2026", "November 2026", "December 2026",
    ]);
    // A full year of rolls lands on the same window one year on.
    expect(start).toBe("2027-01-01");
  });

  it("stays contiguous across a daylight-saving transition", () => {
    // Sydney leaves DST on 5 Apr 2026 and enters it on 4 Oct 2026.
    for (const [s, e] of [["2026-03-01", "2026-03-31"], ["2026-09-01", "2026-09-30"]]) {
      const win = getDatedWindow("monthly", s, e, SYD)!;
      const next = advanceDatedWindow("monthly", s, e, SYD)!;
      const nextWin = getDatedWindow("monthly", next.startDate, next.endDate, SYD)!;
      expect(nextWin.start.getTime()).toBe(win.end.getTime() + 1);
    }
  });
});
