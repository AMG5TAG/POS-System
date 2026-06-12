import type { Transaction } from "@workspace/api-client-react";
import { buildInvoiceHtml } from "@workspace/sales-documents";
import QRCode from "qrcode";
import { getSocialLabel, getSocialHandle, getSocialIconSvg, getSocialBrandColor } from "@/lib/social-links";
import { customerDisplayName } from "@/lib/customer-name";
import { publicOrigin } from "@/lib/public-url";

export interface ReceiptBusinessInfo {
  businessName?: string;
  abn?: string;
  website?: string;
  email?: string;
  brandColor?: string;
  tagline?: string;
  logo?: string;
  phone?: string;
  address?: string;
  partnerReferralCode?: string;
}

/** Normalized layout family shared by the Management preview and the printers. */
export type ReceiptStyleVariant = "professional" | "modern" | "minimal";

/**
 * Maps a stored `selectedStyle` value onto a normalized layout family.
 * Accepts both the template-card ids (`ar-pro`, `ar-modern`, `ar-minimal`,
 * `i-modern`, `q-minimal`, …) and the legacy plain values
 * (`professional`/`modern`/`minimal`). Anything unknown falls back to
 * `professional`.
 */
export function normalizeReceiptStyle(style?: string): ReceiptStyleVariant {
  const s = (style ?? "").toLowerCase();
  if (s.endsWith("minimal")) return "minimal";
  if (s.endsWith("modern") || s.endsWith("bold")) return "modern";
  return "professional";
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
  /* ─── A4 Receipt / Invoice layout + extended toggles ─── */
  styleVariant?: ReceiptStyleVariant;
  showTagline?: boolean;
  showAllCustomerDetails?: boolean;
  showSocialLinks?: boolean;
  paymentTerms?: string;
  invoiceNotes?: string;
  bankDetails?: string;
  paymentSectionHeading?: string;
  socialLinks?: Record<string, string>;
  paymentTypes?: string[];
  /** When true, social icons in A4/color documents render in each platform's
   *  official brand color instead of the surrounding muted text color.
   *  Has no effect on thermal/monochrome receipts. */
  socialIconBrandColors?: boolean;
  /**
   * When the overall cart discount was entered as a percentage, pass the
   * numeric percentage here (e.g. 10 for 10%).  The receipt will then render
   * the discount label as "10% discount" instead of the plain "Discount" text.
   * Leave undefined (or 0) for dollar-amount discounts.
   */
  overallDiscountPct?: number;
  /* ─── Service Ticket field-visibility toggles ─── */
  showCustomerDetails?: boolean;
  showDeviceDetails?: boolean;
  showWorkDescription?: boolean;
  warrantyText?: string;
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

/* ─── Quick-code (merge variable) resolution ──────────────────────────────────
   Every quick code offered in Management → Templates → Sales resolves here, so
   the same codes work across all sales templates (thermal, A4 receipt, invoice,
   quote, service ticket). Unknown codes resolve to "" rather than printing a
   literal {{…}}. */

function businessTemplateVars(biz?: ReceiptBusinessInfo): Record<string, string> {
  const b = biz ?? {};
  const refCode = b.partnerReferralCode ?? "";
  const refUrl = refCode ? `${publicOrigin()}/register?ref=${encodeURIComponent(refCode)}` : "";
  return {
    "business.name": b.businessName ?? "",
    "business.abn": b.abn ?? "",
    "business.email": b.email ?? "",
    "business.phone": b.phone ?? "",
    "business.website": b.website ?? "",
    "business.tagline": b.tagline ?? "",
    "business.address": b.address ?? "",
    "business.partner_referral_code": refCode,
    "business.partner_referral_url": refUrl,
  };
}

/** Full variable map for a sale (receipt / invoice / quote). */
export function buildTemplateVars(tx: Transaction, biz?: ReceiptBusinessInfo): Record<string, string> {
  const created = tx.createdAt ? new Date(tx.createdAt) : new Date();
  const c = (tx.customer ?? null) as null | {
    id?: number; firstName?: string | null; lastName?: string | null; email?: string | null;
    phone?: string | null; loyaltyPoints?: number | null; tierName?: string | null; totalSpent?: number | null;
  };
  const itemCount = ((tx.items ?? []) as Array<{ quantity?: number }>).reduce((s, i) => s + (i.quantity ?? 1), 0);
  const discountTotal = Number((tx as { discountTotal?: number | null }).discountTotal ?? 0);
  const discountPct = (tx as { discountPct?: number | null }).discountPct;
  return {
    ...businessTemplateVars(biz),
    "customer.name": c ? (customerDisplayName(c, "") || "") : "",
    "customer.first_name": c?.firstName ?? "",
    "customer.email": c?.email ?? "",
    "customer.phone": c?.phone ?? "",
    "customer.loyalty_points": c?.loyaltyPoints != null ? `${c.loyaltyPoints}` : "",
    "customer.loyalty_tier": c?.tierName ?? "",
    "customer.id": c?.id != null ? `CUS-${c.id}` : "",
    "customer.total_spent": c?.totalSpent != null ? fmtAUD(Number(c.totalSpent)) : "",
    "transaction.number": tx.receiptNumber ? `#${tx.receiptNumber}` : `#${tx.id ?? ""}`,
    "transaction.date": created.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" }),
    "transaction.time": created.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
    "transaction.total": fmtAUD(Number(tx.total ?? 0)),
    "transaction.gst": fmtAUD(Number(tx.taxTotal ?? 0)),
    "transaction.subtotal": fmtAUD(Number(tx.subtotal ?? 0)),
    "transaction.items": `${itemCount}`,
    "transaction.payment_method": (tx.paymentMethod ?? "").toUpperCase(),
    "transaction.change": fmtAUD(Number((tx as { changeDue?: number | null }).changeDue ?? 0)),
    "promo.discount": discountPct ? `${discountPct}% off` : (discountTotal > 0 ? fmtAUD(discountTotal) : ""),
    "promo.savings": discountTotal > 0 ? fmtAUD(discountTotal) : "",
    "promo.code": "",
    "promo.expiry": "",
    "promo.min_spend": "",
    "promo.description": "",
  };
}

/** Replace every {{code}} from the supplied map; unknown codes become "". */
export function applyTemplateVars(text: string | undefined | null, vars: Record<string, string>): string {
  if (!text) return "";
  return text.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, k: string) => vars[k.toLowerCase()] ?? "");
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

