import PDFDocument from "pdfkit";

type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };

export interface InvoicePdfData {
  invoiceNumber: string;
  status: string;
  createdAt: string;
  dueDate: string | null;
  paidAt: string | null;
  items: LineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  discountTotal: number | null;
  discountType: string | null;
  discountValue: number | null;
  notes: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerCompany: string | null;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  businessCity: string | null;
  businessAbn: string | null;
  businessWebsite: string | null;
  businessEmail: string | null;
}

const BRAND   = "#4f46e5";
const GRAY    = "#6b7280";
const LGRAY   = "#f3f4f6";
const BLACK   = "#111827";
const DARK    = "#374151";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
};

export function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: { Title: `Invoice ${data.invoiceNumber}`, Author: data.businessName },
    });

    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ML = 50;
    const PW = doc.page.width - ML * 2;

    // ── Header ────────────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(22).fillColor(BLACK).text(data.businessName, ML, 50);

    let leftY = 82;
    const addrParts = [data.businessAddress, data.businessCity].filter(Boolean).join(", ");
    doc.font("Helvetica").fontSize(9).fillColor(GRAY);
    if (addrParts)          { doc.text(addrParts,               ML, leftY); leftY += 13; }
    if (data.businessPhone) { doc.text(data.businessPhone,      ML, leftY); leftY += 13; }
    if (data.businessEmail) { doc.text(data.businessEmail,      ML, leftY); leftY += 13; }
    if (data.businessAbn)   { doc.text(`ABN: ${data.businessAbn}`, ML, leftY); leftY += 13; }
    if (data.businessWebsite){ doc.text(data.businessWebsite,   ML, leftY); leftY += 13; }

    // Right column – INVOICE label + meta
    const RX = ML + PW - 200;
    doc.font("Helvetica-Bold").fontSize(28).fillColor(BRAND)
      .text("INVOICE", RX, 50, { width: 200, align: "right" });

    const metaRows: [string, string][] = [
      ["Invoice #", data.invoiceNumber],
      ["Date",      fmtDate(data.createdAt)],
      ...(data.dueDate ? [["Due Date", fmtDate(data.dueDate)] as [string, string]] : []),
      ...(data.paidAt  ? [["Paid On",  fmtDate(data.paidAt)]  as [string, string]] : []),
      ["Status",    data.status.toUpperCase()],
    ];

    let metaY = 85;
    for (const [label, value] of metaRows) {
      doc.font("Helvetica").fontSize(9).fillColor(GRAY).text(label, RX, metaY, { width: 95, align: "right" });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK).text(value, RX + 100, metaY, { width: 100, align: "right" });
      metaY += 15;
    }

    // ── Divider ───────────────────────────────────────────────────────────
    const divY = Math.max(leftY, metaY) + 14;
    doc.moveTo(ML, divY).lineTo(ML + PW, divY).strokeColor("#e5e7eb").lineWidth(1).stroke();

    // ── Bill To ───────────────────────────────────────────────────────────
    let billY = divY + 18;
    if (data.customerName || data.customerEmail) {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("BILL TO", ML, billY);
      billY += 14;
      if (data.customerName)    { doc.font("Helvetica-Bold").fontSize(10).fillColor(BLACK).text(data.customerName, ML, billY); billY += 14; }
      if (data.customerCompany) { doc.font("Helvetica").fontSize(9).fillColor(DARK).text(data.customerCompany, ML, billY); billY += 13; }
      if (data.customerAddress) { doc.font("Helvetica").fontSize(9).fillColor(GRAY).text(data.customerAddress, ML, billY); billY += 13; }
      if (data.customerEmail)   { doc.font("Helvetica").fontSize(9).fillColor(GRAY).text(data.customerEmail, ML, billY);   billY += 13; }
      if (data.customerPhone)   { doc.font("Helvetica").fontSize(9).fillColor(GRAY).text(data.customerPhone, ML, billY);   billY += 13; }
      billY += 10;
    }

    // ── Line-items table ──────────────────────────────────────────────────
    const tY = billY;

    const COL_DESC_X  = ML;
    const COL_QTY_X   = ML + PW - 195;
    const COL_UNIT_X  = ML + PW - 145;
    const COL_TAX_X   = ML + PW - 75;
    const COL_AMT_X   = ML + PW - 45;

    const COL_DESC_W  = COL_QTY_X - COL_DESC_X - 4;
    const COL_QTY_W   = 46;
    const COL_UNIT_W  = 65;
    const COL_TAX_W   = 30;
    const COL_AMT_W   = 45;

    doc.rect(ML, tY, PW, 22).fill(BRAND);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
    doc.text("Description",  COL_DESC_X + 6, tY + 7, { width: COL_DESC_W });
    doc.text("Qty",           COL_QTY_X,     tY + 7, { width: COL_QTY_W,  align: "center" });
    doc.text("Unit Price",    COL_UNIT_X,    tY + 7, { width: COL_UNIT_W, align: "right" });
    doc.text("Tax",           COL_TAX_X,     tY + 7, { width: COL_TAX_W,  align: "center" });
    doc.text("Amount",        COL_AMT_X,     tY + 7, { width: COL_AMT_W,  align: "right" });

    let rowY = tY + 22;
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const amount = item.quantity * item.unitPrice;
      const rowH = 22;
      if (i % 2 === 0) doc.rect(ML, rowY, PW, rowH).fill(LGRAY);
      doc.font("Helvetica").fontSize(9).fillColor(DARK);
      doc.text(item.description || "—", COL_DESC_X + 6, rowY + 7, { width: COL_DESC_W - 4 });
      doc.text(String(item.quantity),    COL_QTY_X,  rowY + 7, { width: COL_QTY_W,  align: "center" });
      doc.text(fmtCurrency(item.unitPrice), COL_UNIT_X, rowY + 7, { width: COL_UNIT_W, align: "right" });
      doc.text(`${item.taxRate}%`,       COL_TAX_X,  rowY + 7, { width: COL_TAX_W,  align: "center" });
      doc.font("Helvetica-Bold").fillColor(BLACK);
      doc.text(fmtCurrency(amount),      COL_AMT_X,  rowY + 7, { width: COL_AMT_W,  align: "right" });
      rowY += rowH;
    }

    doc.moveTo(ML, rowY).lineTo(ML + PW, rowY).strokeColor("#e5e7eb").lineWidth(0.5).stroke();

    // ── Totals ────────────────────────────────────────────────────────────
    const TX = ML + PW - 230;
    let totY = rowY + 16;

    const totRow = (label: string, value: string, bold = false, color = DARK) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10 : 9)
        .fillColor(color).text(label, TX, totY, { width: 130, align: "right" });
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10 : 9)
        .fillColor(bold ? BLACK : DARK).text(value, TX + 135, totY, { width: 95, align: "right" });
      totY += bold ? 18 : 15;
    };

    totRow("Subtotal", fmtCurrency(data.subtotal));
    totRow("GST (10%)", fmtCurrency(data.taxTotal));
    if (data.discountTotal) {
      const discLabel = `Discount${data.discountType === "percent" && data.discountValue ? ` (${data.discountValue}%)` : ""}`;
      totRow(discLabel, `−${fmtCurrency(data.discountTotal)}`);
    }
    totY += 4;
    doc.moveTo(TX, totY - 2).lineTo(ML + PW, totY - 2).strokeColor("#d1d5db").lineWidth(0.5).stroke();
    totY += 2;
    totRow("Total", fmtCurrency(data.total), true, BRAND);
    if (data.amountPaid > 0) {
      totRow("Amount Paid", `−${fmtCurrency(data.amountPaid)}`);
      doc.moveTo(TX, totY - 2).lineTo(ML + PW, totY - 2).strokeColor("#d1d5db").lineWidth(0.5).stroke();
      totY += 2;
      const balance = Math.max(0, data.total - data.amountPaid);
      totRow("Balance Due", fmtCurrency(balance), true, balance > 0 ? "#d97706" : "#059669");
    }

    // ── Notes ─────────────────────────────────────────────────────────────
    if (data.notes) {
      const NY = totY + 24;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text("NOTES", ML, NY);
      doc.font("Helvetica").fontSize(9).fillColor(DARK).text(data.notes, ML, NY + 13, { width: PW - 240 });
    }

    // ── Footer ────────────────────────────────────────────────────────────
    const FY = doc.page.height - 50;
    doc.moveTo(ML, FY - 12).lineTo(ML + PW, FY - 12).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(GRAY)
      .text(`${data.businessName}  ·  Generated by KoaPOS`, ML, FY - 2, { width: PW, align: "center" });

    doc.end();
  });
}
