import { useState, useCallback, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useLocation } from "wouter";
import {
  useListProducts,
  useListCategories,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useCreateCategory,
  useGetMerchant,
  useGetProductPricingHistory,
  useListFloorPlanZones,
  useGetFloorPlan,
  useGetPosSettings,
  useUpsertPosSettings,
  useListProductTypes,
  useListPcCompatRules,
  useUpsertPcCompatRule,
  useDeletePcCompatRule,
  getListPcCompatRulesQueryKey,
  useListProductVariants,
  useCreateProductVariant,
  useDeleteProductVariant,
  useUpdateProductVariant,
  getListProductVariantsQueryKey,
  Product,
  ProductType,
  useListBrands,
  useCreateBrand,
  useListDigitalCodes,
  useCreateDigitalCode,
  useDeleteDigitalCode,
  useListSuppliers,
  useBulkUpdateProducts,
} from "@workspace/api-client-react";
import {
  useStickerTemplates, LabelPreview, STICKER_TYPES, DYMO_SIZES, resolveQuickCodes,
} from "@/lib/sticker-config";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { FloorPlanMiniView } from "@/components/floor-plan-mini-view";
import { ImageUploader } from "@/components/ui/image-uploader";
import { useCustomerSettings, DEFAULT_CUSTOMER_GROUPS } from "@/lib/customer-settings";
import {
  Search, Plus, Pencil, Trash2, Package, Check,
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight,
  Tag, Barcode, Boxes, Settings2, DollarSign, ImageIcon, MapPin,
  Shuffle, Video, Weight, ScanSearch, Eye, EyeOff, Filter,
  Layers, Briefcase, Download, KeyRound, Printer, LayoutTemplate, Star, Lock,
  Archive, X as XIcon, Upload,
} from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  PC_PART_SLOTS, type PCPartCompat,
} from "./management-calculators-pc-builder";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type SortKey = "name" | "price" | "stock" | "category";
type SortDir  = "asc" | "desc";
type DetailTab = "details" | "inventory" | "settings";
type FormTab   = "details" | "media" | "pricing" | "stock" | "compatibility" | "settings" | "digital_codes" | "variants";

type BulkActionPending =
  | { type: "price_percent"; value: number }
  | { type: "price_flat"; value: number }
  | { type: "set_category"; categoryId: number | null; categoryName: string }
  | { type: "set_track_inventory"; value: boolean }
  | { type: "delete" };

type ProductForm = {
  name: string; description: string; price: string; costPrice: string;
  sku: string; barcode: string; categoryId: string; brandId: string;
  /* images */
  imageUrl: string; imageUrl2: string; imageUrl3: string; imageUrl4: string;
  videoUrl: string;
  /* pricing extras */
  supplier: string; supplierCode: string;
  /* physical */
  weight: string; weightUnit: string;
  lengthCm: string; widthCm: string; heightCm: string;
  /* stock */
  productType: string;
  productTypeId: string;
  stockQuantity: string; lowStockThreshold: string; taxRate: string;
  trackInventory: boolean; isActive: boolean; excludeFromLoyalty: boolean;
  tags: string[];
  /* notes */
  internalNotes: string;
  /* group pricing */
  groupPrices: Record<string, string>;
  /* digital code */
  isEpay: boolean;
  /* stock locations */
  stockLocationDisplay: string;
  stockLocationOverflow: string;
};

const defaultForm: ProductForm = {
  name: "", description: "", price: "", costPrice: "", sku: "", barcode: "",
  categoryId: "", brandId: "",
  imageUrl: "", imageUrl2: "", imageUrl3: "", imageUrl4: "", videoUrl: "",
  supplier: "", supplierCode: "",
  weight: "", weightUnit: "kg",
  lengthCm: "", widthCm: "", heightCm: "",
  productType: "standard",
  productTypeId: "",
  stockQuantity: "0", lowStockThreshold: "5",
  taxRate: "10", trackInventory: true, isActive: true, excludeFromLoyalty: false,
  tags: [],
  internalNotes: "",
  groupPrices: {},
  isEpay: false,
  stockLocationDisplay: "",
  stockLocationOverflow: "",
};

const FORM_TABS: { key: FormTab; label: string; digitalCodeOnly?: boolean; variantOnly?: boolean }[] = [
  { key: "details",       label: "Details"       },
  { key: "media",         label: "Media"         },
  { key: "pricing",       label: "Pricing"       },
  { key: "stock",         label: "Stock"         },
  { key: "compatibility", label: "Compatibility" },
  { key: "settings",      label: "Settings"      },
  { key: "digital_codes", label: "Digital Codes", digitalCodeOnly: true },
  { key: "variants",      label: "Variants",     variantOnly: true },
];

/* ─── Product types ──────────────────────────────────────────────────────── */

const PRODUCT_TYPES = [
  { value: "standard",     label: "Standard",     icon: Package,   desc: "Regular physical product" },
  { value: "variant",      label: "Variant",      icon: Layers,    desc: "With size/colour options" },
  { value: "composite",    label: "Composite",    icon: Boxes,     desc: "Made from other products" },
  { value: "service",      label: "Service",      icon: Briefcase, desc: "No inventory tracking" },
  { value: "digital",      label: "Download",     icon: Download,  desc: "File download, no stock" },
  { value: "digital_code", label: "Digital Code", icon: KeyRound,  desc: "Code-based delivery" },
] as const;

const NO_STOCK_TYPES = new Set(["service", "digital", "digital_code"]);

/* ─── SKU helpers ────────────────────────────────────────────────────────── */

