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
 * server (headless Chromium → PDF) unchanged. Anything that needs encoding
 * (customer QR, barcode) is rendered by the caller and passed in as a data URL.
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
  /** Short code shown under the customer-profile QR, e.g. "CUS-0042". */
  code?: string | null;
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
  /** Render customer phone / address / company in the customer block. */
  showAllCustomerDetails?: boolean;
  /** Show the customer-profile QR panel (needs `customerQrDataUrl`). */
  showCustomerQr?: boolean;
  /** Show a merchant-supplied custom QR (needs `customQrDataUrl`). */
  showCustomQr?: boolean;
  /** Caption shown under the custom QR. */
  customQrCaption?: string | null;
  /** Show the green "Loyalty Earned" banner (needs `loyaltyPointsEarned`). */
  showLoyaltyEarned?: boolean;
  /** Show accepted payment-method chips (needs `paymentMethods`). */
  showPaymentMethods?: boolean;
  /** Show the bottom barcode (needs `barcodeDataUrl`). */
  showBarcode?: boolean;
  /** Show the referral footer (needs `referralCode`/`referralUrl`). */
  showReferralLink?: boolean;
  // Free-text blocks
  headerText?: string | null;
  thankYouMsg?: string | null;
  customMessage?: string | null;
  footerText?: string | null;
  paymentTerms?: string | null;
  invoiceNotes?: string | null;
  bankDetails?: string | null;
  paymentSectionHeading?: string | null;
  referralLinkText?: string | null;
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
  /** Loyalty points earned on this sale, shown in the banner when enabled. */
  loyaltyPointsEarned?: number | null;
  /** Accepted payment methods, e.g. ["EFTPOS","Cash","Visa"]. */
  paymentMethods?: string[] | null;
  /** Pre-rendered customer-profile QR (data URL), shown when showCustomerQr. */
  customerQrDataUrl?: string | null;
  /** Merchant-supplied custom QR image (data/https URL), shown when showCustomQr. */
  customQrDataUrl?: string | null;
  /** Pre-rendered barcode (data URL), shown when showBarcode. */
  barcodeDataUrl?: string | null;
  referralCode?: string | null;
  referralUrl?: string | null;
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

  const rawBrand = input.business.brandColor ?? "#0f766e";
  const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(rawBrand) ? rawBrand : "#0f766e";
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
    address,
    phone,
    contactEmail,
    showAbn && abn ? `ABN ${abn}` : "",
    showWebsite && website ? `<span class="link">${website}</span>` : "",
  ].filter(Boolean);
  const bizMeta = bizMetaLines.join("<br>");

  // ── Right-column meta (number / dates) ──
  const metaRight: string[] = [
    `<div class="inv-num">${esc(input.documentNumber)}</div>`,
    `<div class="inv-date">${esc(input.dateStr)}</div>`,
  ];
  if (input.dueDateStr) metaRight.push(`<div class="inv-date">${esc(input.dueDateLabel || "Due")} ${esc(input.dueDateStr)}</div>`);
  if (input.status) metaRight.push(`<div class="inv-status">${esc(input.status)}</div>`);

  // ── Customer panel + profile QR ──
  const customer = input.customer;
  const customerName = esc(customer?.name ?? "");
  const custContact = [customer?.email, customer?.phone].filter(Boolean).map(esc).join(" · ");
  const custExtra: string[] = [];
  if (opts.showAllCustomerDetails) {
    if (customer?.company) custExtra.push(`<div class="cust-line">${esc(customer.company)}</div>`);
    if (customer?.address) custExtra.push(`<div class="cust-line">${esc(customer.address)}</div>`);
  }
  const customerPanel = customerName
    ? `<div class="cust-panel">
        <div class="cust-head">Customer</div>
        <div class="cust-name">${customerName}</div>
        ${custContact ? `<div class="cust-line">${custContact}</div>` : ""}
        ${custExtra.join("")}
      </div>`
    : "";
  const customerQr = (opts.showCustomerQr && input.customerQrDataUrl)
    ? `<div class="cust-qr">
        <div class="cust-qr-label">Customer Profile</div>
        <img src="${esc(input.customerQrDataUrl)}" alt="customer qr" />
        ${customer?.code ? `<div class="cust-qr-code">${esc(customer.code)}</div>` : ""}
      </div>`
    : "";
  const customerRow = (customerPanel || customerQr)
    ? `<div class="cust-row">${customerPanel || "<div></div>"}${customerQr}</div>`
    : "";

  // ── Line items (Item / Qty / Rate / Total) ──
  const itemRows = input.items.map((item) => {
    const warranty = item.warranty && item.warranty.trim()
      ? `<div class="td-warranty">🛡 ${esc(item.warranty.trim())}</div>`
      : "";
    const serials = item.serials && item.serials.length
      ? `<div class="td-serial">S/N: ${esc(item.serials.join(", "))}</div>`
      : "";
    return `
      <tr>
        <td class="td-name">${esc(item.description || "Item")}${warranty}${serials}</td>
        <td class="td-center">${esc(item.quantity)}</td>
        <td class="td-right">${fmtAUD(item.unitPrice)}</td>
        <td class="td-right">${fmtAUD(item.amount)}</td>
      </tr>`;
  }).join("");

  // ── Totals (minimal, right-aligned) ──
  const discountTotal = input.discountTotal ?? 0;
  const amountPaid = input.amountPaid ?? 0;
  const totalsRows: string[] = [];
  if (discountTotal > 0) {
    totalsRows.push(`<div class="totals-row"><span class="lbl">Subtotal${showGst ? " (ex. GST)" : ""}</span><span>${fmtAUD(input.subtotal)}</span></div>`);
  }
  if (showGst) {
    totalsRows.push(`<div class="totals-row"><span class="lbl">GST (10%)</span><span>${fmtAUD(input.taxTotal)}</span></div>`);
  }
  if (discountTotal > 0) {
    const dl = esc(input.discountLabel || "Discount");
    totalsRows.push(`<div class="totals-row" style="color:#dc2626"><span class="lbl">${dl}</span><span>−${fmtAUD(discountTotal)}</span></div>`);
  }
  totalsRows.push(`<div class="totals-total"><span>Total Due (AUD)</span><span>${fmtAUD(input.total)}</span></div>`);
  if (amountPaid > 0) {
    totalsRows.push(`<div class="totals-row"><span class="lbl">Amount Paid</span><span>−${fmtAUD(amountPaid)}</span></div>`);
    const balance = Math.max(0, input.total - amountPaid);
    totalsRows.push(`<div class="totals-row" style="font-weight:700"><span class="lbl" style="color:inherit">Balance Due</span><span>${fmtAUD(balance)}</span></div>`);
  }

  // ── Loyalty banner ──
  const loyaltyHtml = (opts.showLoyaltyEarned && input.loyaltyPointsEarned)
    ? `<div class="loyalty"><span>★ Loyalty Earned</span><span>+${esc(input.loyaltyPointsEarned)} pts</span></div>`
    : "";

  // ── Payment details (methods + bank) ──
  const methods = input.paymentMethods ?? [];
  const methodsHtml = (opts.showPaymentMethods && methods.length)
    ? `<div class="pay-methods">${methods.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</div>`
    : "";
  const bankHtml = (opts.bankDetails && opts.bankDetails.trim())
    ? `<div class="pay-bank">${esc(opts.bankDetails.trim()).replace(/\n/g, "<br>")}</div>`
    : "";
  const paymentHtml = (methodsHtml || bankHtml)
    ? `<div class="payment">
        <div class="pay-head">${esc(opts.paymentSectionHeading?.trim() || "Payment Details")}</div>
        ${methodsHtml}${bankHtml}
      </div>`
    : "";

  // ── Notes / terms ──
  const noteBlocks: string[] = [];
  const pushNote = (heading: string, body?: string | null) => {
    if (body && body.trim()) {
      noteBlocks.push(`<div class="note-block"><div class="note-head">${esc(heading)}</div><div class="note-body">${esc(body.trim()).replace(/\n/g, "<br>")}</div></div>`);
    }
  };
  pushNote("Notes", input.notes);
  pushNote("Notes", opts.invoiceNotes);
  pushNote("Payment Terms", opts.paymentTerms);
  const notesHtml = noteBlocks.length ? `<div class="notes">${noteBlocks.join("")}</div>` : "";

  // ── Header custom text ──
  const headerText = opts.headerText && opts.headerText.trim()
    ? `<div class="header-note">${esc(opts.headerText.trim()).replace(/\n/g, "<br>")}</div>`
    : "";

  // ── Footer (messages + website + socials) ──
  const thankYou = opts.thankYouMsg && opts.thankYouMsg.trim() ? esc(opts.thankYouMsg.trim()) : "";
  const customMsg = opts.customMessage && opts.customMessage.trim() ? esc(opts.customMessage.trim()) : "";
  const footerTxt = opts.footerText && opts.footerText.trim() ? esc(opts.footerText.trim()) : "";
  const socialEntries = Object.entries(opts.socialLinks ?? {}).filter(([, v]) => v);
  const socialHtml = (opts.showSocialLinks && socialEntries.length)
    ? `<div class="socials">${socialEntries.map(([k, v]) =>
        `<span>${getSocialIconSvg(k, 12, opts.socialIconBrandColors ? getSocialBrandColor(k) : null)}<strong>${esc(getSocialLabel(k))}</strong> ${esc(getSocialHandle(String(v)))}</span>`,
      ).join("")}</div>`
    : "";
  const footerHtml = (thankYou || customMsg || footerTxt || (showWebsite && website) || socialHtml)
    ? `<div class="footer">
        ${thankYou ? `<p class="thank-you">${thankYou}</p>` : ""}
        ${customMsg ? `<p>${customMsg}</p>` : ""}
        ${footerTxt ? `<p>${footerTxt}</p>` : ""}
        ${showWebsite && website ? `<p class="link">${website}</p>` : ""}
        ${socialHtml}
      </div>`
    : "";

  // ── Barcode ──
  const barcodeHtml = (opts.showBarcode && input.barcodeDataUrl)
    ? `<div class="barcode"><img src="${esc(input.barcodeDataUrl)}" alt="barcode" /></div>`
    : "";

  // ── Custom QR (merchant-supplied image) ──
  const customQrSrc = input.customQrDataUrl && /^(https?:|data:image\/)/.test(input.customQrDataUrl) ? input.customQrDataUrl : "";
  const customQrHtml = (opts.showCustomQr && customQrSrc)
    ? `<div class="custom-qr">
        <img src="${esc(customQrSrc)}" alt="custom qr" />
        ${opts.customQrCaption ? `<div class="custom-qr-cap">${esc(opts.customQrCaption)}</div>` : ""}
      </div>`
    : "";

  // ── Referral ──
  const referralHtml = opts.showReferralLink
    ? `<div class="referral">
        ${opts.referralLinkText ? `<p>${esc(opts.referralLinkText)}</p>` : ""}
        ${input.referralUrl ? `<p class="mono">${esc(input.referralUrl)}</p>` : ""}
        ${input.referralCode ? `<p>Code: <strong>${esc(input.referralCode)}</strong></p>` : ""}
      </div>`
    : "";

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fontFamily}; font-size: 12px; color: #1f2937; background: #fff; }
    .page { max-width: 760px; margin: 0 auto; padding: 28px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; }
    .link { color: ${brandColor}; }

    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .header .left { max-width: 62%; }
    .logo { width: 46px; height: 46px; object-fit: contain; border-radius: 999px; border: 1px solid #e5e7eb; margin-bottom: 8px; display: block; }
    .biz-name { font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.3px; }
    .biz-tagline { font-size: 11px; color: #6b7280; font-style: italic; margin-top: 2px; }
    .biz-meta { font-size: 11px; color: #6b7280; margin-top: 8px; line-height: 1.7; }
    .invoice-label { text-align: right; }
    .invoice-label h1 { font-size: 26px; font-weight: 800; color: ${brandColor}; letter-spacing: 1px; text-transform: uppercase; }
    .invoice-label .inv-num { font-size: 12px; color: #374151; font-weight: 700; margin-top: 6px; }
    .invoice-label .inv-date { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .invoice-label .inv-status { font-size: 11px; font-weight: 700; color: ${brandColor}; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

    .header-note { font-size: 11px; color: #6b7280; margin-top: 16px; line-height: 1.6; background: #f9fafb; border-radius: 6px; padding: 8px 10px; }

    .cust-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 22px; }
    .cust-panel { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; background: #f9fafb; min-width: 240px; }
    .cust-head { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; }
    .cust-name { font-size: 13px; font-weight: 600; color: #111827; margin-top: 3px; }
    .cust-line { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .cust-qr { text-align: center; flex-shrink: 0; }
    .cust-qr-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 4px; }
    .cust-qr img { width: 72px; height: 72px; object-fit: contain; }
    .cust-qr-code { font-size: 9px; color: #6b7280; margin-top: 3px; font-family: 'Courier New', monospace; }

    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    thead th { padding: 8px 4px; font-size: 11px; font-weight: 700; color: #111827; text-align: left; border-bottom: 2px solid #e5e7eb; }
    thead th.right { text-align: right; }
    thead th.center { text-align: center; }
    .td-name { padding: 9px 4px; border-bottom: 1px solid #f3f4f6; }
    .td-warranty { font-size: 10px; color: #059669; margin-top: 2px; }
    .td-serial { font-size: 10px; color: #6b7280; margin-top: 1px; font-family: 'Courier New', monospace; }
    .td-center { padding: 9px 4px; text-align: center; border-bottom: 1px solid #f3f4f6; }
    .td-right { padding: 9px 4px; text-align: right; border-bottom: 1px solid #f3f4f6; }

    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 6px; }
    .totals { width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 4px; font-size: 12px; }
    .totals-row .lbl { color: #6b7280; }
    .totals-total { display: flex; justify-content: space-between; padding: 9px 4px; margin-top: 2px; font-size: 14px; font-weight: 800; color: ${brandColor}; border-top: 2px solid #e5e7eb; }

    .loyalty { display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; color: #047857; font-size: 11px; font-weight: 600; padding: 7px 12px; border-radius: 8px; margin-top: 14px; }

    .payment { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; margin-top: 14px; }
    .pay-head { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 6px; }
    .pay-methods { display: flex; flex-wrap: wrap; gap: 5px; }
    .pay-methods .chip { border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 7px; font-size: 10px; color: #6b7280; }
    .pay-bank { font-size: 11px; color: #6b7280; font-family: 'Courier New', monospace; line-height: 1.6; margin-top: 6px; }

    .notes { margin-top: 18px; display: flex; flex-direction: column; gap: 12px; }
    .note-block { max-width: 80%; }
    .note-head { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 3px; }
    .note-body { font-size: 11px; color: #374151; line-height: 1.6; }

    .footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; line-height: 1.7; }
    .footer .thank-you { color: ${brandColor}; font-weight: 700; font-size: 12px; }
    .socials { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 8px; font-size: 11px; color: #6b7280; }
    .socials span { display: inline-flex; align-items: center; gap: 4px; }
    .socials svg { flex-shrink: 0; }

    .barcode { text-align: center; margin-top: 18px; }
    .barcode img { height: 46px; max-width: 70%; object-fit: contain; }

    .custom-qr { text-align: center; margin-top: 18px; }
    .custom-qr img { width: 96px; height: 96px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px; }
    .custom-qr-cap { font-size: 11px; color: #6b7280; margin-top: 6px; }

    .referral { border-top: 1px solid #e5e7eb; margin-top: 16px; padding-top: 12px; text-align: center; font-size: 11px; color: #6b7280; line-height: 1.7; }
    .referral .mono { font-family: 'Courier New', monospace; font-size: 10px; color: #9ca3af; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4 portrait; margin: 12mm; }
      .page { padding: 0; max-width: 100%; }
    }
  `;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title} ${esc(input.documentNumber)}</title>
<style>${css}</style>
</head><body>
<div class="page"><div class="card">

  <div class="header">
    <div class="left">
      ${logoHtml}
      <div class="biz-name">${businessName}</div>
      ${showTagline && tagline ? `<div class="biz-tagline">${tagline}</div>` : ""}
      ${bizMeta ? `<div class="biz-meta">${bizMeta}</div>` : ""}
    </div>
    <div class="invoice-label">
      <h1>${title}</h1>
      ${metaRight.join("")}
    </div>
  </div>

  ${headerText}
  ${customerRow}

  <table>
    <thead>
      <tr>
        <th style="width:52%">Item</th>
        <th class="center" style="width:10%">Qty</th>
        <th class="right" style="width:19%">Rate</th>
        <th class="right" style="width:19%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td class="td-name" colspan="4" style="font-style:italic;color:#9ca3af">No items</td></tr>`}
    </tbody>
  </table>

  <div class="totals-wrap"><div class="totals">${totalsRows.join("")}</div></div>

  ${loyaltyHtml}
  ${paymentHtml}
  ${notesHtml}
  ${footerHtml}
  ${barcodeHtml}
  ${customQrHtml}
  ${referralHtml}

</div></div>
</body></html>`;
}
