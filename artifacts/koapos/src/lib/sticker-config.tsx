import { useState } from "react";
import {
  Package, User, RotateCcw, Wrench, MapPin, DollarSign, LayoutGrid,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";

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
    "{{customer.phone}}":   ctx.customer?.phone    ?? "",
    "{{customer.email}}":   ctx.customer?.email    ?? "",
    "{{customer.group}}":   ctx.customer?.group    ?? "",
    "{{merchant.name}}":    ctx.merchant?.name     ?? "",
    "{{merchant.abn}}":     ctx.merchant?.abn      ?? "",
    "{{merchant.phone}}":   ctx.merchant?.phone    ?? "",
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
  { id: "S0722370", name: "Standard Address 36×89mm",           widthMm: 36,    heightMm: 89,   series: "LW" },
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

/* ─── Sticker types — all label fields are on/off toggles ────────────────── */

export const STICKER_TYPES: StickerType[] = [
  {
    id: "product",
    label: "Product / Stock",
    icon: Package,
    color: "text-blue-500",
    description: "Price tags and shelf labels for stock items",
    defaultSize: "S0722520",
    fields: [
      { key: "showProductName", label: "Product Name",  defaultValue: "true",  type: "toggle" },
      { key: "showSku",         label: "SKU",           defaultValue: "true",  type: "toggle" },
      { key: "showPrice",       label: "Price",         defaultValue: "true",  type: "toggle" },
      { key: "showCategory",    label: "Category",      defaultValue: "true",  type: "toggle" },
      { key: "showBarcode",     label: "Barcode",       defaultValue: "true",  type: "toggle" },
      { key: "showBizName",     label: "Business Name", defaultValue: "true",  type: "toggle" },
    ],
  },
  {
    id: "customer",
    label: "Customer",
    icon: User,
    color: "text-violet-500",
    description: "Loyalty cards, ID labels and membership stickers",
    defaultSize: "S0722520",
    fields: [
      { key: "showCustomerName", label: "Customer Name",  defaultValue: "true", type: "toggle" },
      { key: "showCustomerId",   label: "Customer ID",    defaultValue: "true", type: "toggle" },
      { key: "showLoyaltyNo",    label: "Loyalty Number", defaultValue: "true", type: "toggle" },
      { key: "showPhone",        label: "Phone",          defaultValue: "true", type: "toggle" },
      { key: "showGroup",        label: "Group",          defaultValue: "true", type: "toggle" },
      { key: "showBarcode",      label: "Barcode",        defaultValue: "false", type: "toggle" },
      { key: "showBizName",      label: "Business Name",  defaultValue: "true", type: "toggle" },
    ],
  },
  {
    id: "return",
    label: "Return",
    icon: RotateCcw,
    color: "text-amber-500",
    description: "Return authorisation labels for incoming goods",
    defaultSize: "S0722520",
    fields: [
      { key: "showReturnNo",  label: "Return #",       defaultValue: "true", type: "toggle" },
      { key: "showDate",      label: "Date",           defaultValue: "true", type: "toggle" },
      { key: "showItem",      label: "Item",           defaultValue: "true", type: "toggle" },
      { key: "showReason",    label: "Reason",         defaultValue: "true", type: "toggle" },
      { key: "showStatus",    label: "Status",         defaultValue: "true", type: "toggle" },
      { key: "showCustomer",  label: "Customer",       defaultValue: "true", type: "toggle" },
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
    defaultSize: "S0722520",
    fields: [
      { key: "showJobNo",    label: "Job #",         defaultValue: "true", type: "toggle" },
      { key: "showCustomer", label: "Customer",      defaultValue: "true", type: "toggle" },
      { key: "showDevice",   label: "Device",        defaultValue: "true", type: "toggle" },
      { key: "showFault",    label: "Fault",         defaultValue: "true", type: "toggle" },
      { key: "showDueDate",  label: "Due Date",      defaultValue: "true", type: "toggle" },
      { key: "showTech",     label: "Technician",    defaultValue: "true", type: "toggle" },
      { key: "showBarcode",  label: "Barcode",       defaultValue: "false", type: "toggle" },
      { key: "showBizName",  label: "Business Name", defaultValue: "true", type: "toggle" },
    ],
  },
  {
    id: "address",
    label: "Address",
    icon: MapPin,
    color: "text-emerald-500",
    description: "Shipping and postal address labels",
    defaultSize: "S0722520",
    fields: [
      { key: "showName",    label: "Name",                      defaultValue: "true", type: "toggle" },
      { key: "showCompany", label: "Company",                   defaultValue: "true", type: "toggle" },
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
    defaultSize: "S0722520",
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
    defaultSize: "S0722520",
    fields: [
      { key: "showProductName", label: "Product Name", defaultValue: "true", type: "toggle" },
      { key: "showPrice",       label: "Price",        defaultValue: "true", type: "toggle" },
      { key: "showUnitPrice",   label: "Unit Price",   defaultValue: "true", type: "toggle" },
      { key: "showSku",         label: "SKU",          defaultValue: "true", type: "toggle" },
      { key: "showBarcode",     label: "Barcode",      defaultValue: "true", type: "toggle" },
    ],
  },
];

/* ─── Recommended sizes per type ─────────────────────────────────────────── */

export const RECOMMENDED_SIZES: Record<string, string[]> = {
  product:  ["S0722520", "11354", "LW-2x1", "LW-2.5x1", "11353"],
  customer: ["S0722520", "30252", "30331", "S0722370"],
  return:   ["S0722520", "30256", "30334", "99014"],
  repair:   ["S0722520", "30256", "30334", "99014"],
  address:  ["S0722520", "30252", "30331", "S0722370"],
  pricetag: ["S0722520", "LW-2.5x1", "11354", "LW-2x1"],
  shelf:    ["S0722520", "30321", "LW-2.5x1", "11355"],
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
 */
export function barcodeDataUrl(value: string): string {
  if (typeof document === "undefined" || !value) return "";
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, String(value), {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 2,
      height: 100,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/* ─── Label preview renderer ─────────────────────────────────────────────── */

export function LabelPreview({
  type, fields, size, businessName, brandColor,
  fillWidth, fillHeight,
  orientation = "horizontal",
  barcodePosition = "bottom",
}: {
  type: StickerType;
  fields: Record<string, string>;
  size: DymoSize;
  businessName: string;
  brandColor: string;
  fillWidth?: number;
  fillHeight?: number;
  orientation?: "horizontal" | "vertical";
  barcodePosition?: "top" | "bottom";
}) {
  const isHoriz    = orientation === "horizontal";
  const natPortrait = size.widthMm <= size.heightMm;
  const rotated    = isHoriz ? natPortrait : !natPortrait;

  const dispWidthMm  = isHoriz ? Math.max(size.widthMm, size.heightMm) : Math.min(size.widthMm, size.heightMm);
  const dispHeightMm = isHoriz ? Math.min(size.widthMm, size.heightMm) : Math.max(size.widthMm, size.heightMm);

  let finalScale: number;
  if (fillWidth !== undefined && fillHeight !== undefined && fillWidth > 0 && fillHeight > 0) {
    const PAD = 48;
    const scaleW = (fillWidth  - PAD) / dispWidthMm;
    const scaleH = (fillHeight - PAD) / dispHeightMm;
    finalScale = Math.min(scaleW, scaleH);
  } else {
    const PREVIEW_W = fillWidth ?? 280;
    const scale = PREVIEW_W / dispWidthMm;
    const cappedH = Math.min(dispHeightMm * scale, 320);
    finalScale = Math.min(scale, cappedH / dispHeightMm);
  }
  const finalW     = size.widthMm  * finalScale;
  const finalH     = size.heightMm * finalScale;
  const finalDispW = dispWidthMm   * finalScale;
  const finalDispH = dispHeightMm  * finalScale;

  const f = (k: string) => fields[k] ?? "";
  // Show helpers — default "true" unless explicitly "false"
  const show = (k: string) => f(k) !== "false";

  // Scannable barcode strip (spans the full sticker width, sits at the bottom).
  // Falls back to a sample value so the editor preview always shows one.
  const barcodeValue = stickerBarcodeValue(type.id, f) || "1234567890";
  const barcodeUrl   = show("showBarcode") ? barcodeDataUrl(barcodeValue) : "";

  const labelW = rotated ? finalH : finalW;
  const labelH = rotated ? finalW : finalH;

  const baseStyle: React.CSSProperties = {
    width: labelW,
    height: labelH,
    fontSize: Math.max(7, finalScale * 2.8),
    lineHeight: 1.3,
    flexShrink: 0,
  };

  const barcodeImg = barcodeUrl ? (
    <img
      src={barcodeUrl}
      alt="barcode"
      style={{ display: "block", width: "100%", height: Math.max(9, finalScale * 4) }}
    />
  ) : null;

  const labelEl = (
    <div
      className="bg-white border-2 border-gray-300 rounded shadow-lg overflow-hidden relative font-sans"
      style={baseStyle}
    >
      <div className="absolute inset-0 flex flex-col">
      {barcodeImg && barcodePosition === "top" && (
        <div className="px-[6%] pt-[6%]">{barcodeImg}</div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden px-[9%] py-[4%] flex flex-col justify-between">

        {type.id === "product" && (
          <>
            <div>
              {show("showProductName") && (
                <div className="font-bold truncate" style={{ fontSize: Math.max(8, finalScale * 3.2) }}>
                  {f("productName") || "Product Name"}
                </div>
              )}
              {show("showCategory") && (
                <div className="text-gray-400 truncate">{f("category") || "Beverages"}</div>
              )}
              {show("showSku") && (
                <div className="text-gray-400">SKU: {f("sku") || "BEV-001"}</div>
              )}
            </div>
            <div>
              {show("showPrice") && (
                <div className="font-bold" style={{ fontSize: Math.max(9, finalScale * 3.8), color: brandColor }}>
                  {f("price") || "$5.50"}
                </div>
              )}
              {show("showBizName") && (
                <div className="text-gray-400 text-right truncate">{businessName}</div>
              )}
            </div>
          </>
        )}

        {type.id === "customer" && (
          <>
            {show("showCustomerName") && (
              <div className="font-bold truncate" style={{ fontSize: Math.max(8, finalScale * 3.2) }}>
                {f("customerName") || "Sarah Johnson"}
              </div>
            )}
            {show("showGroup") && (
              <div className="px-1 rounded text-white truncate" style={{ background: brandColor, fontSize: Math.max(6, finalScale * 2.2) }}>
                {f("group") || "VIP Member"}
              </div>
            )}
            {show("showCustomerId") && (
              <div className="text-gray-500">{f("customerId") || "#CUS-0042"}</div>
            )}
            {show("showLoyaltyNo") && (
              <div className="text-gray-500">{f("loyaltyNo") || "LYL-20491"}</div>
            )}
            {show("showPhone") && (
              <div className="text-gray-500">{f("phone") || "(03) 9000 0000"}</div>
            )}
            {show("showBizName") && (
              <div className="text-gray-400 text-right truncate">{businessName}</div>
            )}
          </>
        )}

        {type.id === "return" && (
          <>
            {show("showReturnNo") && (
              <div className="font-bold" style={{ color: "#ef4444", fontSize: Math.max(7, finalScale * 2.8) }}>
                RETURN {f("returnNo") || "RTN-0089"}
              </div>
            )}
            {show("showItem") && (
              <div className="font-medium truncate">{f("item") || "Defective Keyboard"}</div>
            )}
            {show("showReason") && (
              <div className="text-gray-500 truncate">{f("reason") || "Not as described"}</div>
            )}
            {show("showStatus") && (
              <div className="px-1 rounded text-white truncate" style={{ background: "#ef4444", fontSize: Math.max(6, finalScale * 2.2) }}>
                {f("status") || "Awaiting Inspection"}
              </div>
            )}
            {show("showDate") && (
              <div className="text-gray-400">{f("date") || "18/05/2026"}</div>
            )}
            {show("showCustomer") && (
              <div className="text-gray-500 truncate">{f("customer") || "Sarah Johnson"}</div>
            )}
            {show("showBizName") && (
              <div className="text-gray-400 text-right truncate">{businessName}</div>
            )}
          </>
        )}

        {type.id === "repair" && (
          <>
            {show("showJobNo") && (
              <div className="font-bold truncate" style={{ fontSize: Math.max(7, finalScale * 2.8) }}>
                SERVICE {f("jobNo") || "SVC-0031"}
              </div>
            )}
            {show("showCustomer") && (
              <div className="font-medium truncate">{f("customer") || "Mike Chen"}</div>
            )}
            {show("showDevice") && (
              <div className="text-gray-500 truncate">{f("device") || "MacBook Pro 2023"}</div>
            )}
            {show("showFault") && (
              <div className="text-gray-400 truncate">Fault: {f("fault") || "Screen flickering"}</div>
            )}
            {show("showDueDate") && (
              <div className="font-medium truncate">Due: {f("dueDate") || "22/05/2026"}</div>
            )}
            {show("showTech") && (
              <div className="text-gray-400 truncate">Tech: {f("tech") || "Alex Taylor"}</div>
            )}
            {show("showBizName") && (
              <div className="text-gray-400 text-right truncate">{businessName}</div>
            )}
          </>
        )}

        {type.id === "address" && (
          <>
            {show("showName") && (
              <div className="font-bold truncate">{f("name") || "Sarah Johnson"}</div>
            )}
            {show("showCompany") && (
              <div className="truncate">{f("company") || "Demo Co Pty Ltd"}</div>
            )}
            {show("showStreet") && (
              <div className="truncate">{f("street") || "123 Main Street"}</div>
            )}
            {show("showSuburb") && (
              <div className="truncate">
                {[f("suburb") || "Melbourne", f("state") || "VIC", f("postcode") || "3000"].filter(Boolean).join(" ")}
              </div>
            )}
            {show("showBizName") && (
              <div className="text-gray-400 text-right truncate">{businessName}</div>
            )}
          </>
        )}

        {type.id === "pricetag" && (
          <>
            {show("showProductName") && (
              <div className="font-bold truncate">{f("productName") || "Reusable Cup"}</div>
            )}
            {show("showSku") && (
              <div className="text-gray-400">#{f("sku") || "HW-042"}</div>
            )}
            <div>
              {show("showWasPrice") && (
                <div className="line-through text-gray-400">{f("wasPrice") || "$18.99"}</div>
              )}
              {show("showPrice") && (
                <div className="font-bold" style={{ fontSize: Math.max(9, finalScale * 4.5), color: brandColor }}>
                  {f("price") || "$12.99"}
                </div>
              )}
            </div>
          </>
        )}

        {type.id === "shelf" && (
          <>
            {show("showProductName") && (
              <div className="font-bold truncate">{f("productName") || "Flat White 250g"}</div>
            )}
            {show("showUnitPrice") && (
              <div className="text-gray-400 truncate">{f("unitPrice") || "$2.20/100g"}</div>
            )}
            {show("showSku") && (
              <div className="text-gray-400">SKU {f("sku") || "GR-250"}</div>
            )}
            {show("showPrice") && (
              <div className="font-bold" style={{ fontSize: Math.max(9, finalScale * 4.5), color: brandColor }}>
                {f("price") || "$5.50"}
              </div>
            )}
          </>
        )}

      </div>
      {barcodeImg && barcodePosition === "bottom" && (
        <div className="px-[6%] pb-[6%]">{barcodeImg}</div>
      )}
      </div>
    </div>
  );

  if (rotated) {
    return (
      <div style={{ width: finalDispW, height: finalDispH, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {labelEl}
      </div>
    );
  }
  return labelEl;
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
  orientation: "horizontal" | "vertical";
  quantity: number;
  barcodePosition?: "top" | "bottom";
}

export function buildLabelHtml(args: BuildLabelHtmlArgs): string {
  const { typeId, size, fields, businessName, brandColor, orientation, quantity, barcodePosition = "bottom" } = args;
  const isHoriz = orientation === "horizontal";
  const pageW = isHoriz ? Math.max(size.widthMm, size.heightMm) : Math.min(size.widthMm, size.heightMm);
  const pageH = isHoriz ? Math.min(size.widthMm, size.heightMm) : Math.max(size.widthMm, size.heightMm);

  const f    = (k: string) => fields[k] ?? "";
  const show = (k: string) => f(k) !== "false";
  const biz  = businessName;

  const shorter = Math.min(pageW, pageH);
  const bp      = Math.max(4.5, shorter * 0.36);

  // Scannable CODE128 barcode, generated from whatever value the type encodes
  // (plain text included). Rendered full-width at the bottom of the label.
  const barcodeUrl = show("showBarcode") ? barcodeDataUrl(stickerBarcodeValue(typeId, f)) : "";

  const inner = (() => {
    switch (typeId) {
      case "product": return `
        <div>
          ${show("showProductName") ? `<div style="font-weight:700;font-size:${(bp*1.15).toFixed(1)}pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("productName")||"Product Name"}</div>` : ""}
          ${show("showCategory") ? `<div style="color:#888;white-space:nowrap;overflow:hidden">${f("category")||"Beverages"}</div>` : ""}
          ${show("showSku") ? `<div style="color:#888">SKU: ${f("sku")||"BEV-001"}</div>` : ""}
        </div>
        <div>
          ${show("showPrice") ? `<div style="font-weight:700;font-size:${(bp*1.35).toFixed(1)}pt;color:${brandColor}">${f("price")||"$5.50"}</div>` : ""}
          ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}
        </div>`;

      case "customer": return `
        ${show("showCustomerName") ? `<div style="font-weight:700;font-size:${(bp*1.15).toFixed(1)}pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("customerName")||"Sarah Johnson"}</div>` : ""}
        ${show("showGroup") ? `<div style="background:${brandColor};color:#fff;padding:0 1mm;border-radius:.5mm;white-space:nowrap;overflow:hidden;font-size:${(bp*.85).toFixed(1)}pt">${f("group")||"VIP Member"}</div>` : ""}
        ${show("showCustomerId") ? `<div style="color:#888">${f("customerId")||"#CUS-0042"}</div>` : ""}
        ${show("showLoyaltyNo") ? `<div style="color:#888">${f("loyaltyNo")||"LYL-20491"}</div>` : ""}
        ${show("showPhone") ? `<div style="color:#888">${f("phone")||"(03) 9000 0000"}</div>` : ""}
        ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}`;

      case "return": return `
        ${show("showReturnNo") ? `<div style="font-weight:700;color:#ef4444;font-size:${(bp*1.1).toFixed(1)}pt">RETURN ${f("returnNo")||"RTN-0089"}</div>` : ""}
        ${show("showItem") ? `<div style="font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("item")||"Defective Keyboard"}</div>` : ""}
        ${show("showReason") ? `<div style="color:#888;white-space:nowrap;overflow:hidden">${f("reason")||"Not as described"}</div>` : ""}
        ${show("showStatus") ? `<div style="background:#ef4444;color:#fff;padding:0 1mm;border-radius:.5mm;font-size:${(bp*.85).toFixed(1)}pt;white-space:nowrap;overflow:hidden">${f("status")||"Awaiting Inspection"}</div>` : ""}
        ${show("showDate") ? `<div style="color:#888">${f("date")||"18/05/2026"}</div>` : ""}
        ${show("showCustomer") ? `<div style="color:#888;white-space:nowrap;overflow:hidden">${f("customer")||"Sarah Johnson"}</div>` : ""}
        ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}`;

      case "repair": return `
        ${show("showJobNo") ? `<div style="font-weight:700;font-size:${(bp*1.1).toFixed(1)}pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">SERVICE ${f("jobNo")||"SVC-0031"}</div>` : ""}
        ${show("showCustomer") ? `<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("customer")||"Mike Chen"}</div>` : ""}
        ${show("showDevice") ? `<div style="color:#888;white-space:nowrap;overflow:hidden">${f("device")||"MacBook Pro 2023"}</div>` : ""}
        ${show("showFault") ? `<div style="color:#aaa;white-space:nowrap;overflow:hidden">Fault: ${f("fault")||"Screen flickering"}</div>` : ""}
        ${show("showDueDate") ? `<div style="font-weight:600">Due: ${f("dueDate")||"22/05/2026"}</div>` : ""}
        ${show("showTech") ? `<div style="color:#888;white-space:nowrap;overflow:hidden">Tech: ${f("tech")||"Alex Taylor"}</div>` : ""}
        ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}`;

      case "address": return `
        ${show("showName") ? `<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("name")||"Sarah Johnson"}</div>` : ""}
        ${show("showCompany") ? `<div style="white-space:nowrap;overflow:hidden">${f("company")||"Demo Co Pty Ltd"}</div>` : ""}
        ${show("showStreet") ? `<div style="white-space:nowrap;overflow:hidden">${f("street")||"123 Main Street"}</div>` : ""}
        ${show("showSuburb") ? `<div style="white-space:nowrap;overflow:hidden">${[f("suburb")||"Melbourne",f("state")||"VIC",f("postcode")||"3000"].filter(Boolean).join(" ")}</div>` : ""}
        ${show("showBizName")&&biz ? `<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>` : ""}`;

      case "pricetag": return `
        ${show("showProductName") ? `<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("productName")||"Reusable Cup"}</div>` : ""}
        ${show("showSku") ? `<div style="color:#888">#${f("sku")||"HW-042"}</div>` : ""}
        <div>
          ${show("showWasPrice") ? `<div style="text-decoration:line-through;color:#aaa">${f("wasPrice")||"$18.99"}</div>` : ""}
          ${show("showPrice") ? `<div style="font-weight:700;font-size:${(bp*1.5).toFixed(1)}pt;color:${brandColor}">${f("price")||"$12.99"}</div>` : ""}
        </div>`;

      case "shelf": return `
        ${show("showProductName") ? `<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("productName")||"Flat White 250g"}</div>` : ""}
        ${show("showUnitPrice") ? `<div style="color:#888;white-space:nowrap;overflow:hidden">${f("unitPrice")||"$2.20/100g"}</div>` : ""}
        ${show("showSku") ? `<div style="color:#888">SKU ${f("sku")||"GR-250"}</div>` : ""}
        ${show("showPrice") ? `<div style="font-weight:700;font-size:${(bp*1.5).toFixed(1)}pt;color:${brandColor}">${f("price")||"$5.50"}</div>` : ""}`;

      default: return "";
    }
  })();

  // Barcode height scales with the short edge of the label (3.5–7mm).
  const bcH = Math.max(3.5, Math.min(7, shorter * 0.22));

  const barcodeBlock = (pad: string) =>
    barcodeUrl ? `<div style="padding:${pad}"><img src="${barcodeUrl}" alt="barcode" style="display:block;width:100%;height:${bcH.toFixed(1)}mm"/></div>` : "";

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
      page-break-after:always;break-after:page;
      page-break-inside:avoid;break-inside:avoid;
    ">
      ${barcodePosition === "top" ? barcodeBlock("1.5mm 2mm 0 2mm") : ""}
      <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:1mm 3mm">
        ${inner}
      </div>
      ${barcodePosition === "bottom" ? barcodeBlock("0 2mm 1.5mm 2mm") : ""}
    </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Label Print</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  @page{size:${pageW}mm ${pageH}mm;margin:0}
  html,body{
    margin:0;padding:0;
    width:${pageW}mm;
    background:#fff;
    writing-mode:horizontal-tb;
  }
</style>
</head>
<body>
${Array.from({ length: Math.max(1, quantity) }).map(() => labelBlock).join("\n")}
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
  const cleanup = () => { if (!removed) { removed = true; setTimeout(() => iframe.remove(), 1000); } };
  win.onafterprint = cleanup;
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { iframe.remove(); }
    // Safety net: some browsers never fire afterprint.
    setTimeout(cleanup, 60_000);
  }, 300);
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
  const { profile } = useBusinessProfile();
  const businessName = merchant?.businessName || "Your Business";
  const brandColor   = profile.brandColors?.[0] || "#efbf04";

  const defaultTemplateFor = (typeId: string): StickerTemplate | undefined =>
    templates.find((t) => t.typeId === typeId && t.isDefault) ?? templates.find((t) => t.typeId === typeId);

  const printStickers = (args: PrintStickersArgs): boolean => {
    const type = STICKER_TYPES.find((t) => t.id === args.typeId);
    if (!type) return false;
    const tpl = args.template ?? defaultTemplateFor(args.typeId);
    const sizeId = args.sizeOverride ?? tpl?.sizeId ?? type.defaultSize;
    const size = DYMO_SIZES.find((s) => s.id === sizeId) ?? DYMO_SIZES[0];

    const typeDefaults = Object.fromEntries(type.fields.map((fld) => [fld.key, fld.defaultValue]));
    const baseFields = { ...typeDefaults, ...(tpl?.fields ?? {}) };
    const resolved = args.context ? resolveQuickCodes(baseFields, args.context) : baseFields;
    const fields = { ...resolved, ...(args.fieldsOverride ?? {}) };

    const html = buildLabelHtml({
      typeId: args.typeId,
      size,
      fields,
      businessName,
      brandColor,
      orientation: args.orientation ?? "horizontal",
      quantity: args.quantity ?? 1,
      barcodePosition: args.barcodePosition ?? "bottom",
    });
    return printLabelHtmlViaIframe(html);
  };

  return { printStickers, defaultTemplateFor, businessName, brandColor };
}
