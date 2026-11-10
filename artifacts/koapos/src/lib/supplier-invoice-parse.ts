/**
 * Purchase Orders › Import supplier invoice — reads a supplier's PDF invoice
 * into lines and header fields. Pure (positions in, data out), so it is
 * tested against real invoices' text (`supplier-invoice-parse.test.ts`); the
 * PDF reading itself is `extractPdfText` below.
 *
 * Built on Leader Computers' tax invoice, but it reads by **column headings**,
 * not fixed positions, so other suppliers with a similar table should work:
 *
 *   Stock Code | Manuf Code | Description | Qty | Unit Price Excl. | Gross Excl. | GST | Total Inc.
 *
 *  - Stock Code is our SKU; Description the product name; Qty what was bought;
 *    Unit Price Excl. the ex-GST cost.
 *  - A row with no numbers continues the line above (Leader wraps long
 *    descriptions and stock codes onto a second row); "SN:" rows carry that
 *    line's serial numbers.
 *  - The invoice number (printed under the barcode, "Our Ref") becomes the PO
 *    number; "Customer Code" is our account with the supplier.
 */

export interface PdfTextItem { str: string; x: number; y: number; w: number }
export interface PdfPage { width: number; height: number; items: PdfTextItem[] }

export interface InvoiceLine {
  stockCode: string;
  manufCode: string;
  description: string;
  qty: number;
  unitEx: number;
  grossEx: number | null;
  gst: number | null;
  totalInc: number | null;
  serials: string[];
}

export interface ParsedInvoice {
  supplier: { name: string; abn: string; website: string };
  invoiceNumber: string;
  /** YYYY-MM-DD, or "" when none was found. */
  date: string;
  accountCode: string;
  orderNumber: string;
  lines: InvoiceLine[];
  totals: { gst: number | null; total: number | null };
  /** Things staff should look at before importing (sums that don't add up, …). */
  warnings: string[];
}

export class InvoiceParseError extends Error {}

type ColKey = "code" | "manuf" | "desc" | "qty" | "unit" | "gross" | "gst" | "total";
interface Col { key: ColKey; x: number; right: number; center: number }
interface Cell extends PdfTextItem { right: number; center: number }
type Row = { y: number; cells: Cell[] };

