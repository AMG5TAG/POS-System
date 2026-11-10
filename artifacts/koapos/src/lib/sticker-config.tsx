import { useMemo, useState } from "react";
import { releasePageLockAfterPrint } from "@/lib/release-page-lock";
import {
  Package, User, RotateCcw, Wrench, MapPin, DollarSign, LayoutGrid,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useGetMerchant, useGetPosSettings } from "@workspace/api-client-react";
import { toast } from "sonner";
import { useBusinessProfile } from "@/lib/business-profile";
import { publicOrigin, serviceJobQrUrl } from "@/lib/public-url";
import { parseHardwareConfig } from "@/lib/hardware-config";
import { isSilentRoute, printDocument } from "@/lib/print-router";
import { formatPhoneForDisplay } from "./phone-format";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface DymoSize {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  series: string;
}

export interface StickerField {
  key: string;
  label: string;
  defaultValue: string;
  type?: "text" | "toggle";
}

export interface StickerType {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
  defaultSize: string;
  fields: StickerField[];
}

export interface StickerTemplate {
  id: string;
  name: string;
  description?: string;
  typeId: string;
  sizeId: string;
  fields: Record<string, string>;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

/* ─── Quick Codes ────────────────────────────────────────────────────────── */

export interface QuickCode {
  code: string;
  label: string;
  group: string;
  example: string;
}

export const QUICK_CODES: QuickCode[] = [
  { code: "{{product.name}}",     label: "Product Name",     group: "Product",  example: "Flat White 250g" },
  { code: "{{product.sku}}",      label: "Product SKU",      group: "Product",  example: "BEV-001" },
  { code: "{{product.price}}",    label: "Sale Price",       group: "Product",  example: "$5.50" },
  { code: "{{product.barcode}}",  label: "Barcode",          group: "Product",  example: "9310000123456" },
  { code: "{{product.category}}", label: "Category",         group: "Product",  example: "Beverages" },
  { code: "{{customer.name}}",    label: "Customer Name",    group: "Customer", example: "Sarah Johnson" },
  { code: "{{customer.id}}",      label: "Customer ID",      group: "Customer", example: "#CUS-0042" },
  { code: "{{customer.loyalty}}", label: "Loyalty Number",   group: "Customer", example: "LYL-20491" },
  { code: "{{customer.phone}}",   label: "Phone",            group: "Customer", example: "(03) 9000 0000" },
  { code: "{{customer.email}}",   label: "Email",            group: "Customer", example: "customer@email.com" },
  { code: "{{customer.group}}",   label: "Membership Group", group: "Customer", example: "VIP Member" },
  { code: "{{merchant.name}}",    label: "Business Name",    group: "Business", example: "Demo Co" },
  { code: "{{merchant.abn}}",     label: "ABN",              group: "Business", example: "12 345 678 901" },
  { code: "{{merchant.phone}}",   label: "Business Phone",   group: "Business", example: "(03) 9000 0000" },
  { code: "{{date.today}}",       label: "Today's Date",     group: "System",   example: new Date().toLocaleDateString("en-AU") },
  { code: "{{date.time}}",        label: "Current Time",     group: "System",   example: "09:30 AM" },
];

export const FIELD_QUICK_CODES: Record<string, string[]> = {
  productName:  ["{{product.name}}"],
  sku:          ["{{product.sku}}"],
  price:        ["{{product.price}}"],
  wasPrice:     ["{{product.price}}"],
  barcode:      ["{{product.barcode}}"],
  category:     ["{{product.category}}"],
  customerName: ["{{customer.name}}"],
  customerId:   ["{{customer.id}}"],
  loyaltyNo:    ["{{customer.loyalty}}"],
  phone:        ["{{customer.phone}}", "{{merchant.phone}}"],
  email:        ["{{customer.email}}"],
  group:        ["{{customer.group}}"],
  name:         ["{{customer.name}}", "{{merchant.name}}"],
  date:         ["{{date.today}}"],
  dueDate:      ["{{date.today}}"],
  customer:     ["{{customer.name}}"],
  businessName: ["{{merchant.name}}"],
  abn:          ["{{merchant.abn}}"],
};

export interface QuickCodeContext {
  product?: { name?: string; sku?: string; price?: number | null; barcode?: string; category?: string; };
  customer?: { name?: string; id?: string; loyalty?: string; phone?: string; email?: string; group?: string; };
  merchant?: { name?: string; abn?: string; phone?: string; };
}

export function resolveQuickCodes(
  fields: Record<string, string>,
  ctx: QuickCodeContext
): Record<string, string> {
  const today = new Date().toLocaleDateString("en-AU");
  const time  = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
  const subs: Record<string, string> = {
    "{{product.name}}":     ctx.product?.name     ?? "",
    "{{product.sku}}":      ctx.product?.sku       ?? "",
    "{{product.price}}":    ctx.product?.price != null ? `$${Number(ctx.product.price).toFixed(2)}` : "",
    "{{product.barcode}}":  ctx.product?.barcode   ?? "",
    "{{product.category}}": ctx.product?.category  ?? "",
    "{{customer.name}}":    ctx.customer?.name     ?? "",
    "{{customer.id}}":      ctx.customer?.id       ?? "",
    "{{customer.loyalty}}": ctx.customer?.loyalty  ?? "",
    "{{customer.phone}}":   formatPhoneForDisplay(ctx.customer?.phone),
    "{{customer.email}}":   ctx.customer?.email    ?? "",
    "{{customer.group}}":   ctx.customer?.group    ?? "",
    "{{merchant.name}}":    ctx.merchant?.name     ?? "",
    "{{merchant.abn}}":     ctx.merchant?.abn      ?? "",
    "{{merchant.phone}}":   formatPhoneForDisplay(ctx.merchant?.phone),
    "{{date.today}}":       today,
    "{{date.time}}":        time,
  };
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, subs[v] ?? v]));
}

/* ─── DYMO label sizes ───────────────────────────────────────────────────── */

