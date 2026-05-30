import type { Transaction } from "@workspace/api-client-react";

export interface ReceiptBusinessInfo {
  businessName?: string;
  abn?: string;
  website?: string;
  email?: string;
  brandColor?: string;
}

export interface ReceiptTemplateOpts {
  showLogo?: boolean;
  showAbn?: boolean;
  showGstBreakdown?: boolean;
  showWebsite?: boolean;
  showPaymentMethods?: boolean;
  showCustomerQr?: boolean;
  showLoyaltyEarned?: boolean;
  showBarcode?: boolean;
  printCustomerCopy?: boolean;
  thankYouMsg?: string;
  footerText?: string;
  headerText?: string;
  customMessage?: string;
  loyaltyQrText?: string;
  fontFamily?: string;
}

/* ─── shared helpers ────────────────────────────────────────────────────── */

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function fmtAUD(n: number): string {
  return `$${n.toFixed(2)}`;
}

function openPrintWindow(html: string, title: string): void {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    // eslint-disable-next-line no-console
    console.warn("Popup blocked — print could not open");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 800);
}

/* ─── Thermal / 80mm receipt ────────────────────────────────────────────── */

export function printReceipt(
  tx: Transaction,
  businessInfo?: ReceiptBusinessInfo,
  opts?: ReceiptTemplateOpts,
): void {
  const rawBusinessName = businessInfo?.businessName ?? "Your Store";
  const rawAbn = businessInfo?.abn ?? "";
  const rawWebsite = businessInfo?.website ?? "";
  const rawEmail = businessInfo?.email ?? "";
  const rawBrandColor = businessInfo?.brandColor ?? "#374151";
  const businessName = esc(rawBusinessName);
  const abn = esc(rawAbn);
  const website = esc(rawWebsite);
  const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(rawBrandColor) ? rawBrandColor : "#374151";

  const tpl: ReceiptTemplateOpts = {
    showLogo: true,
    showAbn: true,
    showGstBreakdown: true,
    showWebsite: true,
    showPaymentMethods: true,
    showCustomerQr: false,
    showLoyaltyEarned: false,
    showBarcode: false,
    printCustomerCopy: false,
    thankYouMsg: "Thank you for your purchase!",
    footerText: "",
    headerText: "",
    customMessage: "",
    loyaltyQrText: "",
    fontFamily: "Courier New",
    ...opts,
  };

  const receiptNum = tx.receiptNumber ? `#${tx.receiptNumber}` : `#${tx.id}`;
  const dateStr = new Date(tx.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = new Date(tx.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

  const items = (tx.items ?? []) as Array<{ productName?: string; quantity?: number; unitPrice?: number; totalPrice?: number; discount?: number }>;

  const itemRows = items.map((item) => {
    const name = esc(item.productName ?? "Item");
    const qty = item.quantity ?? 1;
    const lineTotal = item.totalPrice ?? (item.unitPrice ?? 0) * qty;
    return `<tr><td>${name}</td><td class="tcenter">${qty}</td><td class="right">${fmtAUD(lineTotal)}</td></tr>`;
  }).join("");

  const subtotal = tx.subtotal ?? 0;
  const taxTotal = tx.taxTotal ?? 0;
  const total = tx.total ?? 0;
  const pmLabel = tx.paymentMethod?.toUpperCase() ?? "";

  const fontFamily = tpl.fontFamily === "Courier New" ? "'Courier New', monospace" : (tpl.fontFamily ?? "'Courier New', monospace");

  const resolveStr = (text?: string) => {
    if (!text) return "";
    return esc(
      text
        .replace(/\{\{business\.name\}\}/g, rawBusinessName)
        .replace(/\{\{business\.abn\}\}/g, rawAbn)
        .replace(/\{\{business\.email\}\}/g, rawEmail)
        .replace(/\{\{business\.website\}\}/g, rawWebsite)
        .replace(/\{\{transaction\.total\}\}/g, fmtAUD(total))
        .replace(/\{\{transaction\.date\}\}/g, `${dateStr} ${timeStr}`)
        .replace(/\{\{transaction\.number\}\}/g, receiptNum)
        .replace(/\{\{[^}]+\}\}/g, ""),
    );
  };

  const thankYou = resolveStr(tpl.thankYouMsg);
  const footer = resolveStr(tpl.footerText);
  const header = resolveStr(tpl.headerText);
  const customMsg = resolveStr(tpl.customMessage);
  const escReceiptNum = esc(receiptNum);

  const body = `
    <div class="receipt">
      <div class="center bdr-b pb mb">
        ${tpl.showLogo ? `<div class="logo-square" style="background:${brandColor}"></div>` : ""}
        <p class="bold upper tracking">${businessName}</p>
        ${tpl.showAbn && abn ? `<p class="gray small">ABN ${abn}</p>` : ""}
        ${tpl.showWebsite && website ? `<p class="gray small">${website}</p>` : ""}
        <p class="gray small">${dateStr} ${timeStr}</p>
        ${receiptNum ? `<p class="gray small">Receipt: ${escReceiptNum}</p>` : ""}
      </div>
      ${header ? `<p class="center small mb">${header}</p>` : ""}
      <table>
        <thead><tr><th class="left">Item</th><th class="tcenter">Qty</th><th class="right">Amt</th></tr></thead>
        <tbody>
          ${itemRows || '<tr><td class="gray small">No items</td><td class="tcenter">—</td><td class="right">—</td></tr>'}
        </tbody>
      </table>
      <div class="bdr-t pt small">
        <div class="row"><span class="gray">Subtotal</span><span>${fmtAUD(subtotal)}</span></div>
        ${tpl.showGstBreakdown ? `<div class="row"><span class="gray">GST (10% incl.)</span><span>${fmtAUD(taxTotal)}</span></div>` : ""}
        ${tx.discountTotal ? `<div class="row"><span class="gray">Discount</span><span>−${fmtAUD(tx.discountTotal)}</span></div>` : ""}
        <div class="row bold"><span>TOTAL AUD</span><span>${fmtAUD(total)}</span></div>
        ${tpl.showPaymentMethods && pmLabel ? `<div class="row gray"><span>${pmLabel}</span><span>Approved</span></div>` : ""}
      </div>
      <div class="center gray small bdr-t pt mt">
        ${thankYou ? `<p>${thankYou}</p>` : ""}
        ${footer ? `<p>${footer}</p>` : ""}
        ${customMsg ? `<p style="line-height:1.5;margin-top:4px">${customMsg}</p>` : ""}
      </div>
    </div>`;

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fontFamily}; font-size: 12px; color: #1f2937; background: #fff; padding: 16px; }
    .receipt { max-width: 300px; margin: 0 auto; }
    .center { text-align: center; }
    .left { text-align: left; }
    .right { text-align: right; }
    .tcenter { text-align: center; }
    .bold { font-weight: bold; }
    .upper { text-transform: uppercase; }
    .tracking { letter-spacing: 0.05em; }
    .gray { color: #9ca3af; }
    .small { font-size: 10px; }
    .mb { margin-bottom: 8px; }
    .mt { margin-top: 8px; }
    .pb { padding-bottom: 8px; }
    .pt { padding-top: 8px; }
    .bdr-b { border-bottom: 1px solid #e5e7eb; }
    .bdr-t { border-top: 1px solid #e5e7eb; }
    .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 4px 0; }
    thead tr { border-bottom: 1px solid #e5e7eb; }
    th { font-weight: 500; padding-bottom: 2px; font-size: 10px; color: #6b7280; }
    td { padding: 2px 0; }
    .logo-square { width: 20px; height: 20px; border-radius: 2px; margin: 0 auto 4px; }
    @media print {
      body { padding: 0; }
      @page { margin: 8mm; size: 80mm auto; }
    }
  `;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${escReceiptNum}</title><style>${css}</style></head><body>${body}</body></html>`;

  openPrintWindow(html, `Receipt ${escReceiptNum}`);

  if (tpl.printCustomerCopy) {
    setTimeout(() => {
      const tagged = html.replace("<body>", '<body><p style="text-align:center;font-weight:bold;font-size:11px;color:#9ca3af;letter-spacing:2px;margin-bottom:6px">CUSTOMER COPY</p>');
      const win2 = window.open("", "_blank", "width=400,height=600,scrollbars=yes");
      if (win2) {
        win2.document.write(tagged);
        win2.document.close();
        win2.focus();
        setTimeout(() => win2.print(), 800);
      }
    }, 1400);
  }
}

/* ─── A4 invoice ────────────────────────────────────────────────────────── */

export function printA4Invoice(
  tx: Transaction,
  businessInfo?: ReceiptBusinessInfo,
  opts?: ReceiptTemplateOpts,
): void {
  const rawBusinessName = businessInfo?.businessName ?? "Your Store";
  const rawAbn = businessInfo?.abn ?? "";
  const rawWebsite = businessInfo?.website ?? "";
  const rawEmail = businessInfo?.email ?? "";
  const rawBrandColor = businessInfo?.brandColor ?? "#374151";
  const businessName = esc(rawBusinessName);
  const abn = esc(rawAbn);
  const website = esc(rawWebsite);
  const contactEmail = esc(rawEmail);
  const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(rawBrandColor) ? rawBrandColor : "#374151";

  const tpl: ReceiptTemplateOpts = {
    showAbn: true,
    showGstBreakdown: true,
    showWebsite: true,
    thankYouMsg: "Thank you for your business.",
    footerText: "",
    ...opts,
  };

  const receiptNum = tx.receiptNumber ? tx.receiptNumber : `${tx.id}`;
  const escReceiptNum = esc(receiptNum);
  const dateStr = new Date(tx.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  const pmLabel = (tx.paymentMethod ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const customer = tx.customer;
  const customerName = customer
    ? esc([customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || "")
    : "";
  const customerEmail = customer ? esc(customer.email ?? "") : "";

  const items = (tx.items ?? []) as Array<{ productName?: string; quantity?: number; unitPrice?: number; totalPrice?: number; discount?: number }>;

  const itemRows = items.map((item, i) => {
    const name = esc(item.productName ?? "Item");
    const qty = item.quantity ?? 1;
    const unit = item.unitPrice ?? 0;
    const lineTotal = item.totalPrice ?? unit * qty;
    const bg = i % 2 === 0 ? "#f9fafb" : "#ffffff";
    return `
      <tr style="background:${bg}">
        <td class="td-name">${name}</td>
        <td class="td-center">${qty}</td>
        <td class="td-right">${fmtAUD(unit)}</td>
        <td class="td-right">${fmtAUD(lineTotal)}</td>
      </tr>`;
  }).join("");

  const subtotal = tx.subtotal ?? 0;
  const taxTotal = tx.taxTotal ?? 0;
  const discountTotal = tx.discountTotal ?? 0;
  const total = tx.total ?? 0;

  const thankYou = tpl.thankYouMsg ? esc(tpl.thankYouMsg) : "";
  const footerTxt = tpl.footerText ? esc(tpl.footerText) : "";

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1f2937; background: #fff; }
    .page { max-width: 780px; margin: 0 auto; padding: 40px; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid ${brandColor}; }
    .biz-name { font-size: 22px; font-weight: 700; color: ${brandColor}; letter-spacing: -0.3px; }
    .biz-meta { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.6; }
    .invoice-label { text-align: right; }
    .invoice-label h1 { font-size: 28px; font-weight: 800; color: ${brandColor}; letter-spacing: 1px; text-transform: uppercase; }
    .invoice-label .inv-num { font-size: 14px; color: #374151; font-weight: 600; margin-top: 4px; }
    .invoice-label .inv-date { font-size: 12px; color: #6b7280; margin-top: 2px; }

    /* Meta row */
    .meta-row { display: flex; gap: 32px; margin-bottom: 32px; }
    .meta-block { flex: 1; }
    .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 4px; }
    .meta-value { font-size: 13px; color: #1f2937; }
    .meta-value.bold { font-weight: 600; }

    /* Items table */
    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    thead tr { background: ${brandColor}; }
    thead th { padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #fff; text-align: left; }
    thead th.right { text-align: right; }
    thead th.center { text-align: center; }
    .td-name { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; }
    .td-center { padding: 9px 12px; text-align: center; border-bottom: 1px solid #f3f4f6; }
    .td-right { padding: 9px 12px; text-align: right; border-bottom: 1px solid #f3f4f6; }
    .td-empty { font-style: italic; color: #9ca3af; padding: 16px 12px; }

    /* Totals */
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 0; }
    .totals { width: 280px; border: 1px solid #e5e7eb; border-top: none; }
    .totals-row { display: flex; justify-content: space-between; padding: 7px 12px; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
    .totals-row .lbl { color: #6b7280; }
    .totals-total { display: flex; justify-content: space-between; padding: 10px 12px; font-size: 14px; font-weight: 700; background: ${brandColor}; color: #fff; }

    /* Payment badge */
    .payment-row { margin-top: 20px; display: flex; align-items: center; gap-8px; }
    .payment-badge { display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; margin-top: 20px; }

    /* Footer */
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; line-height: 1.7; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4; margin: 15mm 18mm; }
      .page { padding: 0; max-width: 100%; }
    }
  `;

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Tax Invoice ${escReceiptNum}</title>
<style>${css}</style>
</head><body>
<div class="page">

  <div class="header">
    <div>
      <div class="biz-name">${businessName}</div>
      <div class="biz-meta">
        ${abn ? `ABN ${abn}<br>` : ""}
        ${contactEmail ? `${contactEmail}<br>` : ""}
        ${website ? `${website}` : ""}
      </div>
    </div>
    <div class="invoice-label">
      <h1>Tax Invoice</h1>
      <div class="inv-num">${escReceiptNum}</div>
      <div class="inv-date">${dateStr}</div>
    </div>
  </div>

  <div class="meta-row">
    ${customerName ? `
    <div class="meta-block">
      <div class="meta-label">Bill To</div>
      <div class="meta-value bold">${customerName}</div>
      ${customerEmail ? `<div class="meta-value" style="color:#6b7280;font-size:12px">${customerEmail}</div>` : ""}
    </div>` : ""}
    <div class="meta-block">
      <div class="meta-label">Payment Method</div>
      <div class="meta-value">${esc(pmLabel) || "—"}</div>
    </div>
    <div class="meta-block">
      <div class="meta-label">Status</div>
      <div class="meta-value bold" style="text-transform:capitalize">${esc(tx.status ?? "completed")}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50%">Description</th>
        <th class="center" style="width:10%">Qty</th>
        <th class="right" style="width:20%">Unit Price</th>
        <th class="right" style="width:20%">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td class="td-name td-empty" colspan="4">No items</td></tr>`}
    </tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals">
      <div class="totals-row"><span class="lbl">Subtotal (ex. GST)</span><span>${fmtAUD(subtotal - taxTotal)}</span></div>
      ${tpl.showGstBreakdown ? `<div class="totals-row"><span class="lbl">GST (10%)</span><span>${fmtAUD(taxTotal)}</span></div>` : ""}
      ${discountTotal > 0 ? `<div class="totals-row" style="color:#dc2626"><span class="lbl">Discount</span><span>−${fmtAUD(discountTotal)}</span></div>` : ""}
      <div class="totals-total"><span>Total AUD</span><span>${fmtAUD(total)}</span></div>
    </div>
  </div>

  <div><span class="payment-badge">✓ Paid — ${esc(pmLabel) || "Payment received"}</span></div>

  <div class="footer">
    ${thankYou ? `<p>${thankYou}</p>` : ""}
    ${abn ? `<p>ABN ${abn}</p>` : ""}
    ${footerTxt ? `<p>${footerTxt}</p>` : ""}
  </div>

</div>
</body></html>`;

  openPrintWindow(html, `Invoice ${escReceiptNum}`);
}
