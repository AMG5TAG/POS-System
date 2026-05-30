import { csvRow, dl } from "./contacts-export";
import {
  HEARD_FROM_PERIODS,
  type HeardFromAnalytics,
  type HeardFromPeriod,
} from "./heard-from-analytics";

function periodLabel(period: HeardFromPeriod): string {
  return HEARD_FROM_PERIODS.find((p) => p.value === period)?.label ?? "All time";
}

function periodSlug(period: HeardFromPeriod): string {
  return periodLabel(period).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function heardFromCsvFilename(period: HeardFromPeriod): string {
  return `heard-from-${periodSlug(period)}.csv`;
}

export function exportHeardFromCSV(
  analytics: HeardFromAnalytics,
  period: HeardFromPeriod,
  filename = heardFromCsvFilename(period),
) {
  const { breakdown, comparison, trend, windowTotal } = analytics;
  const hasComparison = comparison !== null;
  const denom = windowTotal || 1;
  const rows: string[] = [];

  rows.push(csvRow(["KoaPOS — Heard From Breakdown"]));
  rows.push(csvRow(["Period", periodLabel(period)]));
  rows.push(csvRow(["Generated", new Date().toLocaleString()]));
  rows.push(csvRow(["Customers in window", windowTotal]));
  rows.push("");

  // Per-source totals for the selected window.
  rows.push(csvRow(["Per-source totals"]));
  const totalsHeader = ["Source", "Customers", "Share %"];
  if (hasComparison) totalsHeader.push("Previous period", "Change");
  rows.push(csvRow(totalsHeader));
  for (const s of breakdown) {
    const pct = Math.round((s.value / denom) * 100);
    const cells: (string | number)[] = [s.name, s.value, pct];
    if (hasComparison) {
      const cmp = comparison?.find((c) => c.name === s.name);
      cells.push(cmp?.previous ?? 0, cmp ? cmp.delta : 0);
    }
    rows.push(csvRow(cells));
  }
  rows.push("");

  // Per-time-bucket trend rows.
  rows.push(csvRow(["Trend over time"]));
  rows.push(csvRow(["Period", ...trend.sources, "Total"]));
  for (const point of trend.data) {
    const counts = trend.sources.map((src) => (point[src] as number) ?? 0);
    const total = counts.reduce((sum, n) => sum + n, 0);
    rows.push(csvRow([point.label as string, ...counts, total]));
  }

  dl(filename, rows.join("\n"), "text/csv;charset=utf-8");
}