export const DYMO_SIZES: DymoSize[] = [
  // LabelWriter 400/450 series
  { id: "11352",    name: "Return Address (3/4\" × 2\")",       widthMm: 19.1,  heightMm: 50.8, series: "LW" },
  { id: "11353",    name: "Multipurpose (1\" × 1\")",           widthMm: 25.4,  heightMm: 25.4, series: "LW" },
  { id: "11354",    name: "Multipurpose (2¼\" × 1¼\")",        widthMm: 57,    heightMm: 32,   series: "LW" },
  { id: "11355",    name: "Multipurpose (1\" × 2\")",           widthMm: 25.4,  heightMm: 50.8, series: "LW" },
  { id: "30252",    name: "Address (1⅛\" × 3½\")",             widthMm: 28.6,  heightMm: 88.9, series: "LW" },
  { id: "30256",    name: "Shipping (2⅜\" × 4\")",             widthMm: 59,    heightMm: 102,  series: "LW" },
  { id: "30321",    name: "Folder Insert (⁹⁄₁₆\" × 3⁷⁄₁₆\")", widthMm: 14.3,  heightMm: 87.3, series: "LW" },
  { id: "30330",    name: "Multipurpose (1\" × 2⅛\")",         widthMm: 25.4,  heightMm: 54,   series: "LW" },
  { id: "30331",    name: "Large Address (1⅜\" × 3½\")",       widthMm: 35,    heightMm: 88.9, series: "LW" },
  { id: "30334",    name: "Extra Large Ship (4\" × 6\")",       widthMm: 102,   heightMm: 152,  series: "LW" },
  { id: "30336",    name: "Multipurpose (1\" × 2⅛\")",         widthMm: 25.4,  heightMm: 54,   series: "LW" },
  { id: "99014",    name: "Shipping 54×101mm",                  widthMm: 54,    heightMm: 101,  series: "LW" },
  // DYMO 99010 — 28 × 89 mm (was listed here as 36 × 89, which is 99012).
  { id: "S0722370", name: "Standard Address 28×89mm (99010)",    widthMm: 28,    heightMm: 89,   series: "LW" },
  { id: "S0722520", name: "Large Return Address 25×54mm",        widthMm: 25,    heightMm: 54,   series: "LW" },
  // LabelWriter 550 series
  { id: "LW-1x1",   name: "Square 1\" × 1\" (550)",            widthMm: 25.4,  heightMm: 25.4, series: "LW550" },
  { id: "LW-2x1",   name: "Retail Tag 2\" × 1\" (550)",        widthMm: 51,    heightMm: 25.4, series: "LW550" },
  { id: "LW-2.5x1", name: "Price Tag 2½\" × 1\" (550)",        widthMm: 63.5,  heightMm: 25.4, series: "LW550" },
  { id: "LW-4x2",   name: "Large Multipurpose 4\" × 2\" (550)",widthMm: 102,   heightMm: 51,   series: "LW550" },
  // D1 Tape
  { id: "D1-6mm",   name: "D1 Tape 6mm",                       widthMm: 6,     heightMm: 40,   series: "D1"  },
  { id: "D1-9mm",   name: "D1 Tape 9mm",                       widthMm: 9,     heightMm: 40,   series: "D1"  },
  { id: "D1-12mm",  name: "D1 Tape 12mm",                      widthMm: 12,    heightMm: 40,   series: "D1"  },
  { id: "D1-19mm",  name: "D1 Tape 19mm",                      widthMm: 19,    heightMm: 40,   series: "D1"  },
];

/* ─── The one label size ─────────────────────────────────────────────────────
   The shop runs ONE DYMO roll: S0722520, Large Return Address, 25 × 54 mm.
   Every label type — sale tickets, price tags, customer, repair, return,
   address and shelf labels — prints on it, enforced where every label is built
   (buildStickersHtml) and shown in the templates editor and previews, so a
   template saved at another size, or a print path that asks for one, still
   comes out on that roll. The other DYMO_SIZES stay listed only so old saved
   templates still resolve. */
export const LABEL_SIZE_ID = "S0722520";
/** Kept for callers that speak of sale tickets; the same single size. */
export const SALE_TICKET_SIZE_ID = LABEL_SIZE_ID;
export const SALE_TICKET_TYPES: ReadonlySet<string> = new Set(["product", "pricetag"]);

/** The label size every label type prints at: always the one roll, S0722520. */
export function labelSizeFor(_typeId: string, _sizeId?: string | null): string {
  return LABEL_SIZE_ID;
}

/* ─── Sticker types — all label fields are on/off toggles ────────────────── */

export const STICKER_TYPES: StickerType[] = [
  {
    id: "product",
    label: "Product / Stock",
    icon: Package,
    color: "text-blue-500",
    description: "Price tags and shelf labels for stock items",
    defaultSize: LABEL_SIZE_ID,
    fields: [
      { key: "showProductName", label: "Product Name",  defaultValue: "true",  type: "toggle" },
      { key: "showSku",         label: "SKU",           defaultValue: "true",  type: "toggle" },
      { key: "showPrice",       label: "Price",         defaultValue: "true",  type: "toggle" },
      { key: "showCategory",    label: "Category",      defaultValue: "true",  type: "toggle" },
      { key: "showBarcode",     label: "Barcode",       defaultValue: "true",  type: "toggle" },
      { key: "showProductQr",   label: "Product QR",    defaultValue: "false", type: "toggle" },
      { key: "showBizName",     label: "Business Name", defaultValue: "true",  type: "toggle" },
    ],
  },
  {
    id: "customer",
    label: "Customer",
    icon: User,
    color: "text-violet-500",
    description: "Loyalty cards, ID labels and membership stickers",
    defaultSize: LABEL_SIZE_ID,
    fields: [
      { key: "showCustomerName", label: "Customer Name",  defaultValue: "true", type: "toggle" },
      { key: "showCustomerId",   label: "Customer ID",    defaultValue: "true", type: "toggle" },
      { key: "showLoyaltyNo",    label: "Loyalty Number", defaultValue: "true", type: "toggle" },
      { key: "showPhone",        label: "Phone",          defaultValue: "true", type: "toggle" },
      { key: "showGroup",        label: "Group",          defaultValue: "true", type: "toggle" },
      { key: "showBarcode",      label: "Barcode",        defaultValue: "false", type: "toggle" },
      { key: "showCustomerQr",   label: "Customer QR",    defaultValue: "false", type: "toggle" },
      { key: "showBizName",      label: "Business Name",  defaultValue: "true", type: "toggle" },
    ],
  },
  {
    id: "return",
    label: "Return",
    icon: RotateCcw,
    color: "text-amber-500",
    description: "Supplier return (RMA) labels for goods sent back to suppliers",
    defaultSize: LABEL_SIZE_ID,
    fields: [
      { key: "showReturnNo",  label: "RMA #",          defaultValue: "true", type: "toggle" },
      { key: "showDate",      label: "Date",           defaultValue: "true", type: "toggle" },
      { key: "showItem",      label: "Item",           defaultValue: "true", type: "toggle" },
      { key: "showReason",    label: "Reason",         defaultValue: "true", type: "toggle" },
      { key: "showStatus",    label: "Status",         defaultValue: "true", type: "toggle" },
      { key: "showCustomer",  label: "Supplier",       defaultValue: "true", type: "toggle" },
      { key: "showBarcode",   label: "Barcode",        defaultValue: "false", type: "toggle" },
      { key: "showBizName",   label: "Business Name",  defaultValue: "true", type: "toggle" },
    ],
  },
  {
    id: "repair",
    label: "Repair / Service",
    icon: Wrench,
    color: "text-rose-500",
    description: "Job labels for service desk and repair tickets",
    defaultSize: LABEL_SIZE_ID,
    fields: [
      { key: "showJobNo",    label: "Job #",         defaultValue: "true", type: "toggle" },
      { key: "splitJobNo",   label: "Job # on 2 Lines", defaultValue: "false", type: "toggle" },
      { key: "showCustomer", label: "Customer",      defaultValue: "true", type: "toggle" },
      { key: "showDevice",   label: "Device",        defaultValue: "true", type: "toggle" },
      { key: "showFault",    label: "Fault",         defaultValue: "true", type: "toggle" },
      { key: "showDueDate",  label: "Due Date",      defaultValue: "true", type: "toggle" },
      { key: "showTech",     label: "Technician",    defaultValue: "true", type: "toggle" },
      { key: "showUsername", label: "Username",      defaultValue: "false", type: "toggle" },
      { key: "showPassword", label: "Password",      defaultValue: "false", type: "toggle" },
      { key: "showBarcode",  label: "Barcode",       defaultValue: "false", type: "toggle" },
      { key: "showServiceQr", label: "Job QR",       defaultValue: "false", type: "toggle" },
      { key: "showBizName",  label: "Business Name", defaultValue: "true", type: "toggle" },
    ],
  },
  {
    id: "address",
    label: "Address",
    icon: MapPin,
    color: "text-emerald-500",
    description: "Shipping and postal address labels",
    defaultSize: LABEL_SIZE_ID,
    fields: [
      { key: "showName",    label: "Name",                      defaultValue: "true", type: "toggle" },
      { key: "showCompany", label: "Business Name",             defaultValue: "true", type: "toggle" },
      { key: "showStreet",  label: "Street",                    defaultValue: "true", type: "toggle" },
      { key: "showSuburb",  label: "Suburb / State / Postcode", defaultValue: "true", type: "toggle" },
      { key: "showBarcode", label: "Barcode",                   defaultValue: "false", type: "toggle" },
      { key: "showBizName", label: "Business Name",             defaultValue: "true", type: "toggle" },
    ],
  },
  {
    id: "pricetag",
    label: "Price Tag",
    icon: DollarSign,
    color: "text-green-600",
    description: "Retail price tags with product info",
    defaultSize: LABEL_SIZE_ID,
    fields: [
      { key: "showProductName", label: "Product Name", defaultValue: "true",  type: "toggle" },
      { key: "showPrice",       label: "Price",        defaultValue: "true",  type: "toggle" },
      { key: "showWasPrice",    label: "Was Price",    defaultValue: "false", type: "toggle" },
      { key: "showSku",         label: "SKU",          defaultValue: "true",  type: "toggle" },
      { key: "showBarcode",     label: "Barcode",      defaultValue: "true",  type: "toggle" },
    ],
  },
  {
    id: "shelf",
    label: "Shelf Label",
    icon: LayoutGrid,
    color: "text-cyan-500",
    description: "Shelf-edge labels for gondola or display shelving",
    defaultSize: LABEL_SIZE_ID,
    fields: [
      { key: "showProductName", label: "Product Name", defaultValue: "true", type: "toggle" },
      { key: "showPrice",       label: "Price",        defaultValue: "true", type: "toggle" },
      { key: "showUnitPrice",   label: "Unit Price",   defaultValue: "true", type: "toggle" },
      { key: "showSku",         label: "SKU",          defaultValue: "true", type: "toggle" },
      { key: "showBarcode",     label: "Barcode",      defaultValue: "true", type: "toggle" },
    ],
  },
];

