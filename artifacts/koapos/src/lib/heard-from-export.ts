import { csvRow, dl } from "./contacts-export";
import {
  HEARD_FROM_METRICS,
  HEARD_FROM_PERIODS,
  type HeardFromAnalytics,
  type HeardFromMetric,
  type HeardFromPeriod,
} from "./heard-from-analytics";

function periodLabel(period: HeardFromPeriod): string {
  return HEARD_FROM_PERIODS.find((p) => p.value === period)?.label ?? "All time";
}

function metricLabel(metric: HeardFromMetric): string {
  return HEARD_FROM_METRICS.find((m) => m.value === metric)?.label ?? "By customers";
}

function periodSlug(period: HeardFromPeriod): string {
  return periodLabel(period).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function heardFromCsvFilename(period: HeardFromPeriod): string {
  return `heard-from-${periodSlug(period)}.csv`;
}

export function heardFromXlsxFilename(period: HeardFromPeriod): string {
  return `heard-from-${periodSlug(period)}.xlsx`;
}

function money(n: number): string {
  return n.toFixed(2);
}

export function exportHeardFromCSV(
  analytics: HeardFromAnalytics,
  period: HeardFromPeriod,
  filename = heardFromCsvFilename(period),
) {
  const { breakdown, comparison, trend, windowTotal, windowRevenue, metric } = analytics;
  const hasComparison = comparison !== null;
  const isRevenue = metric === "revenue";
  const denom = (isRevenue ? windowRevenue : windowTotal) || 1;
  const rows: string[] = [];

  rows.push(csvRow(["KoaPOS — Heard From Breakdown"]));
  rows.push(csvRow(["Period", periodLabel(period)]));
  rows.push(csvRow(["View", metricLabel(metric)]));
  rows.push(csvRow(["Generated", new Date().toLocaleString()]));
  rows.push(csvRow(["Customers in window", windowTotal]));
  rows.push(csvRow(["Revenue in window", money(windowRevenue)]));
  rows.push("");

  // Per-source totals for the selected window. Both customers and revenue are
  // always included; "Share %" reflects the selected view.
  rows.push(csvRow(["Per-source totals"]));
  const totalsHeader = ["Source", "Customers", "Total spent", "Avg spend", `Share % (${metricLabel(metric).toLowerCase()})`];
  if (hasComparison) {
    totalsHeader.push(isRevenue ? "Previous spend" : "Previous customers", "Change");
  }
  rows.push(csvRow(totalsHeader));
  for (const s of breakdown) {
    const share = Math.round(((isRevenue ? s.revenue : s.customers) / denom) * 100);
    const cells: (string | number)[] = [s.name, s.customers, money(s.revenue), money(s.avgSpend), share];
    if (hasComparison) {
      const cmp = comparison?.find((c) => c.name === s.name);
      const prev = cmp?.previous ?? 0;
      const delta = cmp ? cmp.delta : 0;
      cells.push(isRevenue ? money(prev) : prev, isRevenue ? money(delta) : delta);
    }
    rows.push(csvRow(cells));
  }
  rows.push("");

  // Per-time-bucket trend rows (values in the selected view).
  rows.push(csvRow([`Trend over time (${metricLabel(metric).toLowerCase()})`]));
  rows.push(csvRow(["Period", ...trend.sources, "Total"]));
  for (const point of trend.data) {
    const counts = trend.sources.map((src) => (point[src] as number) ?? 0);
    const total = counts.reduce((sum, n) => sum + n, 0);
    const cells = isRevenue
      ? [point.label as string, ...counts.map(money), money(total)]
      : [point.label as string, ...counts, total];
    rows.push(csvRow(cells));
  }

  dl(filename, rows.join("\n"), "text/csv;charset=utf-8");
}

// ─── XLSX (.xlsx) ─────────────────────────────────────────────────────────────
// Native spreadsheet with styled headers and separate tabs for per-source totals
// and the per-time-bucket trend. Opens cleanly in Excel / Google Sheets.

const HEADER_FILL = "FFEFF6FF"; // light blue
const TITLE_FONT = { bold: true, size: 14, color: { argb: "FF1E3A8A" } } as const;
const HEADER_FONT = { bold: true, color: { argb: "FF1E3A8A" } } as const;

export async function exportHeardFromXLSX(
  analytics: HeardFromAnalytics,
  period: HeardFromPeriod,
  filename = heardFromXlsxFilename(period),
) {
  const ExcelJS = (await import("exceljs")).default;
  const { breakdown, comparison, trend, windowTotal, windowRevenue, metric } = analytics;
  const hasComparison = comparison !== null;
  const isRevenue = metric === "revenue";
  const denom = (isRevenue ? windowRevenue : windowTotal) || 1;

  const wb = new ExcelJS.Workbook();
  wb.creator = "KoaPOS";
  wb.created = new Date();

  const styleHeaderRow = (row: import("exceljs").Row) => {
    row.eachCell((cell) => {
      cell.font = HEADER_FONT;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFBFDBFE" } } };
    });
  };

  // ── Sheet 1: Per-source totals ──────────────────────────────────────────────
  const totals = wb.addWorksheet("Per-source totals");

  const titleRow = totals.addRow(["KoaPOS — Heard From Breakdown"]);
  titleRow.getCell(1).font = TITLE_FONT;
  totals.addRow(["Period", periodLabel(period)]);
  totals.addRow(["View", metricLabel(metric)]);
  totals.addRow(["Generated", new Date().toLocaleString()]);
  totals.addRow(["Customers in window", windowTotal]);
  totals.addRow(["Revenue in window", windowRevenue]).getCell(2).numFmt = '"$"#,##0.00';
  totals.addRow([]);

  const totalsHeaderCells = ["Source", "Customers", "Total spent", "Avg spend", "Share %"];
  if (hasComparison) {
    totalsHeaderCells.push(isRevenue ? "Previous spend" : "Previous customers", "Change");
  }
  styleHeaderRow(totals.addRow(totalsHeaderCells));

  for (const s of breakdown) {
    const share = Math.round(((isRevenue ? s.revenue : s.customers) / denom) * 100);
    const cells: (string | number)[] = [s.name, s.customers, s.revenue, s.avgSpend, share / 100];
    if (hasComparison) {
      const cmp = comparison?.find((c) => c.name === s.name);
      cells.push(cmp?.previous ?? 0, cmp ? cmp.delta : 0);
    }
    const row = totals.addRow(cells);
    row.getCell(3).numFmt = '"$"#,##0.00'; // Total spent
    row.getCell(4).numFmt = '"$"#,##0.00'; // Avg spend
    row.getCell(5).numFmt = "0%";          // Share %
    if (hasComparison && isRevenue) {
      row.getCell(6).numFmt = '"$"#,##0.00';
      row.getCell(7).numFmt = '"$"#,##0.00';
    }
  }

  totals.columns.forEach((col, i) => {
    col.width = i === 0 ? 28 : 16;
  });

  // ── Sheet 2: Trend over time ────────────────────────────────────────────────
  const trendSheet = wb.addWorksheet("Trend over time");
  styleHeaderRow(trendSheet.addRow(["Period", ...trend.sources, "Total"]));

  for (const point of trend.data) {
    const counts = trend.sources.map((src) => (point[src] as number) ?? 0);
    const total = counts.reduce((sum, n) => sum + n, 0);
    const row = trendSheet.addRow([point.label as string, ...counts, total]);
    if (isRevenue) {
      row.eachCell((cell, col) => {
        if (col > 1) cell.numFmt = '"$"#,##0.00';
      });
    }
  }

  trendSheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 16 : 14;
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
