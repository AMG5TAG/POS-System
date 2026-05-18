import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Printer, Tag, User, Package, RotateCcw, Wrench, MapPin,
  DollarSign, LayoutGrid, Info, Barcode,
} from "lucide-react";

/* ─── DYMO label sizes ───────────────────────────────────────────────────── */

interface DymoSize {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  series: string;
}

const DYMO_SIZES: DymoSize[] = [
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

interface StickerType {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
  defaultSize: string;
  fields: StickerField[];
}

interface StickerField {
  key: string;
  label: string;
  defaultValue: string;
  type?: "text" | "toggle";
}

const STICKER_TYPES: StickerType[] = [
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

/* ─── Label preview renderer ─────────────────────────────────────────────── */

function LabelPreview({
  type, fields, size, businessName, brandColor,
}: {
  type: StickerType;
  fields: Record<string, string>;
  size: DymoSize;
  businessName: string;
  brandColor: string;
}) {
  // Scale preview to fit a ~280px wide preview area, maintaining aspect ratio
  const PREVIEW_W = 280;
  const scale = PREVIEW_W / size.widthMm;
  const previewH = size.heightMm * scale;
  const cappedH = Math.min(previewH, 320);
  const cappedScale = cappedH / size.heightMm;
  const finalScale = Math.min(scale, cappedScale);
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
      {/* Colour top strip */}
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

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ManagementStickersPage() {
  const [selectedTypeId, setSelectedTypeId] = useState<string>("product");
  const [selectedSizeId, setSelectedSizeId] = useState<string>("11354");
  const [quantity, setQuantity] = useState(1);
  const [showBusiness, setShowBusiness] = useState(true);

  const selectedType = STICKER_TYPES.find((t) => t.id === selectedTypeId)!;

  const [fields, setFields] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      STICKER_TYPES.map((t) => [t.id, Object.fromEntries(t.fields.map((f) => [f.key, f.defaultValue]))])
    )
  );

  const currentFields = fields[selectedTypeId] ?? {};
  const setField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [selectedTypeId]: { ...prev[selectedTypeId], [key]: value } }));
  };

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();
  const businessName = showBusiness ? (merchant?.businessName || "Your Business") : "";
  const brandColor = profile.brandColors?.[0] || "#efbf04";

  const selectedSize = DYMO_SIZES.find((s) => s.id === selectedSizeId) ?? DYMO_SIZES[0];

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    const t = STICKER_TYPES.find((x) => x.id === typeId);
    if (t) setSelectedSizeId(t.defaultSize);
  };

  const handlePrint = () => {
    window.print();
  };

  // Group DYMO sizes by series
  const sizeGroups = DYMO_SIZES.reduce<Record<string, DymoSize[]>>((acc, s) => {
    (acc[s.series] ??= []).push(s);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Sticker & Label Printing</h1>
              <p className="text-sm text-muted-foreground">Design and print labels on DYMO LabelWriter printers</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="showBiz" className="text-muted-foreground cursor-pointer">Show business name</Label>
              <Switch id="showBiz" checked={showBusiness} onCheckedChange={setShowBusiness} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Qty</Label>
              <Input type="number" min={1} max={999} value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-8 text-center text-sm" />
            </div>
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" /> Print {quantity > 1 ? `${quantity} Labels` : "Label"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-6 items-start">
          {/* Left: sticker type selector */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Label Type</p>
            <div className="rounded-xl border overflow-hidden">
              {STICKER_TYPES.map((type) => {
                const Icon = type.icon;
                const active = type.id === selectedTypeId;
                return (
                  <button
                    key={type.id}
                    onClick={() => handleTypeChange(type.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b last:border-b-0 text-left",
                      active ? "bg-primary/5 text-primary font-semibold" : "hover:bg-muted/50"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : type.color)} />
                    <div className="min-w-0">
                      <p className="font-medium">{type.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{type.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* DYMO printer note */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 flex gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-0.5">DYMO Printer Setup</p>
                <p>Connect your DYMO LabelWriter via USB. Install DYMO Connect software to enable direct wireless printing. Click Print to send to your default label printer.</p>
              </div>
            </div>
          </div>

          {/* Middle: field editor */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <selectedType.icon className={cn("w-4 h-4", selectedType.color)} />
                <CardTitle className="text-base">{selectedType.label} Label Fields</CardTitle>
              </div>
              <CardDescription>{selectedType.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Size selector */}
              <div className="space-y-1.5">
                <Label>DYMO Label Size</Label>
                <Select value={selectedSizeId} onValueChange={setSelectedSizeId}>
                  <SelectTrigger>
                    <SelectValue>
                      {selectedSize.name} ({selectedSize.widthMm}×{selectedSize.heightMm}mm)
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(sizeGroups).map(([series, sizes]) => (
                      <div key={series}>
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
                          {series === "LW" ? "LabelWriter 400/450" : series === "LW550" ? "LabelWriter 550" : "D1 Tape"}
                        </div>
                        {sizes.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} · {s.widthMm}×{s.heightMm}mm
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Size: {selectedSize.widthMm}mm × {selectedSize.heightMm}mm · DYMO Part #{selectedSize.id}
                </p>
              </div>

              <Separator />

              {/* Dynamic field inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedType.fields.map((field) => {
                  if (field.type === "toggle") {
                    return (
                      <div key={field.key} className="flex items-center justify-between col-span-2 sm:col-span-1 py-1">
                        <Label className="cursor-pointer">{field.label}</Label>
                        <Switch
                          checked={currentFields[field.key] === "true"}
                          onCheckedChange={(v) => setField(field.key, v ? "true" : "false")}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label>{field.label}</Label>
                      <Input
                        value={currentFields[field.key] ?? ""}
                        onChange={(e) => setField(field.key, e.target.value)}
                        placeholder={field.defaultValue}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Barcode preview strip */}
              {(selectedType.id === "product" || selectedType.id === "shelf") && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Barcode className="w-4 h-4" />
                    <span>Barcode will be rendered automatically from the barcode field value above.</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Right: preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Label Preview</p>
              <Badge variant="outline" className="text-[10px]">
                {selectedSize.widthMm}×{selectedSize.heightMm}mm · #{selectedSize.id}
              </Badge>
            </div>
            <div className="rounded-xl border bg-gray-50 p-6 flex items-center justify-center min-h-64">
              <LabelPreview
                type={selectedType}
                fields={currentFields}
                size={selectedSize}
                businessName={businessName}
                brandColor={brandColor}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">Preview is scaled — actual size: {selectedSize.widthMm}mm × {selectedSize.heightMm}mm</p>

            <Separator />

            {/* Quick sizing reference */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Recommended sizes for {selectedType.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {DYMO_SIZES.filter((s) => {
                  if (selectedTypeId === "product")  return ["11354", "LW-2x1", "LW-2.5x1", "11353"].includes(s.id);
                  if (selectedTypeId === "customer") return ["30252", "30331", "S0722370"].includes(s.id);
                  if (selectedTypeId === "return")   return ["30256", "30334", "99014"].includes(s.id);
                  if (selectedTypeId === "repair")   return ["30256", "30334", "99014"].includes(s.id);
                  if (selectedTypeId === "address")  return ["30252", "30331", "S0722370"].includes(s.id);
                  if (selectedTypeId === "pricetag") return ["LW-2.5x1", "11354", "LW-2x1"].includes(s.id);
                  if (selectedTypeId === "shelf")    return ["30321", "LW-2.5x1", "11355"].includes(s.id);
                  return false;
                }).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSizeId(s.id)}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded border transition-colors",
                      s.id === selectedSizeId
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted border-border"
                    )}
                  >
                    {s.id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