/* ─── Common fields on every label ───────────────────────────────────────────
 * Business logo and a free-text section are available on every sticker type, so
 * they're appended to each type's fields here rather than repeated in all seven
 * definitions above. The logo toggle shows the business profile logo; the custom
 * text field prints whatever the user types (e.g. a promo line or care note). */
export const COMMON_STICKER_FIELDS: StickerField[] = [
  { key: "showLogo",    label: "Business Logo",   defaultValue: "false", type: "toggle" },
  { key: "showWebsite", label: "Business Website", defaultValue: "false", type: "toggle" },
  { key: "customText",  label: "Custom Text",     defaultValue: "",      type: "text"   },
];
STICKER_TYPES.forEach((t) => t.fields.push(...COMMON_STICKER_FIELDS));

/* ─── Recommended sizes per type ─────────────────────────────────────────── */

export const RECOMMENDED_SIZES: Record<string, string[]> = {
  product:  [LABEL_SIZE_ID],
  customer: [LABEL_SIZE_ID],
  return:   [LABEL_SIZE_ID],
  repair:   [LABEL_SIZE_ID],
  address:  [LABEL_SIZE_ID],
  pricetag: [LABEL_SIZE_ID],
  shelf:    [LABEL_SIZE_ID],
};

/* ─── Barcode helpers ────────────────────────────────────────────────────── */

/**
 * The value each sticker type encodes into its barcode. Any plain text works —
 * CODE128 encodes the full ASCII range — so a value typed straight onto the
 * product (SKU, loyalty no, job no, …) is turned into a scannable barcode.
 */
export function stickerBarcodeValue(typeId: string, f: (k: string) => string): string {
  switch (typeId) {
    case "product":  return f("barcode") || f("sku");
    case "pricetag": return f("barcode") || f("sku");
    case "shelf":    return f("barcode") || f("sku");
    case "customer": return f("loyaltyNo") || f("customerId");
    case "return":   return f("returnNo");
    case "repair":   return f("jobNo");
    case "address":  return f("name");
    default:         return f("barcode") || "";
  }
}

/**
 * Render a scannable CODE128 barcode as a PNG data URL. Returns "" when there's
 * no value or no DOM (SSR). Drawn at a fixed module width/height; callers stretch
 * the resulting <img> to the full sticker width — only the relative bar widths
 * matter to a scanner, and those are preserved under horizontal scaling.
 *
 * CODE128 is the format DYMO LabelWriters print and retail scanners read. Pure
 * black (#000) bars on white at a wide module width keep the bars crisp at the
 * printer's 300dpi so the print is scannable (callers also set image-rendering
 * so the upscale to full-width stays hard-edged rather than blurred).
 */