export async function printReceipt(
  tx: Transaction,
  businessInfo?: ReceiptBusinessInfo,
  opts?: ReceiptTemplateOpts,
): Promise<void> {
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

  const items = (tx.items ?? []) as Array<{ productName?: string; quantity?: number; unitPrice?: number; totalPrice?: number; discount?: number; digitalCodes?: string[]; warranty?: string | null; serials?: string[] }>;

  const itemRows = items.map((item) => {
    const name = esc(item.productName ?? "Item");
    const qty = item.quantity ?? 1;
    const lineTotal = item.totalPrice ?? (item.unitPrice ?? 0) * qty;
    const warranty = item.warranty && item.warranty.trim()
      ? `<div class="gray" style="font-size:10px">🛡 ${esc(item.warranty.trim())}</div>` : "";
    const serials = item.serials && item.serials.length
      ? `<div class="gray" style="font-size:10px">S/N: ${esc(item.serials.join(", "))}</div>` : "";
    return `<tr><td>${name}${warranty}${serials}</td><td class="tcenter">${qty}</td><td class="right">${fmtAUD(lineTotal)}</td></tr>`;
  }).join("");

  const subtotal = tx.subtotal ?? 0;
  const taxTotal = tx.taxTotal ?? 0;
  const total = tx.total ?? 0;
  const pmLabel = tx.paymentMethod?.toUpperCase() ?? "";

  const fontFamily = tpl.fontFamily === "Courier New" ? "'Courier New', monospace" : (tpl.fontFamily ?? "'Courier New', monospace");

  const templateVars = buildTemplateVars(tx, businessInfo);
  const resolveStr = (text?: string) => esc(applyTemplateVars(text, templateVars));

  const thankYou = resolveStr(tpl.thankYouMsg);
  const footer = resolveStr(tpl.footerText);
  const header = resolveStr(tpl.headerText);
  const customMsg = resolveStr(tpl.customMessage);
  const escReceiptNum = esc(receiptNum);

  const socialEntries = Object.entries(tpl.socialLinks ?? {}).filter(([, v]) => v);
  const socialHtml = (tpl.showSocialLinks && socialEntries.length)
    ? `<div class="socials">${socialEntries.map(([k, v]) => `<span>${getSocialIconSvg(k, 10)}<strong>${esc(getSocialLabel(k))}</strong> ${esc(getSocialHandle(String(v)))}</span>`).join("")}</div>`
    : "";

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
        ${tx.discountTotal ? `<div class="row"><span class="gray">${tpl.overallDiscountPct ? `${tpl.overallDiscountPct}% discount` : "Discount"}</span><span>−${fmtAUD(tx.discountTotal)}</span></div>` : ""}
        <div class="row bold"><span>TOTAL AUD</span><span>${fmtAUD(total)}</span></div>
        ${tpl.showPaymentMethods && pmLabel ? `<div class="row gray"><span>${pmLabel}</span><span>Approved</span></div>` : ""}
      </div>
      <div class="center gray small bdr-t pt mt">
        ${thankYou ? `<p>${thankYou}</p>` : ""}
        ${footer ? `<p>${footer}</p>` : ""}
        ${customMsg ? `<p style="line-height:1.5;margin-top:4px">${customMsg}</p>` : ""}
        ${socialHtml}
      </div>
      ${items.some((i) => i.digitalCodes?.length)
        ? `<div class="bdr-t pt mt">
            <p class="bold upper small" style="color:#2563eb;margin-bottom:4px">Digital Code${items.filter((i) => i.digitalCodes?.length).length > 1 ? "s" : ""}</p>
            ${items.flatMap((i) => {
              const codes = i.digitalCodes ?? [];
              return codes.map((c) =>
                `<div class="row" style="margin-bottom:2px">
                  <span class="mono bold" style="letter-spacing:2px;font-size:11px">${esc(c)}</span>
                  <span class="gray small">${esc(i.productName ?? "Item")}</span>
                </div>`
              );
            }).join("")}
            <p class="gray small" style="margin-top:2px">Keep this receipt for your code(s).</p>
          </div>`
        : ""}
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
    .socials { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 4px; }
    .socials span { display: inline-flex; align-items: center; gap: 3px; }
    @media print {
      body { padding: 0; }
      @page { margin: 8mm; size: 80mm auto; }
    }
  `;

  /* ── Customer QR code ────────────────────────────────────────────────── */
  let qrBlock = "";
  if (tpl.showCustomerQr && tx.customer?.id) {
    try {
      const qrDataUrl = await QRCode.toDataURL(`CUS-${tx.customer.id}`, { width: 80, margin: 1 });
      qrBlock = `<div class="center mt bdr-t pt">
        <div class="gray small" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Customer Profile</div>
        <div style="display:inline-block;border:1px solid #e5e7eb;padding:4px;border-radius:4px">
          <img src="${qrDataUrl}" style="width:72px;height:72px;display:block" alt="QR">
        </div>
        ${tpl.loyaltyQrText ? `<p class="gray small" style="margin-top:4px">${esc(tpl.loyaltyQrText)}</p>` : ""}
      </div>`;
    } catch { /* silently skip if QR generation fails */ }
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${escReceiptNum}</title><style>${css}</style></head><body>${body}${qrBlock}</body></html>`;

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

/**
 * Shared A4 document renderer for the Invoice and Quote paths. Both render
 * through the single-source-of-truth `buildInvoiceHtml` layout; only the
 * heading (`title`), the default status, and the print-window label differ.
 */
function printA4Document(
  title: string,
  defaultStatus: string,
  windowLabel: string,
  tx: Transaction,
  businessInfo?: ReceiptBusinessInfo,
  opts?: ReceiptTemplateOpts,
): void {
  const receiptNum = tx.receiptNumber ? tx.receiptNumber : `${tx.id}`;
  const escReceiptNum = esc(receiptNum);
  const pmLabel = (tx.paymentMethod ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const customer = tx.customer;
  const customerName = customer
    ? customerDisplayName(customer, "") || customer.email || ""
    : "";

  const items = (tx.items ?? []) as Array<{ productName?: string; quantity?: number; unitPrice?: number; totalPrice?: number; warranty?: string | null; serials?: string[] }>;

  // Merge in the historical defaults this path applied before delegating to
  // the shared renderer, so existing print output stays equivalent.
  const baseOptions: ReceiptTemplateOpts = {
    showAbn: true,
    showGstBreakdown: true,
    showWebsite: true,
    thankYouMsg: "Thank you for your business.",
    footerText: "",
    ...opts,
  };

  // Resolve quick codes in the free-text fields before the shared renderer
  // escapes them. (buildInvoiceHtml escapes, so we substitute raw values here.)
  const templateVars = buildTemplateVars(tx, businessInfo);
  const r = (t?: string) => { const v = applyTemplateVars(t, templateVars); return v || undefined; };
  const options: ReceiptTemplateOpts = {
    ...baseOptions,
    headerText: r(baseOptions.headerText),
    thankYouMsg: r(baseOptions.thankYouMsg),
    footerText: r(baseOptions.footerText),
    paymentTerms: r(baseOptions.paymentTerms),
    invoiceNotes: r(baseOptions.invoiceNotes),
    bankDetails: r(baseOptions.bankDetails),
    paymentSectionHeading: r(baseOptions.paymentSectionHeading),
  };

  const html = buildInvoiceHtml({
    title,
    documentNumber: receiptNum,
    dateStr: new Date(tx.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" }),
    status: tx.status ?? defaultStatus,
    paymentMethodLabel: pmLabel || null,
    business: {
      name: businessInfo?.businessName ?? "Your Store",
      abn: businessInfo?.abn ?? null,
      website: businessInfo?.website ?? null,
      email: businessInfo?.email ?? null,
      tagline: businessInfo?.tagline ?? null,
      brandColor: businessInfo?.brandColor ?? "#374151",
      logoUrl: businessInfo?.logo ?? null,
    },
    customer: customer
      ? {
          name: customerName,
          email: customer.email ?? null,
          phone: (customer as { phone?: string }).phone ?? null,
        }
      : null,
    items: items.map((item) => ({
      description: item.productName ?? "Item",
      quantity: item.quantity ?? 1,
      unitPrice: item.unitPrice ?? 0,
      amount: item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 1),
      warranty: item.warranty ?? null,
      serials: item.serials ?? null,
    })),
    subtotal: (tx.subtotal ?? 0) - (tx.taxTotal ?? 0),
    taxTotal: tx.taxTotal ?? 0,
    discountTotal: tx.discountTotal ?? 0,
    // Optional extras some callers (e.g. the Invoices page) attach to the tx so
    // partially-paid balances and discount labels render. Plain POS receipts
    // omit these, so behaviour there is unchanged.
    discountLabel: (tx as { discountLabel?: string | null }).discountLabel ?? undefined,
    total: tx.total ?? 0,
    amountPaid: (tx as { amountPaid?: number | null }).amountPaid ?? undefined,
    options,
  });

  openPrintWindow(html, `${windowLabel} ${escReceiptNum}`);
}

export function printA4Invoice(
  tx: Transaction,
  businessInfo?: ReceiptBusinessInfo,
  opts?: ReceiptTemplateOpts,
): void {
  printA4Document("Tax Invoice", "completed", "Invoice", tx, businessInfo, opts);
}

/* ─── A4 quote ─────────────────────────────────────────────────────────── */
/* Same layout as the Invoice but titled "Quote" (no payment/paid badge). */

export function printA4Quote(
  tx: Transaction,
  businessInfo?: ReceiptBusinessInfo,
  opts?: ReceiptTemplateOpts,
): void {
  printA4Document("Quote", "quote", "Quote", tx, businessInfo, opts);
}

/* ─── A4 sales receipt ─────────────────────────────────────────────────── */
/* Shares the same layout as the Invoice but with a "Receipt" title. */

export async function printA4Receipt(
  tx: Transaction,
  businessInfo?: ReceiptBusinessInfo,
  opts?: ReceiptTemplateOpts,
): Promise<void> {
  const rawBusinessName = businessInfo?.businessName ?? "Your Store";
  const rawAbn = businessInfo?.abn ?? "";
  const rawWebsite = businessInfo?.website ?? "";
  const rawEmail = businessInfo?.email ?? "";
  const rawBrandColor = businessInfo?.brandColor ?? "#374151";
  const rawTagline = businessInfo?.tagline ?? "";
  const rawLogo = businessInfo?.logo ?? "";
  const businessName = esc(rawBusinessName);
  const abn = esc(rawAbn);
  const website = esc(rawWebsite);
  const contactEmail = esc(rawEmail);
  const tagline = esc(rawTagline);
  const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(rawBrandColor) ? rawBrandColor : "#374151";
  const logoUrl = /^(https?:|data:image\/|\/)/.test(rawLogo) ? rawLogo : "";

  const tpl: ReceiptTemplateOpts = {
    showLogo: true,
    showAbn: true,
    showGstBreakdown: true,
    showWebsite: true,
    showPaymentMethods: true,
    thankYouMsg: "Thank you for your purchase.",
    footerText: "",
    ...opts,
  };
  const variant = normalizeReceiptStyle(tpl.styleVariant);

  const receiptNum = tx.receiptNumber ? tx.receiptNumber : `${tx.id}`;
  const escReceiptNum = esc(receiptNum);
  const dateStr = new Date(tx.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  const pmLabel = (tx.paymentMethod ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const customer = tx.customer;
  const customerName = customer
    ? esc(customerDisplayName(customer, "") || customer.email || "")
    : "";
  const customerEmail = customer ? esc(customer.email ?? "") : "";
  const customerPhone = customer ? esc((customer as { phone?: string }).phone ?? "") : "";

  const items = (tx.items ?? []) as Array<{ productName?: string; quantity?: number; unitPrice?: number; totalPrice?: number; discount?: number; digitalCodes?: string[]; warranty?: string | null; serials?: string[] }>;
  const warrantyHtml = (item: { warranty?: string | null; serials?: string[] }) => {
    const w = item.warranty && item.warranty.trim()
      ? `<div style="font-size:10px;color:#059669;margin-top:2px">🛡 ${esc(item.warranty.trim())}</div>` : "";
    const s = item.serials && item.serials.length
      ? `<div style="font-size:10px;color:#6b7280;margin-top:1px;font-family:'Courier New',monospace">S/N: ${esc(item.serials.join(", "))}</div>` : "";
    return w + s;
  };

  const subtotal = tx.subtotal ?? 0;
  const taxTotal = tx.taxTotal ?? 0;
  const discountTotal = tx.discountTotal ?? 0;
  const total = tx.total ?? 0;
  const exGst = subtotal - taxTotal;
  const loyaltyEarned = Number((tx as { loyaltyEarned?: number }).loyaltyEarned ?? 0);
  const fontFamily = tpl.fontFamily || "'Helvetica Neue', Arial, sans-serif";

  const templateVars = buildTemplateVars(tx, businessInfo);
  const resolveStr = (text?: string) => esc(applyTemplateVars(text, templateVars));

  const header = resolveStr(tpl.headerText);
  const footerTxt = resolveStr(tpl.footerText);
  const thankYou = resolveStr(tpl.thankYouMsg);
  const customMsg = resolveStr(tpl.customMessage);
  const terms = resolveStr(tpl.paymentTerms);
  const notesHtml = tpl.invoiceNotes ? `<p>${resolveStr(tpl.invoiceNotes).replace(/\n/g, "<br>")}</p>` : "";

  /* ─── shared, option-gated building blocks ─────────────────────────── */
  const customerHtml = tpl.showAllCustomerDetails
    ? `<p class="muted-label">Customer</p>
       <p class="strong">${customerName || "—"}</p>
       ${customerEmail ? `<p class="muted">${customerEmail}</p>` : ""}
       ${customerPhone ? `<p class="muted">${customerPhone}</p>` : ""}`
    : (customerName ? `<p class="strong">${customerName}</p>` : "");

  let qrDataUrlA4 = "";
  if (tpl.showCustomerQr && tx.customer?.id) {
    try { qrDataUrlA4 = await QRCode.toDataURL(`CUS-${tx.customer.id}`, { width: 80, margin: 1 }); } catch {}
  }
  const qrHtml = (tpl.showCustomerQr && qrDataUrlA4)
    ? `<div class="qr">
         <div class="qr-cap">Customer Profile</div>
         <img src="${qrDataUrlA4}" style="width:64px;height:64px;display:block;margin:0 auto;border:1px solid #e5e7eb;border-radius:2px" alt="QR">
         ${tpl.loyaltyQrText ? `<div class="qr-sub">${esc(tpl.loyaltyQrText)}</div>` : ""}
       </div>`
    : "";

  const loyaltyHtml = (tpl.showLoyaltyEarned && loyaltyEarned > 0)
    ? `<div class="loyalty"><span>★ Loyalty Earned</span><span>+${loyaltyEarned} pts</span></div>`
    : "";

  const paymentTypes = (tpl.paymentTypes && tpl.paymentTypes.length)
    ? tpl.paymentTypes
    : ["EFTPOS", "Cash", "Visa", "Mastercard"];
  const chipsHtml = paymentTypes.map((m) => `<span class="chip">${esc(m)}</span>`).join("");
  const paymentHtml = (tpl.showPaymentMethods || tpl.bankDetails)
    ? `<div class="paybox">
         ${tpl.paymentSectionHeading ? `<p class="muted-label">${esc(tpl.paymentSectionHeading)}</p>` : ""}
         ${tpl.showPaymentMethods ? `<div class="chips">${chipsHtml}</div>` : ""}
         ${tpl.bankDetails ? `<p class="bank">${esc(tpl.bankDetails)}</p>` : ""}
       </div>`
    : "";

  const socialEntries = Object.entries(tpl.socialLinks ?? {}).filter(([, v]) => v);
  const socialHtml = (tpl.showSocialLinks && socialEntries.length)
    ? `<div class="socials">${socialEntries.map(([k, v]) => `<span>${getSocialIconSvg(k, 11, tpl.socialIconBrandColors ? getSocialBrandColor(k) : null)}<strong>${esc(getSocialLabel(k))}</strong> ${esc(getSocialHandle(String(v)))}</span>`).join("")}</div>`
    : "";

  const barcodeHtml = tpl.showBarcode
    ? `<div class="barcode"><div class="bars"></div></div>`
    : "";

  const paidBadge = `<span class="paid">✓ Paid — ${esc(pmLabel) || "Payment received"}</span>`;

  const footerBlock = `
    <div class="ftr">
      ${terms ? `<p>${terms}</p>` : ""}
      ${notesHtml}
      ${customMsg ? `<p class="msg">${customMsg}</p>` : ""}
      ${thankYou ? `<p class="thanks">${thankYou}</p>` : ""}
      ${tpl.showWebsite && website ? `<p>${website}</p>` : ""}
      ${footerTxt ? `<p>${footerTxt}</p>` : ""}
      ${socialHtml}
    </div>`;

  const digitalCodesHtml = items.some((i) => i.digitalCodes?.length)
    ? `<div class="digital-codes">
        <p class="muted-label">Digital Code${items.filter((i) => i.digitalCodes?.length).length > 1 ? "s" : ""}</p>
        ${items.flatMap((i) => {
          const codes = i.digitalCodes ?? [];
          return codes.map((c) =>
            `<div class="dc-row"><span class="dc-name">${esc(i.productName ?? "Item")}</span><span class="dc-code">${esc(c)}</span></div>`
          );
        }).join("")}
      </div>`
    : "";

  /* ─── per-style item rows ──────────────────────────────────────────── */
  const itemRowsPro = items.map((item) => {
    const name = esc(item.productName ?? "Item");
    const qty = item.quantity ?? 1;
    const unit = item.unitPrice ?? 0;
    const line = item.totalPrice ?? unit * qty;
    return `<tr><td>${name}${warrantyHtml(item)}</td><td class="c">${qty}</td><td class="r">${fmtAUD(unit)}</td><td class="r">${fmtAUD(line)}</td></tr>`;
  }).join("");
  const emptyRow4 = `<tr><td colspan="4" class="empty">No items</td></tr>`;

  const itemRowsModern = items.map((item) => {
    const name = esc(item.productName ?? "Item");
    const qty = item.quantity ?? 1;
    const unit = item.unitPrice ?? 0;
    const line = item.totalPrice ?? unit * qty;
    return `<tr><td>${name} <span class="muted">×${qty}</span>${warrantyHtml(item)}</td><td class="r">${fmtAUD(line)}</td></tr>`;
  }).join("");
  const emptyRow2 = `<tr><td colspan="2" class="empty">No items</td></tr>`;

  const itemLinesMinimal = items.map((item) => {
    const name = esc(item.productName ?? "Item");
    const qty = item.quantity ?? 1;
    const unit = item.unitPrice ?? 0;
    const line = item.totalPrice ?? unit * qty;
    return `<div class="min-item"><span class="min-name">${name}${warrantyHtml(item)}</span><span class="min-qty">${qty}</span><span class="min-amt">${fmtAUD(line)}</span></div>`;
  }).join("");

  /* ─── per-style body ───────────────────────────────────────────────── */
  const logoHtml = tpl.showLogo
    ? (logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="logo">` : `<div class="logo-sq"></div>`)
    : "";

  const professionalBody = `
    <div class="page professional">
      <div class="hdr">
        <div class="hdr-left">
          ${logoHtml}
          <div class="biz">${businessName}</div>
          ${tpl.showTagline && tagline ? `<div class="tagline">${tagline}</div>` : ""}
          <div class="biz-meta">
            ${tpl.showAbn && abn ? `ABN ${abn}<br>` : ""}
            ${contactEmail ? `${contactEmail}<br>` : ""}
            ${tpl.showWebsite && website ? `${website}` : ""}
          </div>
        </div>
        <div class="hdr-right">
          <div class="doc-title">RECEIPT</div>
          <div class="doc-num">${escReceiptNum}</div>
          <div class="doc-date">${dateStr}</div>
        </div>
      </div>
      ${header ? `<p class="custom-header">${header}</p>` : ""}
      <div class="cust-row">
        <div class="cust">${customerHtml}</div>
        ${qrHtml}
      </div>
      <table class="items">
        <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Total</th></tr></thead>
        <tbody>${itemRowsPro || emptyRow4}</tbody>
      </table>
      <div class="totals">
        <div class="trow"><span class="lbl">Subtotal (ex. GST)</span><span>${fmtAUD(exGst)}</span></div>
        ${tpl.showGstBreakdown ? `<div class="trow"><span class="lbl">GST (10%)</span><span>${fmtAUD(taxTotal)}</span></div>` : ""}
        ${discountTotal > 0 ? `<div class="trow disc"><span class="lbl">${tpl.overallDiscountPct ? `${tpl.overallDiscountPct}% discount` : "Discount"}</span><span>−${fmtAUD(discountTotal)}</span></div>` : ""}
        <div class="ttotal"><span>Total (AUD)</span><span>${fmtAUD(total)}</span></div>
      </div>
      <div class="badge-row">${paidBadge}</div>
      ${loyaltyHtml}
      ${digitalCodesHtml}
      ${paymentHtml}
      ${barcodeHtml}
      ${footerBlock}
    </div>`;

  const modernBody = `
    <div class="page modern">
      ${logoHtml}
      <div class="band" style="background:${brandColor}">
        <span class="band-biz">${businessName}</span>
        <span class="band-doc">RECEIPT ${escReceiptNum}</span>
      </div>
      ${tpl.showTagline && tagline ? `<div class="tagline">${tagline}</div>` : ""}
      ${header ? `<p class="custom-header">${header}</p>` : ""}
      <div class="grid2">
        <div>
          <div class="muted-label">From</div>
          <div class="strong">${businessName}</div>
          ${tpl.showAbn && abn ? `<div class="muted">ABN ${abn}</div>` : ""}
          ${contactEmail ? `<div class="muted">${contactEmail}</div>` : ""}
          <div class="muted">${dateStr}</div>
        </div>
        <div class="grid2-right">
          <div class="billto">
            <div class="muted-label">Bill To</div>
            ${customerHtml || `<div class="muted">Walk-in</div>`}
          </div>
          ${qrHtml}
        </div>
      </div>
      <table class="items modern-items">
        <thead><tr><th>Description</th><th class="r">Total</th></tr></thead>
        <tbody>${itemRowsModern || emptyRow2}</tbody>
      </table>
      <div class="modern-totals">
        ${tpl.showGstBreakdown ? `<div class="trow"><span class="lbl">GST (10%)</span><span>${fmtAUD(taxTotal)}</span></div>` : ""}
        ${discountTotal > 0 ? `<div class="trow disc"><span class="lbl">${tpl.overallDiscountPct ? `${tpl.overallDiscountPct}% discount` : "Discount"}</span><span>−${fmtAUD(discountTotal)}</span></div>` : ""}
        <div class="modern-total" style="color:${brandColor}"><span>Total Due (AUD)</span><span>${fmtAUD(total)}</span></div>
      </div>
      <div class="badge-row">${paidBadge}</div>
      ${loyaltyHtml}
      ${digitalCodesHtml}
      ${paymentHtml}
      ${barcodeHtml}
      ${footerBlock}
    </div>`;

  const minimalBody = `
    <div class="page minimal">
      ${logoHtml}
      <div class="min-hdr"><span class="strong">${businessName}</span><span class="strong">RECEIPT ${escReceiptNum}</span></div>
      ${tpl.showAbn && abn ? `<div class="muted">ABN: ${abn}</div>` : ""}
      <div class="muted">Date: ${dateStr}</div>
      ${header ? `<p class="custom-header">${header}</p>` : ""}
      <div class="sep"></div>
      <div class="cust-row">
        <div class="cust">${customerHtml}</div>
        ${qrHtml}
      </div>
      <div class="sep"></div>
      ${itemLinesMinimal || `<div class="muted">No items</div>`}
      <div class="sep"></div>
      <div class="min-row"><span>Subtotal (ex. GST)</span><span>${fmtAUD(exGst)}</span></div>
      ${tpl.showGstBreakdown ? `<div class="min-row"><span>GST 10%</span><span>${fmtAUD(taxTotal)}</span></div>` : ""}
      ${discountTotal > 0 ? `<div class="min-row"><span>${tpl.overallDiscountPct ? `${tpl.overallDiscountPct}% discount` : "Discount"}</span><span>−${fmtAUD(discountTotal)}</span></div>` : ""}
      <div class="min-row strong"><span>TOTAL (AUD)</span><span>${fmtAUD(total)}</span></div>
      <div class="min-paid">${paidBadge}</div>
      ${loyaltyHtml}
      ${digitalCodesHtml}
      ${paymentHtml}
      ${footerBlock}
      ${barcodeHtml}
    </div>`;

  const body = variant === "minimal" ? minimalBody : variant === "modern" ? modernBody : professionalBody;

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fontFamily}; font-size: 13px; color: #1f2937; background: #fff; }
    .page { max-width: 780px; margin: 0 auto; padding: 40px; }
    .muted { color: #6b7280; }
    .muted-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 2px; }
    .strong { font-weight: 700; }
    .r { text-align: right; } .c { text-align: center; }
    .empty { font-style: italic; color: #9ca3af; padding: 14px 12px; }
    .custom-header { font-size: 12px; color: #374151; margin: 4px 0 12px; }

    /* professional */
    .professional .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${brandColor}; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { max-height: 46px; max-width: 140px; object-fit: contain; margin-bottom: 8px; display: block; }
    .logo-sq { width: 28px; height: 28px; border-radius: 4px; background: ${brandColor}; margin-bottom: 8px; }
    .biz { font-size: 22px; font-weight: 700; color: ${brandColor}; letter-spacing: -0.3px; }
    .tagline { font-size: 12px; color: #9ca3af; font-style: italic; margin-top: 2px; }
    .biz-meta { font-size: 11px; color: #6b7280; margin-top: 6px; line-height: 1.6; }
    .hdr-right { text-align: right; }
    .doc-title { font-size: 26px; font-weight: 800; color: ${brandColor}; letter-spacing: 1px; }
    .doc-num { font-size: 13px; font-weight: 600; color: #374151; margin-top: 4px; }
    .doc-date { font-size: 12px; color: #6b7280; margin-top: 2px; }

    .cust-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 20px; }
    .cust { flex: 1; min-width: 0; }

    table.items { width: 100%; border-collapse: collapse; }
    .items thead tr { background: ${brandColor}; }
    .items thead th { padding: 9px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #fff; text-align: left; }
    .items thead th.r { text-align: right; } .items thead th.c { text-align: center; }
    .items tbody td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
    .items tbody td.r { text-align: right; } .items tbody td.c { text-align: center; }

    .totals { width: 300px; margin-left: auto; margin-top: 14px; border: 1px solid #e5e7eb; }
    .trow { display: flex; justify-content: space-between; padding: 7px 12px; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
    .trow .lbl { color: #6b7280; } .trow.disc { color: #dc2626; }
    .ttotal { display: flex; justify-content: space-between; padding: 10px 12px; font-size: 14px; font-weight: 700; background: ${brandColor}; color: #fff; }

    .badge-row { margin-top: 18px; }
    .paid { display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 99px; }
    .loyalty { display: flex; justify-content: space-between; max-width: 300px; margin-top: 12px; background: #ecfdf5; color: #047857; font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 6px; }

    .digital-codes { margin-top: 14px; border: 1px solid #e0e7ff; border-radius: 6px; padding: 10px 12px; background: #f5f7ff; }
    .digital-codes .muted-label { margin-bottom: 6px; color: #2563eb; }
    .dc-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .dc-name { font-size: 12px; color: #374151; }
    .dc-code { font-family: monospace; font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #1d4ed8; }

    .paybox { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .chip { border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 8px; font-size: 10px; color: #6b7280; }
    .bank { white-space: pre-wrap; font-family: monospace; font-size: 11px; color: #6b7280; margin-top: 6px; }

    .qr { text-align: center; flex-shrink: 0; }
    .qr-cap { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 4px; }
    .qr-img { width: 64px; height: 64px; margin: 0 auto; border: 1px solid #e5e7eb; background: repeating-conic-gradient(#111827 0% 25%, #fff 0% 50%) 0 0 / 12px 12px; }
    .qr-sub { font-size: 8px; color: #9ca3af; margin-top: 4px; max-width: 84px; }

    .barcode { text-align: center; margin-top: 18px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    .bars { height: 42px; width: 220px; margin: 0 auto; background: repeating-linear-gradient(90deg, #111827 0 2px, #fff 2px 4px, #111827 4px 5px, #fff 5px 9px); }
    .bars-cap { font-family: monospace; font-size: 11px; letter-spacing: 2px; margin-top: 4px; color: #374151; }

    .ftr { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; line-height: 1.7; }
    .ftr .thanks { color: ${brandColor}; font-weight: 600; }
    .ftr .msg { background: #f9fafb; border-radius: 4px; padding: 6px 10px; color: #6b7280; margin: 6px 0; }
    .socials { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 6px; color: #6b7280; }
    .socials span { display: inline-flex; align-items: center; gap: 4px; }

    /* modern */
    .modern .band { display: flex; justify-content: space-between; align-items: center; color: #fff; padding: 16px 18px; border-radius: 6px; margin-bottom: 14px; }
    .band-biz { font-size: 20px; font-weight: 700; }
    .band-doc { font-size: 12px; opacity: 0.85; }
    .modern .tagline { text-align: left; margin: 0 0 10px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .grid2-right { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .modern-totals { margin-top: 10px; }
    .modern-totals .trow { border: none; justify-content: flex-end; gap: 24px; padding: 2px 0; }
    .modern-total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; margin-top: 4px; }

    /* minimal */
    .minimal { font-family: 'Courier New', monospace; font-size: 12px; color: #374151; }
    .min-hdr { display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; }
    .sep { border-top: 1px dashed #d1d5db; margin: 8px 0; }
    .min-item { display: flex; justify-content: space-between; gap: 8px; }
    .min-name { flex: 1; } .min-qty { width: 30px; text-align: right; } .min-amt { width: 76px; text-align: right; }
    .min-row { display: flex; justify-content: space-between; }
    .min-paid { margin-top: 8px; }
    .minimal .qr-img { width: 48px; height: 48px; }
    .minimal .ftr { text-align: left; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4 portrait; margin: 15mm; }
      .page { padding: 0; max-width: 100%; }
    }
  `;

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Sales Receipt ${escReceiptNum}</title>
<style>${css}</style>
</head><body>
${body}
</body></html>`;

  openPrintWindow(html, `Receipt ${escReceiptNum}`);
}

/* ─── A4 service job report ─────────────────────────────────────────────── */

export interface ServiceJobPrintData {
  id: number;
  jobNumber: string;
  status: string;
  bookInDate: string;
  deviceType?: string | null;
  deviceDescription?: string | null;
  serialNumber?: string | null;
  condition?: string | null;
  workDescription?: string | null;
  additionalEquipment?: string | null;
  notes?: string | null;
  /** Accepts numeric value (API) or string representation (DB) */
  estimatedCost?: number | string | null;
  /** Accepts boolean (API) or "true"/"false" string (DB) */
  isPartnerRepair?: boolean | string | null;
  /** Accepts boolean (API) or "true"/"false" string (DB) */
  isCritical?: boolean | string | null;
  /** Accepts boolean (API) or "true"/"false" string (DB) */
  isUnderWarranty?: boolean | string | null;
  scheduledAt?: string | Date | null;
  createdAt: string | Date;
  /** Flattened customer fields from API responses */
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
}

export function printA4ServiceJob(
  job: ServiceJobPrintData,
  businessInfo?: ReceiptBusinessInfo,
  customerOverride?: { name?: string; email?: string; phone?: string },
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

  // Service ticket template options — clean defaults so the report is never blank.
  const tpl: ReceiptTemplateOpts = {
    showCustomerDetails: true,
    showDeviceDetails: true,
    showWorkDescription: true,
    showAbn: true,
    showWebsite: true,
    footerText: "",
    headerText: "",
    warrantyText: "",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    ...opts,
  };
  const fontFamily = tpl.fontFamily || "'Helvetica Neue', Arial, sans-serif";

  // Service tickets have no sale/transaction, so resolve business + the job's
  // customer; any transaction/promo codes resolve to "".
  const svcVars: Record<string, string> = {
    ...businessTemplateVars(businessInfo),
    "customer.name": customerOverride?.name ?? job.customerName ?? "",
    "customer.email": customerOverride?.email ?? job.customerEmail ?? "",
    "customer.phone": customerOverride?.phone ?? job.customerPhone ?? "",
  };
  const resolveStr = (text?: string) => applyTemplateVars(text, svcVars).trim();
  const headerText = resolveStr(tpl.headerText);
  const footerText = resolveStr(tpl.footerText);
  const warrantyText = resolveStr(tpl.warrantyText);

  const escJobNum = esc(job.jobNumber);
  const createdDate = new Date(job.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  const bookInDateStr = job.bookInDate ? esc(job.bookInDate) : "—";
  const scheduledStr = job.scheduledAt
    ? new Date(job.scheduledAt).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const custName = customerOverride?.name ?? job.customerName ?? "";
  const custEmail = customerOverride?.email ?? job.customerEmail ?? "";
  const custPhone = customerOverride?.phone ?? job.customerPhone ?? "";

  const statusLabel = (job.status ?? "pending").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const isWarranty = job.isUnderWarranty === true || job.isUnderWarranty === "true";
  const isCritical = job.isCritical === true || job.isCritical === "true";
  const isPartner  = job.isPartnerRepair === true || job.isPartnerRepair === "true";
  const estimatedCost = job.estimatedCost != null ? parseFloat(String(job.estimatedCost)) : null;

  function row(label: string, value: string | null | undefined, wide = false) {
    if (!value) return "";
    return `<tr><td class="cell-label">${esc(label)}</td><td class="${wide ? "cell-value-wide" : "cell-value"}">${esc(value)}</td></tr>`;
  }

  const badgeRow = [
    isWarranty  ? `<span class="badge badge-blue">Under Warranty</span>` : "",
    isCritical  ? `<span class="badge badge-red">Critical</span>` : "",
    isPartner   ? `<span class="badge badge-purple">Partner Repair</span>` : "",
  ].filter(Boolean).join(" ");

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fontFamily}; font-size: 13px; color: #1f2937; background: #fff; }
    .page { max-width: 780px; margin: 0 auto; padding: 40px; }

    .header-note { background: #f9fafb; border: 1px solid #e5e7eb; padding: 10px 14px; margin-bottom: 24px; font-size: 12px; color: #374151; line-height: 1.6; white-space: pre-wrap; text-align: center; }
    .warranty-note { border: 1px dashed ${brandColor}; padding: 12px 14px; margin-bottom: 24px; font-size: 11px; color: #6b7280; line-height: 1.6; white-space: pre-wrap; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 3px solid ${brandColor}; }
    .biz-name { font-size: 22px; font-weight: 700; color: ${brandColor}; }
    .biz-meta { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.7; }
    .report-label { text-align: right; }
    .report-label h1 { font-size: 26px; font-weight: 800; color: ${brandColor}; text-transform: uppercase; letter-spacing: 1px; }
    .report-label .job-num { font-size: 14px; color: #374151; font-weight: 600; margin-top: 4px; }
    .report-label .job-date { font-size: 11px; color: #6b7280; margin-top: 2px; }

    .two-col { display: flex; gap: 24px; margin-bottom: 28px; }
    .two-col > div { flex: 1; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #fff; background: ${brandColor}; padding: 5px 10px; margin-bottom: 0; }

    table.detail { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; }
    .cell-label { width: 160px; padding: 7px 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; background: #f9fafb; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .cell-value { padding: 7px 10px; font-size: 13px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .cell-value-wide { padding: 7px 10px; font-size: 13px; border-bottom: 1px solid #f3f4f6; vertical-align: top; white-space: pre-wrap; line-height: 1.6; }

    .text-block { border: 1px solid #e5e7eb; border-top: none; padding: 14px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; color: #374151; min-height: 48px; }

    .cost-box { border: 2px solid ${brandColor}; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .cost-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
    .cost-value { font-size: 24px; font-weight: 800; color: ${brandColor}; }

    .badges { margin: 12px 0; display: flex; gap: 8px; flex-wrap: wrap; }
    .badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }
    .badge-blue   { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .badge-red    { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-purple { background: #faf5ff; color: #7c3aed; border: 1px solid #e9d5ff; }

    .status-pill { display: inline-block; padding: 3px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }

    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; line-height: 1.8; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4 portrait; margin: 15mm; }
      .page { padding: 0; max-width: 100%; }
      .section { page-break-inside: avoid; }
      .text-block { page-break-inside: auto; }
    }
  `;

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Service Report ${escJobNum}</title>
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
    <div class="report-label">
      <h1>Service Report</h1>
      <div class="job-num">Job ${escJobNum}</div>
      <div class="job-date">Issued ${esc(createdDate)}</div>
    </div>
  </div>

  ${headerText ? `<div class="header-note">${esc(headerText)}</div>` : ""}

  <div class="two-col">
    ${tpl.showCustomerDetails && (custName || custEmail || custPhone) ? `
    <div class="section">
      <div class="section-title">Customer</div>
      <table class="detail">
        ${row("Name", custName)}
        ${row("Email", custEmail)}
        ${row("Phone", custPhone)}
      </table>
    </div>` : ""}

    <div class="section">
      <div class="section-title">Job Details</div>
      <table class="detail">
        <tr><td class="cell-label">Status</td><td class="cell-value"><span class="status-pill">${esc(statusLabel)}</span></td></tr>
        ${row("Book-In Date", bookInDateStr)}
        ${scheduledStr ? row("Scheduled", scheduledStr) : ""}
        ${estimatedCost != null ? `<tr><td class="cell-label">Est. Cost</td><td class="cell-value" style="font-weight:700;color:${brandColor}">$${estimatedCost.toFixed(2)}</td></tr>` : ""}
      </table>
      ${badgeRow ? `<div class="badges">${badgeRow}</div>` : ""}
    </div>
  </div>

  ${tpl.showDeviceDetails && (job.deviceType || job.deviceDescription || job.serialNumber || job.condition) ? `
  <div class="section">
    <div class="section-title">Device Information</div>
    <table class="detail">
      ${row("Device Type", job.deviceType)}
      ${row("Description", job.deviceDescription)}
      ${row("Serial Number", job.serialNumber)}
      ${row("Condition", job.condition)}
    </table>
  </div>` : ""}

  ${tpl.showWorkDescription && job.workDescription ? `
  <div class="section">
    <div class="section-title">Work Description</div>
    <div class="text-block">${esc(job.workDescription)}</div>
  </div>` : ""}

  ${job.additionalEquipment ? `
  <div class="section">
    <div class="section-title">Additional Equipment / Parts</div>
    <div class="text-block">${esc(job.additionalEquipment)}</div>
  </div>` : ""}

  ${job.notes ? `
  <div class="section">
    <div class="section-title">Technician Notes</div>
    <div class="text-block">${esc(job.notes)}</div>
  </div>` : ""}

  ${estimatedCost != null ? `
  <div class="cost-box">
    <div class="cost-label">Estimated Cost (inc. GST)</div>
    <div class="cost-value">$${estimatedCost.toFixed(2)}</div>
  </div>` : ""}

  ${warrantyText ? `<div class="warranty-note">${esc(warrantyText)}</div>` : ""}

  <div class="footer">
    ${footerText ? `<p>${esc(footerText)}</p>` : `<p>Thank you for choosing ${businessName}.</p>`}
    ${tpl.showAbn && abn ? `<p>ABN ${abn}</p>` : ""}
    ${tpl.showWebsite && website ? `<p>${esc(website)}</p>` : ""}
  </div>

</div>
</body></html>`;

  openPrintWindow(html, `Service Report ${escJobNum}`);
}
