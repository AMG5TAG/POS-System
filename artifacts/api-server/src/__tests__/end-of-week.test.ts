import { describe, it, expect } from "vitest";
import {
  defaultWeekRange, shiftWeek, daysInRange, groupByBanking, computeDeposit,
  shiftHours, computeWages, computeSuper, mergeStaffCosts, sumStaffCosts,
  mergeCashPurchases, sumCashPurchases, staffCostTotal,
  type StaffCostRow, type CashPurchase,
} from "../lib/end-of-week";

/**
 * End of Week — the money rules behind the weekly banking sheet.
 *
 * These are the calculations a merchant reconciles a cash drawer against and
 * carries to the bank, so each test below pins a decision that would otherwise
 * be easy to "simplify" into a wrong deposit.
 */

describe("defaultWeekRange", () => {
  it("defaults to the last complete Friday → Thursday week", () => {
    // Saturday 2026-09-05.
    const r = defaultWeekRange(new Date("2026-09-05T09:00:00Z"));
    expect(r).toEqual({ startDate: "2026-08-28", endDate: "2026-09-03" });
    expect(new Date(`${r.startDate}T00:00:00Z`).getUTCDay()).toBe(5); // Friday
    expect(new Date(`${r.endDate}T00:00:00Z`).getUTCDay()).toBe(4);   // Thursday
  });

  it("does not offer the week ending today — today's trading is not over", () => {
    // Thursday 2026-09-03 is itself a week-end day.
    const r = defaultWeekRange(new Date("2026-09-03T09:00:00Z"));
    expect(r.endDate).toBe("2026-08-27");
    expect(r.startDate).toBe("2026-08-21");
  });

  it("honours a different week-end day", () => {
    const r = defaultWeekRange(new Date("2026-09-05T09:00:00Z"), "sunday");
    expect(r).toEqual({ startDate: "2026-08-24", endDate: "2026-08-30" });
  });

  it("always spans exactly seven days", () => {
    for (const day of ["monday", "thursday", "saturday"] as const) {
      const r = defaultWeekRange(new Date("2026-09-05T09:00:00Z"), day);
      expect(daysInRange(r.startDate, r.endDate)).toBe(7);
    }
  });
});

describe("shiftWeek", () => {
  it("steps back and forward by the length of the range, not a fixed 7 days", () => {
    // A merchant who widened the range to a fortnight steps by a fortnight.
    expect(shiftWeek("2026-08-21", "2026-09-03", -1)).toEqual({ startDate: "2026-08-07", endDate: "2026-08-20" });
    expect(shiftWeek("2026-08-28", "2026-09-03", 1)).toEqual({ startDate: "2026-09-04", endDate: "2026-09-10" });
  });
});

describe("groupByBanking", () => {
  it("splits takings into the buckets a deposit cares about", () => {
    const g = groupByBanking([
      { method: "cash", count: 10, total: 500 },
      { method: "eftpos", count: 20, total: 1200 },
      { method: "card", count: 3, total: 300 },
      { method: "direct_deposit", count: 1, total: 250 },
      { method: "gift_card", count: 2, total: 60 },
      { method: "crypto", count: 1, total: 40 },
    ]);
    expect(g).toEqual({ cash: 500, eftpos: 1500, directDeposit: 250, nonBanking: 60, other: 40 });
  });

  it("drops 'split' rather than bucketing it — its legs are already counted", () => {
    // A split sale is recorded leg by leg. Counting the parent as well would
    // bank the same money twice.
    const g = groupByBanking([
      { method: "cash", count: 1, total: 50 },
      { method: "eftpos", count: 1, total: 50 },
      { method: "split", count: 1, total: 100 },
    ]);
    expect(g.other).toBe(0);
    expect(g.cash + g.eftpos).toBe(100);
  });

  it("keeps gift cards and store credit out of banking", () => {
    // Redeeming a gift card moves no new money — it settles a liability that
    // was paid for when the card was sold.
    const g = groupByBanking([
      { method: "gift_card", count: 1, total: 100 },
      { method: "store_credit", count: 1, total: 25 },
      { method: "loyalty", count: 1, total: 5 },
    ]);
    expect(g.nonBanking).toBe(130);
    expect(g.cash).toBe(0);
    expect(g.eftpos).toBe(0);
  });
});