export function barcodeDataUrl(value: string): string {
  if (typeof document === "undefined" || !value) return "";
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, String(value), {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 4,
      height: 160,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/**
 * Render a QR code as a PNG data URL synchronously (so it's ready before a label
 * is written to a print iframe — unlike `QRCode.toDataURL`, which is async). The
 * repair/service sticker uses this to print the job's QR resolver, which staff
 * or the customer can scan to open it. Returns "" when there's no value or no
 * DOM (SSR).
 */
export function qrDataUrl(value: string, px = 256): string {
  if (typeof document === "undefined" || !value) return "";
  try {
    const qr = QRCode.create(String(value), { errorCorrectionLevel: "M" });
    const count = qr.modules.size;
    const data = qr.modules.data;
    const cell = Math.max(1, Math.floor(px / count));
    const dim = cell * count;
    const canvas = document.createElement("canvas");
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = "#000000";
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (data[y * count + x]) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/** Sample service-job URL used to render a representative QR in editor previews
 *  when no real job URL has been supplied yet. */
const SAMPLE_SERVICE_QR_URL = serviceJobQrUrl(0);

/** Sample customer code used to render a representative QR in editor previews
 *  when no real customer has been supplied yet. */
const SAMPLE_CUSTOMER_QR = "CUS-0042";

/** Sample public product URL used to render a representative QR in editor
 *  previews when no real product has been supplied yet. */
const SAMPLE_PRODUCT_QR = `${publicOrigin()}/b/demo/p/0`;

/**
 * The value a product sticker encodes into its QR code: the public, customer-
 * facing product page URL the print path supplies (see publicProductUrl). A
 * shopper scans it to view the product's details online.
 */
function productQrValue(f: (k: string) => string): string {
  return f("productQrUrl");
}

/**
 * The value a customer sticker encodes into its QR code. Prefers an explicit
 * value the print entry point supplies, then the customer ID, then the loyalty
 * number — so a scanned loyalty sticker resolves to the same `CUS-…` code the
 * receipt QR uses, letting staff pull up the customer at the POS.
 */
function customerQrValue(f: (k: string) => string): string {
  return f("customerQrValue") || f("customerId") || f("loyaltyNo");
}

/* ─── Per-field font size ─────────────────────────────────────────────────────
 * Each text option on a label can be sized independently. The chosen scale is a
 * plain multiplier (1 = the field's default size) persisted alongside the field
 * toggles under a `fs_<key>` key, so it rides through the same template save /
 * load / print path without a schema change. Both the on-screen preview and the
 * print HTML multiply the field's base size by this scale. */

/** Font-size choices offered per option in the editor (label → scale). */
export const FONT_SIZE_OPTIONS: { label: string; value: string }[] = [
  { label: "XS", value: "0.7" },
  { label: "S",  value: "0.85" },
  { label: "M",  value: "1" },
  { label: "L",  value: "1.25" },
  { label: "XL", value: "1.5" },
];

/** Toggle options that don't render text (images, codes, layout switches) and so
 *  have no font size to set. */
const NON_TEXT_FONT_KEYS = new Set([
  "showBarcode", "showLogo", "showServiceQr", "showCustomerQr", "showProductQr", "splitJobNo",
]);

/** Whether an option key carries text the user can resize. Used by the editor to
 *  decide whether to show a font-size control next to the toggle. */
export function fieldHasFontSize(field: StickerField): boolean {
  return field.type !== "text" && !NON_TEXT_FONT_KEYS.has(field.key);
}

/** The key under which a field's font scale is stored in the template fields. */
export function fontScaleKey(fieldKey: string): string {
  return `fs_${fieldKey}`;
}

/** Read a field's font scale (1 when unset or invalid). */
function fieldFontScale(f: (k: string) => string, fieldKey: string): number {
  const v = parseFloat(f(fontScaleKey(fieldKey)));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/* ─── Label preview renderer ─────────────────────────────────────────────── */

/**
 * The data a repair sticker prints for a service job — ONE builder for every
 * place that prints one (New Service Job, Service Jobs reprint), which used to
 * send different data: the reprint left the technician blank and put the device
 * type ahead of its description. "Due:" is the job's own due date
 * (service_jobs.due_date, dd/mm/yyyy) — left off when the job has none.
 */
export function repairStickerFields(
  job: {
    id?: number | null; jobNumber?: string | null; customerName?: string | null;
    deviceDescription?: string | null; deviceType?: string | null; workDescription?: string | null;
    accounts?: string | null; passwordOrPin?: string | null; dueDate?: string | null;
  },
  extra: { customer?: string | null; tech?: string | null } = {},
): Record<string, string> {
  const oneLine = (v: string | null | undefined) =>
    (v ?? "").split("\n").map((x) => x.trim()).filter(Boolean).join(" / ");
  return {
    jobNo: job.jobNumber ?? "",
    customer: (extra.customer ?? job.customerName ?? "").trim(),
    device: [job.deviceDescription, job.deviceType].map((x) => (x ?? "").trim()).find(Boolean) ?? "",
    fault: oneLine(job.workDescription),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(job.dueDate ?? "") ? job.dueDate!.split("-").reverse().join("/") : "",
    tech: (extra.tech ?? "").trim(),
    username: oneLine(job.accounts),
    password: oneLine(job.passwordOrPin),
    serviceQrUrl: job.id != null ? serviceJobQrUrl(job.id) : "",
  };
}

/**
 * Sample values for designing a template with no real record to hand (the
 * Labels page). The preview AND the test print both use them, so what is shown
 * is what prints — they are never used for a real label.
 */
export const SAMPLE_LABEL_FIELDS: Record<string, Record<string, string>> = {
  product:  { productName: "Product Name", category: "Category", sku: "SKU-001", price: "$5.50", barcode: "9300000000017", productQrUrl: SAMPLE_PRODUCT_QR },
  customer: { customerName: "Sarah Johnson", group: "VIP Member", customerId: "CUS-0042", loyaltyNo: "120 pts", phone: "0412 345 678", customerQrValue: SAMPLE_CUSTOMER_QR },
  return:   { returnNo: "RA-0089", item: "Defective Keyboard × 1", reason: "Not as described", status: "Awaiting inspection", date: "18/05/2026", customer: "Acme Wholesale" },
  repair:   { jobNo: "KS0031", customer: "Mike Chen", device: "MacBook Pro 2023", fault: "Screen flickering", dueDate: "22/05/2026", tech: "Alex Taylor", username: "user@example.com", password: "1234", serviceQrUrl: SAMPLE_SERVICE_QR_URL },
  address:  { name: "Sarah Johnson", company: "Demo Co Pty Ltd", street: "123 Main Street", suburb: "Mannering Park", state: "NSW", postcode: "2259" },
  pricetag: { productName: "Reusable Cup", sku: "HW-042", wasPrice: "$18.99", price: "$12.99", barcode: "9300000000024" },
  shelf:    { productName: "Flat White 250g", unitPrice: "$2.20/100g", sku: "GR-250", price: "$5.50", barcode: "9300000000031" },
};

/** Fields with the type's samples filled in wherever a value is empty. */
export function withSampleFields(typeId: string, fields: Record<string, string>): Record<string, string> {
  const out = { ...fields };
  for (const [k, v] of Object.entries(SAMPLE_LABEL_FIELDS[typeId] ?? {})) {
    if (!(out[k] ?? "").trim()) out[k] = v;
  }
  return out;
}

/**
 * On-screen label preview. It renders the PRINT HTML itself (buildLabelHtml in
 * screen mode — no page rotation, no @page) in a scaled frame, so the preview
 * can never show a line the print leaves out, or vice versa. The hand-built
 * preview this replaced had drifted: it filled every empty field with sample
 * text, so lines showed on screen that never printed.
 */
export function LabelPreview({
  type, fields, size, businessName, brandColor, logoUrl, businessWebsite,
  fillWidth, fillHeight,
  orientation = "horizontal",
  barcodePosition = "bottom",
  colorMode = "bw",
}: {
  type: StickerType;
  fields: Record<string, string>;
  size: DymoSize;
  businessName: string;
  brandColor: string;
  logoUrl?: string;
  businessWebsite?: string;
  fillWidth?: number;
  fillHeight?: number;
  orientation?: "horizontal" | "vertical";
  barcodePosition?: "top" | "bottom";
  colorMode?: "bw" | "color";
}) {
  const isHoriz = orientation === "horizontal";
  const dispWidthMm  = isHoriz ? Math.max(size.widthMm, size.heightMm) : Math.min(size.widthMm, size.heightMm);
  const dispHeightMm = isHoriz ? Math.min(size.widthMm, size.heightMm) : Math.max(size.widthMm, size.heightMm);

  // Screen pixels per label millimetre.
  let scale: number;
  if (fillWidth !== undefined && fillHeight !== undefined && fillWidth > 0 && fillHeight > 0) {
    const PAD = 48;
    scale = Math.min((fillWidth - PAD) / dispWidthMm, (fillHeight - PAD) / dispHeightMm);
  } else {
    const PREVIEW_W = fillWidth ?? 280;
    const s0 = PREVIEW_W / dispWidthMm;
    scale = Math.min(s0, Math.min(dispHeightMm * s0, 320) / dispHeightMm);
  }

  const html = useMemo(() => buildLabelHtml({
    typeId: type.id, size, fields, businessName, brandColor, logoUrl, website: businessWebsite,
    orientation, quantity: 1, barcodePosition, colorMode, screen: true,
  }), [type.id, size, fields, businessName, brandColor, logoUrl, businessWebsite, orientation, barcodePosition, colorMode]);

  const PX_PER_MM = 96 / 25.4;
  return (
    <div
      className="bg-white shadow-sm ring-1 ring-black/10 rounded-[3px] overflow-hidden"
      style={{ width: dispWidthMm * scale, height: dispHeightMm * scale }}
    >
      <iframe
        title={`${type.label} label preview`}
        srcDoc={html}
        sandbox="allow-scripts"
        tabIndex={-1}
        style={{
          width: dispWidthMm * PX_PER_MM,
          height: dispHeightMm * PX_PER_MM,
          border: 0,
          pointerEvents: "none",
          transform: `scale(${scale / PX_PER_MM})`,
          transformOrigin: "0 0",
          display: "block",
        }}
      />
    </div>
  );
}

/* ─── Template persistence hook ──────────────────────────────────────────── */

import {
  useListStickerTemplates,
  useCreateStickerTemplate,
  useUpdateStickerTemplate,
  useDeleteStickerTemplate,
  useSetDefaultStickerTemplate,
  getListStickerTemplatesQueryKey,
  StickerTemplate as ApiStickerTemplate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function fromApi(t: ApiStickerTemplate): StickerTemplate {
  return {
    id:          t.id,
    name:        t.name,
    description: t.description ?? "",
    typeId:      t.typeId,
    sizeId:      t.sizeId,
    fields:      (t.fields ?? {}) as Record<string, string>,
    isDefault:   t.isDefault ?? false,
    createdAt:   typeof t.createdAt === "number" ? t.createdAt : 0,
    updatedAt:   typeof t.updatedAt === "number" ? t.updatedAt : 0,
  };
}

export function useStickerTemplates() {
  const qc = useQueryClient();
  const { data: apiData } = useListStickerTemplates({ query: { queryKey: getListStickerTemplatesQueryKey() } });

  const templates: StickerTemplate[] = (apiData ?? []).map(fromApi);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListStickerTemplatesQueryKey() });

  const createMut  = useCreateStickerTemplate();
  const updateMut  = useUpdateStickerTemplate();
  const deleteMut  = useDeleteStickerTemplate();
  const defaultMut = useSetDefaultStickerTemplate();

  const create = (data: Omit<StickerTemplate, "id" | "createdAt" | "updatedAt">): StickerTemplate => {
    const now = Date.now();
    const tpl: StickerTemplate = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    qc.setQueryData(getListStickerTemplatesQueryKey(), [...(apiData ?? []), tpl as unknown as ApiStickerTemplate]);
    createMut.mutate({ data: { ...tpl, id: tpl.id } }, { onSuccess: invalidate, onError: invalidate });
    return tpl;
  };

  const update = (id: string, data: Partial<Omit<StickerTemplate, "id" | "createdAt">>) => {
    qc.setQueryData(
      getListStickerTemplatesQueryKey(),
      (apiData ?? []).map((t) => t.id === id ? { ...t, ...data, updatedAt: Date.now() } : t),
    );
    updateMut.mutate({ id, data }, { onSuccess: invalidate, onError: invalidate });
  };

  const remove = (id: string) => {
    qc.setQueryData(getListStickerTemplatesQueryKey(), (apiData ?? []).filter((t) => t.id !== id));
    deleteMut.mutate({ id }, { onSuccess: invalidate, onError: invalidate });
  };

  const setDefault = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    qc.setQueryData(
      getListStickerTemplatesQueryKey(),
      (apiData ?? []).map((t) => ({
        ...t,
        isDefault: t.id === id
          ? !tpl.isDefault
          : t.typeId === tpl.typeId ? false : t.isDefault,
      })),
    );
    defaultMut.mutate({ id }, { onSuccess: invalidate, onError: invalidate });
  };

  return { templates, create, update, remove, setDefault };
}

/* ─── Shared label print helper ──────────────────────────────────────────────
 * Single source of truth for turning a sticker type + resolved fields into a
 * print-ready, DYMO-sized HTML document. Used by the Stickers manager and by
 * every "Print label" entry point across the app so the same layout, sizing
 * and field toggles apply everywhere. (Mirrors the per-type markup the
 * Stickers manager preview renders.)
 */
export interface BuildLabelHtmlArgs {
  typeId: string;
  size: DymoSize;
  /** Resolved field values; toggle fields use the literal string "false" to hide. */
  fields: Record<string, string>;
  businessName: string;
  brandColor: string;
  /** Business logo (URL or data URL) printed when the showLogo toggle is on. */
  logoUrl?: string;
  /** Business website printed when the showWebsite toggle is on. */
  website?: string;
  orientation: "horizontal" | "vertical";
  quantity: number;
  barcodePosition?: "top" | "bottom";
  colorMode?: "bw" | "color";
  /** On-screen preview (LabelPreview): the label as it reads, no print page setup. */
  screen?: boolean;
}

/** Escape user-entered text before interpolating it into the print HTML string. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildLabelHtml(args: BuildLabelHtmlArgs): string {
  const { typeId, size, fields, businessName, brandColor, logoUrl, website, orientation, quantity, barcodePosition = "bottom", colorMode = "bw", screen = false } = args;
  // B&W (default) prints every accent in black; "color" keeps brand/status hues.
  const accent = colorMode === "color" ? brandColor : "#000";
  const danger = colorMode === "color" ? "#ef4444" : "#000";
  const isHoriz = orientation === "horizontal";
  const pageW = isHoriz ? Math.max(size.widthMm, size.heightMm) : Math.min(size.widthMm, size.heightMm);
  const pageH = isHoriz ? Math.min(size.widthMm, size.heightMm) : Math.max(size.widthMm, size.heightMm);
  // A landscape design is rotated onto the driver's portrait page (see the
  // page setup at the end). Square labels need no turn.
  const rotateToMedia = pageW > pageH && !screen;

  // Real values only. These layouts used to fall back to sample text ("Beverages",
  // "Sarah Johnson", a password of "1234"…) whenever a field was empty, and that
  // sample text printed on real labels. An empty field now prints nothing.
  const f    = (k: string) => fields[k] ?? "";
  const show = (k: string) => f(k) !== "false";
  /** A line prints only when it has something to say — no bare "#", "Due:" or "Tech:". */
  const has  = (k: string) => f(k).trim() !== "";
  const biz  = businessName;

  const shorter = Math.min(pageW, pageH);
  const bp      = Math.max(4.5, shorter * 0.36);

  // Per-field font size (pt): base multiplier × the user's chosen scale for that
  // option, so the printed label matches the on-screen preview.
  const hSize = (k: string, mult: number) => (bp * mult * fieldFontScale(f, k)).toFixed(1);

  // Scannable CODE128 barcode, generated from whatever value the type encodes
  // (plain text included). Rendered full-width at the bottom of the label.
  const barcodeValue = stickerBarcodeValue(typeId, f);
  const barcodeUrl = show("showBarcode") && barcodeValue.trim() ? barcodeDataUrl(barcodeValue) : "";

  // Service QR — repair stickers can carry the job's QR resolver. Uses the real
  // job URL when supplied (the actual print paths pass one); falls back to a
  // sample so a test print from the Stickers editor still shows the code, matching
  // the on-screen preview.
  const serviceQrSrc = typeId === "repair" && show("showServiceQr") && has("serviceQrUrl")
    ? qrDataUrl(f("serviceQrUrl"))
    : "";
  // Customer QR — customer stickers can carry the customer's `CUS-…` code (or an
  // explicit value the print path supplies) so staff scan the sticker to pull the
  // customer up at the POS. Falls back to a sample so a test print still shows it.
  const customerQrSrc = typeId === "customer" && show("showCustomerQr") && !!customerQrValue(f)
    ? qrDataUrl(customerQrValue(f))
    : "";
  // Product QR — product stickers can carry a QR that opens the public product
  // page when scanned (the print path supplies the real URL). Falls back to a
  // sample so a test print still shows it, matching the on-screen preview.
  const productQrSrc = typeId === "product" && show("showProductQr") && has("productQrUrl")
    ? qrDataUrl(productQrValue(f))
    : "";
  const qrMm = Math.max(8, Math.min(shorter * 0.7, pageH * 0.78));

  const inner = (() => {
    switch (typeId) {
      case "product": {
        const productText = `
        <div>
          ${show("showProductName")&&has("productName") ? `<div style="font-weight:700;font-size:${hSize("showProductName",1.15)}pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("productName")}</div>` : ""}
          ${show("showCategory")&&has("category") ? `<div style="font-size:${hSize("showCategory",1)}pt;color:#888;white-space:nowrap;overflow:hidden">${f("category")}</div>` : ""}
          ${show("showSku")&&has("sku") ? `<div style="font-size:${hSize("showSku",1)}pt;color:#888">${f("sku")}</div>` : ""}
        </div>
        <div>
          ${show("showPrice")&&has("price") ? `<div style="font-weight:700;font-size:${hSize("showPrice",1.35)}pt;color:${accent}">${f("price")}</div>` : ""}
          ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${hSize("showBizName",0.85)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}
        </div>`;
        if (!productQrSrc) return productText;
        return `<div style="display:flex;gap:2mm;flex:1;min-height:0;align-items:center">
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;align-self:stretch">${productText}</div>
          <img src="${productQrSrc}" alt="product qr" style="width:${qrMm.toFixed(1)}mm;height:${qrMm.toFixed(1)}mm;object-fit:contain;flex-shrink:0;image-rendering:pixelated"/>
        </div>`;
      }

      case "customer": {
        const customerText = `
        ${show("showCustomerName")&&has("customerName") ? `<div style="font-weight:700;font-size:${hSize("showCustomerName",1.15)}pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("customerName")}</div>` : ""}
        ${show("showGroup")&&has("group") ? `<div style="background:${accent};color:#fff;padding:0 1mm;border-radius:.5mm;white-space:nowrap;overflow:hidden;font-size:${hSize("showGroup",0.85)}pt">${f("group")}</div>` : ""}
        ${show("showCustomerId")&&has("customerId") ? `<div style="font-size:${hSize("showCustomerId",1)}pt;color:#888">${f("customerId")}</div>` : ""}
        ${show("showLoyaltyNo")&&has("loyaltyNo") ? `<div style="font-size:${hSize("showLoyaltyNo",1)}pt;color:#888">${f("loyaltyNo")}</div>` : ""}
        ${show("showPhone")&&has("phone") ? `<div style="font-size:${hSize("showPhone",1)}pt;color:#888">${f("phone")}</div>` : ""}
        ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${hSize("showBizName",0.85)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}`;
        if (!customerQrSrc) return customerText;
        return `<div style="display:flex;gap:2mm;flex:1;min-height:0;align-items:center">
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;align-self:stretch">${customerText}</div>
          <img src="${customerQrSrc}" alt="customer qr" style="width:${qrMm.toFixed(1)}mm;height:${qrMm.toFixed(1)}mm;object-fit:contain;flex-shrink:0;image-rendering:pixelated"/>
        </div>`;
      }

      case "return": return `
        ${show("showReturnNo")&&has("returnNo") ? `<div style="font-weight:700;color:${danger};font-size:${hSize("showReturnNo",1.1)}pt">RETURN ${f("returnNo")}</div>` : ""}
        ${show("showItem")&&has("item") ? `<div style="font-size:${hSize("showItem",1)}pt;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("item")}</div>` : ""}
        ${show("showReason")&&has("reason") ? `<div style="font-size:${hSize("showReason",1)}pt;color:#888;white-space:nowrap;overflow:hidden">${f("reason")}</div>` : ""}
        ${show("showStatus")&&has("status") ? `<div style="background:${danger};color:#fff;padding:0 1mm;border-radius:.5mm;font-size:${hSize("showStatus",0.85)}pt;white-space:nowrap;overflow:hidden">${f("status")}</div>` : ""}
        ${show("showDate")&&has("date") ? `<div style="font-size:${hSize("showDate",1)}pt;color:#888">${f("date")}</div>` : ""}
        ${show("showCustomer")&&has("customer") ? `<div style="font-size:${hSize("showCustomer",1)}pt;color:#888;white-space:nowrap;overflow:hidden">${f("customer")}</div>` : ""}
        ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${hSize("showBizName",0.85)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}`;

      case "repair": {
        const repairText = `
        ${show("showJobNo") ? (show("splitJobNo")
          ? `<div style="font-weight:700;font-size:${hSize("showJobNo",1.1)}pt;line-height:1.05"><div>SERVICE</div><div style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("jobNo")}</div></div>`
          : `<div style="font-weight:700;font-size:${hSize("showJobNo",1.1)}pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">SERVICE ${f("jobNo")}</div>`) : ""}
        ${show("showCustomer")&&has("customer") ? `<div style="font-size:${hSize("showCustomer",1)}pt;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("customer")}</div>` : ""}
        ${show("showDevice")&&has("device") ? `<div style="font-size:${hSize("showDevice",1)}pt;color:#888;white-space:nowrap;overflow:hidden">${f("device")}</div>` : ""}
        ${show("showFault")&&has("fault") ? `<div style="font-size:${hSize("showFault",1)}pt;color:#aaa;white-space:nowrap;overflow:hidden">Fault: ${f("fault")}</div>` : ""}
        ${show("showDueDate")&&has("dueDate") ? `<div style="font-size:${hSize("showDueDate",1)}pt;font-weight:600">Due: ${f("dueDate")}</div>` : ""}
        ${show("showTech")&&has("tech") ? `<div style="font-size:${hSize("showTech",1)}pt;color:#888;white-space:nowrap;overflow:hidden">Tech: ${f("tech")}</div>` : ""}
        ${show("showUsername")&&has("username") ? `<div style="font-size:${hSize("showUsername",1)}pt;color:#666;white-space:nowrap;overflow:hidden">User: ${f("username")}</div>` : ""}
        ${show("showPassword")&&has("password") ? `<div style="font-size:${hSize("showPassword",1)}pt;color:#666;white-space:nowrap;overflow:hidden">Pass: ${f("password")}</div>` : ""}
        ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${hSize("showBizName",0.85)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}`;
        if (!serviceQrSrc) return repairText;
        return `<div style="display:flex;gap:2mm;flex:1;min-height:0;align-items:center">
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;align-self:stretch">${repairText}</div>
          <img src="${serviceQrSrc}" alt="service qr" style="width:${qrMm.toFixed(1)}mm;height:${qrMm.toFixed(1)}mm;object-fit:contain;flex-shrink:0;image-rendering:pixelated"/>
        </div>`;
      }

      case "address": return `
        ${show("showName")&&has("name") ? `<div style="font-size:${hSize("showName",1)}pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("name")}</div>` : ""}
        ${show("showCompany")&&has("company") ? `<div style="font-size:${hSize("showCompany",1)}pt;white-space:nowrap;overflow:hidden">${f("company")}</div>` : ""}
        ${show("showStreet")&&has("street") ? `<div style="font-size:${hSize("showStreet",1)}pt;white-space:nowrap;overflow:hidden">${f("street")}</div>` : ""}
        ${show("showSuburb")&&(has("suburb")||has("state")||has("postcode")) ? `<div style="font-size:${hSize("showSuburb",1)}pt;white-space:nowrap;overflow:hidden">${[f("suburb"),f("state"),f("postcode")].filter(Boolean).join(" ")}</div>` : ""}
        ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${hSize("showBizName",0.85)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}`;

      case "pricetag": return `
        ${show("showProductName")&&has("productName") ? `<div style="font-size:${hSize("showProductName",1)}pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("productName")}</div>` : ""}
        ${show("showSku")&&has("sku") ? `<div style="font-size:${hSize("showSku",1)}pt;color:#888">#${f("sku")}</div>` : ""}
        <div>
          ${show("showWasPrice")&&has("wasPrice") ? `<div style="font-size:${hSize("showWasPrice",1)}pt;text-decoration:line-through;color:#aaa">${f("wasPrice")}</div>` : ""}
          ${show("showPrice")&&has("price") ? `<div style="font-weight:700;font-size:${hSize("showPrice",1.5)}pt;color:${accent}">${f("price")}</div>` : ""}
        </div>`;

      case "shelf": return `
        ${show("showProductName")&&has("productName") ? `<div style="font-size:${hSize("showProductName",1)}pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("productName")}</div>` : ""}
        ${show("showUnitPrice")&&has("unitPrice") ? `<div style="font-size:${hSize("showUnitPrice",1)}pt;color:#888;white-space:nowrap;overflow:hidden">${f("unitPrice")}</div>` : ""}
        ${show("showSku")&&has("sku") ? `<div style="font-size:${hSize("showSku",1)}pt;color:#888">${f("sku")}</div>` : ""}
        ${show("showPrice")&&has("price") ? `<div style="font-weight:700;font-size:${hSize("showPrice",1.5)}pt;color:${accent}">${f("price")}</div>` : ""}`;

      default: return "";
    }
  })();

  // Barcode height scales with the short edge of the label (3.5–7mm).
  const bcH = Math.max(3.5, Math.min(7, shorter * 0.22));

  const barcodeBlock = (pad: string) =>
    barcodeUrl ? `<div style="padding:${pad}"><img src="${barcodeUrl}" alt="barcode" style="display:block;width:100%;height:${bcH.toFixed(1)}mm;image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;image-rendering:pixelated"/></div>` : "";

  // Business logo header — sized to the short edge, capped so it never crowds out
  // the content. Only printed when the toggle is on and a logo is configured.
  const logoH = Math.max(3.5, Math.min(8, shorter * 0.32));
  const logoBlock = show("showLogo") && logoUrl
    ? `<div style="margin-bottom:1mm"><img src="${logoUrl}" alt="logo" style="display:block;height:${logoH.toFixed(1)}mm;max-width:60%;object-fit:contain;object-position:left center"/></div>`
    : "";

  // Free-text footer line — prints the user's custom text. Hidden when blank.
  const customText = f("customText").trim();
  const customTextBlock = customText
    ? `<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;margin-top:1mm;line-height:1.2;word-break:break-word">${escapeHtml(customText)}</div>`
    : "";

  // Business website — a common footer line available on every sticker type.
  const websiteText = (website ?? "").trim();
  const websiteBlock = show("showWebsite") && websiteText
    ? `<div style="color:#888;font-size:${hSize("showWebsite",0.8)}pt;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(websiteText)}</div>`
    : "";

  const labelBlock = `
    <div style="
      width:${pageW}mm;height:${pageH}mm;
      box-sizing:border-box;overflow:hidden;
      position:relative;
      font-family:Arial,Helvetica,sans-serif;
      font-size:${bp.toFixed(1)}pt;line-height:1.25;
      display:flex;flex-direction:column;
      background:#fff;
      writing-mode:horizontal-tb;
      ${rotateToMedia ? "" : "page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;"}
    ">
      ${barcodePosition === "top" ? barcodeBlock("1.5mm 2mm 0 2mm") : ""}
      <div class="lbl-body" style="flex:1;min-height:0;overflow:hidden;padding:1mm 3mm 0.6mm">
        <div class="lbl-fit" style="min-height:100%;display:flex;flex-direction:column">
          ${logoBlock}
          <div class="lbl-inner" style="flex:1;display:flex;flex-direction:column;justify-content:space-between">
            ${inner}
          </div>
          ${websiteBlock}
          ${customTextBlock}
        </div>
      </div>
      ${barcodePosition === "bottom" ? barcodeBlock("0 2mm 1.5mm 2mm") : ""}
    </div>`;

  /* The page is always the roll as the DYMO driver defines it: PORTRAIT, short
     edge across the print head (S0722520 = 25 mm wide × 54 mm long). A
     landscape @page (54 × 25) matched no paper the driver offers, so Chrome fell
     back to the printer's default paper with normal margins — the browser's
     date/title header printed and one ticket ran over two labels. A landscape
     design is drawn at its own size and turned −90° to sit on the portrait
     page, so it still reads along the label. */
  const mediaW = Math.min(pageW, pageH);
  const mediaH = Math.max(pageW, pageH);
  const page = rotateToMedia
    ? `<div style="width:${mediaW}mm;height:${mediaH}mm;position:relative;overflow:hidden;page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid">
        <div style="position:absolute;left:0;top:${mediaH}mm;width:${pageW}mm;height:${pageH}mm;transform-origin:0 0;transform:rotate(-90deg)">${labelBlock}</div>
      </div>`
    : labelBlock;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>​</title>
<style>
  *,*::before,*::after{
    box-sizing:border-box;margin:0;padding:0;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  ${screen ? "" : `@page{size:${mediaW}mm ${mediaH}mm;margin:0}`}
  html,body{
    margin:0;padding:0;
    width:${screen ? pageW : mediaW}mm;overflow:hidden;
    background:#fff;
    writing-mode:horizontal-tb;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  img{image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;image-rendering:pixelated}
  /* Lines never squash into each other: a label with more lines than fit is
     shrunk as a whole by the script below instead. */
  .lbl-fit>*,.lbl-inner>*{flex-shrink:0}
</style>
</head>
<body>
${Array.from({ length: Math.max(1, quantity) }).map(() => page).join("\n")}
<script>
/* Shrink a label's text block until it fits the 25 x 54 mm label (down to 55%).
   Zoom changes layout, so the body's scrollHeight follows it. */
(function(){
  var bodies=document.querySelectorAll('.lbl-body');
  for(var i=0;i<bodies.length;i++){
    var b=bodies[i],f=b.firstElementChild,z=1;
    while(f&&b.scrollHeight>b.clientHeight+1&&z>0.55){z-=0.04;f.style.zoom=String(z);}
  }
})();
</script>
</body>
</html>`;
}

/** Print label HTML through a hidden, off-screen iframe (no pop-up required). */
function printLabelHtmlViaIframe(html: string): boolean {
  if (typeof document === "undefined") return false;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) { iframe.remove(); return false; }
  doc.open();
  doc.write(html);
  doc.close();
  let removed = false;
  const cleanup = () => {
    if (!removed) { removed = true; setTimeout(() => iframe.remove(), 1000); }
    releasePageLockAfterPrint();
  };
  win.onafterprint = cleanup;

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try { win.focus(); win.print(); } catch { iframe.remove(); releasePageLockAfterPrint(); return; }
    // print() returns once the dialog is dismissed in most browsers.
    releasePageLockAfterPrint();
    // Safety net: some browsers never fire afterprint.
    setTimeout(cleanup, 60_000);
  };

  // The barcode is a base64 PNG <img>. If we print before it has decoded, the
  // label prints with a blank barcode (visible on screen but missing on paper),
  // so wait for every image to finish loading before invoking print().
  const waitForImagesThenPrint = () => {
    const imgs = Array.from(doc.images);
    const pending = imgs.filter((img) => !img.complete || img.naturalWidth === 0);
    if (pending.length === 0) { triggerPrint(); return; }
    let settled = 0;
    const onSettled = () => {
      settled += 1;
      if (settled >= pending.length) triggerPrint();
    };
    pending.forEach((img) => {
      img.addEventListener("load", onSettled, { once: true });
      img.addEventListener("error", onSettled, { once: true });
    });
    // Fallback: print anyway if an image never reports load/error.
    setTimeout(triggerPrint, 3000);
  };

  // Let the written document parse, then wait on its images.
  setTimeout(waitForImagesThenPrint, 50);
  return true;
}

export interface PrintStickersArgs {
  /** Sticker type id, e.g. "product" | "customer" | "repair" | "address" | "return". */
  typeId: string;
  /** Data context used to resolve {{quick.codes}} in the template fields. */
  context?: QuickCodeContext;
  /** Explicit template to use; otherwise the default (then first) saved template for the type. */
  template?: StickerTemplate;
  sizeOverride?: string;
  quantity?: number;
  orientation?: "horizontal" | "vertical";
  barcodePosition?: "top" | "bottom";
  colorMode?: "bw" | "color";
  /** Literal field values merged AFTER quick-code resolution (escape hatch for
   *  type-specific keys like returnNo / street that aren't in QUICK_CODES). */
  fieldsOverride?: Record<string, string>;
}

/**
 * Centralized sticker-print controller. Resolves the saved (default) template
 * for a type, substitutes quick codes from the given data context, and prints
 * a correctly DYMO-sized label — so every print path applies the same template.
 * Returns false if printing couldn't be started (e.g. unknown type / no DOM).
 */
export function useStickerPrinter() {
  const { templates } = useStickerTemplates();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const hardware = parseHardwareConfig((posSettings as { hardwareConfig?: string } | undefined)?.hardwareConfig);
  const { profile } = useBusinessProfile();
  const businessName = merchant?.businessName || "Your Business";
  const brandColor   = profile.brandColors?.[0] || "#efbf04";
  const logoUrl      = profile.logo || "";
  const website      = profile.website || "";

  const defaultTemplateFor = (typeId: string): StickerTemplate | undefined =>
    templates.find((t) => t.typeId === typeId && t.isDefault) ?? templates.find((t) => t.typeId === typeId);

  /** Resolve a single sticker's print HTML (full document) without printing. */
  const buildStickersHtml = (args: PrintStickersArgs): string | null => {
    const type = STICKER_TYPES.find((t) => t.id === args.typeId);
    if (!type) return null;
    const tpl = args.template ?? defaultTemplateFor(args.typeId);
    const sizeId = labelSizeFor(args.typeId, args.sizeOverride ?? tpl?.sizeId ?? type.defaultSize);
    const size = DYMO_SIZES.find((s) => s.id === sizeId) ?? DYMO_SIZES[0];

    const typeDefaults = Object.fromEntries(type.fields.map((fld) => [fld.key, fld.defaultValue]));
    const baseFields = { ...typeDefaults, ...(tpl?.fields ?? {}) };
    const resolved = args.context ? resolveQuickCodes(baseFields, args.context) : baseFields;
    const fields = { ...resolved, ...(args.fieldsOverride ?? {}) };

    return buildLabelHtml({
      typeId: args.typeId,
      size,
      fields,
      businessName,
      brandColor,
      logoUrl,
      website,
      orientation: args.orientation ?? "horizontal",
      quantity: args.quantity ?? 1,
      barcodePosition: args.barcodePosition ?? "bottom",
      colorMode: args.colorMode ?? "bw",
    });
  };

  /**
   * Send one label document to the printer the merchant routed "Labels &
   * stickers" at. Label printers (DYMO and friends) don't speak ESC/POS, so this
   * is always the HTML path — the label markup already declares its exact
   * die-cut size in `@page`, and the bridge passes that through untouched.
   *
   * Returns whether a print was started, keeping the existing synchronous
   * contract: when nothing silent is configured this is literally the old
   * iframe call, so behaviour is unchanged for merchants without a bridge.
   */
  const routeLabels = (html: string): boolean => {
    if (!isSilentRoute(hardware, "label", false)) return printLabelHtmlViaIframe(html);

    void printDocument({
      purpose: "label",
      hw: hardware,
      paper: "auto",
      jobName: "KoaPOS labels",
      html: () => html,
      browserFallback: () => { printLabelHtmlViaIframe(html); },
    }).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Couldn't print the label");
    });
    return true;
  };

  const printStickers = (args: PrintStickersArgs): boolean => {
    const html = buildStickersHtml(args);
    if (!html) return false;
    return routeLabels(html);
  };

  /**
   * Print labels for many items in a SINGLE print job (one dialog), rather than
   * one print per item. Each item is rendered with its own fields/quantity; the
   * resulting label blocks are concatenated into one document. All items are
   * expected to share a size (e.g. the default product template), so the first
   * item's page setup drives the job. Returns false if nothing could be built.
   */
  const printStickersBatch = (items: PrintStickersArgs[]): boolean => {
    const docs = items.map(buildStickersHtml).filter((h): h is string => !!h);
    if (docs.length === 0) return false;
    const bodyOf = (doc: string) => doc.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";
    const mergedBody = docs.map(bodyOf).join("\n");
    const merged = docs[0].replace(/<body>[\s\S]*?<\/body>/i, `<body>\n${mergedBody}\n</body>`);
    return routeLabels(merged);
  };

  return { printStickers, printStickersBatch, buildStickersHtml, defaultTemplateFor, businessName, brandColor, logoUrl };
}
