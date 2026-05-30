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

export function heardFromPdfFilename(period: HeardFromPeriod): string {
  return `heard-from-${periodSlug(period)}.pdf`;
}

function money(n: number): string {
  return n.toFixed(2);
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
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

// ─── PDF ──────────────────────────────────────────────────────────────────────
// Print-ready A4 report with KoaPOS branding, per-source totals table, and
// trend over time. Uses jsPDF (already a project dependency) — no html2canvas
// needed, everything is drawn with vector primitives for crisp output.

const C = {
  primary:  [59,  130, 246] as [number, number, number],
  dark:     [17,  24,  39]  as [number, number, number],
  mid:      [75,  85,  99]  as [number, number, number],
  light:    [156, 163, 175] as [number, number, number],
  border:   [229, 231, 235] as [number, number, number],
  bg:       [249, 250, 251] as [number, number, number],
  white:    [255, 255, 255] as [number, number, number],
  green:    [22,  163, 74]  as [number, number, number],
  greenBg:  [220, 252, 231] as [number, number, number],
  red:      [220, 38,  38]  as [number, number, number],
  redBg:    [254, 226, 226] as [number, number, number],
};

const PAGE_W   = 210;
const PAGE_H   = 297;
const ML       = 14;
const MR       = 14;
const CONTENT_W = PAGE_W - ML - MR;

export async function exportHeardFromPDF(
  analytics: HeardFromAnalytics,
  period: HeardFromPeriod,
  filename = heardFromPdfFilename(period),
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const { breakdown, comparison, trend, windowTotal, windowRevenue, metric } = analytics;
  const hasComparison = comparison !== null;
  const isRevenue = metric === "revenue";
  const denom = (isRevenue ? windowRevenue : windowTotal) || 1;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  /* ── Utilities ──────────────────────────────────────────────────────────── */

  function checkPage(needed = 10): void {
    if (y + needed > PAGE_H - 16) {
      doc.addPage();
      y = 16;
    }
  }

  function hRule(color = C.border, x1 = ML, x2 = ML + CONTENT_W): void {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.2);
    doc.line(x1, y, x2, y);
  }

  function sectionHeading(title: string): void {
    checkPage(14);
    y += 6;
    doc.setFillColor(...C.primary);
    doc.roundedRect(ML, y, CONTENT_W, 7, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.text(title.toUpperCase(), ML + 3.5, y + 4.8);
    y += 9;
  }

  function pageFooter(pageNum: number, pageCount: number): void {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.light);
    doc.text(`KoaPOS — Heard From Breakdown  ·  ${periodLabel(period)}`, ML, PAGE_H - 8);
    const right = `Page ${pageNum} of ${pageCount}`;
    const rw = doc.getStringUnitWidth(right) * 7 * 0.352778;
    doc.text(right, PAGE_W - MR - rw, PAGE_H - 8);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(ML, PAGE_H - 11, ML + CONTENT_W, PAGE_H - 11);
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */

  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PAGE_W, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...C.white);
  doc.text("KoaPOS", ML, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Heard From Breakdown", ML, 19);

  // Period badge top-right
  const periodStr = periodLabel(period);
  const metricStr = metricLabel(metric);
  const exportDate = new Date().toLocaleString("en-AU");

  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  const dateW = doc.getStringUnitWidth(exportDate) * 8 * 0.352778;
  doc.text(exportDate, PAGE_W - MR - dateW, 12);
  const periodLineStr = `${periodStr}  ·  ${metricStr}`;
  const periodW = doc.getStringUnitWidth(periodLineStr) * 8 * 0.352778;
  doc.text(periodLineStr, PAGE_W - MR - periodW, 19);

  y = 34;

  /* ── Summary KPIs ───────────────────────────────────────────────────────── */

  doc.setFillColor(...C.bg);
  doc.roundedRect(ML, y, CONTENT_W, 18, 2, 2, "F");

  const kpiBoxW = CONTENT_W / 2;

  // Customers in window
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.mid);
  doc.text("Customers in window", ML + 6, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C.dark);
  doc.text(String(windowTotal), ML + 6, y + 14);

  // Vertical divider
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML + kpiBoxW, y + 3, ML + kpiBoxW, y + 15);

  // Revenue in window
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.mid);
  doc.text("Revenue in window", ML + kpiBoxW + 6, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C.dark);
  doc.text(fmtMoney(windowRevenue), ML + kpiBoxW + 6, y + 14);

  y += 22;

  /* ── Per-source totals table ─────────────────────────────────────────────── */

  sectionHeading("Per-source totals");

  // Column layout
  const COL = {
    source:    ML,
    customers: ML + 52,
    revenue:   ML + 82,
    avg:       ML + 114,
    share:     ML + 144,
    prev:      ML + 157,
    change:    ML + 170,
  };

  // Table header row
  checkPage(10);
  doc.setFillColor(...C.primary);
  doc.roundedRect(ML, y, CONTENT_W, 6.5, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...C.white);
  doc.text("Source",      COL.source    + 1, y + 4.3);
  doc.text("Customers",   COL.customers + 1, y + 4.3);
  doc.text("Total spent", COL.revenue   + 1, y + 4.3);
  doc.text("Avg spend",   COL.avg       + 1, y + 4.3);
  doc.text("Share %",     COL.share     + 1, y + 4.3);
  if (hasComparison) {
    doc.text(isRevenue ? "Prev spend" : "Prev count", COL.prev   + 1, y + 4.3);
    doc.text("Change",                                COL.change + 1, y + 4.3);
  }
  y += 6.5;

  let rowBg = false;
  for (const s of breakdown) {
    checkPage(8);
    const share = Math.round(((isRevenue ? s.revenue : s.customers) / denom) * 100);

    if (rowBg) {
      doc.setFillColor(...C.bg);
      doc.rect(ML, y, CONTENT_W, 7, "F");
    }
    rowBg = !rowBg;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.dark);

    // Source name — truncate if needed
    const srcLines = doc.splitTextToSize(s.name, 48) as string[];
    doc.text(srcLines[0] ?? s.name, COL.source + 1, y + 4.5);

    doc.text(String(s.customers), COL.customers + 1, y + 4.5);
    doc.text(fmtMoney(s.revenue), COL.revenue   + 1, y + 4.5);
    doc.text(fmtMoney(s.avgSpend), COL.avg      + 1, y + 4.5);
    doc.text(`${share}%`,          COL.share    + 1, y + 4.5);

    if (hasComparison) {
      const cmp = comparison?.find((c) => c.name === s.name);
      const prev = cmp?.previous ?? 0;
      const delta = cmp ? cmp.delta : 0;
      doc.text(isRevenue ? fmtMoney(prev) : String(prev), COL.prev   + 1, y + 4.5);

      // Colour-coded delta
      if (delta > 0) {
        doc.setTextColor(...C.green);
        doc.text(`+${isRevenue ? fmtMoney(delta) : delta}`, COL.change + 1, y + 4.5);
      } else if (delta < 0) {
        doc.setTextColor(...C.red);
        doc.text(isRevenue ? fmtMoney(delta) : String(delta), COL.change + 1, y + 4.5);
      } else {
        doc.setTextColor(...C.mid);
        doc.text("—", COL.change + 1, y + 4.5);
      }
      doc.setTextColor(...C.dark);
    }

    // Row separator
    hRule(C.border, ML, ML + CONTENT_W);
    y += 7;
  }

  // Summary row
  checkPage(10);
  y += 2;
  const totalCustomers = breakdown.reduce((s, r) => s + r.customers, 0);
  const totalRevenue   = breakdown.reduce((s, r) => s + r.revenue,   0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.mid);
  doc.text(`${breakdown.length} source${breakdown.length !== 1 ? "s" : ""}  ·  ${totalCustomers} customer${totalCustomers !== 1 ? "s" : ""}  ·  ${fmtMoney(totalRevenue)} total revenue`, ML + 1, y + 4);
  y += 8;

  /* ── Trend over time table ───────────────────────────────────────────────── */

  if (trend.sources.length > 0 && trend.data.length > 0) {
    sectionHeading(`Trend over time  (${metricStr.toLowerCase()})`);

    // Dynamic column widths: first col wider, rest split evenly
    const sourceCols = trend.sources.length + 1; // +1 for Total
    const labelColW = 28;
    const remainW = CONTENT_W - labelColW;
    const dataColW = Math.min(22, remainW / sourceCols);

    // Header
    checkPage(10);
    doc.setFillColor(...C.primary);
    doc.roundedRect(ML, y, CONTENT_W, 6.5, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text("Period", ML + 1, y + 4.3);

    trend.sources.forEach((src, i) => {
      const x = ML + labelColW + i * dataColW;
      const truncSrc = doc.splitTextToSize(src, dataColW - 1) as string[];
      doc.text(truncSrc[0] ?? src, x + 1, y + 4.3);
    });
    const totalX = ML + labelColW + trend.sources.length * dataColW;
    doc.text("Total", totalX + 1, y + 4.3);
    y += 6.5;

    let trendRowBg = false;
    for (const point of trend.data) {
      checkPage(7);
      const counts = trend.sources.map((src) => (point[src] as number) ?? 0);
      const total = counts.reduce((sum, n) => sum + n, 0);

      if (trendRowBg) {
        doc.setFillColor(...C.bg);
        doc.rect(ML, y, CONTENT_W, 6.5, "F");
      }
      trendRowBg = !trendRowBg;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...C.dark);
      doc.text(String(point.label), ML + 1, y + 4.2);

      counts.forEach((count, i) => {
        const x = ML + labelColW + i * dataColW;
        doc.text(isRevenue ? fmtMoney(count) : String(count), x + 1, y + 4.2);
      });
      doc.setFont("helvetica", "bold");
      doc.text(isRevenue ? fmtMoney(total) : String(total), totalX + 1, y + 4.2);
      doc.setFont("helvetica", "normal");

      hRule(C.border, ML, ML + CONTENT_W);
      y += 6.5;
    }
  }

  /* ── Footer on every page ────────────────────────────────────────────────── */

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    pageFooter(i, pageCount);
  }

  doc.save(filename);
}