describe("computeDeposit", () => {
  const base = {
    cashTakings: 1000, cashRefunds: 0, drawerCashIn: 0,
    cashPurchasesTotal: 0, floatRetained: 200, cashCounted: null,
  };

  it("banks the takings less the float held back", () => {
    const d = computeDeposit(base);
    expect(d.expectedCash).toBe(1000);
    expect(d.expectedInTill).toBe(1200);
    expect(d.cashToBank).toBe(1000);
    expect(d.countVariance).toBeNull();
    expect(d.fromCount).toBe(false);
  });

  it("takes cash refunds and till purchases out of the deposit", () => {
    const d = computeDeposit({ ...base, cashRefunds: 150, cashPurchasesTotal: 80, drawerCashIn: 30 });
    expect(d.expectedCash).toBe(800);   // 1000 − 150 + 30 − 80
    expect(d.cashToBank).toBe(800);
  });

  it("banks the counted cash, not the predicted figure", () => {
    // The drawer was counted at $1,150 against an expected $1,200. What goes to
    // the bank is what is actually there, less the float.
    const d = computeDeposit({ ...base, cashCounted: 1150 });
    expect(d.countVariance).toBe(-50);
    expect(d.cashToBank).toBe(950);
    expect(d.fromCount).toBe(true);
  });

  it("does not deduct till purchases twice when the drawer was counted", () => {
    // The $80 already left the drawer, so a count of $1,120 has it gone. The
    // deposit is count − float; subtracting the purchases again would short the
    // banking by $80 every week.
    const d = computeDeposit({ ...base, cashPurchasesTotal: 80, cashCounted: 1120 });
    expect(d.expectedInTill).toBe(1120);
    expect(d.countVariance).toBe(0);
    expect(d.cashToBank).toBe(920);
  });

  it("reports no variance when nothing was counted", () => {
    // A zero here would read as "counted, and it balanced" — which is a lie
    // about a drawer nobody opened.
    expect(computeDeposit({ ...base, cashCounted: null }).countVariance).toBeNull();
  });

  it("treats a counted zero as a real count", () => {
    const d = computeDeposit({ ...base, cashTakings: 0, floatRetained: 0, cashCounted: 0 });
    expect(d.countVariance).toBe(0);
    expect(d.fromCount).toBe(true);
  });
});

describe("shiftHours", () => {
  it("measures an ordinary shift", () => {
    expect(shiftHours("09:00", "17:30")).toBe(8.5);
  });

  it("wraps a shift that runs past midnight", () => {
    expect(shiftHours("22:00", "02:00")).toBe(4);
  });

  it("counts an unfinished shift as zero rather than guessing", () => {
    expect(shiftHours("09:00", null)).toBe(0);
    expect(shiftHours("09:00", "")).toBe(0);
  });

  it("ignores unparseable clock strings", () => {
    expect(shiftHours("lunchtime", "17:00")).toBe(0);
    expect(shiftHours("09:00", "99:99")).toBe(0);
  });
});

describe("wages", () => {
  it("applies casual loading on top of the base rate", () => {
    expect(computeWages(10, 30, 25)).toBe(375);
  });

  it("is zero without a rate on the staff record", () => {
    expect(computeWages(38, 0, 25)).toBe(0);
  });

  it("puts super on the loaded wage", () => {
    expect(computeSuper(375, 12)).toBe(45);
  });
});

describe("mergeStaffCosts", () => {
  const computed: StaffCostRow[] = [
    { staffId: 1, name: "Alex", role: "owner", hours: 38, wages: 1140, tax: 0, superannuation: 136.8, bonus: 0, extras: 0, kpi: 0, edited: false },
    { staffId: 2, name: "Jamie", role: "cashier", hours: 20, wages: 500, tax: 0, superannuation: 60, bonus: 0, extras: 0, kpi: 100, edited: false },
  ];

  it("keeps what the merchant typed over a later recompute", () => {
    // The PAYG figure is the accountant's, not something the app can derive.
    // Recomputing must never wipe it.
    const merged = mergeStaffCosts(computed, [{ staffId: 2, tax: 90, bonus: 50 }]);
    const jamie = merged.find((r) => r.staffId === 2)!;
    expect(jamie.tax).toBe(90);
    expect(jamie.bonus).toBe(50);
    expect(jamie.edited).toBe(true);
    expect(merged.find((r) => r.staffId === 1)!.edited).toBe(false);
  });

  it("refreshes hours from the timesheets even on an edited row", () => {
    const merged = mergeStaffCosts(computed, [{ staffId: 1, hours: 5, tax: 200 }]);
    expect(merged.find((r) => r.staffId === 1)!.hours).toBe(38);
  });

  it("keeps a saved row for a staff member who has since left", () => {
    // Their wage was still a cost of that week.
    const merged = mergeStaffCosts(computed, [{ staffId: 9, name: "Sam", wages: 400, superannuation: 48 }]);
    const sam = merged.find((r) => r.staffId === 9)!;
    expect(sam.name).toBe("Sam");
    expect(sam.wages).toBe(400);
  });

  it("lets a saved zero override a computed figure", () => {
    // "0" is an answer — an unpaid week, a working owner — not a missing value.
    const merged = mergeStaffCosts(computed, [{ staffId: 2, kpi: 0 }]);
    expect(merged.find((r) => r.staffId === 2)!.kpi).toBe(0);
  });
});

