/**
 * Single source of truth for the A4 invoice / receipt layout.
 *
 * Both the in-app print path (koapos `printA4Invoice`) and the server-side
 * customer-facing PDF (`api-server` `buildInvoicePdf`) render through this one
 * function, so what a customer receives always matches what the merchant
 * configures in Management > Templates and sees in Print Preview.
 *
 * This module is intentionally pure: it returns an HTML string and touches no
 * DOM or Node APIs, so it can run in the browser (print window) and on the
 * server (headless Chromium → PDF) unchanged.
 */
import { getSocialIconSvg, getSocialLabel, getSocialHandle, getSocialBrandColor } from "./social-links";

/* ─── Public input shape ──────────────────────────────────────────────────── */

export interface InvoiceDocBusiness {
  name: string;
  abn?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  tagline?: string | null;
  /** Hex brand colour, e.g. "#4f46e5". */
  brandColor?: string | null;
  /** https:// or data: URL for the logo image. */
  logoUrl?: string | null;
}

export interface InvoiceDocCustomer {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  company?: string | null;
}

export interface InvoiceDocLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Line total (qty × unit, less any line discount). */
  amount: number;
  /** Optional warranty label, e.g. "2 years warranty", shown under the item. */
  warranty?: string | null;
  /** Optional serial numbers for the line, shown under the item. */
  serials?: string[] | null;
}

export interface InvoiceDocOptions {
  // Visibility toggles
  showLogo?: boolean;
  showAbn?: boolean;
  showWebsite?: boolean;
  showTagline?: boolean;
  showGstBreakdown?: boolean;
  showSocialLinks?: boolean;
  socialIconBrandColors?: boolean;
  /** Render customer phone / address / company in the Bill-To block. */
  showAllCustomerDetails?: boolean;
  // Free-text blocks
  headerText?: string | null;
  thankYouMsg?: string | null;
  footerText?: string | null;
  paymentTerms?: string | null;
  invoiceNotes?: string | null;
  bankDetails?: string | null;
  paymentSectionHeading?: string | null;
  // Styling
  fontFamily?: string | null;
  /** Raw stored `selectedStyle` (e.g. "professional", "i-modern", "minimal"). */
  styleVariant?: string | null;
  /** Map of platform → url/handle, rendered when showSocialLinks is on. */
  socialLinks?: Record<string, string> | null;
}

