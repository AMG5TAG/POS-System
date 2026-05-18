import { useState } from "react";
import {
  Package, User, RotateCcw, Wrench, MapPin, DollarSign, LayoutGrid,
} from "lucide-react";

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

/* ─── Sticker types ──────────────────────────────────────────────────────── */

export const STICKER_TYPES: StickerType[] = [
  {
    id: "product",
    label: "Product / Stock",
    icon: Package,
    color: "text-blue-500",
    description: "Price tags and shelf labels for stock items",
    defaultSize: "11354",
    fields: [
      { key: "productName", label: "Product Name",  defaultValue: "Flat White" },
      { key: "sku",         label: "SKU",           defaultValue: "BEV-001"    },
      { key: "price",       label: "Price",         defaultValue: "$5.50"       },
      { key: "category",    label: "Category",      defaultValue: "Beverages"  },
      { key: "barcode",     label: "Barcode",       defaultValue: "9310000123456" },
      { key: "showBarcode", label: "Show Barcode",  defaultValue: "true", type: "toggle" },
    ],
  },
  {
    id: "customer",
    label: "Customer",
    icon: User,
    color: "text-violet-500",
    description: "Loyalty cards, ID labels and membership stickers",
    defaultSize: "30252",
    fields: [
      { key: "customerName",  label: "Customer Name",  defaultValue: "Sarah Johnson" },
      { key: "customerId",    label: "Customer ID",    defaultValue: "#CUS-0042"    },
      { key: "loyaltyNo",     label: "Loyalty Number", defaultValue: "LYL-20491"    },
      { key: "phone",         label: "Phone",          defaultValue: "(03) 9000 0000" },
      { key: "email",         label: "Email",          defaultValue: "sarah@email.com" },
      { key: "group",         label: "Group",          defaultValue: "VIP Member"   },
    ],
  },
  {
    id: "return",
    label: "Return",
    icon: RotateCcw,
    color: "text-amber-500",
    description: "Return authorisation labels for incoming goods",
    defaultSize: "30256",
    fields: [
      { key: "returnNo",   label: "Return #",      defaultValue: "RTN-0089"        },
      { key: "date",       label: "Date",          defaultValue: "18/05/2026"      },
      { key: "item",       label: "Item",          defaultValue: "Defective Keyboard" },
      { key: "reason",     label: "Reason",        defaultValue: "Not as described" },
      { key: "status",     label: "Status",        defaultValue: "Awaiting Inspection" },
      { key: "customer",   label: "Customer",      defaultValue: "Sarah Johnson"   },
    ],
  },
  {
    id: "repair",
    label: "Repair / Service",
    icon: Wrench,
    color: "text-rose-500",
    description: "Job labels for service desk and repair tickets",
    defaultSize: "30256",
    fields: [
      { key: "jobNo",      label: "Job #",         defaultValue: "SVC-0031"        },
      { key: "customer",   label: "Customer",      defaultValue: "Mike Chen"       },
      { key: "device",     label: "Device",        defaultValue: "MacBook Pro 2023" },
      { key: "fault",      label: "Fault",         defaultValue: "Screen flickering" },
      { key: "dueDate",    label: "Due Date",      defaultValue: "22/05/2026"      },
      { key: "tech",       label: "Technician",    defaultValue: "Alex Taylor"     },
    ],
  },
  {
    id: "address",
    label: "Address",
    icon: MapPin,
    color: "text-emerald-500",
    description: "Shipping and postal address labels",
    defaultSize: "30252",
    fields: [
      { key: "name",     label: "Name",      defaultValue: "Sarah Johnson"      },
      { key: "company",  label: "Company",   defaultValue: "Demo Co Pty Ltd"    },
      { key: "street",   label: "Street",    defaultValue: "123 Main Street"    },
      { key: "suburb",   label: "Suburb",    defaultValue: "Melbourne"          },
      { key: "state",    label: "State",     defaultValue: "VIC"                },
      { key: "postcode", label: "Postcode",  defaultValue: "3000"               },
    ],
  },
  {
    id: "pricetag",
    label: "Price Tag",
    icon: DollarSign,
    color: "text-green-600",
    description: "Retail price tags with product info",
    defaultSize: "LW-2.5x1",
    fields: [
      { key: "productName", label: "Product Name", defaultValue: "Reusable Cup"     },
      { key: "price",       label: "Sale Price",   defaultValue: "$12.99"            },
      { key: "wasPrice",    label: "Was Price",    defaultValue: "$18.99"            },
      { key: "sku",         label: "SKU",          defaultValue: "HW-042"            },
      { key: "showWas",     label: "Show Was Price", defaultValue: "true", type: "toggle" },
    ],
  },
  {
    id: "shelf",
    label: "Shelf Label",
    icon: LayoutGrid,
    color: "text-cyan-500",
    description: "Shelf-edge labels for gondola or display shelving",
    defaultSize: "30321",
    fields: [
      { key: "productName", label: "Product Name",  defaultValue: "Flat White 250g"  },
      { key: "price",       label: "Price",         defaultValue: "$5.50"             },
      { key: "unitPrice",   label: "Unit Price",    defaultValue: "$2.20/100g"        },
      { key: "sku",         label: "SKU",           defaultValue: "GR-250"            },
      { key: "barcode",     label: "Barcode",       defaultValue: "9310000123456"     },
    ],
  },
];