const clean = (s: string) => s.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
const NUM_RE = /^-?\$?\(?-?[\d,]*\.?\d+\)?$/;
const isNum = (s: string) => NUM_RE.test(s.replace(/\s/g, "")) && /\d/.test(s);
export function parseAmount(s: string): number | null {
  const t = s.replace(/[\s$,]/g, "");
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = parseFloat(t.replace(/[()-]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** Text items → rows, top to bottom, cells left to right. */
function toRows(page: PdfPage): Row[] {
  const cells: Cell[] = page.items
    .map((i) => ({ ...i, str: clean(i.str) }))
    .filter((i) => i.str)
    .map((i) => ({ ...i, right: i.x + i.w, center: i.x + i.w / 2 }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Row[] = [];
  for (const c of cells) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(c.y - r.y) <= 2.5) r.cells.push(c);
    else rows.push({ y: c.y, cells: [c] });
  }
  for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
  return rows;
}

const HEAD: Array<[ColKey, RegExp]> = [
  ["code", /^(stock|item|product|part)\s*(code|no\.?|number|#)$|^(code|sku)$/i],
  ["manuf", /^(manuf(acturer)?|mfr|mfg|vendor)\.?\s*(code|part|no\.?)?$|^mpn$/i],
  ["desc", /^(description|item description|product description)$/i],
  ["qty", /^(qty|quantity|qty\.? (shipped|supplied|invoiced))$/i],
  ["unit", /\bunit\b|^price( ex(cl)?\.?)?$/i],
  ["gross", /\b(gross|extended|ext\.?|line total ex|amount ex)\b/i],
  ["gst", /^(gst|tax)( amount)?$/i],
  ["total", /total|amount/i],
];

/** The table heading: a row with Description and Qty, its labels joined with the row above
 *  when they sit over the same column ("Unit Price" / "Excl."). */
function findHeader(rows: Row[]): { index: number; cols: Col[] } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const hasDesc = row.cells.some((c) => /^description$/i.test(c.str));
    const hasQty = row.cells.some((c) => /^(qty|quantity)$/i.test(c.str));
    if (!hasDesc || !hasQty) continue;
    const above = i > 0 && row.y - rows[i - 1]!.y < 14 ? rows[i - 1]! : null;
    const labelled = row.cells.map((c) => {
      const over = above?.cells.find((a) => a.right > c.x - 6 && a.x < c.right + 6);
      return { cell: c, label: clean(`${over?.str ?? ""} ${c.str}`) };
    });
    const cols: Col[] = [];
    for (const { cell, label } of labelled) {
      const hit = HEAD.find(([key, re]) => !cols.some((c) => c.key === key) && (re.test(label) || re.test(cell.str)));
      if (hit) cols.push({ key: hit[0], x: cell.x, right: cell.right, center: cell.center });
    }
    if (!cols.some((c) => c.key === "desc") || !cols.some((c) => c.key === "qty") || !cols.some((c) => c.key === "unit")) continue;
    cols.sort((a, b) => a.x - b.x);
    return { index: i, cols };
  }
  return null;
}

const FOOTER_RE = /^(payment terms|total value|sub ?total|gst:?|total:?|invoice total|amount due|balance due|freight total)\b/i;
const SERIAL_RE = /^(s\/?n|serial(s| no\.?| numbers?)?)\s*:?$/i;

/** Which text column a cell starts in. */
function textColumn(cols: Col[], cell: Cell): ColKey | null {
  const text = cols.filter((c) => c.key === "code" || c.key === "manuf" || c.key === "desc");
  const firstNum = cols.find((c) => !["code", "manuf", "desc"].includes(c.key));
  let best: ColKey | null = null;
  for (const c of text) if (cell.x >= c.x - 3) best = c.key;
  if (firstNum && cell.x >= firstNum.x - 3 && isNum(cell.str)) return null;
  return best;
}

/** Which number column a numeric cell belongs to: nearest heading by right edge. */
function numberColumn(cols: Col[], cell: Cell): ColKey | null {
  const nums = cols.filter((c) => !["code", "manuf", "desc"].includes(c.key));
  let best: Col | null = null;
  let dist = Infinity;
  for (const c of nums) {
    const d = Math.min(Math.abs(c.right - cell.right), Math.abs(c.center - cell.center));
    if (d < dist) { dist = d; best = c; }
  }
  return best && dist < 40 ? best.key : null;
}

function labelValue(rows: Row[], label: RegExp): string {
  for (const r of rows) {
    const i = r.cells.findIndex((c) => label.test(c.str));
    if (i < 0) continue;
    // "Label: value" in one cell…
    const inline = r.cells[i]!.str.replace(label, "").replace(/^[:\s]+/, "").trim();
    if (inline && !label.test(inline)) return inline;
    // …or the next cell to its right on the same row.
    const next = r.cells.slice(i + 1).find((c) => c.x > r.cells[i]!.right - 1 && c.x - r.cells[i]!.right < 200);
    if (next) return next.str;
  }
  return "";
}

function isoDate(s: string): string {
  const m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (!m) return "";
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  const mm = m[2]!.padStart(2, "0");
  const dd = m[1]!.padStart(2, "0");
  return Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31 ? `${y}-${mm}-${dd}` : "";
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function parseSupplierInvoice(pages: PdfPage[]): ParsedInvoice {
  const allRows = pages.map(toRows);
  const firstHeader = allRows.map(findHeader).find(Boolean);
  if (!firstHeader) {
    const anyText = pages.some((p) => p.items.some((i) => i.str.trim()));
    throw new InvoiceParseError(anyText
      ? "Couldn't find the invoice's item table (a heading row with Description, Qty and Unit Price)."
      : "This PDF has no text in it — it looks like a scan. Ask the supplier for the emailed PDF invoice.");
  }

  const lines: InvoiceLine[] = [];
  let gst: number | null = null;
  let total: number | null = null;
  const topRows: Row[] = [];

  allRows.forEach((rows, p) => {
    const header = findHeader(rows);
    if (p === 0) topRows.push(...rows.slice(0, header ? header.index : rows.length));
    if (!header) return;
    const { cols } = header;
    let current: InvoiceLine | null = null;
    let lastY = rows[header.index]!.y;
    let ended = false;

    for (const row of rows.slice(header.index + 1)) {
      const first = row.cells[0]!;
      if (FOOTER_RE.test(first.str) || row.cells.some((c) => /^(total value|invoice total|amount due|balance due)\b/i.test(c.str))) ended = true;
      if (ended) {
        // Footer totals: "GST: 95.80", "Total Value: $: 1,053.80".
        const gstAt = row.cells.findIndex((c) => /^gst:?$/i.test(c.str));
        if (gstAt >= 0) { const n = row.cells.slice(gstAt + 1).find((c) => isNum(c.str)); if (n) gst = parseAmount(n.str); }
        if (row.cells.some((c) => /^(total value|invoice total|total|amount due|balance due):?$/i.test(c.str))) {
          const nums = row.cells.filter((c) => isNum(c.str));
          if (nums.length) total = parseAmount(nums[nums.length - 1]!.str);
        }
        continue;
      }
      // A big gap means we've left the table (page furniture, terms).
      if (row.y - lastY > 40) { ended = true; continue; }
      lastY = row.y;

      const serialAt = row.cells.findIndex((c) => SERIAL_RE.test(c.str));
      if (serialAt >= 0 && serialAt <= 1) {
        if (current) {
          const text = row.cells.slice(serialAt + 1).map((c) => c.str).join(" ");
          current.serials.push(...text.split(/[,;]\s*|\s+/).map((s) => s.trim()).filter(Boolean));
        }
        continue;
      }

      const byCol: Partial<Record<ColKey, string[]>> = {};
      for (const c of row.cells) {
        const key = isNum(c.str) ? (numberColumn(cols, c) ?? textColumn(cols, c)) : textColumn(cols, c);
        if (!key) continue;
        (byCol[key] ??= []).push(c.str);
      }
      const qtyStr = byCol.qty?.[0];
      const unitStr = byCol.unit?.[0];
      if (qtyStr && unitStr && isNum(qtyStr) && isNum(unitStr)) {
        current = {
          stockCode: (byCol.code ?? []).join(""),
          manufCode: (byCol.manuf ?? []).join(" "),
          description: (byCol.desc ?? []).join(" "),
          qty: parseAmount(qtyStr) ?? 0,
          unitEx: parseAmount(unitStr) ?? 0,
          grossEx: byCol.gross?.[0] ? parseAmount(byCol.gross[0]) : null,
          gst: byCol.gst?.[0] ? parseAmount(byCol.gst[0]) : null,
          totalInc: byCol.total?.[0] ? parseAmount(byCol.total[0]) : null,
          serials: [],
        };
        lines.push(current);
      } else if (current) {
        // Wrapped text: codes join without a space ("MPA-" + "CAB023FQ1MWH").
        if (byCol.code) current.stockCode += byCol.code.join("");
        if (byCol.manuf) current.manufCode += byCol.manuf.join("");
        if (byCol.desc) current.description = clean(`${current.description} ${byCol.desc.join(" ")}`);
      }
    }
  });

  // Header fields, from above the table on page 1.
  const flat = topRows.flatMap((r) => r.cells.map((c) => c.str));
  const name = flat.find((s) => /\b(pty\.?\s*ltd\.?|limited|p\/l)\b/i.test(s) && !/koastal/i.test(s)) ?? "";
  const abnText = flat.find((s) => /\bABN\b/i.test(s)) ?? "";
  const abnDigits = (/ABN[:\s]*([\d\s]{11,20})/i.exec(abnText)?.[1] ?? "").replace(/\D/g, "");
  const website = (flat.map((s) => /\b(www\.[a-z0-9.-]+\.[a-z]{2,}(\.[a-z]{2})?)\b/i.exec(s)?.[1]).find(Boolean)) ?? "";
  const invoiceNumber = labelValue(topRows, /^(our ref|invoice (no|number|#)|tax invoice (no|number)|document (no|number))\.?:?/i);
  const date = isoDate(labelValue(topRows, /^(invoice )?date:?/i));
  const accountCode = labelValue(topRows, /^(customer code|account (no|number|code)|customer (no|number|id)|acc(ount)?\.? ?#?):?/i);
  const orderNumber = labelValue(topRows, /^(your order no|your ref(erence)?|customer order( no)?|your po( no)?)\.?:?/i);

  const finalLines = lines.map((l) => ({ ...l, serials: [...new Set(l.serials)] }));
  const warnings: string[] = [];
  for (const l of finalLines) {
    if (l.grossEx != null && Math.abs(round2(l.qty * l.unitEx) - l.grossEx) > 0.02) {
      warnings.push(`${l.stockCode || l.description}: ${l.qty} × $${l.unitEx.toFixed(2)} doesn't equal the line's $${l.grossEx.toFixed(2)}.`);
    }
    if (!Number.isInteger(l.qty)) warnings.push(`${l.stockCode || l.description}: quantity ${l.qty} isn't a whole number.`);
  }
  const sumInc = round2(finalLines.reduce((s, l) => s + (l.totalInc ?? round2(l.qty * l.unitEx * 1.1)), 0));
  if (total != null && Math.abs(sumInc - total) > 0.05) {
    warnings.push(`The lines add up to $${sumInc.toFixed(2)} but the invoice total is $${(total as number).toFixed(2)} — a line may not have been read.`);
  }
  if (!finalLines.length) throw new InvoiceParseError("Found the item table but no lines in it.");

  return {
    supplier: { name: clean(name), abn: abnDigits.length === 11 ? abnDigits : "", website },
    invoiceNumber, date, accountCode, orderNumber,
    lines: finalLines,
    totals: { gst, total },
    warnings,
  };
}

/** Read a PDF's text with positions (top-left origin), page by page. */
export async function extractPdfText(file: File): Promise<PdfPage[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      if (typeof it.str !== "string" || !it.transform) continue;
      items.push({ str: it.str, x: it.transform[4]!, y: vp.height - it.transform[5]!, w: it.width ?? 0 });
    }
    pages.push({ width: vp.width, height: vp.height, items });
  }
  return pages;
}
