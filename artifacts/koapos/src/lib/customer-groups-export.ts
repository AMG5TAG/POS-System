import { csvRow, dl } from "./contacts-export";
import type { CustomerGroup } from "./customer-settings";

export interface CustomerGroupStat {
  group: CustomerGroup;
  count: number;
  pct: number;
}

function buildStats(groups: CustomerGroup[], groupCounts: Record<string, number>, total: number): CustomerGroupStat[] {
  return groups.map((g) => {
    const count = groupCounts[g.name] ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return { group: g, count, pct };
  });
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export function exportCustomerGroupsCSV(
  groups: CustomerGroup[],
  groupCounts: Record<string, number>,
  total: number,
  filename = "customer-groups.csv",
): void {
  const stats = buildStats(groups, groupCounts, total);
  const rows: string[] = [];

  rows.push(csvRow(["KoaPOS — Customer Groups"]));
  rows.push(csvRow(["Generated", new Date().toLocaleString()]));
  rows.push(csvRow(["Total customers", total]));
  rows.push("");

  rows.push(csvRow(["Group", "Description", "Customers", "Share %"]));
  for (const { group, count, pct } of stats) {
    rows.push(csvRow([group.name, group.description, count, pct]));
  }

  dl(filename, rows.join("\n"), "text/csv;charset=utf-8");
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────

const HEADER_FILL = "FFEFF6FF";
const TITLE_FONT  = { bold: true, size: 14, color: { argb: "FF1E3A8A" } } as const;
const HEADER_FONT = { bold: true, color: { argb: "FF1E3A8A" } } as const;

export async function exportCustomerGroupsXLSX(
  groups: CustomerGroup[],
  groupCounts: Record<string, number>,
  total: number,
  filename = "customer-groups.xlsx",
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const stats = buildStats(groups, groupCounts, total);

  const wb = new ExcelJS.Workbook();
  wb.creator = "KoaPOS";
  wb.created = new Date();

  const ws = wb.addWorksheet("Customer Groups");

  const titleRow = ws.addRow(["KoaPOS — Customer Groups"]);
  titleRow.getCell(1).font = TITLE_FONT;
  ws.addRow(["Generated", new Date().toLocaleString()]);
  ws.addRow(["Total customers", total]);
  ws.addRow([]);

  const headerRow = ws.addRow(["Group", "Description", "Customers", "Share %"]);
  headerRow.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFDBFE" } } };
  });

  for (const { group, count, pct } of stats) {
    const row = ws.addRow([group.name, group.description, count, pct / 100]);
    row.getCell(4).numFmt = "0%";
  }

  ws.columns = [
    { width: 22 },
    { width: 36 },
    { width: 14 },
    { width: 12 },
  ];

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

const C = {
  primary: [59,  130, 246] as [number, number, number],
  dark:    [17,  24,  39]  as [number, number, number],
  mid:     [75,  85,  99]  as [number, number, number],
  light:   [156, 163, 175] as [number, number, number],
  border:  [229, 231, 235] as [number, number, number],
  bg:      [249, 250, 251] as [number, number, number],
  white:   [255, 255, 255] as [number, number, number],
};

const PAGE_W    = 210;
const PAGE_H    = 297;
const ML        = 14;
const MR        = 14;
const CONTENT_W = PAGE_W - ML - MR;

export async function exportCustomerGroupsPDF(
  groups: CustomerGroup[],
  groupCounts: Record<string, number>,
  total: number,
  filename = "customer-groups.pdf",
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const stats = buildStats(groups, groupCounts, total);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  function checkPage(needed = 10): void {
    if (y + needed > PAGE_H - 16) {
      doc.addPage();
      y = 16;
    }
  }

  function hRule(): void {
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(ML, y, ML + CONTENT_W, y);
  }

  function pageFooter(pageNum: number, pageCount: number): void {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.light);
    doc.text("KoaPOS — Customer Groups", ML, PAGE_H - 8);
    const right = `Page ${pageNum} of ${pageCount}`;
    const rw = doc.getStringUnitWidth(right) * 7 * 0.352778;
    doc.text(right, PAGE_W - MR - rw, PAGE_H - 8);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(ML, PAGE_H - 11, ML + CONTENT_W, PAGE_H - 11);
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PAGE_W, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...C.white);
  doc.text("KoaPOS", ML, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Customer Groups", ML, 19);

  const exportDate = new Date().toLocaleString("en-AU");
  doc.setFontSize(8);
  const dateW = doc.getStringUnitWidth(exportDate) * 8 * 0.352778;
  doc.text(exportDate, PAGE_W - MR - dateW, 12);

  const totalStr = `${total} customer${total !== 1 ? "s" : ""}  ·  ${groups.length} group${groups.length !== 1 ? "s" : ""}`;
  const totalW = doc.getStringUnitWidth(totalStr) * 8 * 0.352778;
  doc.text(totalStr, PAGE_W - MR - totalW, 19);

  y = 34;

  // ── Table header ────────────────────────────────────────────────────────────

  const COL = {
    name:  ML,
    desc:  ML + 40,
    count: ML + 130,
    pct:   ML + 154,
  };

  checkPage(10);
  doc.setFillColor(...C.primary);
  doc.roundedRect(ML, y, CONTENT_W, 6.5, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...C.white);
  doc.text("Group",       COL.name  + 1, y + 4.3);
  doc.text("Description", COL.desc  + 1, y + 4.3);
  doc.text("Customers",   COL.count + 1, y + 4.3);
  doc.text("Share %",     COL.pct   + 1, y + 4.3);
  y += 6.5;

  // ── Rows ────────────────────────────────────────────────────────────────────

  let rowBg = false;
  for (const { group, count, pct } of stats) {
    checkPage(8);

    if (rowBg) {
      doc.setFillColor(...C.bg);
      doc.rect(ML, y, CONTENT_W, 7, "F");
    }
    rowBg = !rowBg;

    // Group colour swatch
    const hex = group.color.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g2 = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    doc.setFillColor(r, g2, b);
    doc.roundedRect(COL.name + 1, y + 2, 3, 3, 0.5, 0.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.dark);
    doc.text(group.name, COL.name + 6, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.mid);
    const descLines = doc.splitTextToSize(group.description || "—", 88) as string[];
    doc.text(descLines[0] ?? "—", COL.desc + 1, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.dark);
    doc.text(String(count), COL.count + 1, y + 4.5);
    doc.text(`${pct}%`,     COL.pct   + 1, y + 4.5);

    hRule();
    y += 7;
  }

  // ── Footer ──────────────────────────────────────────────────────────────────

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    pageFooter(i, pageCount);
  }

  doc.save(filename);
}