export interface InvoiceDocInput {
  /** Document heading, e.g. "Tax Invoice" or "Receipt". Defaults to "Tax Invoice". */
  title?: string;
  documentNumber: string;
  dateStr: string;
  dueDateStr?: string | null;
  /** Label preceding the due/validity date, e.g. "Due" or "Valid until". Defaults to "Due". */
  dueDateLabel?: string | null;
  paidAtStr?: string | null;
  status?: string | null;
  /** POS receipt path supplies a payment-method label; invoices usually omit it. */
  paymentMethodLabel?: string | null;
  business: InvoiceDocBusiness;
  customer?: InvoiceDocCustomer | null;
  items: InvoiceDocLineItem[];
  /** GST-exclusive subtotal. */
  subtotal: number;
  taxTotal: number;
  discountTotal?: number | null;
  /** Override for the discount row label, e.g. "Discount (10%)". */
  discountLabel?: string | null;
  total: number;
  amountPaid?: number | null;
  /** Free-form invoice note (distinct from the template `invoiceNotes`). */
  notes?: string | null;
  options?: InvoiceDocOptions;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function fmtAUD(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

const KNOWN_FONT_STACKS: Record<string, string> = {
  inter:       "'Inter', 'Helvetica Neue', Arial, sans-serif",
  roboto:      "'Roboto', 'Helvetica Neue', Arial, sans-serif",
  opensans:    "'Open Sans', 'Helvetica Neue', Arial, sans-serif",
  lato:        "'Lato', 'Helvetica Neue', Arial, sans-serif",
  montserrat:  "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
  poppins:     "'Poppins', 'Helvetica Neue', Arial, sans-serif",
  georgia:     "Georgia, 'Times New Roman', serif",
  times:       "'Times New Roman', Times, serif",
  courier:     "'Courier New', Courier, monospace",
  "courier new": "'Courier New', Courier, monospace",
  helvetica:   "'Helvetica Neue', Helvetica, Arial, sans-serif",
  arial:       "Arial, 'Helvetica Neue', sans-serif",
};

/** Resolve a stored font key/name into a safe CSS font-family stack. */
export function resolveFontStack(font?: string | null): string {
  const fallback = "'Helvetica Neue', Arial, sans-serif";
  if (!font) return fallback;
  const key = font.trim().toLowerCase();
  if (KNOWN_FONT_STACKS[key]) return KNOWN_FONT_STACKS[key];
  // Treat anything else (incl. uploaded custom fonts) as a literal family name.
  const safe = font.replace(/["'<>]/g, "");
  return `"${safe}", ${fallback}`;
}

/* ─── Renderer ────────────────────────────────────────────────────────────── */

export function buildInvoiceHtml(input: InvoiceDocInput): string {
  const opts = input.options ?? {};
  const title = esc(input.title || "Tax Invoice");

  const rawBrand = input.business.brandColor ?? "#374151";
  const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(rawBrand) ? rawBrand : "#374151";
  const fontFamily = resolveFontStack(opts.fontFamily);

  const businessName = esc(input.business.name || "Your Business");
  const abn = esc(input.business.abn ?? "");
  const website = esc(input.business.website ?? "");
  const contactEmail = esc(input.business.email ?? "");
  const phone = esc(input.business.phone ?? "");
  const tagline = esc(input.business.tagline ?? "");
  const addressParts = [input.business.address, input.business.city].filter(Boolean).join(", ");
  const address = esc(addressParts);

  const showAbn = opts.showAbn !== false;
  const showWebsite = opts.showWebsite !== false;
  const showTagline = opts.showTagline === true;
  const showGst = opts.showGstBreakdown !== false;
  const showLogo = opts.showLogo !== false;

  const rawLogo = input.business.logoUrl ?? "";
  const logoUrl = /^(https?:|data:image\/)/.test(rawLogo) ? rawLogo : "";
  const logoHtml = showLogo && logoUrl
    ? `<img class="logo" src="${esc(logoUrl)}" alt="${businessName}" />`
    : "";

  // ── Business contact lines (under the name) ──
  const bizMetaLines = [
    showTagline && tagline ? tagline : "",
    address,
    phone,
    contactEmail,
    showAbn && abn ? `ABN ${abn}` : "",
    showWebsite && website ? website : "",
  ].filter(Boolean);
  const bizMeta = bizMetaLines.join("<br>");

  // ── Customer (Bill To) ──
  const customer = input.customer;
  const customerName = esc(customer?.name ?? "");
  const customerEmail = esc(customer?.email ?? "");
  const customerLines: string[] = [];
  if (customerEmail) {
    customerLines.push(`<div class="meta-value sub">${customerEmail}</div>`);
  }
  if (opts.showAllCustomerDetails) {
    if (customer?.company) customerLines.push(`<div class="meta-value sub">${esc(customer.company)}</div>`);
    if (customer?.phone)   customerLines.push(`<div class="meta-value sub">${esc(customer.phone)}</div>`);
    if (customer?.address) customerLines.push(`<div class="meta-value sub">${esc(customer.address)}</div>`);
  }

  // ── Right-column meta (number / dates / status) ──
  const metaRight: string[] = [`<div class="inv-num">${esc(input.documentNumber)}</div>`,
    `<div class="inv-date">${esc(input.dateStr)}</div>`];
  if (input.dueDateStr) metaRight.push(`<div class="inv-date">${esc(input.dueDateLabel || "Due")} ${esc(input.dueDateStr)}</div>`);

  // ── Line items ──
  const itemRows = input.items.map((item, i) => {
    const bg = i % 2 === 0 ? "#f9fafb" : "#ffffff";
    const warranty = item.warranty && item.warranty.trim()
      ? `<div class="td-warranty">🛡 ${esc(item.warranty.trim())}</div>`
      : "";
    const serials = item.serials && item.serials.length
      ? `<div class="td-serial">S/N: ${esc(item.serials.join(", "))}</div>`
      : "";
    return `
      <tr style="background:${bg}">
        <td class="td-name">${esc(item.description || "Item")}${warranty}${serials}</td>
        <td class="td-center">${esc(item.quantity)}</td>
        <td class="td-right">${fmtAUD(item.unitPrice)}</td>
        <td class="td-right">${fmtAUD(item.amount)}</td>
      </tr>`;
  }).join("");

  // ── Totals ──
  const discountTotal = input.discountTotal ?? 0;
  const amountPaid = input.amountPaid ?? 0;
  const totalsRows: string[] = [
    `<div class="totals-row"><span class="lbl">Subtotal${showGst ? " (ex. GST)" : ""}</span><span>${fmtAUD(input.subtotal)}</span></div>`,
  ];
  if (showGst) {
    totalsRows.push(`<div class="totals-row"><span class="lbl">GST (10%)</span><span>${fmtAUD(input.taxTotal)}</span></div>`);
  }
  if (discountTotal > 0) {
    const dl = esc(input.discountLabel || "Discount");
    totalsRows.push(`<div class="totals-row" style="color:#dc2626"><span class="lbl">${dl}</span><span>−${fmtAUD(discountTotal)}</span></div>`);
  }
  totalsRows.push(`<div class="totals-total"><span>Total AUD</span><span>${fmtAUD(input.total)}</span></div>`);
  if (amountPaid > 0) {
    totalsRows.push(`<div class="totals-row"><span class="lbl">Amount Paid</span><span>−${fmtAUD(amountPaid)}</span></div>`);
    const balance = Math.max(0, input.total - amountPaid);
    const balColor = balance > 0 ? "#d97706" : "#059669";
    totalsRows.push(`<div class="totals-row" style="font-weight:700;color:${balColor}"><span class="lbl" style="color:inherit">Balance Due</span><span>${fmtAUD(balance)}</span></div>`);
  }

  // ── Notes / terms / bank details ──
  const noteBlocks: string[] = [];
  const pushNote = (heading: string, body?: string | null) => {
    if (body && body.trim()) {
      noteBlocks.push(`<div class="note-block"><div class="note-head">${esc(heading)}</div><div class="note-body">${esc(body.trim()).replace(/\n/g, "<br>")}</div></div>`);
    }
  };
  pushNote("Notes", input.notes);
  pushNote("Notes", opts.invoiceNotes);
  pushNote("Payment Terms", opts.paymentTerms);
  pushNote(opts.paymentSectionHeading?.trim() || "Payment Details", opts.bankDetails);
  const notesHtml = noteBlocks.length ? `<div class="notes">${noteBlocks.join("")}</div>` : "";

  // ── Status badge ──
  const status = esc(input.status ?? "");
  const pmLabel = esc(input.paymentMethodLabel ?? "");
  const badgeHtml = pmLabel
    ? `<div><span class="payment-badge">✓ Paid — ${pmLabel}</span></div>`
    : "";

  // ── Header custom text ──
  const headerText = opts.headerText && opts.headerText.trim()
    ? `<div class="header-note">${esc(opts.headerText.trim()).replace(/\n/g, "<br>")}</div>`
    : "";

  // ── Footer / socials ──
  const thankYou = opts.thankYouMsg && opts.thankYouMsg.trim() ? esc(opts.thankYouMsg.trim()) : "";
  const footerTxt = opts.footerText && opts.footerText.trim() ? esc(opts.footerText.trim()) : "";
  const socialEntries = Object.entries(opts.socialLinks ?? {}).filter(([, v]) => v);
  const socialHtml = (opts.showSocialLinks && socialEntries.length)
    ? `<div class="socials">${socialEntries.map(([k, v]) =>
        `<span>${getSocialIconSvg(k, 11, opts.socialIconBrandColors ? getSocialBrandColor(k) : null)}<strong>${esc(getSocialLabel(k))}</strong> ${esc(getSocialHandle(String(v)))}</span>`,
      ).join("")}</div>`
    : "";

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fontFamily}; font-size: 13px; color: #1f2937; background: #fff; }
    .page { max-width: 780px; margin: 0 auto; padding: 40px; }

    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 2px solid ${brandColor}; }
    .header .left { max-width: 60%; }
    .logo { max-height: 56px; max-width: 200px; margin-bottom: 10px; display: block; }
    .biz-name { font-size: 22px; font-weight: 700; color: ${brandColor}; letter-spacing: -0.3px; }
    .biz-meta { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.6; }
    .invoice-label { text-align: right; }
    .invoice-label h1 { font-size: 28px; font-weight: 800; color: ${brandColor}; letter-spacing: 1px; text-transform: uppercase; }
    .invoice-label .inv-num { font-size: 14px; color: #374151; font-weight: 600; margin-top: 4px; }
    .invoice-label .inv-date { font-size: 12px; color: #6b7280; margin-top: 2px; }

    .header-note { font-size: 11px; color: #6b7280; margin-bottom: 24px; line-height: 1.6; }

    .meta-row { display: flex; gap: 32px; margin-bottom: 32px; }
    .meta-block { flex: 1; }
    .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 4px; }
    .meta-value { font-size: 13px; color: #1f2937; }
    .meta-value.bold { font-weight: 600; }
    .meta-value.sub { color: #6b7280; font-size: 12px; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    thead tr { background: ${brandColor}; }
    thead th { padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #fff; text-align: left; }
    thead th.right { text-align: right; }
    thead th.center { text-align: center; }
    .td-name { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; }
    .td-warranty { font-size: 10px; color: #059669; margin-top: 2px; }
    .td-serial { font-size: 10px; color: #6b7280; margin-top: 1px; font-family: 'Courier New', monospace; }
    .td-center { padding: 9px 12px; text-align: center; border-bottom: 1px solid #f3f4f6; }
    .td-right { padding: 9px 12px; text-align: right; border-bottom: 1px solid #f3f4f6; }
    .td-empty { font-style: italic; color: #9ca3af; padding: 16px 12px; }

    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 0; }
    .totals { width: 300px; border: 1px solid #e5e7eb; border-top: none; }
    .totals-row { display: flex; justify-content: space-between; padding: 7px 12px; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
    .totals-row .lbl { color: #6b7280; }
    .totals-total { display: flex; justify-content: space-between; padding: 10px 12px; font-size: 14px; font-weight: 700; background: ${brandColor}; color: #fff; }

    .payment-badge { display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; margin-top: 20px; }

    .notes { margin-top: 28px; display: flex; flex-direction: column; gap: 14px; }
    .note-block { max-width: 70%; }
    .note-head { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 4px; }
    .note-body { font-size: 12px; color: #374151; line-height: 1.6; }

    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; line-height: 1.7; }
    .socials { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 6px; font-size: 10px; color: #6b7280; }
    .socials span { display: inline-flex; align-items: center; gap: 3px; }
    .socials svg { flex-shrink: 0; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4 portrait; margin: 15mm; }
      .page { padding: 0; max-width: 100%; }
    }
  `;

  const billToBlock = customerName
    ? `<div class="meta-block">
        <div class="meta-label">Bill To</div>
        <div class="meta-value bold">${customerName}</div>
        ${customerLines.join("")}
      </div>`
    : "";
  const paymentBlock = pmLabel
    ? `<div class="meta-block">
        <div class="meta-label">Payment Method</div>
        <div class="meta-value">${pmLabel}</div>
      </div>`
    : "";
  const statusBlock = status
    ? `<div class="meta-block">
        <div class="meta-label">Status</div>
        <div class="meta-value bold" style="text-transform:capitalize">${status}</div>
      </div>`
    : "";
  const metaRow = (billToBlock || paymentBlock || statusBlock)
    ? `<div class="meta-row">${billToBlock}${paymentBlock}${statusBlock}</div>`
    : "";

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title} ${esc(input.documentNumber)}</title>
<style>${css}</style>
</head><body>
<div class="page">

  <div class="header">
    <div class="left">
      ${logoHtml}
      <div class="biz-name">${businessName}</div>
      ${bizMeta ? `<div class="biz-meta">${bizMeta}</div>` : ""}
    </div>
    <div class="invoice-label">
      <h1>${title}</h1>
      ${metaRight.join("")}
    </div>
  </div>

  ${headerText}
  ${metaRow}

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
      ${totalsRows.join("")}
    </div>
  </div>

  ${badgeHtml}
  ${notesHtml}

  <div class="footer">
    ${thankYou ? `<p>${thankYou}</p>` : ""}
    ${showAbn && abn ? `<p>ABN ${abn}</p>` : ""}
    ${footerTxt ? `<p>${footerTxt}</p>` : ""}
    ${socialHtml}
  </div>

</div>
</body></html>`;
}