/* ─── Recommended sizes per type ─────────────────────────────────────────── */

export const RECOMMENDED_SIZES: Record<string, string[]> = {
  product:  ["11354", "LW-2x1", "LW-2.5x1", "11353"],
  customer: ["30252", "30331", "S0722370"],
  return:   ["30256", "30334", "99014"],
  repair:   ["30256", "30334", "99014"],
  address:  ["30252", "30331", "S0722370"],
  pricetag: ["LW-2.5x1", "11354", "LW-2x1"],
  shelf:    ["30321", "LW-2.5x1", "11355"],
};

/* ─── Label preview renderer ─────────────────────────────────────────────── */

export function LabelPreview({
  type, fields, size, businessName, brandColor,
  fillWidth, fillHeight,
}: {
  type: StickerType;
  fields: Record<string, string>;
  size: DymoSize;
  businessName: string;
  brandColor: string;
  /** When provided together, scale to fill this container (px) maintaining aspect ratio */
  fillWidth?: number;
  fillHeight?: number;
}) {
  let finalScale: number;
  if (fillWidth !== undefined && fillHeight !== undefined && fillWidth > 0 && fillHeight > 0) {
    const PAD = 48;
    const scaleW = (fillWidth  - PAD) / size.widthMm;
    const scaleH = (fillHeight - PAD) / size.heightMm;
    finalScale = Math.min(scaleW, scaleH);
  } else {
    const PREVIEW_W = fillWidth ?? 280;
    const scale = PREVIEW_W / size.widthMm;
    const cappedH = Math.min(size.heightMm * scale, 320);
    finalScale = Math.min(scale, cappedH / size.heightMm);
  }
  const finalW = size.widthMm * finalScale;
  const finalH = size.heightMm * finalScale;

  const f = (k: string) => fields[k] ?? "";
  const showBarcode = f("showBarcode") === "true";
  const showWas = f("showWas") === "true";

  const baseStyle: React.CSSProperties = {
    width: finalW,
    height: finalH,
    fontSize: Math.max(7, finalScale * 2.8),
    lineHeight: 1.3,
  };

  return (
    <div
      className="bg-white border-2 border-gray-300 rounded shadow-lg overflow-hidden relative font-sans"
      style={baseStyle}
    >
      <div className="absolute top-0 left-0 right-0" style={{ height: Math.max(2, finalScale * 1.5), background: brandColor }} />
      <div className="absolute inset-0 p-[6%] pt-[8%] flex flex-col justify-between">
        {type.id === "product" && (
          <>
            <div>
              <div className="font-bold truncate" style={{ fontSize: Math.max(8, finalScale * 3.2) }}>{f("productName") || "Product Name"}</div>
              {f("category") && <div className="text-gray-400 truncate">{f("category")}</div>}
              {f("sku") && <div className="text-gray-400">SKU: {f("sku")}</div>}
            </div>
            <div>
              {showBarcode && f("barcode") && (
                <div className="flex items-center gap-0.5 mb-0.5 opacity-60">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="bg-black" style={{ width: i % 3 === 0 ? 1.5 : 1, height: Math.max(8, finalScale * 3) }} />
                  ))}
                </div>
              )}
              <div className="font-bold" style={{ fontSize: Math.max(9, finalScale * 3.8), color: brandColor }}>{f("price") || "$0.00"}</div>
              <div className="text-gray-400 text-right truncate">{businessName}</div>
            </div>
          </>
        )}
        {type.id === "customer" && (
          <>
            <div className="font-bold truncate" style={{ fontSize: Math.max(8, finalScale * 3.2) }}>{f("customerName") || "Customer Name"}</div>
            {f("group") && <div className="px-1 rounded text-white truncate" style={{ background: brandColor, fontSize: Math.max(6, finalScale * 2.2) }}>{f("group")}</div>}
            {f("customerId") && <div className="text-gray-500">{f("customerId")}</div>}
            {f("loyaltyNo") && <div className="text-gray-500">{f("loyaltyNo")}</div>}
            {f("phone") && <div className="text-gray-500">{f("phone")}</div>}
            <div className="text-gray-400 text-right truncate">{businessName}</div>
          </>
        )}
        {type.id === "return" && (
          <>
            <div className="font-bold" style={{ color: "#ef4444", fontSize: Math.max(7, finalScale * 2.8) }}>RETURN {f("returnNo")}</div>
            {f("item") && <div className="font-medium truncate">{f("item")}</div>}
            {f("reason") && <div className="text-gray-500 truncate">{f("reason")}</div>}
            {f("status") && <div className="px-1 rounded text-white truncate" style={{ background: "#ef4444", fontSize: Math.max(6, finalScale * 2.2) }}>{f("status")}</div>}
            {f("date") && <div className="text-gray-400">{f("date")}</div>}
            <div className="text-gray-400 text-right truncate">{businessName}</div>
          </>
        )}
        {type.id === "repair" && (
          <>
            <div className="font-bold" style={{ color: "#ef4444", fontSize: Math.max(7, finalScale * 2.8) }}>SERVICE {f("jobNo")}</div>
            {f("customer") && <div className="font-medium truncate">{f("customer")}</div>}
            {f("device") && <div className="text-gray-500 truncate">{f("device")}</div>}
            {f("fault") && <div className="text-gray-400 truncate">Fault: {f("fault")}</div>}
            {f("dueDate") && <div className="font-medium truncate">Due: {f("dueDate")}</div>}
            {f("tech") && <div className="text-gray-400 truncate">Tech: {f("tech")}</div>}
          </>
        )}
        {type.id === "address" && (
          <>
            {f("name") && <div className="font-bold truncate">{f("name")}</div>}
            {f("company") && <div className="truncate">{f("company")}</div>}
            {f("street") && <div className="truncate">{f("street")}</div>}
            <div className="truncate">{[f("suburb"), f("state"), f("postcode")].filter(Boolean).join(" ")}</div>
            <div className="text-gray-400 text-right truncate">{businessName}</div>
          </>
        )}
        {type.id === "pricetag" && (
          <>
            <div className="font-bold truncate">{f("productName") || "Product"}</div>
            {f("sku") && <div className="text-gray-400">#{f("sku")}</div>}
            <div>
              {showWas && f("wasPrice") && <div className="line-through text-gray-400">{f("wasPrice")}</div>}
              <div className="font-bold" style={{ fontSize: Math.max(9, finalScale * 4.5), color: brandColor }}>{f("price") || "$0.00"}</div>
            </div>
          </>
        )}
        {type.id === "shelf" && (
          <>
            <div className="font-bold truncate">{f("productName") || "Product"}</div>
            {f("unitPrice") && <div className="text-gray-400 truncate">{f("unitPrice")}</div>}
            {f("sku") && <div className="text-gray-400">SKU {f("sku")}</div>}
            <div className="font-bold" style={{ fontSize: Math.max(9, finalScale * 4.5), color: brandColor }}>{f("price") || "$0.00"}</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Template persistence hook ──────────────────────────────────────────── */

const TEMPLATES_KEY = "koapos_sticker_templates";

export function useStickerTemplates() {
  const [templates, setTemplates] = useState<StickerTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "[]") as StickerTemplate[]; }
    catch { return []; }
  });

  const persist = (next: StickerTemplate[]) => {
    setTemplates(next);
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)); } catch {}
  };

  const create = (data: Omit<StickerTemplate, "id" | "createdAt" | "updatedAt">): StickerTemplate => {
    const now = Date.now();
    const tpl: StickerTemplate = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    persist([...templates, tpl]);
    return tpl;
  };

  const update = (id: string, data: Partial<Omit<StickerTemplate, "id" | "createdAt">>) => {
    persist(templates.map((t) => t.id === id ? { ...t, ...data, updatedAt: Date.now() } : t));
  };

  const remove = (id: string) => {
    persist(templates.filter((t) => t.id !== id));
  };

  const setDefault = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    persist(templates.map((t) => ({
      ...t,
      isDefault: t.id === id
        ? !tpl.isDefault
        : t.typeId === tpl.typeId ? false : t.isDefault,
    })));
  };

  return { templates, create, update, remove, setDefault };
}