function generateSKU(prefix: string) {
  const n = Math.floor(Math.random() * 90000) + 10000;
  return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${n}`;
}

/* ─── Sort header ────────────────────────────────────────────────────────── */

function SortTh({ label, sortKey, active, dir, onSort, className }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th className={cn("p-3 text-left font-medium whitespace-nowrap cursor-pointer select-none group", className)} onClick={() => onSort(sortKey)}>
      <span className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" /> : <ChevronsUpDown className="w-3 h-3" />}
        </span>
      </span>
    </th>
  );
}

/* ─── Detail row helper ──────────────────────────────────────────────────── */

function InfoRow({ icon: Icon, label, value, valueClass }: {
  icon: React.ComponentType<{ className?: string }>; label: string;
  value?: string | number | null; valueClass?: string;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="text-sm min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("font-medium", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

/* ─── Section header helper ──────────────────────────────────────────────── */

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">{label}</p>
  );
}

/* ─── Category tree selector ─────────────────────────────────────────────── */

type CatNode = { id: number; name: string; parentId: number | null; children: CatNode[] };

function buildCatTree(cats: { id: number; name: string; parentId?: number | null }[]): CatNode[] {
  const map = new Map<number, CatNode>();
  cats.forEach((c) => map.set(c.id, { id: c.id, name: c.name, parentId: c.parentId ?? null, children: [] }));
  const roots: CatNode[] = [];
  map.forEach((node) => {
    if (node.parentId != null && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function TreeCategorySelect({
  categories, value, onChange, placeholder = "No Category", triggerClass, onCreateCategory,
}: {
  categories: { id: number; name: string; parentId?: number | null }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  triggerClass?: string;
  onCreateCategory?: (name: string, onCreated: (id: number) => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creatingInline, setCreatingInline] = useState(false);
  const [newCatNameInline, setNewCatNameInline] = useState("");
  const tree = buildCatTree(categories);
  const selected = categories.find((c) => c.id.toString() === value);

  const renderNodes = (nodes: CatNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => { onChange(node.id.toString()); setOpen(false); }}
          className={cn(
            "w-full text-left py-1.5 text-sm rounded hover:bg-muted transition-colors flex items-center gap-1",
            value === node.id.toString() && "bg-primary/10 text-primary font-medium",
          )}
          style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: "8px" }}
        >
          {depth > 0 && <span className="text-muted-foreground/40 text-xs shrink-0">└</span>}
          {node.name}
        </button>
        {node.children.length > 0 && renderNodes(node.children, depth + 1)}
      </div>
    ));

  const commitNewCat = () => {
    if (!newCatNameInline.trim() || !onCreateCategory) return;
    onCreateCategory(newCatNameInline.trim(), (id) => {
      onChange(id.toString());
      setOpen(false);
    });
    setCreatingInline(false);
    setNewCatNameInline("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (!o) { setCreatingInline(false); setNewCatNameInline(""); } setOpen(o); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            triggerClass,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.name ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1.5 max-h-72 overflow-y-auto" align="start" style={{ minWidth: "180px" }}>
        <button
          type="button"
          onClick={() => { onChange(""); setOpen(false); }}
          className={cn(
            "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors",
            !value && "bg-primary/10 text-primary font-medium",
          )}
        >
          {placeholder}
        </button>
        {renderNodes(tree)}
        {onCreateCategory && (
          creatingInline ? (
            <div className="border-t mt-1 pt-1.5 px-1 flex items-center gap-1.5">
              <input
                autoFocus
                value={newCatNameInline}
                onChange={(e) => setNewCatNameInline(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitNewCat(); }
                  if (e.key === "Escape") { setCreatingInline(false); setNewCatNameInline(""); }
                }}
                placeholder="Category name…"
                className="flex-1 text-sm border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring bg-background"
              />
              <button type="button" onClick={commitNewCat} className="text-xs text-primary font-medium hover:underline whitespace-nowrap">Add</button>
              <button type="button" onClick={() => { setCreatingInline(false); setNewCatNameInline(""); }} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingInline(true)}
              className="w-full text-left px-2 py-1.5 text-xs text-primary font-medium border-t mt-1 flex items-center gap-1.5 hover:bg-muted/50 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Add New Category
            </button>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Image slot ─────────────────────────────────────────────────────────── */

function ImageSlot({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <ImageUploader value={value} onChange={onChange} aspectRatio="square" />
    </div>
  );
}

/* ─── Print Sticker dialog ───────────────────────────────────────────────── */

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function PrintStickerDialog({ open, onOpenChange, product }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
}) {
  const { templates, setDefault } = useStickerTemplates();
  const { data: merchant }        = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile }               = useBusinessProfile();
  const [quantity, setQuantity]   = useState(1);
  const previewRef                = useRef<HTMLDivElement>(null);
  const previewSize               = useContainerSize(previewRef);
  const [, navigate]              = useLocation();

  if (!product) return null;

  const businessName = merchant?.businessName ?? "Your Business";
  const brandColor   = profile.brandColors?.[0] ?? "#efbf04";

  const defaultTpl = templates.find((t) => t.typeId === "product" && t.isDefault)
    ?? templates.find((t) => t.typeId === "product");

  const type = defaultTpl ? (STICKER_TYPES.find((t) => t.id === defaultTpl.typeId) ?? STICKER_TYPES[0]) : STICKER_TYPES[0];
  const size = defaultTpl ? (DYMO_SIZES.find((s) => s.id === defaultTpl.sizeId) ?? DYMO_SIZES[2]) : DYMO_SIZES[2];

  const resolvedFields = defaultTpl ? resolveQuickCodes(defaultTpl.fields, {
    product: {
      name:     product.name,
      sku:      product.sku      ?? "",
      price:    product.price,
      barcode:  product.barcode  ?? "",
      category: product.category?.name ?? "",
    },
    merchant: { name: businessName },
  }) : {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4" /> Print Sticker
          </DialogTitle>
        </DialogHeader>

        {!defaultTpl ? (
          <div className="text-center py-8 space-y-3">
            <LayoutTemplate className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="font-medium">No product template found</p>
            <p className="text-sm text-muted-foreground">
              Create a product template in Sticker Templates and mark it as the default
              <Star className="w-3 h-3 text-amber-500 inline mb-0.5 mx-1" />
              to enable one-click printing here.
            </p>
            <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); navigate("/management/sticker-templates"); }}>
              Open Sticker Templates
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-4 items-stretch">
            {/* Left: info + controls */}
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Using template</p>
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm">{defaultTpl.name}</p>
                  {defaultTpl.isDefault && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                </div>
                <p className="text-[11px] text-muted-foreground">{type.label} · {size.widthMm}×{size.heightMm}mm</p>
                {!defaultTpl.isDefault && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1">
                    <Star className="w-2.5 h-2.5" />First product template — star one to set default
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Quantity</Label>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="w-8 h-8 p-0"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</Button>
                  <Input type="number" min={1} max={999} value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 text-center h-8 text-sm" />
                  <Button size="sm" variant="outline" className="w-8 h-8 p-0"
                    onClick={() => setQuantity((q) => Math.min(999, q + 1))}>+</Button>
                </div>
              </div>

              <Button className="w-full gap-2" onClick={() => window.print()}>
                <Printer className="w-4 h-4" />
                Print {quantity > 1 ? `${quantity} Labels` : "Label"}
              </Button>

              <Button variant="outline" size="sm" className="w-full gap-1.5"
                onClick={() => { onOpenChange(false); navigate("/management/sticker-templates"); }}>
                <LayoutTemplate className="w-3.5 h-3.5" /> Manage Templates
              </Button>

              {templates.filter((t) => t.typeId === "product").length > 1 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Other product templates:</p>
                  {templates.filter((t) => t.typeId === "product" && t.id !== defaultTpl.id).map((tpl) => (
                    <button key={tpl.id}
                      onClick={() => setDefault(tpl.id)}
                      className="w-full text-left text-[11px] px-2 py-1 rounded border hover:bg-muted flex items-center gap-1.5"
                    >
                      <Star className={cn("w-2.5 h-2.5 shrink-0", tpl.isDefault ? "text-amber-500 fill-amber-500" : "text-muted-foreground")} />
                      {tpl.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: live preview */}
            <div
              ref={previewRef}
              className="rounded-xl border bg-[radial-gradient(circle,_#e5e7eb_1px,_transparent_1px)] [background-size:12px_12px] flex items-center justify-center min-h-40"
            >
              <LabelPreview
                type={type}
                fields={resolvedFields}
                size={size}
                businessName={businessName}
                brandColor={brandColor}
                fillWidth={previewSize.w}
                fillHeight={previewSize.h}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Product detail dialog ──────────────────────────────────────────────── */

function ProductDetailDialog({
  product, onClose, onEdit, onDelete, deleteIsPending,
}: {
  product: Product | null;
  onClose: () => void;
  onEdit: (p: Product) => void;
  onDelete: (id: number) => void;
  deleteIsPending: boolean;
}) {
  const [tab, setTab]                         = useState<DetailTab>("details");
  const [printStickerOpen, setPrintStickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete]       = useState(false);
  const { data: floorPlanData }                 = useGetFloorPlan();
  if (!product) return null;
  const productStockLocation = (product as Product & { stockLocation?: string | null }).stockLocation ?? null;

  const margin = product.costPrice && product.price > 0
    ? Math.round(((product.price - product.costPrice) / product.price) * 100)
    : null;

  const isLowStock = product.trackInventory &&
    (product.stockQuantity ?? 0) <= (product.lowStockThreshold ?? 5);

  const TABS: { key: DetailTab; label: string }[] = [
    { key: "details",   label: "Details"   },
    { key: "inventory", label: "Inventory" },
    { key: "settings",  label: "Settings"  },
  ];

  return (
    <>
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <DialogTitle>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-base leading-tight truncate">{product.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <Badge variant={product.isActive ? "default" : "secondary"} className="text-xs px-2 py-0 h-5">
                    {product.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {product.category && (
                    <Badge variant="outline" className="text-xs px-2 py-0 h-5">{product.category.name}</Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex border-b px-6 gap-0 shrink-0 mt-3">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 min-h-0">

        {tab === "details" && (
          <div className="space-y-3 py-4">
            {/* Pricing */}
            <div className="rounded-xl border bg-muted/20 divide-y">
              <InfoRow icon={DollarSign} label="Sell Price"  value={formatCurrency(product.price)} />
              {product.costPrice != null && (
                <InfoRow icon={DollarSign} label="Cost Price" value={formatCurrency(product.costPrice)} />
              )}
              {margin !== null && (
                <InfoRow icon={DollarSign} label="Margin" value={`${margin}%`} valueClass={margin < 20 ? "text-destructive" : "text-emerald-600"} />
              )}
              <InfoRow icon={Settings2} label="Tax Rate (GST)" value={`${product.taxRate ?? 10}%`} />
            </div>
            {/* Identifiers */}
            {(product.sku || (product as Product & { barcode?: string }).barcode) && (
              <div className="rounded-xl border bg-muted/20 divide-y">
                <InfoRow icon={Tag}     label="SKU"     value={product.sku} />
                <InfoRow icon={Barcode} label="Barcode" value={(product as Product & { barcode?: string }).barcode} />
              </div>
            )}
            {/* Product type */}
            <div className="rounded-xl border bg-muted/20 divide-y">
              <InfoRow icon={Package} label="Product Type"
                value={((product as Product & { productType?: string }).productType ?? "standard")
                  .replace(/-/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())} />
            </div>
            {/* Description */}
            {product.description && (
              <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Description</p>
                <p className="whitespace-pre-line">{product.description}</p>
              </div>
            )}
          </div>
        )}

        {tab === "inventory" && (
          <div className="space-y-3 py-4">
            <div className="rounded-xl border bg-muted/20 divide-y">
              <div className="flex items-center gap-3 px-4 py-3">
                <Boxes className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Track Inventory</p>
                  <p className="font-medium">{product.trackInventory ? "Enabled" : "Disabled"}</p>
                </div>
              </div>
              {product.trackInventory ? (
                <>
                  <InfoRow icon={Boxes} label="In Stock" value={product.stockQuantity}
                    valueClass={isLowStock ? "text-amber-600" : undefined} />
                  <InfoRow icon={Boxes} label="Low Stock Alert" value={product.lowStockThreshold ?? 5} />
                </>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Boxes className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">In Stock</p>
                    <p className="font-medium text-muted-foreground text-lg">∞</p>
                  </div>
                </div>
              )}
            </div>
            {productStockLocation && (
              <div className="rounded-xl border bg-muted/20 divide-y mt-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Stock Location</p>
                    <p className="font-medium">{productStockLocation}</p>
                  </div>
                </div>
                {floorPlanData && floorPlanData.elements && floorPlanData.elements.length > 0 && (
                  <div className="px-4 py-3">
                    <FloorPlanMiniView
                      floorPlan={floorPlanData as { elements: { id: string; type: string; x: number; y: number; width: number; height: number; label: string }[]; gridCols: number; gridRows: number }}
                      highlightLabel={productStockLocation}
                    />
                  </div>
                )}
              </div>
            )}
            {isLowStock && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                ⚠ Stock is below the low stock threshold
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-3 py-4">
            <div className="rounded-xl border bg-muted/20 divide-y">
              <div className="flex items-center gap-3 px-4 py-3">
                <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium">{product.isActive ? "Active — visible in POS" : "Inactive — hidden from POS"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Loyalty Points</p>
                  <p className="font-medium">{product.excludeFromLoyalty ? "Excluded — does not earn points" : "Included — earns loyalty points"}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        </div>

        <div className="flex items-center justify-between px-6 pb-5 pt-4 border-t shrink-0">
          <Button variant="destructive" size="sm" className="gap-1.5"
            onClick={() => setConfirmDelete(true)} disabled={deleteIsPending}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPrintStickerOpen(true)}>
              <Printer className="w-3.5 h-3.5" /> Print Sticker
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => { onClose(); onEdit(product); }}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        </div>
      </DialogContent>
      <PrintStickerDialog open={printStickerOpen} onOpenChange={setPrintStickerOpen} product={product} />
    </Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{product.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the product and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { onDelete(product.id); onClose(); }}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}

/* ─── Pricing History Table ──────────────────────────────────────────────── */

function PricingHistoryTable({ productId }: { productId: number }) {
  const { data, isLoading } = useGetProductPricingHistory(productId);

  if (isLoading) {
    return (
      <div className="mt-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No pricing history yet. Cost price changes from Purchase Orders will appear here.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-2.5 font-medium text-muted-foreground">Date</th>
            <th className="text-right p-2.5 font-medium text-muted-foreground">Cost Price</th>
            <th className="text-left p-2.5 font-medium text-muted-foreground hidden sm:table-cell">Supplier</th>
            <th className="text-left p-2.5 font-medium text-muted-foreground hidden md:table-cell">PO Number</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((entry) => (
            <tr key={entry.id} className="hover:bg-muted/20">
              <td className="p-2.5 text-muted-foreground">
                {new Date(entry.changedAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
              </td>
              <td className="p-2.5 text-right font-medium">{formatCurrency(entry.costPrice)}</td>
              <td className="p-2.5 text-muted-foreground hidden sm:table-cell">{entry.supplierName ?? "—"}</td>
              <td className="p-2.5 font-mono text-xs text-muted-foreground hidden md:table-cell">{entry.poNumber ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Category → suggested tags ─────────────────────────────────────────── */

const TAG_SUGGESTIONS: [string[], string[]][] = [
  [["beverage", "drink", "coffee", "tea", "juice", "water", "soda", "beer", "wine", "spirit", "alcohol"], ["hot", "cold", "caffeine-free", "sugar-free", "organic", "local", "imported", "seasonal", "vegan", "gluten-free"]],
  [["snack", "chip", "crisp", "candy", "chocolate", "confection", "sweet", "lolly", "biscuit", "cookie"], ["sweet", "savoury", "gluten-free", "vegan", "low-sugar", "organic", "bulk", "seasonal", "imported", "local"]],
  [["food", "grocery", "produce", "meat", "seafood", "dairy", "bakery", "deli", "frozen"], ["fresh", "frozen", "organic", "local", "imported", "seasonal", "gluten-free", "vegan", "low-fat", "sugar-free"]],
  [["electronic", "tech", "computer", "laptop", "phone", "tablet", "camera", "audio", "gaming", "console", "accessory"], ["new", "refurbished", "wireless", "bluetooth", "usb-c", "hdmi", "compatible", "bundle", "official", "spare"]],
  [["clothing", "apparel", "fashion", "shirt", "pants", "dress", "jacket", "shoe", "footwear", "wear", "garment"], ["unisex", "mens", "womens", "kids", "casual", "formal", "summer", "winter", "sale", "new-arrival"]],
  [["beauty", "cosmetic", "skincare", "haircare", "makeup", "fragrance", "perfume", "grooming", "personal care"], ["vegan", "cruelty-free", "natural", "organic", "spf", "travel-size", "gift-set", "sensitive", "hypoallergenic", "bestseller"]],
  [["health", "vitamin", "supplement", "pharmacy", "medicine", "wellness", "fitness", "protein", "nutrition"], ["daily", "vegan", "gluten-free", "sugar-free", "organic", "clinically-tested", "bundle", "travel-size", "bestseller", "new"]],
  [["toy", "game", "puzzle", "hobby", "craft", "kids", "children", "baby", "infant"], ["ages-3+", "ages-6+", "educational", "stem", "outdoor", "indoor", "multiplayer", "battery-free", "eco-friendly", "gift"]],
  [["book", "magazine", "stationery", "office", "art", "drawing", "writing", "journal", "notebook"], ["fiction", "non-fiction", "educational", "kids", "adult", "bestseller", "new-release", "signed", "illustrated", "hardcover"]],
  [["furniture", "home", "decor", "kitchen", "bedroom", "bathroom", "garden", "outdoor", "tool", "hardware", "cleaning"], ["new-arrival", "sale", "bundle", "eco-friendly", "handmade", "local", "imported", "bestseller", "gift", "premium"]],
  [["sport", "gym", "fitness", "yoga", "running", "cycling", "swim", "outdoor", "camping", "hiking"], ["unisex", "performance", "lightweight", "waterproof", "breathable", "bundle", "sale", "new-arrival", "eco-friendly", "premium"]],
  [["pet", "dog", "cat", "bird", "fish", "animal", "vet"], ["dogs", "cats", "birds", "small-animals", "natural", "grain-free", "organic", "vet-approved", "bestseller", "new"]],
  [["service", "repair", "install", "consult", "support", "labour", "hire"], ["labour", "on-site", "remote", "express", "warranty", "bundle", "scheduled", "emergency", "certified", "fixed-price"]],
  [["gift", "wrap", "card", "voucher"], ["gift-wrap", "personalised", "same-day", "express", "luxury", "eco-friendly", "digital", "physical", "bundle", "seasonal"]],
];

function getSuggestedTags(categoryName: string): string[] {
  const lower = categoryName.toLowerCase();
  for (const [keywords, tags] of TAG_SUGGESTIONS) {
    if (keywords.some((k) => lower.includes(k))) return tags;
  }
  return ["new-arrival", "sale", "bestseller", "bundle", "local", "imported", "organic", "eco-friendly", "premium", "seasonal"];
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch]             = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editingProduct, setEditingProduct]   = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm]                 = useState<ProductForm>(defaultForm);
  const [formTab, setFormTab]           = useState<FormTab>("details");
  const [pcPartType, setPcPartType]     = useState("");
  const [pcSocket, setPcSocket]         = useState("");
  const [pcCompatNotes, setPcCompatNotes] = useState("");
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const upsertPosSettings = useUpsertPosSettings();
  const { data: productTypesData } = useListProductTypes({ query: { queryKey: ["product-types"] } });
  const productTypesList: ProductType[] = productTypesData?.items ?? [];
  const { data: compatRules } = useListPcCompatRules();
  const upsertCompatRuleMutation = useUpsertPcCompatRule();
  const deleteCompatRuleMutation = useDeletePcCompatRule();
  const invCompat = () => queryClient.invalidateQueries({ queryKey: getListPcCompatRulesQueryKey() });
  const [skuPrefix, setSkuPrefix]       = useState("KP");
  useEffect(() => {
    if (posSettings?.defaultSkuPrefix) setSkuPrefix(posSettings.defaultSkuPrefix);
  }, [posSettings]);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [sortKey, setSortKey]           = useState<SortKey>("name");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [checked, setChecked]           = useState<Set<number>>(new Set());
  const [groupExportOpen, setGroupExportOpen] = useState(false);
  const [typeFilter, setTypeFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter]       = useState("");
  const [hideCosts, setHideCosts]       = useState(true);
  const [showHideCostsBtn]              = useState(false);
  const [enableGroupPricing]            = useState(false);

  /* ── Digital codes state ── */
  type DigitalCodeEntry = { id: number; code: string; isUsed: boolean; usedAt: string | null; createdAt: string };
  const [newCodeInput, setNewCodeInput]     = useState("");
  const [bulkMode, setBulkMode]             = useState(false);
  const [bulkActionPending, setBulkActionPending] = useState<BulkActionPending | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen]     = useState(false);
  const [bulkSubmitting, setBulkSubmitting]       = useState(false);
  const [csvImportOpen, setCsvImportOpen]         = useState(false);
  const [bulkPriceInput, setBulkPriceInput]       = useState("");
  const [bulkPricePopover, setBulkPricePopover]   = useState<"percent" | "flat" | null>(null);
  const [bulkCatPopover, setBulkCatPopover]       = useState(false);
  const [bulkCatInput, setBulkCatInput]           = useState("");
  const [bulkInvPopover, setBulkInvPopover]       = useState(false);

  /* ── Brands state ── */
  const [brandPopoverOpen, setBrandPopoverOpen] = useState(false);
  const [brandCreatingInline, setBrandCreatingInline] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [newBrandName, setNewBrandName] = useState("");

  const { data: brandsListData } = useListBrands(undefined, { query: { queryKey: ["brands"] } });
  const brandsList = ((brandsListData?.items ?? []) as { id: number; name: string }[]);
  const createBrandMutation = useCreateBrand();

  const createBrandInline = async (onCreated: (id: number) => void) => {
    if (!newBrandName.trim()) return;
    try {
      const brand = await createBrandMutation.mutateAsync({ data: { name: newBrandName.trim() } }) as { id: number; name: string };
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      onCreated(brand.id);
      setNewBrandName("");
      setBrandCreatingInline(false);
      setBrandPopoverOpen(false);
    } catch {
      toast.error("Failed to create brand");
    }
  };

  const createCategoryInline = (name: string, onCreated: (id: number) => void) => {
    createCategoryMutation.mutate({ data: { name } }, {
      onSuccess: (cat) => {
        queryClient.invalidateQueries({ queryKey: ["categories"] });
        onCreated((cat as { id: number }).id);
      },
      onError: () => toast.error("Failed to create category"),
    });
  };

  /* ── Variants state ── */
  type VariantEntry = { id: number; name: string; sku: string | null; price: number | null; stockQuantity: number; isActive: boolean };
  type VariantForm = { name: string; sku: string; price: string; stockQuantity: string };
  const defaultVariantForm: VariantForm = { name: "", sku: "", price: "", stockQuantity: "0" };

  const [addingVariant, setAddingVariant] = useState(false);
  const [variantForm, setVariantForm] = useState<VariantForm>(defaultVariantForm);
  const [editingVariantId, setEditingVariantId] = useState<number | null>(null);
  const [editVariantForm, setEditVariantForm] = useState<VariantForm>(defaultVariantForm);

  const editingProductId = editingProduct?.id ?? 0;
  const { data: variantsList, isLoading: variantsLoading } = useListProductVariants(
    editingProductId,
    { query: { enabled: !!editingProduct?.id && formTab === "variants", queryKey: getListProductVariantsQueryKey(editingProductId) } },
  );
  const variants = (variantsList ?? []) as VariantEntry[];

  const createVariantMutation = useCreateProductVariant();
  const deleteVariantMutation = useDeleteProductVariant();
  const updateVariantMutation = useUpdateProductVariant();

  const handleAddVariant = async (productId: number) => {
    if (!variantForm.name.trim()) { toast.error("Variant name is required"); return; }
    try {
      await createVariantMutation.mutateAsync({
        productId,
        data: {
          name: variantForm.name,
          sku: variantForm.sku || undefined,
          price: variantForm.price ? parseFloat(variantForm.price) : undefined,
          stockQuantity: parseInt(variantForm.stockQuantity) || 0,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(productId) });
      setVariantForm(defaultVariantForm);
      setAddingVariant(false);
    } catch {
      toast.error("Failed to add variant");
    }
  };

  const handleDeleteVariant = async (variantId: number, productId: number) => {
    try {
      await deleteVariantMutation.mutateAsync({ productId, id: variantId });
      queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(productId) });
    } catch {
      toast.error("Failed to delete variant");
    }
  };

  const handleUpdateVariant = async (variantId: number, productId: number) => {
    if (!editVariantForm.name.trim()) { toast.error("Variant name is required"); return; }
    try {
      await updateVariantMutation.mutateAsync({
        productId,
        id: variantId,
        data: {
          name: editVariantForm.name,
          sku: editVariantForm.sku || undefined,
          price: editVariantForm.price ? parseFloat(editVariantForm.price) : undefined,
          stockQuantity: parseInt(editVariantForm.stockQuantity) || 0,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(productId) });
      setEditingVariantId(null);
    } catch {
      toast.error("Failed to update variant");
    }
  };

  /* Only owners and managers can see digital code values; cashiers see XXXX */
  const canViewCodes = true;

  const createDigitalCodeMutation = useCreateDigitalCode();
  const deleteDigitalCodeMutation = useDeleteDigitalCode();
  const { data: digitalCodesData, isLoading: codesLoading, refetch: refetchDigitalCodes } = useListDigitalCodes(
    editingProductId,
    { query: { enabled: !!editingProduct?.id && formTab === "digital_codes", queryKey: ["digital-codes", editingProductId] } }
  );
  const digitalCodes = (digitalCodesData ?? []) as DigitalCodeEntry[];

  const addDigitalCode = useCallback(async (productId: number, code: string) => {
    try {
      await createDigitalCodeMutation.mutateAsync({ productId, data: { code: code.trim() } });
      await refetchDigitalCodes();
      setNewCodeInput("");
    } catch { toast.error("Failed to add code"); }
  }, [createDigitalCodeMutation, refetchDigitalCodes]);

  const deleteDigitalCode = useCallback(async (codeId: number, _productId: number) => {
    try {
      await deleteDigitalCodeMutation.mutateAsync({ id: codeId });
      await refetchDigitalCodes();
    } catch { toast.error("Failed to delete code"); }
  }, [deleteDigitalCodeMutation, refetchDigitalCodes]);
  const { settings: customerSettings }  = useCustomerSettings();
  const customerGroups = customerSettings.groups.length ? customerSettings.groups : DEFAULT_CUSTOMER_GROUPS;

  const { data: productsData, isLoading } = useListProducts(
    { search: search || undefined, categoryId: categoryFilter && categoryFilter !== "all" ? parseInt(categoryFilter) : undefined, limit: 1000 },
    { query: { queryKey: ["products", search, categoryFilter] } }
  );
  const { data: categoriesData } = useListCategories({ query: { queryKey: ["categories"] } });
  const { data: floorPlanZones } = useListFloorPlanZones();
  const createMutation   = useCreateProduct();
  const updateMutation   = useUpdateProduct();
  const deleteMutation   = useDeleteProduct();
  const createCategoryMutation = useCreateCategory();
  const bulkUpdateMutation = useBulkUpdateProducts();
  const { data: suppliersListData } = useListSuppliers(undefined, { query: { queryKey: ["suppliers"] } });
  const suppliersList = ((suppliersListData?.items ?? []) as { id: number; name: string }[]);

  useEffect(() => {
    if (!dialogOpen) return;
    const t = setTimeout(() => scrollContainerRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [dialogOpen]);

  const products   = productsData?.items || [];
  const allTags    = [...new Set(products.flatMap((p) => (p as typeof p & { tags?: string[] }).tags ?? []))].sort();
  const categories = (categoriesData as unknown as { id: number; name: string; parentId?: number | null }[]) || [];

  /* Sort */
  const sorted = [...products].sort((a, b) => {
    let av: string | number = "", bv: string | number = "";
    switch (sortKey) {
      case "name":     av = a.name.toLowerCase();              bv = b.name.toLowerCase();              break;
      case "price":    av = a.price;                           bv = b.price;                           break;
      case "stock":    av = a.trackInventory ? (a.stockQuantity ?? 0) : Infinity; bv = b.trackInventory ? (b.stockQuantity ?? 0) : Infinity; break;
      case "category": av = (a.category?.name ?? "").toLowerCase(); bv = (b.category?.name ?? "").toLowerCase(); break;
    }
    const r = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? r : -r;
  });

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => { if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; } setSortDir("asc"); return key; });
  }, []);

  const filtered = sorted.filter((p) => {
    if (statusFilter === "active")   return p.isActive !== false;
    if (statusFilter === "inactive") return p.isActive === false;
    return true;
  }).filter((p) => {
    if (typeFilter === "all") return true;
    const ep = p as Product & { productType?: string; productTypeId?: number | null };
    if (ep.productTypeId) {
      const pt = productTypesList.find((t) => t.id === ep.productTypeId);
      if (pt) return pt.slug === typeFilter;
    }
    return (ep.productType ?? "standard") === typeFilter;
  }).filter((p) => {
    if (!tagFilter) return true;
    const ep = p as Product & { tags?: string[] };
    return (ep.tags ?? []).includes(tagFilter);
  });

  const allChecked = filtered.length > 0 && filtered.every((p) => checked.has(p.id));
  const toggleAll  = () => setChecked(allChecked ? new Set() : new Set(filtered.map((p) => p.id)));
  const toggleOne  = (id: number) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openCreate = () => {
    setEditingProduct(null); setForm(defaultForm); setFormTab("details"); setPcPartType(""); setPcSocket(""); setPcCompatNotes(""); setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    const ep = p as Product & { barcode?: string; imageUrl?: string; productType?: string; productTypeId?: number | null; groupPrices?: Record<string, number>; supplier?: string | null; supplierCode?: string | null; isEpay?: boolean };
    setForm({
      name: p.name, description: p.description || "",
      price: p.price.toString(), costPrice: p.costPrice?.toString() || "",
      sku: p.sku || "", barcode: ep.barcode || "",
      categoryId: p.categoryId?.toString() || "",
      brandId: (ep as Product & { brandId?: number | null }).brandId?.toString() || "",
      imageUrl: ep.imageUrl || "",
      imageUrl2: "", imageUrl3: "", imageUrl4: "", videoUrl: "",
      supplier: ep.supplier || "", supplierCode: ep.supplierCode || "",
      weight: "", weightUnit: "kg",
      lengthCm: "", widthCm: "", heightCm: "",
      productType: ep.productType ?? "standard",
      productTypeId: ep.productTypeId?.toString() || "",
      stockQuantity: (p.stockQuantity ?? 0).toString(),
      lowStockThreshold: p.lowStockThreshold?.toString() || "5",
      taxRate: p.taxRate?.toString() || "10",
      trackInventory: p.trackInventory ?? true,
      isActive: p.isActive ?? true,
      excludeFromLoyalty: p.excludeFromLoyalty ?? false,
      tags: (ep as Product & { tags?: string[] }).tags ?? [],
      internalNotes: "",
      groupPrices: Object.fromEntries(
        Object.entries(ep.groupPrices ?? {}).map(([k, v]) => [k, v.toString()])
      ),
      isEpay: ep.isEpay ?? false,
      stockLocationDisplay: (ep as Product & { stockLocation?: string | null }).stockLocation ?? "",
      stockLocationOverflow: (ep as Product & { overflowLocation?: string | null }).overflowLocation ?? "",
    });
    const _c = (compatRules ?? []).find(r => r.ruleKey === p.id.toString()) as PCPartCompat | undefined;
    setPcPartType(_c?.partType || "");
    setPcSocket(_c?.socket || "");
    setPcCompatNotes(_c?.specs || "");
    setFormTab("details");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) { toast.error("Product name is required"); return; }
    if (!form.price) { toast.error("Sell price is required"); return; }
    const payload = {
      name: form.name, description: form.description || undefined,
      price: parseFloat(form.price),
      costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      imageUrl: form.imageUrl || undefined,
      categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      brandId: form.brandId ? parseInt(form.brandId) : undefined,
      productType: form.productType,
      productTypeId: form.productTypeId ? parseInt(form.productTypeId) : undefined,
      stockQuantity: parseInt(form.stockQuantity) || 0,
      lowStockThreshold: parseInt(form.lowStockThreshold) || 5,
      taxRate: parseFloat(form.taxRate) || 10,
      trackInventory: form.trackInventory, isActive: form.isActive,
      excludeFromLoyalty: form.excludeFromLoyalty,
      supplier: form.supplier || undefined,
      supplierCode: form.supplierCode || undefined,
      isEpay: form.isEpay,
      tags: form.tags,
      stockLocation: form.stockLocationDisplay || undefined,
      overflowLocation: form.stockLocationOverflow || undefined,
      groupPrices: Object.fromEntries(
        Object.entries(form.groupPrices)
          .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
          .map(([k, v]) => [k, parseFloat(v)])
      ),
    };
    const inv = () => queryClient.invalidateQueries({ queryKey: ["products"] });
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload }, {
        onSuccess: () => {
          if (pcPartType) {
            upsertCompatRuleMutation.mutate(
              { data: { ruleKey: editingProduct.id.toString(), partType: pcPartType, socket: pcSocket, specs: pcCompatNotes } },
              { onError: () => toast.error("Failed to save compatibility data"), onSettled: invCompat },
            );
          } else {
            deleteCompatRuleMutation.mutate(
              { ruleKey: editingProduct.id.toString() },
              { onSettled: invCompat },
            );
          }
          toast.success("Product updated"); setDialogOpen(false); inv();
        },
        onError: () => toast.error("Failed to update product"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: (created) => {
          const cid = (created as { id?: number })?.id;
          if (pcPartType && cid) {
            upsertCompatRuleMutation.mutate(
              { data: { ruleKey: cid.toString(), partType: pcPartType, socket: pcSocket, specs: pcCompatNotes } },
              { onError: () => toast.error("Failed to save compatibility data"), onSettled: invCompat },
            );
          }
          toast.success("Product created"); setDialogOpen(false); inv();
        },
        onError: () => toast.error("Failed to create product"),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast.success("Product deleted"); queryClient.invalidateQueries({ queryKey: ["products"] }); },
      onError: () => toast.error("Failed to delete product"),
    });
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${checked.size} product${checked.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const ids = [...checked];
    let ok = 0;
    for (const id of ids) {
      await new Promise<void>((res) => deleteMutation.mutate({ id }, { onSuccess: () => { ok++; res(); }, onError: () => res() }));
    }
    setChecked(new Set());
    queryClient.invalidateQueries({ queryKey: ["products"] });
    toast.success(`${ok} product${ok !== 1 ? "s" : ""} deleted`);
  };

  const handleBulkSetActive = async (isActive: boolean) => {
    const ids = [...checked];
    let ok = 0;
    for (const id of ids) {
      await new Promise<void>((res) => updateMutation.mutate({ id, data: { isActive } }, { onSuccess: () => { ok++; res(); }, onError: () => res() }));
    }
    setChecked(new Set());
    queryClient.invalidateQueries({ queryKey: ["products"] });
    toast.success(`${ok} product${ok !== 1 ? "s" : ""} ${isActive ? "activated" : "archived"}`);
  };

  const handleBulkApply = async () => {
    if (!bulkActionPending) return;
    setBulkSubmitting(true);
    try {
      const body: Record<string, unknown> = { ids: [...checked], action: bulkActionPending.type };
      if (bulkActionPending.type === "price_percent" || bulkActionPending.type === "price_flat") {
        body.value = bulkActionPending.value;
      } else if (bulkActionPending.type === "set_category") {
        body.categoryId = bulkActionPending.categoryId;
      } else if (bulkActionPending.type === "set_track_inventory") {
        body.trackInventory = bulkActionPending.value;
      }
      const result = await bulkUpdateMutation.mutateAsync({ data: body as unknown as Parameters<typeof bulkUpdateMutation.mutateAsync>[0]["data"] }) as { updated: number; deleted: number };
      const n = result.deleted > 0 ? result.deleted : result.updated;
      const verb = bulkActionPending.type === "delete" ? "deleted" : "updated";
      toast.success(`${n} product${n !== 1 ? "s" : ""} ${verb}`);
      setChecked(new Set());
      setBulkConfirmOpen(false);
      setBulkActionPending(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } finally {
      setBulkSubmitting(false);
    }
  };

  const applyBulkPricePercent = () => {
    const pct = parseFloat(bulkPriceInput);
    if (isNaN(pct)) { toast.error("Enter a valid percentage"); return; }
    setBulkActionPending({ type: "price_percent", value: pct });
    setBulkPricePopover(null);
    setBulkPriceInput("");
    setBulkConfirmOpen(true);
  };

  const applyBulkPriceFlat = () => {
    const delta = parseFloat(bulkPriceInput);
    if (isNaN(delta)) { toast.error("Enter a valid amount"); return; }
    setBulkActionPending({ type: "price_flat", value: delta });
    setBulkPricePopover(null);
    setBulkPriceInput("");
    setBulkConfirmOpen(true);
  };

  const applyBulkCategory = () => {
    const catId = bulkCatInput ? parseInt(bulkCatInput) : null;
    const catName = catId ? (categories.find((c) => c.id === catId)?.name ?? "Unknown") : "No Category";
    setBulkActionPending({ type: "set_category", categoryId: catId, categoryName: catName });
    setBulkCatPopover(false);
    setBulkCatInput("");
    setBulkConfirmOpen(true);
  };

  const applyBulkTrackInventory = (value: boolean) => {
    setBulkActionPending({ type: "set_track_inventory", value });
    setBulkInvPopover(false);
    setBulkConfirmOpen(true);
  };

  const openBulkDelete = () => {
    setBulkActionPending({ type: "delete" });
    setBulkConfirmOpen(true);
  };

  const handleCreateCategory = () => {
    if (!newCategoryName) return;
    createCategoryMutation.mutate({ data: { name: newCategoryName } }, {
      onSuccess: () => { toast.success("Category created"); setCategoryDialogOpen(false); setNewCategoryName(""); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
      onError: () => toast.error("Failed to create category"),
    });
  };

  const sh = (label: string, key: SortKey, className?: string) => ({
    label, sortKey: key, active: sortKey, dir: sortDir, onSort: handleSort, className,
  });

  const goNextTab = () => {
    const idx = FORM_TABS.findIndex((t) => t.key === formTab);
    if (idx < FORM_TABS.length - 1) setFormTab(FORM_TABS[idx + 1].key);
  };
  const isLastTab = formTab === FORM_TABS[FORM_TABS.length - 1].key;

  const setField = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleGenerateSKU = () => {
    setField("sku", generateSKU(skuPrefix));
  };

  const handleSkuPrefixChange = (v: string) => {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setSkuPrefix(clean);
    upsertPosSettings.mutate({ data: { defaultSkuPrefix: clean } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos-settings"] }),
    });
  };

  const marginPct = form.costPrice && form.price && parseFloat(form.price) > 0
    ? Math.round(((parseFloat(form.price) - parseFloat(form.costPrice)) / parseFloat(form.price)) * 100)
    : null;

  const exportProductsCsv = () => {
    const headers = ["Name", "SKU", "Barcode", "Type", "Category", "Price", "Cost Price", "Stock", "Active", "Tags"];
    const rows = filtered.map((p) => {
      const ep = p as Product & { productType?: string; productTypeName?: string | null; tags?: string[] };
      const typeName = ep.productTypeName
        ?? PRODUCT_TYPES.find((t) => t.value === (ep.productType ?? "standard"))?.label
        ?? ep.productType ?? "";
      return [
        p.name,
        p.sku ?? "",
        (p as Product & { barcode?: string }).barcode ?? "",
        typeName,
        p.category?.name ?? "",
        p.price.toFixed(2),
        p.costPrice?.toFixed(2) ?? "",
        (p.stockQuantity ?? 0).toString(),
        p.isActive !== false ? "Yes" : "No",
        (ep.tags ?? []).join("; "),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "products.csv";
    a.click();
  };

  const exportGroupPriceSheet = (groupId: string, groupName: string) => {
    setGroupExportOpen(false);

    const hdrCell = "background:#1e293b;color:#fff;font-weight:bold;padding:8px 12px;border:1px solid #334155;font-size:13px;";
    const cell    = "padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;";
    const hiCell  = "padding:8px 12px;border:1px solid #fcd34d;font-size:12px;background:#fefce8;";
    const hiPriceCell = "padding:8px 12px;border:1px solid #fcd34d;font-size:12px;background:#fefce8;font-weight:bold;color:#92400e;";

    const headerRow = `<tr>
      <th style="${hdrCell}">Product Name</th>
      <th style="${hdrCell}">SKU</th>
      <th style="${hdrCell}">Description</th>
      <th style="${hdrCell}">RRP (inc GST)</th>
      <th style="${hdrCell}">${groupName} Price</th>
    </tr>`;

    const dataRows = products.map((p) => {
      const ep = p as Product & { groupPrices?: Record<string, number>; description?: string };
      const gp = ep.groupPrices?.[groupId];
      const hasPrice = gp != null && Number(gp) > 0;
      const rowBg = hasPrice ? "background:#fefce8;" : "";
      return `<tr style="${rowBg}">
        <td style="${hasPrice ? hiCell : cell}">${(p.name ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
        <td style="${hasPrice ? hiCell : cell}">${(p.sku ?? "").replace(/&/g, "&amp;")}</td>
        <td style="${hasPrice ? hiCell : cell}">${(ep.description ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
        <td style="${hasPrice ? hiCell : cell}">${p.price != null ? "$" + Number(p.price).toFixed(2) : ""}</td>
        <td style="${hasPrice ? hiPriceCell : cell}">${hasPrice ? "$" + Number(gp).toFixed(2) : ""}</td>
      </tr>`;
    }).join("");

    const legend = `<p style="font-family:sans-serif;font-size:12px;color:#92400e;background:#fefce8;border:1px solid #fcd34d;padding:6px 10px;display:inline-block;border-radius:4px;margin-bottom:8px;">
      ★ Highlighted rows have a custom <strong>${groupName}</strong> price set
    </p>`;

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
        <style>table{border-collapse:collapse;font-family:sans-serif;}</style>
      </head>
      <body>
        <h2 style="font-family:sans-serif;margin-bottom:4px;">${groupName} Group Pricing</h2>
        ${legend}
        <table>${headerRow}${dataRows}</table>
      </body></html>`;

    const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Group_Pricing_${groupName.replace(/\s+/g, "_")}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your product catalogue, pricing, and availability.</p>
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, SKU, barcode..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* All Categories */}
          <TreeCategorySelect
            categories={categories}
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="All Categories"
            triggerClass="w-[160px]"
          />

          {/* All Types */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {productTypesList.filter((t) => t.isActive).map((t) => (
                <SelectItem key={t.id} value={t.slug}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* All Status */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {/* All Tags */}
          {allTags.length > 0 && (
            <Select value={tagFilter || "all"} onValueChange={(v) => setTagFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Hide / Show Costs — only visible when enabled in Management > Inventory */}
          {showHideCostsBtn && (
            <Button variant="outline" size="sm" onClick={() => setHideCosts((v) => !v)} className="gap-1.5">
              {hideCosts ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {hideCosts ? "Show Costs" : "Hide Costs"}
            </Button>
          )}

          {/* CSV Import */}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCsvImportOpen(true)}>
            <Upload className="w-4 h-4" />
            Import CSV
          </Button>

          {/* CSV Export */}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportProductsCsv} title="Export current product list to CSV">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>

          {/* Group Export */}
          <Popover open={groupExportOpen} onOpenChange={setGroupExportOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="w-4 h-4" />
                Group Export
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              <p className="text-[11px] text-muted-foreground px-2 py-1.5 font-medium">Export pricing for group</p>
              {customerGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => exportGroupPriceSheet(group.id, group.name)}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: group.color }} />
                  {group.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Add Product */}
          <Button onClick={openCreate} className="ml-auto gap-1.5">
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        </div>

        {/* ── Bulk action bar (shown when rows are selected) ─────────────── */}
        {checked.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-primary/5 border-primary/20 flex-wrap">
            <span className="text-sm font-medium text-primary shrink-0">{checked.size} selected</span>
            <div className="w-px h-4 bg-border shrink-0" />

            {/* % Price change */}
            <Popover open={bulkPricePopover === "percent"} onOpenChange={(o) => { setBulkPricePopover(o ? "percent" : null); if (!o) setBulkPriceInput(""); }}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                  <DollarSign className="w-3 h-3" /> % Price
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-3" align="start">
                <p className="text-xs font-medium mb-2 text-muted-foreground">Apply % price change</p>
                <div className="flex items-center gap-1.5">
                  <Input type="number" placeholder="+10 or -5" value={bulkPriceInput}
                    onChange={(e) => setBulkPriceInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyBulkPricePercent(); }}
                    className="flex-1 h-8 text-sm" />
                  <span className="text-sm text-muted-foreground shrink-0">%</span>
                </div>
                <Button size="sm" className="w-full mt-2 h-7" onClick={applyBulkPricePercent} disabled={!bulkPriceInput.trim()}>
                  Preview
                </Button>
              </PopoverContent>
            </Popover>

            {/* Flat price change */}
            <Popover open={bulkPricePopover === "flat"} onOpenChange={(o) => { setBulkPricePopover(o ? "flat" : null); if (!o) setBulkPriceInput(""); }}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                  <DollarSign className="w-3 h-3" /> ±$
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-3" align="start">
                <p className="text-xs font-medium mb-2 text-muted-foreground">Apply flat price change</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground shrink-0">$</span>
                  <Input type="number" placeholder="+5.00 or -2.00" value={bulkPriceInput}
                    onChange={(e) => setBulkPriceInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyBulkPriceFlat(); }}
                    className="flex-1 h-8 text-sm" />
                </div>
                <Button size="sm" className="w-full mt-2 h-7" onClick={applyBulkPriceFlat} disabled={!bulkPriceInput.trim()}>
                  Preview
                </Button>
              </PopoverContent>
            </Popover>

            {/* Category change */}
            <Popover open={bulkCatPopover} onOpenChange={(o) => { setBulkCatPopover(o); if (!o) setBulkCatInput(""); }}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                  <Tag className="w-3 h-3" /> Category
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="start">
                <p className="text-xs font-medium mb-2 text-muted-foreground">Change category</p>
                <TreeCategorySelect
                  categories={categories}
                  value={bulkCatInput}
                  onChange={setBulkCatInput}
                  placeholder="No Category (clear)"
                />
                <Button size="sm" className="w-full mt-2 h-7" onClick={applyBulkCategory}>
                  Preview
                </Button>
              </PopoverContent>
            </Popover>

            {/* Track inventory toggle */}
            <Popover open={bulkInvPopover} onOpenChange={setBulkInvPopover}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                  <Boxes className="w-3 h-3" /> Inventory
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-3" align="start">
                <p className="text-xs font-medium mb-2 text-muted-foreground">Inventory tracking</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyBulkTrackInventory(true)}>Enable</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyBulkTrackInventory(false)}>Disable</Button>
                </div>
              </PopoverContent>
            </Popover>

            <div className="w-px h-4 bg-border shrink-0" />

            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkSetActive(true)} disabled={updateMutation.isPending}>
              Activate
            </Button>
            <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => handleBulkSetActive(false)} disabled={updateMutation.isPending}>
              <Archive className="w-3 h-3" /> Archive
            </Button>
            <Button size="sm" variant="destructive" className="gap-1 h-7 text-xs" onClick={openBulkDelete}>
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setChecked(new Set())}>
              <XIcon className="w-3 h-3 mr-1" /> Clear
            </Button>
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="rounded-lg border">
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Package className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No products yet</p>
                <p className="text-muted-foreground text-sm">Add your first product to start selling.</p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Product</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background border-b">
                  <tr>
                    <th className="p-3 w-10">
                      <input type="checkbox" checked={allChecked} onChange={toggleAll}
                        className="rounded border-muted-foreground/40 accent-primary" />
                    </th>
                    <SortTh {...sh("Product / SKU", "name")} />
                    <th className="p-3 text-left font-medium whitespace-nowrap">Type</th>
                    <SortTh {...sh("Category", "category")} />
                    <th className="p-3 text-left font-medium whitespace-nowrap">Supplier</th>
                    {!hideCosts && <SortTh {...sh("Cost", "price")} />}
                    <SortTh {...sh("Sell (inc. GST)", "price")} />
                    {!hideCosts && (
                      <>
                        <th className="p-3 text-right font-medium whitespace-nowrap text-[#16a34a]">Margin</th>
                        <th className="p-3 text-right font-medium whitespace-nowrap text-[#16a34a]">Reseller Margin</th>
                        <th className="p-3 text-right font-medium whitespace-nowrap text-[#16a34a]">WL Margin</th>
                      </>
                    )}
                    <SortTh {...sh("Stock", "stock")} />
                    <th className="p-3 text-left font-medium whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((product) => {
                    const isChecked   = checked.has(product.id);
                    const productType = (product as Product & { productType?: string }).productType ?? "standard";
                    const isService   = productType === "service";
                    const isLowStock  = !isService && product.trackInventory && (product.stockQuantity ?? 0) <= (product.lowStockThreshold ?? 5);
                    const cost = product.costPrice ?? null;
                    const sell = product.price;
                    const marginPct = cost !== null && sell > 0 ? Math.round(((sell - cost) / sell) * 100) : null;
                    return (
                      <tr key={product.id}
                        className={cn("bg-background hover:bg-muted/30 transition-colors cursor-pointer", isChecked && "bg-primary/5")}
                        onClick={() => setSelectedProduct(product)}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleOne(product.id)}
                            className="rounded border-muted-foreground/40 accent-primary" />
                        </td>
                        <td className="p-3 min-w-[160px]">
                          <p className="font-medium leading-tight">{product.name}</p>
                          {product.sku && <p className="text-xs text-muted-foreground mt-0.5">SKU: {product.sku}</p>}
                        </td>
                        <td className="p-3 text-muted-foreground text-sm">
                          {(product as Product & { productTypeName?: string | null }).productTypeName
                            ?? PRODUCT_TYPES.find((t) => t.value === ((product as Product & { productType?: string }).productType ?? "standard"))?.label
                            ?? "Standard"}
                        </td>
                        <td className="p-3">
                          {product.category
                            ? <Badge variant="outline" className="text-xs font-normal">{product.category.name}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-muted-foreground text-sm">
                          {(product as Product & { supplier?: string | null }).supplier || <span className="text-muted-foreground/40">—</span>}
                        </td>
                        {!hideCosts && (
                          <td className="p-3 text-muted-foreground">
                            {cost != null ? formatCurrency(cost) : <span className="text-muted-foreground/50">—</span>}
                          </td>
                        )}
                        <td className="p-3 font-medium">{formatCurrency(sell)}</td>
                        {!hideCosts && (
                          <>
                            <td className="p-3 text-right">
                              {marginPct != null
                                ? <span className="text-[#16a34a] font-medium">{marginPct}%</span>
                                : <span className="text-muted-foreground/50">—</span>}
                            </td>
                            <td className="p-3 text-right text-muted-foreground/50">—</td>
                            <td className="p-3 text-right text-muted-foreground/50">—</td>
                          </>
                        )}
                        <td className="p-3">
                          {isService
                            ? <span className="text-muted-foreground">—</span>
                            : product.trackInventory
                              ? <span className={isLowStock ? "text-amber-600 font-medium" : ""}>{product.stockQuantity}</span>
                              : <span className="text-muted-foreground">∞</span>}
                        </td>
                        <td className="p-3">
                          <Badge variant={product.isActive !== false ? "default" : "secondary"} className="text-xs">
                            {product.isActive !== false ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground text-right">
              {filtered.length} product{filtered.length !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>

      {/* ─── Bulk Confirm Dialog ───────────────────────────────────────────── */}
      <Dialog open={bulkConfirmOpen} onOpenChange={(o) => { if (!o) { setBulkConfirmOpen(false); setBulkActionPending(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkActionPending?.type === "delete" ? "Delete Products" : "Bulk Update — Preview"}
            </DialogTitle>
          </DialogHeader>
          {bulkActionPending && (() => {
            const selectedProducts = products.filter((p) => checked.has(p.id));
            const count = checked.size;

            let priceRange: { min: number; max: number } | null = null;
            if (bulkActionPending.type === "price_percent") {
              const newPrices = selectedProducts.map((p) =>
                Math.max(0, Math.round(p.price * (1 + bulkActionPending.value / 100) * 100) / 100)
              );
              if (newPrices.length) priceRange = { min: Math.min(...newPrices), max: Math.max(...newPrices) };
            } else if (bulkActionPending.type === "price_flat") {
              const newPrices = selectedProducts.map((p) =>
                Math.max(0, Math.round((p.price + bulkActionPending.value) * 100) / 100)
              );
              if (newPrices.length) priceRange = { min: Math.min(...newPrices), max: Math.max(...newPrices) };
            }

            return (
              <div className="space-y-4 py-1">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <p className="text-sm font-semibold">
                    {count} product{count !== 1 ? "s" : ""} will be affected
                  </p>

                  {bulkActionPending.type === "price_percent" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Price change:{" "}
                        <span className={cn("font-medium", bulkActionPending.value >= 0 ? "text-green-600" : "text-red-600")}>
                          {bulkActionPending.value >= 0 ? "+" : ""}{bulkActionPending.value}%
                        </span>
                      </p>
                      {priceRange && (
                        <p className="text-sm text-muted-foreground">
                          New price range:{" "}
                          <span className="font-medium text-foreground">
                            {formatCurrency(priceRange.min)}{priceRange.min !== priceRange.max ? ` – ${formatCurrency(priceRange.max)}` : ""}
                          </span>
                        </p>
                      )}
                    </>
                  )}

                  {bulkActionPending.type === "price_flat" && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Price change:{" "}
                        <span className={cn("font-medium", bulkActionPending.value >= 0 ? "text-green-600" : "text-red-600")}>
                          {bulkActionPending.value >= 0 ? "+" : "−"}{formatCurrency(Math.abs(bulkActionPending.value))}
                        </span>
                      </p>
                      {priceRange && (
                        <p className="text-sm text-muted-foreground">
                          New price range:{" "}
                          <span className="font-medium text-foreground">
                            {formatCurrency(priceRange.min)}{priceRange.min !== priceRange.max ? ` – ${formatCurrency(priceRange.max)}` : ""}
                          </span>
                        </p>
                      )}
                    </>
                  )}

                  {bulkActionPending.type === "set_category" && (
                    <p className="text-sm text-muted-foreground">
                      New category:{" "}
                      <span className="font-medium text-foreground">{bulkActionPending.categoryName}</span>
                    </p>
                  )}

                  {bulkActionPending.type === "set_track_inventory" && (
                    <p className="text-sm text-muted-foreground">
                      Inventory tracking:{" "}
                      <span className="font-medium text-foreground">{bulkActionPending.value ? "Enabled" : "Disabled"}</span>
                    </p>
                  )}

                  {bulkActionPending.type === "delete" && (
                    <p className="text-sm text-destructive font-medium">This cannot be undone.</p>
                  )}
                </div>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => { setBulkConfirmOpen(false); setBulkActionPending(null); }}>
                    Cancel
                  </Button>
                  <Button
                    variant={bulkActionPending.type === "delete" ? "destructive" : "default"}
                    onClick={handleBulkApply}
                    disabled={bulkSubmitting}
                  >
                    {bulkSubmitting ? "Applying…" : bulkActionPending.type === "delete" ? `Delete ${count}` : "Apply Changes"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ProductDetailDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
      />

      {/* ─── Add / Edit Product dialog ─────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh] overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
            <DialogTitle>
              {editingProduct ? `Edit Product — ${editingProduct.name}` : "New Product"}
            </DialogTitle>
          </DialogHeader>

          {/* Tab nav */}
          <div className="flex border-b px-6 gap-0 shrink-0 mt-3">
            {FORM_TABS
              .filter(({ digitalCodeOnly, variantOnly }) => (!digitalCodeOnly || form.productType === "digital_code") && (!variantOnly || form.productType === "variant"))
              .map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    setFormTab(key);
                  }}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                    formTab === key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
          </div>

          {/* Tab content — tabIndex allows mouse-wheel scroll immediately on dialog open */}
          <div
            className="flex-1 overflow-y-auto px-6 min-h-0"
            tabIndex={-1}
            style={{ outline: "none" }}
            ref={scrollContainerRef}
          >

            {/* ── Details ── */}
            {formTab === "details" && (
              <div className="py-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs text-muted-foreground">Product Name *</Label>
                      <button
                        type="button"
                        title={form.barcode ? `Look up barcode "${form.barcode}" on Barcode Lookup` : "Look up barcode on Barcode Lookup (enter a barcode first)"}
                        onClick={() => {
                          const url = form.barcode
                            ? `https://www.barcodelookup.com/${encodeURIComponent(form.barcode.trim())}`
                            : "https://www.barcodelookup.com/";
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                        className={cn(
                          "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors",
                          form.barcode
                            ? "text-primary border-primary/30 bg-primary/5 hover:bg-primary/10"
                            : "text-muted-foreground border-border hover:bg-muted/50",
                        )}
                      >
                        <ScanSearch className="w-3 h-3" />
                        Barcode Lookup
                      </button>
                    </div>
                    <Input
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder='e.g. Laptop Screen 15.6"'
                      autoFocus
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setField("description", e.target.value)}
                      placeholder="Product description, specifications..."
                      rows={3}
                      className="mt-1.5 resize-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Product Type</Label>
                    {productTypesList.length > 0 ? (
                      <Select
                        value={form.productTypeId || ""}
                        onValueChange={(v) => {
                          const pt = productTypesList.find((t) => t.id.toString() === v);
                          if (pt) { setField("productTypeId", v); setField("productType", pt.slug); }
                        }}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Select type…" />
                        </SelectTrigger>
                        <SelectContent>
                          {productTypesList.filter((t) => t.isActive).map((t) => (
                            <SelectItem key={t.id} value={t.id.toString()}>
                              <div className="flex flex-col">
                                <span>{t.name}</span>
                                {t.description && <span className="text-xs text-muted-foreground">{t.description}</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 mt-1.5">
                        {PRODUCT_TYPES.map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setField("productType", value)}
                            className={cn(
                              "flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border-2 text-center transition-all",
                              form.productType === value
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="text-[11px] font-medium leading-tight">{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">SKU Code</Label>
                    <div className="flex gap-1.5 mt-1.5">
                      <Input
                        value={form.sku}
                        onChange={(e) => setField("sku", e.target.value)}
                        placeholder="e.g. KP-12345"
                        className="flex-1"
                      />
                      <Button
                        type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9"
                        onClick={handleGenerateSKU} title="Generate SKU"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Barcode</Label>
                    <Input
                      value={form.barcode}
                      onChange={(e) => setField("barcode", e.target.value)}
                      placeholder="Scan or type barcode"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <TreeCategorySelect
                      categories={categories}
                      value={form.categoryId}
                      onChange={(v) => setField("categoryId", v)}
                      placeholder="No Category"
                      triggerClass="mt-1.5"
                      onCreateCategory={createCategoryInline}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Brand</Label>
                    <Popover open={brandPopoverOpen} onOpenChange={(o) => { if (!o) { setBrandCreatingInline(false); setNewBrandName(""); } setBrandPopoverOpen(o); }}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 mt-1.5"
                        >
                          <span className={cn("truncate", !form.brandId && "text-muted-foreground")}>
                            {brandsList.find((b) => b.id.toString() === form.brandId)?.name ?? "No Brand"}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="p-1.5 max-h-64 overflow-y-auto" align="start" style={{ minWidth: "180px" }}>
                        <button
                          type="button"
                          onClick={() => { setField("brandId", ""); setBrandPopoverOpen(false); }}
                          className={cn("w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors", !form.brandId && "bg-primary/10 text-primary font-medium")}
                        >No Brand</button>
                        {brandsList.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => { setField("brandId", b.id.toString()); setBrandPopoverOpen(false); }}
                            className={cn("w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors", form.brandId === b.id.toString() && "bg-primary/10 text-primary font-medium")}
                          >{b.name}</button>
                        ))}
                        {brandCreatingInline ? (
                          <div className="border-t mt-1 pt-1.5 px-1 flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={newBrandName}
                              onChange={(e) => setNewBrandName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); void createBrandInline((id) => setField("brandId", id.toString())); }
                                if (e.key === "Escape") { setBrandCreatingInline(false); setNewBrandName(""); }
                              }}
                              placeholder="Brand name…"
                              className="flex-1 text-sm border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring bg-background"
                            />
                            <button type="button" onClick={() => void createBrandInline((id) => setField("brandId", id.toString()))} className="text-xs text-primary font-medium hover:underline whitespace-nowrap">Add</button>
                            <button type="button" onClick={() => { setBrandCreatingInline(false); setNewBrandName(""); }} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setBrandCreatingInline(true)}
                            className="w-full text-left px-2 py-1.5 text-xs text-primary font-medium border-t mt-1 flex items-center gap-1.5 hover:bg-muted/50 rounded transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Add New Brand
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4 items-start">
                    {/* Tags input */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Tags <span className="text-muted-foreground/50">(up to 5)</span></Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 min-h-[36px] rounded-md border bg-background px-2.5 py-1.5">
                        {form.tags.map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                            {t}
                            <button type="button" onClick={() => setField("tags", form.tags.filter((x) => x !== t))} className="hover:text-destructive leading-none">&times;</button>
                          </span>
                        ))}
                        {form.tags.length < 5 && (
                          <input
                            className="flex-1 min-w-[80px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                            placeholder={form.tags.length === 0 ? "Type and press Enter…" : "Add tag…"}
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                                e.preventDefault();
                                const val = tagInput.trim().replace(/,$/, "");
                                if (val && !form.tags.includes(val) && form.tags.length < 5) {
                                  setField("tags", [...form.tags, val]);
                                }
                                setTagInput("");
                              } else if (e.key === "Backspace" && !tagInput && form.tags.length > 0) {
                                setField("tags", form.tags.slice(0, -1));
                              }
                            }}
                            onBlur={() => {
                              const val = tagInput.trim().replace(/,$/, "");
                              if (val && !form.tags.includes(val) && form.tags.length < 5) {
                                setField("tags", [...form.tags, val]);
                                setTagInput("");
                              }
                            }}
                          />
                        )}
                      </div>
                    </div>
                    {/* Suggested tags based on selected category */}
                    {(() => {
                      const selectedCat = form.categoryId
                        ? categories.find((c) => c.id.toString() === form.categoryId)
                        : null;
                      if (!selectedCat) return (
                        <div className="flex items-center justify-center h-full min-h-[48px]">
                          <p className="text-xs text-muted-foreground/50 italic">Select a category to see suggested tags</p>
                        </div>
                      );
                      const suggestions = getSuggestedTags(selectedCat.name).filter((s) => !form.tags.includes(s));
                      if (suggestions.length === 0) return null;
                      return (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">
                            Suggested for <span className="font-medium text-foreground">{selectedCat.name}</span>
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {suggestions.map((s) => (
                              <button
                                key={s}
                                type="button"
                                disabled={form.tags.length >= 5}
                                onClick={() => {
                                  if (!form.tags.includes(s) && form.tags.length < 5) {
                                    setField("tags", [...form.tags, s]);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                + {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Digital / Download notice — shown inline after the type selector */}
                {form.productType === "digital" && (
                  <div className="flex items-start gap-3 p-3.5 border rounded-xl bg-muted/20 text-muted-foreground">
                    <Download className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-foreground">Digital download</p>
                      <p className="text-xs mt-0.5">No physical stock tracked. Customers receive a download link.</p>
                    </div>
                  </div>
                )}

                {/* Physical details — only for standard products */}
                {form.productType === "standard" && (
                <div className="border-t pt-4 space-y-3">
                  <SectionHeader label="Physical Details" />
                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Weight</Label>
                      <div className="flex gap-1.5 mt-1.5">
                        <Input
                          type="number" step="0.001" min="0"
                          value={form.weight}
                          onChange={(e) => setField("weight", e.target.value)}
                          placeholder="0.000"
                          className="flex-1"
                        />
                        <Select value={form.weightUnit} onValueChange={(v) => setField("weightUnit", v)}>
                          <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="g">g</SelectItem>
                            <SelectItem value="lb">lb</SelectItem>
                            <SelectItem value="oz">oz</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">L (cm)</Label>
                      <Input type="number" step="0.01" min="0" value={form.lengthCm} onChange={(e) => setField("lengthCm", e.target.value)} placeholder="0.00" className="mt-1.5" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">W (cm)</Label>
                      <Input type="number" step="0.01" min="0" value={form.widthCm} onChange={(e) => setField("widthCm", e.target.value)} placeholder="0.00" className="mt-1.5" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">H (cm)</Label>
                      <Input type="number" step="0.01" min="0" value={form.heightCm} onChange={(e) => setField("heightCm", e.target.value)} placeholder="0.00" className="mt-1.5" />
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}

            {/* ── Pricing ── */}
            {formTab === "pricing" && (
              <div className="py-5 space-y-6">
                {/* Supplier */}
                <div>
                  <SectionHeader label="Supplier" />
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Primary Supplier</Label>
                      {suppliersList.length > 0 ? (
                        <Select value={form.supplier || "__none__"} onValueChange={(v) => setField("supplier", v === "__none__" ? "" : v)}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="No supplier" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No supplier</SelectItem>
                            {[...suppliersList].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={form.supplier}
                          onChange={(e) => setField("supplier", e.target.value)}
                          placeholder="No supplier"
                          className="mt-1.5"
                        />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Supplier Code</Label>
                      <Input
                        value={form.supplierCode}
                        onChange={(e) => setField("supplierCode", e.target.value)}
                        placeholder="Supplier product code"
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Standard pricing */}
                <div className="border-t pt-5">
                  <div className="flex items-center justify-between">
                    <SectionHeader label="Standard Pricing" />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      GST Free
                      <Switch
                        checked={form.taxRate === "0"}
                        onCheckedChange={(v) => setField("taxRate", v ? "0" : "10")}
                        className="scale-75"
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Cost Price (ex GST)</Label>
                      <div className="relative mt-1.5">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                        <Input
                          type="number" step="0.01" min="0"
                          value={form.costPrice}
                          onChange={(e) => setField("costPrice", e.target.value)}
                          placeholder="0.00"
                          className="pl-7"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Sell Price (inc GST) *</Label>
                      <div className="relative mt-1.5">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                        <Input
                          type="number" step="0.01" min="0"
                          value={form.price}
                          onChange={(e) => setField("price", e.target.value)}
                          placeholder="0.00"
                          className="pl-7"
                        />
                      </div>
                    </div>
                  </div>
                  {marginPct !== null && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                      <DollarSign className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Margin: <span className={cn("font-semibold", marginPct < 20 ? "text-destructive" : "text-emerald-600")}>{marginPct}%</span>
                        {" · "}Profit: <span className="font-semibold text-foreground">${(parseFloat(form.price) - parseFloat(form.costPrice)).toFixed(2)}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Customer Group Pricing */}
                {enableGroupPricing && (
                  <div className="border-t pt-5">
                    <div className="flex items-center justify-between mb-3">
                      <SectionHeader label="Customer Group Pricing" />
                      <span className="text-xs text-muted-foreground">Leave blank to use standard price</span>
                    </div>
                    <div className="space-y-2">
                      {customerGroups.map((group) => (
                        <div key={group.id} className="flex items-center gap-3">
                          <div className="flex items-center gap-2 w-36 shrink-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                            <span className="text-sm font-medium truncate">{group.name}</span>
                          </div>
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">$</span>
                            <Input
                              type="number" step="0.01" min="0"
                              value={form.groupPrices[group.id] ?? ""}
                              onChange={(e) => setField("groupPrices", { ...form.groupPrices, [group.id]: e.target.value })}
                              placeholder={form.price || "0.00"}
                              className="pl-7 text-sm"
                            />
                          </div>
                          {form.groupPrices[group.id] && form.price && parseFloat(form.groupPrices[group.id]) < parseFloat(form.price) && (
                            <span className="text-xs text-amber-600 whitespace-nowrap">
                              -{Math.round((1 - parseFloat(form.groupPrices[group.id]) / parseFloat(form.price)) * 100)}%
                            </span>
                          )}
                          {form.groupPrices[group.id] && form.price && parseFloat(form.groupPrices[group.id]) > parseFloat(form.price) && (
                            <span className="text-xs text-emerald-600 whitespace-nowrap">
                              +{Math.round((parseFloat(form.groupPrices[group.id]) / parseFloat(form.price) - 1) * 100)}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pricing History */}
                {editingProduct && (
                  <div className="border-t pt-5">
                    <SectionHeader label="Pricing History" />
                    <PricingHistoryTable productId={editingProduct.id} />
                  </div>
                )}
              </div>
            )}

            {/* ── Media ── */}
            {formTab === "media" && (
              <div className="py-5 space-y-6">
                <div>
                  <SectionHeader label="Product Images" />
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Upload images or paste a URL. JPG, PNG, WebP · Max 2048×2048px recommended.</p>
                  <div className="grid grid-cols-4 gap-3">
                    <ImageSlot label="Primary"  value={form.imageUrl}  onChange={(v) => setField("imageUrl", v)}  />
                    <ImageSlot label="Image 2"  value={form.imageUrl2} onChange={(v) => setField("imageUrl2", v)} />
                    <ImageSlot label="Image 3"  value={form.imageUrl3} onChange={(v) => setField("imageUrl3", v)} />
                    <ImageSlot label="Image 4"  value={form.imageUrl4} onChange={(v) => setField("imageUrl4", v)} />
                  </div>
                </div>

                <div className="border-t pt-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="w-4 h-4 text-muted-foreground" />
                    <SectionHeader label="Video" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Video URL (YouTube or direct link)</Label>
                    <Input
                      value={form.videoUrl}
                      onChange={(e) => setField("videoUrl", e.target.value)}
                      placeholder="https://youtube.com/watch?v=… or direct video URL"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">Displayed as a video preview on the product detail page.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Stock ── */}
            {formTab === "stock" && (
              <div className="py-5 space-y-6">

                {/* Inventory */}
                <div>
                  <SectionHeader label="Inventory" />
                  {form.productType === "digital_code" ? null : (() => {
                  const selType = productTypesList.find((t) => t.id.toString() === form.productTypeId);
                  const noStock = selType ? !selType.trackStock : NO_STOCK_TYPES.has(form.productType);
                  return noStock;
                })() ? (
                    <div className="mt-3 flex items-center gap-3 p-3.5 border rounded-xl bg-muted/20 text-muted-foreground">
                      <Briefcase className="w-4 h-4 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-foreground">No stock tracking</p>
                        <p className="text-xs mt-0.5">This product type does not use inventory tracking.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 flex items-center justify-between p-3.5 border rounded-xl hover:bg-muted/20 transition-colors">
                        <div>
                          <p className="text-sm font-medium">No Stock Tracking</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Always shows as in-stock</p>
                        </div>
                        <Switch
                          checked={!form.trackInventory}
                          onCheckedChange={(v) => setField("trackInventory", !v)}
                        />
                      </div>
                      {form.trackInventory && (
                        <div className="grid grid-cols-2 gap-4 mt-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">Stock Quantity</Label>
                            <Input type="number" min="0" value={form.stockQuantity} onChange={(e) => setField("stockQuantity", e.target.value)} className="mt-1.5" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Low Stock Alert (units)</Label>
                            <Input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setField("lowStockThreshold", e.target.value)} className="mt-1.5" />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Stock Locations */}
                <div className="border-t pt-5">
                  <SectionHeader label="Stock Locations" />
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Specify where this product can be found in your store.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Display
                      </Label>
                      <Select value={form.stockLocationDisplay || "__none__"} onValueChange={(v) => setField("stockLocationDisplay", v === "__none__" ? "" : v)}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="No location assigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— No location —</SelectItem>
                          {(floorPlanZones ?? []).map((z) => (
                            <SelectItem key={z.id} value={z.label}>{z.label}</SelectItem>
                          ))}
                          {(!floorPlanZones || floorPlanZones.length === 0) && (
                            <div className="px-3 py-2 text-xs text-muted-foreground">No zones defined — add zones in the Floor Plan editor</div>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1.5">Where the product is shown on the shop floor.</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Overflow
                      </Label>
                      <Select value={form.stockLocationOverflow || "__none__"} onValueChange={(v) => setField("stockLocationOverflow", v === "__none__" ? "" : v)}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="No location assigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— No location —</SelectItem>
                          {(floorPlanZones ?? []).map((z) => (
                            <SelectItem key={z.id} value={z.label}>{z.label}</SelectItem>
                          ))}
                          {(!floorPlanZones || floorPlanZones.length === 0) && (
                            <div className="px-3 py-2 text-xs text-muted-foreground">No zones defined — add zones in the Floor Plan editor</div>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1.5">Where backup / overflow stock is held.</p>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ── Settings ── */}
            {formTab === "settings" && (
              <div className="py-5 space-y-5">

                {/* Availability — only shown when editing an existing product */}
                {editingProduct && (
                  <div className="border-t pt-5">
                    <SectionHeader label="Availability" />
                    <div className="mt-3 flex items-center justify-between p-3.5 border rounded-xl hover:bg-muted/20 transition-colors">
                      <div>
                        <p className="text-sm font-medium">Active</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Visible and available for sale in the POS</p>
                      </div>
                      <Switch
                        checked={form.isActive}
                        onCheckedChange={(v) => setField("isActive", v)}
                      />
                    </div>
                  </div>
                )}

                {/* No Loyalty Points */}
                <div className="border-t pt-5">
                  <SectionHeader label="Loyalty" />
                  <div className="mt-3 flex items-center justify-between p-3.5 border rounded-xl hover:bg-muted/20 transition-colors">
                    <div>
                      <p className="text-sm font-medium">No Loyalty Points</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Exclude from loyalty program</p>
                    </div>
                    <Switch
                      checked={form.excludeFromLoyalty}
                      onCheckedChange={(v) => setField("excludeFromLoyalty", v)}
                    />
                  </div>
                </div>

                {/* Internal Notes */}
                <div className="border-t pt-5">
                  <SectionHeader label="Internal Notes" />
                  <Textarea
                    value={form.internalNotes}
                    onChange={(e) => setField("internalNotes", e.target.value)}
                    placeholder="Internal notes, specifications, special handling..."
                    rows={4}
                    className="mt-3 resize-none"
                  />
                </div>
              </div>
            )}

            {/* ── Digital Codes ── */}
            {formTab === "digital_codes" && (
              <div className="py-5 space-y-5">

                {/* ePay switch */}
                <div>
                  <SectionHeader label="ePay Mode" />
                  <div className="mt-3 flex items-center justify-between p-3.5 border rounded-xl hover:bg-muted/20 transition-colors">
                    <div>
                      <p className="text-sm font-medium">ePay / Physical Card</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        When enabled, no digital code is printed on the receipt — the card processes its own code at the terminal.
                      </p>
                    </div>
                    <Switch
                      checked={form.isEpay}
                      onCheckedChange={(v) => setField("isEpay", v)}
                    />
                  </div>
                </div>

                {/* Code inventory — hidden when ePay mode is on */}
                {!form.isEpay && <div className="border-t pt-5">
                  <SectionHeader label="Code Inventory" />

                  {!editingProduct ? (
                    <div className="mt-3 flex items-start gap-3 p-3.5 border rounded-xl bg-muted/20 text-muted-foreground">
                      <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="text-sm">Save this product first to start adding digital codes.</p>
                    </div>
                  ) : (
                    <>
                      {/* Add code(s) — managers/owners only */}
                      {canViewCodes ? (
                        !bulkMode ? (
                          <div className="mt-3 flex gap-2">
                            <Input
                              value={newCodeInput}
                              onChange={(e) => setNewCodeInput(e.target.value)}
                              placeholder="Enter a code (e.g. XXXX-XXXX-XXXX)"
                              onKeyDown={(e) => { if (e.key === "Enter" && newCodeInput.trim()) addDigitalCode(editingProduct.id, newCodeInput); }}
                              className="flex-1"
                            />
                            <Button
                              type="button" variant="outline" size="sm"
                              onClick={() => { if (newCodeInput.trim()) addDigitalCode(editingProduct.id, newCodeInput); }}
                              disabled={!newCodeInput.trim()}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" /> Add
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setBulkMode(true)}>
                              Bulk
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            <Textarea
                              value={newCodeInput}
                              onChange={(e) => setNewCodeInput(e.target.value)}
                              placeholder={"One code per line:\nXXXX-XXXX-XXXX\nYYYY-YYYY-YYYY"}
                              rows={5}
                              className="resize-none font-mono text-xs"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button" size="sm"
                                onClick={async () => {
                                  const lines = newCodeInput.split("\n").map(l => l.trim()).filter(Boolean);
                                  for (const line of lines) await addDigitalCode(editingProduct.id, line);
                                  setNewCodeInput(""); setBulkMode(false);
                                }}
                                disabled={!newCodeInput.trim()}
                              >
                                Add {newCodeInput.split("\n").filter(l => l.trim()).length} codes
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => { setBulkMode(false); setNewCodeInput(""); }}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="mt-3 flex items-center gap-3 p-3.5 border rounded-xl bg-muted/20 text-muted-foreground">
                          <Lock className="w-4 h-4 shrink-0" />
                          <p className="text-sm">Code management is restricted to managers and owners.</p>
                        </div>
                      )}

                      {/* Code list */}
                      {codesLoading ? (
                        <p className="text-xs text-muted-foreground mt-4">Loading codes…</p>
                      ) : digitalCodes.length === 0 ? (
                        <div className="mt-4 flex items-start gap-3 p-3.5 border rounded-xl bg-muted/20 text-muted-foreground">
                          <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                          <p className="text-sm">No codes yet. Add codes above — each code is delivered to one customer upon sale.</p>
                        </div>
                      ) : (
                        <div className="mt-4 border rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              {digitalCodes.length} code{digitalCodes.length !== 1 ? "s" : ""} — {digitalCodes.filter(c => !c.isUsed).length} available
                            </p>
                          </div>
                          <div className="divide-y max-h-64 overflow-y-auto">
                            {digitalCodes.map((c) => (
                              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                                <KeyRound className={cn("w-3.5 h-3.5 shrink-0", c.isUsed ? "text-muted-foreground/40" : "text-primary")} />
                                <span className={cn("flex-1 font-mono text-sm", c.isUsed && "line-through text-muted-foreground/60")}>
                                  {canViewCodes ? c.code : c.code.replace(/[A-Za-z0-9]/g, "X")}
                                </span>
                                {c.isUsed && (
                                  <Badge variant="secondary" className="text-[10px] shrink-0">Used</Badge>
                                )}
                                {!c.isUsed && canViewCodes && (
                                  <button
                                    type="button"
                                    onClick={() => deleteDigitalCode(c.id, editingProduct.id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                    title="Delete code"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>}
              </div>
            )}

            {/* ── Compatibility ── */}
            {formTab === "compatibility" && (
              <div className="py-5 space-y-5">
                <div>
                  <SectionHeader label="PC Part Type" />
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Tag this product as a PC component so it appears as a selectable part in POS → PC Builder.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setPcPartType(""); setPcSocket(""); setPcCompatNotes(""); }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm transition-all text-left",
                        !pcPartType
                          ? "border-primary bg-primary/5 text-primary font-medium"
                          : "border-border hover:border-muted-foreground/40 text-muted-foreground"
                      )}
                    >
                      <Package className="w-3.5 h-3.5 shrink-0" />
                      Not a PC part
                    </button>
                    {PC_PART_SLOTS.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPcPartType(id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm transition-all text-left",
                          pcPartType === id
                            ? "border-primary bg-primary/5 text-primary font-medium"
                            : "border-border hover:border-muted-foreground/40 text-muted-foreground"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {pcPartType && (
                  <div className="border-t pt-5 grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Socket / Interface</Label>
                      <Input
                        value={pcSocket}
                        onChange={(e) => setPcSocket(e.target.value)}
                        placeholder={
                          pcPartType === "cpu" || pcPartType === "motherboard" ? "e.g. AM5, LGA1700"
                          : pcPartType === "memory" ? "e.g. DDR5, DDR4"
                          : pcPartType === "storage" ? "e.g. M.2 NVMe, SATA III"
                          : pcPartType === "psu" ? "e.g. ATX, SFX"
                          : "e.g. socket, interface"
                        }
                        className="mt-1.5"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Used for compatibility matching in PC Builder.</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Additional Specs</Label>
                      <Input
                        value={pcCompatNotes}
                        onChange={(e) => setPcCompatNotes(e.target.value)}
                        placeholder="e.g. 32GB, 3200MHz, 850W, 6-core"
                        className="mt-1.5"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Shown as extra info in the PC Builder slot picker.</p>
                    </div>
                  </div>
                )}

                {!pcPartType && (
                  <div className="border rounded-xl p-4 bg-muted/20 text-sm text-muted-foreground">
                    Select a PC part type above to tag this product. Once tagged, it will appear in the relevant slot when building a custom PC in POS → PC Builder.
                  </div>
                )}
              </div>
            )}

            {/* ── Variants ── */}
            {formTab === "variants" && (
              <div className="py-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionHeader label="Product Variants" />
                    <p className="text-xs text-muted-foreground mt-1">Manage sizes, colours, or other variations of this product.</p>
                  </div>
                  {editingProduct && (
                    <Button type="button" size="sm" variant="outline" className="gap-1.5 h-8 shrink-0"
                      onClick={() => { setAddingVariant(true); setVariantForm(defaultVariantForm); }}>
                      <Plus className="w-3.5 h-3.5" /> Add Variant
                    </Button>
                  )}
                </div>

                {!editingProduct && (
                  <div className="border rounded-xl p-5 bg-muted/20 text-sm text-muted-foreground text-center">
                    Save the product first, then come back to add variants.
                  </div>
                )}

                {editingProduct && (
                  <>
                    {addingVariant && (
                      <div className="border rounded-xl p-4 space-y-3 bg-muted/10">
                        <p className="text-xs font-semibold text-foreground">New Variant</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">Variant Name *</Label>
                            <Input
                              value={variantForm.name}
                              onChange={(e) => setVariantForm((f) => ({ ...f, name: e.target.value }))}
                              placeholder="e.g. Red / Large"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">SKU</Label>
                            <Input
                              value={variantForm.sku}
                              onChange={(e) => setVariantForm((f) => ({ ...f, sku: e.target.value }))}
                              placeholder="SKU-001-RED"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Price Override</Label>
                            <div className="relative mt-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                              <Input
                                type="number" step="0.01"
                                value={variantForm.price}
                                onChange={(e) => setVariantForm((f) => ({ ...f, price: e.target.value }))}
                                placeholder={form.price || "0.00"}
                                className="pl-7"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Stock Qty</Label>
                            <Input
                              type="number"
                              value={variantForm.stockQuantity}
                              onChange={(e) => setVariantForm((f) => ({ ...f, stockQuantity: e.target.value }))}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button type="button" size="sm" onClick={() => void handleAddVariant(editingProduct.id)}>Add</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingVariant(false); setVariantForm(defaultVariantForm); }}>Cancel</Button>
                        </div>
                      </div>
                    )}

                    {variantsLoading ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Loading variants…</p>
                    ) : variants.length === 0 && !addingVariant ? (
                      <div className="border rounded-xl p-8 text-center text-muted-foreground text-sm bg-muted/10">
                        <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>No variants yet.</p>
                        <p className="text-xs mt-1">Click "Add Variant" to create your first one.</p>
                      </div>
                    ) : variants.length > 0 ? (
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground">Name</th>
                              <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground">SKU</th>
                              <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground">Price</th>
                              <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground">Stock</th>
                              <th className="px-4 py-2.5 w-16"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {variants.map((v) =>
                              editingVariantId === v.id ? (
                                <tr key={v.id} className="bg-muted/10">
                                  <td className="px-2 py-1.5">
                                    <Input value={editVariantForm.name} onChange={(e) => setEditVariantForm(f => ({ ...f, name: e.target.value }))} className="h-7 text-sm" placeholder="Variant name" />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <Input value={editVariantForm.sku} onChange={(e) => setEditVariantForm(f => ({ ...f, sku: e.target.value }))} className="h-7 text-sm font-mono" placeholder="SKU" />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                      <Input type="number" step="0.01" value={editVariantForm.price} onChange={(e) => setEditVariantForm(f => ({ ...f, price: e.target.value }))} className="h-7 text-sm pl-5" placeholder="base" />
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <Input type="number" value={editVariantForm.stockQuantity} onChange={(e) => setEditVariantForm(f => ({ ...f, stockQuantity: e.target.value }))} className="h-7 text-sm" />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <div className="flex gap-1">
                                      <button type="button" onClick={() => void handleUpdateVariant(v.id, editingProduct.id)} className="text-primary hover:text-primary/80 transition-colors">
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button type="button" onClick={() => setEditingVariantId(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                                        <XIcon className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2.5 font-medium">{v.name}</td>
                                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{v.sku || "—"}</td>
                                  <td className="px-4 py-2.5">{v.price != null ? formatCurrency(v.price) : <span className="text-muted-foreground text-xs">uses base</span>}</td>
                                  <td className="px-4 py-2.5">{v.stockQuantity}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => { setEditingVariantId(v.id); setEditVariantForm({ name: v.name, sku: v.sku || "", price: v.price != null ? String(v.price) : "", stockQuantity: String(v.stockQuantity ?? 0) }); }}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteVariant(v.id, editingProduct.id)}
                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/10 shrink-0">
            {!isLastTab ? (
              <Button variant="outline" onClick={goNextTab} className="gap-1.5">
                Next Tab <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingProduct ? "Save Changes" : "Create Product"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── CSV Import ────────────────────────────────────────────────────── */}
      <CsvImportDialog
        entity="product"
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["products"] })}
      />

      {/* ─── Category manager ──────────────────────────────────────────────── */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Categories</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="font-medium">{c.name}</span>
                </div>
              ))}
              {categories.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">No categories yet.</p>}
            </div>
            <div className="border-t pt-4">
              <Label>New Category Name</Label>
              <div className="flex gap-2 mt-2">
                <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Beverages" onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()} />
                <Button onClick={handleCreateCategory} disabled={!newCategoryName || createCategoryMutation.isPending}>Add</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