describe("staff cost totals", () => {
  const row = (o: Partial<StaffCostRow>): StaffCostRow => ({
    staffId: 1, name: "x", role: "", hours: 0, wages: 0, tax: 0,
    superannuation: 0, bonus: 0, extras: 0, kpi: 0, edited: false, ...o,
  });

  it("excludes PAYG by default — it is withheld from the wage, not added to it", () => {
    // Counting tax on top of wages would inflate the wage bill by the withheld
    // amount, which the business never pays twice.
    expect(staffCostTotal(row({ wages: 1000, tax: 250, superannuation: 120 }))).toBe(1120);
  });

  it("adds PAYG when the merchant's convention says to", () => {
    // sales_settings.eowIncludeTaxInStaffCost — for shops budgeting on the gross
    // figure, or remitting PAYG as a separate outgoing they want to see.
    expect(staffCostTotal(row({ wages: 1000, tax: 250, superannuation: 120 }), true)).toBe(1370);
  });

  it("changes nothing but the total when PAYG is counted", () => {
    const r = row({ wages: 1000, tax: 250, superannuation: 120, bonus: 100, extras: 25, kpi: 200 });
    expect(staffCostTotal(r, true) - staffCostTotal(r, false)).toBe(250);
  });

  it("adds bonuses, extras and KPI money to the cost", () => {
    expect(staffCostTotal(row({ wages: 1000, superannuation: 120, bonus: 100, extras: 25, kpi: 200 }))).toBe(1445);
  });

  it("sums a whole roster", () => {
    const t = sumStaffCosts([
      row({ hours: 38, wages: 1000, tax: 250, superannuation: 120 }),
      row({ hours: 20, wages: 500, tax: 90, superannuation: 60, kpi: 100 }),
    ]);
    expect(t.hours).toBe(58);
    expect(t.wages).toBe(1500);
    expect(t.tax).toBe(340);
    expect(t.total).toBe(1780);
  });

  it("still reports PAYG on its own line when it is counted in the total", () => {
    // The tax column is information either way — the option only moves whether
    // it lands in `total`, so a merchant can always see what was withheld.
    const rows = [
      row({ hours: 38, wages: 1000, tax: 250, superannuation: 120 }),
      row({ hours: 20, wages: 500, tax: 90, superannuation: 60, kpi: 100 }),
    ];
    const t = sumStaffCosts(rows, true);
    expect(t.tax).toBe(340);
    expect(t.total).toBe(2120);
    expect(t.total - sumStaffCosts(rows, false).total).toBe(t.tax);
  });
});

describe("mergeCashPurchases", () => {
  const drawer = [
    { id: 7, amount: 42.5, note: "Milk + coffee", shiftDate: "2026-08-29" },
    { id: 9, amount: 15, note: null, shiftDate: "2026-08-31" },
  ];

  it("pulls the week's till cash-outs in the first time the week is opened", () => {
    const rows = mergeCashPurchases([], drawer, true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "drawer:7", description: "Milk + coffee", amount: 42.5, source: "drawer" });
    expect(rows[1].description).toBe("Till cash-out");
    expect(sumCashPurchases(rows)).toBe(57.5);
  });

  it("does not re-add a drawer line the merchant deleted", () => {
    // After the first open the saved row is the record of what they chose to
    // keep — re-pulling would resurrect deletions on every page load.
    const saved: CashPurchase[] = [
      { id: "drawer:7", description: "Milk + coffee", amount: 42.5, source: "drawer" },
    ];
    const rows = mergeCashPurchases(saved, drawer, false);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("drawer:7");
  });

  it("leaves manual lines alone", () => {
    const saved: CashPurchase[] = [
      { id: "m1", description: "Petrol", amount: 60, source: "manual" },
    ];
    const rows = mergeCashPurchases(saved, [], false);
    expect(rows).toEqual(saved);
    expect(sumCashPurchases(rows)).toBe(60);
  });

  it("ignores a non-numeric amount rather than producing NaN banking", () => {
    const rows: CashPurchase[] = [
      { id: "m1", description: "Petrol", amount: 60, source: "manual" },
      { id: "m2", description: "Broken", amount: Number.NaN, source: "manual" },
    ];
    expect(sumCashPurchases(rows)).toBe(60);
  });
});
