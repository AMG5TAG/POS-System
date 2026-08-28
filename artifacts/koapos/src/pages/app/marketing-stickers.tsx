import { useState, useRef, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListStickerTemplates,
  useCreateStickerTemplate,
  useUpdateStickerTemplate,
  useDeleteStickerTemplate,
  useListQrCodes,
  useGetMerchant,
  useGetPosSettings,
  type Product,
  type Customer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ProductSearchInput } from "@/components/products/ProductSearchInput";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { ImageUploader } from "@/components/ui/image-uploader";
import { DYMO_SIZES, QUICK_CODES, useStickerPrinter, type DymoSize } from "@/lib/sticker-config";
import { useBusinessProfile } from "@/lib/business-profile";
import { parseHardwareConfig } from "@/lib/hardware-config";
import { printDocument } from "@/lib/print-router";
import { QRCodeSVG } from "qrcode.react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { toast } from "sonner";
import {
  Sticker, Type, ImagePlus, QrCode, Barcode, Trash2, Printer, Save, Plus,
  Bold, AlignLeft, AlignCenter, AlignRight, Zap, FolderOpen, Building2,
  Square, Minus, ZoomIn, ZoomOut,
} from "lucide-react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

/* ── Label sizes: DYMO LabelWriter series + Brother VC-500W continuous tape ── */
const BROTHER_SIZES: DymoSize[] = [
  { id: "VC500W-9",  name: "VC-500W 9mm tape",  widthMm: 9,  heightMm: 50, series: "VC500W" },
  { id: "VC500W-12", name: "VC-500W 12mm tape", widthMm: 12, heightMm: 50, series: "VC500W" },
  { id: "VC500W-19", name: "VC-500W 19mm tape", widthMm: 19, heightMm: 60, series: "VC500W" },
  { id: "VC500W-25", name: "VC-500W 25mm tape", widthMm: 25, heightMm: 70, series: "VC500W" },
  { id: "VC500W-50", name: "VC-500W 50mm tape", widthMm: 50, heightMm: 90, series: "VC500W" },
];
const SIZES: DymoSize[] = [...DYMO_SIZES, ...BROTHER_SIZES];
const SERIES_LABEL: Record<string, string> = {
  LW: "DYMO LabelWriter 400/450", LW550: "DYMO LabelWriter 550", D1: "DYMO D1 Tape", VC500W: "Brother VC-500W",
};
const SERIES_ORDER = ["LW", "LW550", "D1", "VC500W"];
const DEFAULT_SIZE = "S0722370";

type ElType = "text" | "image" | "qr" | "barcode" | "rect" | "line";
interface StickerEl {
  id: string;
  type: ElType;
  x: number; y: number; w: number;          // % of label
  h?: number;                                // % of label height (rect)
  content?: string;                          // text / qr / barcode value (supports {{quick.codes}})
  src?: string;                              // image url
  fontSizeMm?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  color?: string;                            // text colour / line colour
  fill?: string;                             // rect fill ("transparent" allowed)
  borderColor?: string;                      // rect border
  borderWidthMm?: number;                    // rect border thickness
  thicknessMm?: number;                      // line thickness
}
interface Layout { sizeId: string; bg: string; orientation?: "portrait" | "landscape"; elements: StickerEl[]; }

const emptyLayout = (): Layout => ({ sizeId: DEFAULT_SIZE, bg: "#ffffff", orientation: "portrait", elements: [] });
const uid = () => `el_${Math.random().toString(36).slice(2, 9)}`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/* Build the {{code}} → value map from the imported business/product/customer. */
function buildSubs(o: { businessName: string; abn: string; phone: string; product: Product | null; customer: Customer | null }): Record<string, string> {
  const p = o.product as (Product & { barcode?: string | null; category?: { name?: string } | null }) | null;
  const c = o.customer as (Customer & { customerGroup?: string | null; loyaltyPoints?: number | null }) | null;
  const today = new Date().toLocaleDateString("en-AU");
  const time = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
  return {
    "{{product.name}}": p?.name ?? "",
    "{{product.sku}}": p?.sku ?? "",
    "{{product.price}}": p?.price != null ? `$${Number(p.price).toFixed(2)}` : "",
    "{{product.barcode}}": p?.barcode ?? "",
    "{{product.category}}": p?.category?.name ?? "",
    "{{customer.name}}": c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : "",
    "{{customer.id}}": c ? `#CUS-${String(c.id).padStart(4, "0")}` : "",
    "{{customer.loyalty}}": c?.loyaltyPoints != null ? String(c.loyaltyPoints) : "",
    "{{customer.phone}}": c?.phone ?? "",
    "{{customer.email}}": c?.email ?? "",
    "{{customer.group}}": c?.customerGroup ?? "",
    "{{merchant.name}}": o.businessName ?? "",
    "{{merchant.abn}}": o.abn ?? "",
    "{{merchant.phone}}": o.phone ?? "",
    "{{date.today}}": today,
    "{{date.time}}": time,
  };
}
const resolveInline = (text: string, subs: Record<string, string>) =>
  text.replace(/\{\{[\w.]+\}\}/g, (m) => (m in subs ? subs[m] : m));

function barcodeDataUrl(value: string): string {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value || "0", { format: "CODE128", displayValue: false, margin: 0, height: 50 });
    return canvas.toDataURL("image/png");
  } catch { return ""; }
}

function BarcodeImg({ value }: { value: string }) {
  const url = useMemo(() => barcodeDataUrl(value), [value]);
  return url ? <img src={url} alt="barcode" style={{ width: "100%", height: "auto", display: "block" }} /> : null;
}

/* Inserts a quick code into a text/qr/barcode element. */
function QuickCodeMenu({ onPick }: { onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const g: Record<string, typeof QUICK_CODES> = {};
    for (const qc of QUICK_CODES) (g[qc.group] ??= []).push(qc);
    return g;
  }, []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs"><Zap className="w-3 h-3" /> Quick code</Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5 max-h-[300px] overflow-y-auto" align="end">
        {Object.entries(groups).map(([group, codes]) => (
          <div key={group} className="mb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1.5 py-1">{group}</p>
            {codes.map((qc) => (
              <button key={qc.code} type="button" onClick={() => { onPick(qc.code); setOpen(false); }}
                className="w-full text-left px-1.5 py-1 rounded text-xs hover:bg-muted transition-colors">
                {qc.label}
              </button>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export default function MarketingStickersPage() {
  // Designed labels go to the same "Labels & stickers" printer as product and
  // repair labels.
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const hardware = parseHardwareConfig((posSettings as { hardwareConfig?: string } | undefined)?.hardwareConfig);
  const { businessName, logoUrl } = useStickerPrinter();
  const { profile } = useBusinessProfile();
  const { data: merchantData } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const merchantPhone = (merchantData as { phone?: string } | undefined)?.phone ?? "";

  const { data: templatesData, refetch: refetchTemplates } = useListStickerTemplates({ query: { queryKey: ["sticker-templates"] } });
  const templates = templatesData ?? [];

  const { data: qrCodesData } = useListQrCodes({ query: { queryKey: ["qr-codes"] } });
  const savedQrCodes = qrCodesData?.items ?? [];
  const createTpl = useCreateStickerTemplate();
  const updateTpl = useUpdateStickerTemplate();
  const deleteTpl = useDeleteStickerTemplate();

  const [layout, setLayout] = useState<Layout>(emptyLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showResolved, setShowResolved] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const adjustZoom = (delta: number) => setPreviewZoom((z) => Math.min(3, Math.max(0.5, Math.round((z + delta) * 100) / 100)));

  /* ── Unsaved-changes tracking ──
     The saved snapshot captures the design (layout) + template name. It's reset
     after a save/load/new; any divergence marks the sticker dirty and arms the
     navigation guard. Live-data preview toggles (product/customer/zoom) aren't
     part of the saved template, so they never count as changes. */
  const snapshotOf = (l: Layout, name: string) => JSON.stringify({ layout: l, templateName: name.trim() });
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf(emptyLayout(), ""));
  const isDirty = snapshotOf(layout, templateName) !== savedSnapshot;
  const { ConfirmDialog: UnsavedGuard } = useUnsavedChangesGuard(isDirty, {
    title: "Unsaved sticker changes",
    description: "You have an unsaved sticker design. If you leave now, your changes will be lost.",
    actionLabel: "Leave anyway",
    cancelLabel: "Stay on page",
  });

  const size = SIZES.find((s) => s.id === layout.sizeId) ?? SIZES[0];
  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;
  const subs = useMemo(() => buildSubs({ businessName, abn: profile.abn ?? "", phone: merchantPhone, product, customer }), [businessName, profile.abn, merchantPhone, product, customer]);

  /* Effective label dimensions — landscape swaps width/height. */
  const landscape = layout.orientation === "landscape";
  const effW = landscape ? size.heightMm : size.widthMm;
  const effH = landscape ? size.widthMm : size.heightMm;

  /* Canvas scale: fit the label inside a ~360×360 box, then apply the zoom
     factor. Folding zoom into `scale` keeps the drag math (which works off
     labelW/labelH) correct without any per-zoom adjustment. */
  const MAXW = 360, MAXH = 360;
  const scale = Math.min(MAXW / effW, MAXH / effH) * previewZoom;
  const labelW = effW * scale, labelH = effH * scale;
  const canvasRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<Layout>) => setLayout((l) => ({ ...l, ...patch }));
  const updateEl = (id: string, patch: Partial<StickerEl>) =>
    setLayout((l) => ({ ...l, elements: l.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const removeEl = (id: string) =>
    setLayout((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== id) }));

  const addEl = (type: ElType) => {
    const base: StickerEl = { id: uid(), type, x: 8, y: 8, w: type === "text" ? 70 : type === "line" || type === "rect" ? 60 : 36 };
    if (type === "text") Object.assign(base, { content: "Text", fontSizeMm: 3, bold: false, align: "left", color: "#000000" });
    if (type === "qr") base.content = "{{product.barcode}}";
    if (type === "barcode") base.content = "{{product.barcode}}";
    if (type === "rect") Object.assign(base, { h: 20, fill: "transparent", borderColor: "#000000", borderWidthMm: 0.4 });
    if (type === "line") Object.assign(base, { thicknessMm: 0.5, color: "#000000" });
    setLayout((l) => ({ ...l, elements: [...l.elements, base] }));
    setSelectedId(base.id);
  };

  /* ── Drag to position ── */
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onElMouseDown = (e: React.MouseEvent, el: StickerEl) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedId(el.id);
    drag.current = { id: el.id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      const d = drag.current;
      const nx = d.ox + ((e.clientX - d.sx) / labelW) * 100;
      const ny = d.oy + ((e.clientY - d.sy) / labelH) * 100;
      updateEl(d.id, { x: Math.max(0, Math.min(96, nx)), y: Math.max(0, Math.min(96, ny)) });
    };
    const up = () => { drag.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [labelW, labelH]);

  /* ── Element preview content ── */
  const renderEl = (el: StickerEl) => {
    if (el.type === "text") {
      const txt = showResolved ? resolveInline(el.content ?? "", subs) : (el.content ?? "");
      return <div style={{ fontSize: (el.fontSizeMm ?? 3) * scale, fontWeight: el.bold ? 700 : 400, textAlign: el.align, color: el.color, lineHeight: 1.1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{txt || " "}</div>;
    }
    if (el.type === "image") return el.src ? <img src={el.src} alt="" style={{ width: "100%", display: "block" }} /> : <div className="text-[8px] text-muted-foreground border border-dashed rounded text-center py-2">image</div>;
    if (el.type === "rect") return <div style={{ width: "100%", height: "100%", background: el.fill, border: (el.borderWidthMm ?? 0) > 0 ? `${(el.borderWidthMm ?? 0) * scale}px solid ${el.borderColor}` : "none", boxSizing: "border-box" }} />;
    if (el.type === "line") return <div style={{ width: "100%", height: "100%", background: el.color }} />;
    const val = resolveInline(el.content ?? " ", subs) || " ";
    if (el.type === "qr") return <QRCodeSVG value={val} style={{ width: "100%", height: "auto" }} />;
    return <BarcodeImg value={val} />;
  };

  /* ── Template load / save ── */
  const loadTemplate = (tplId: string) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    const f = tpl.fields as { layout?: Layout } | undefined;
    let nextLayout: Layout;
    if (f?.layout?.elements) {
      nextLayout = { sizeId: f.layout.sizeId || tpl.sizeId || DEFAULT_SIZE, bg: f.layout.bg || "#ffffff", orientation: f.layout.orientation || "portrait", elements: f.layout.elements };
    } else {
      // Pull in a fixed-type Settings → Stickers template: stack its enabled fields as text.
      const fields = (tpl.fields ?? {}) as Record<string, unknown>;
      const els: StickerEl[] = [];
      let y = 6;
      for (const [k, v] of Object.entries(fields)) {
        if (k.startsWith("show") && String(v) === "true") {
          els.push({ id: uid(), type: "text", x: 8, y, w: 84, content: k.replace(/^show/, ""), fontSizeMm: 3, bold: false, align: "left", color: "#000000" });
          y += 16;
        }
      }
      nextLayout = { sizeId: tpl.sizeId || DEFAULT_SIZE, bg: "#ffffff", elements: els };
    }
    const nextName = tpl.typeId === "custom" ? tpl.name : `${tpl.name} (copy)`;
    setLayout(nextLayout);
    setEditingTplId(tpl.typeId === "custom" ? tpl.id : null);
    setTemplateName(nextName);
    setSelectedId(null);
    setSavedSnapshot(snapshotOf(nextLayout, nextName));
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) { toast.error("Name your template"); return; }
    const payload = { name: templateName.trim(), typeId: "custom", sizeId: layout.sizeId, fields: { layout } as Record<string, unknown> };
    try {
      if (editingTplId) {
        await updateTpl.mutateAsync({ id: editingTplId, data: payload });
        toast.success("Template updated");
      } else {
        const created = await createTpl.mutateAsync({ data: payload });
        setEditingTplId((created as { id?: string })?.id ?? null);
        toast.success("Template saved");
      }
      setSavedSnapshot(snapshotOf(layout, templateName));
      refetchTemplates();
    } catch { toast.error("Couldn't save the template"); }
  };

  const newSticker = () => {
    const fresh = emptyLayout();
    setLayout(fresh); setSelectedId(null); setEditingTplId(null); setTemplateName("");
    setSavedSnapshot(snapshotOf(fresh, ""));
  };

  /* ── Print ── */
  const handlePrint = async () => {
    const parts: string[] = [];
    for (const el of layout.elements) {
      const common = `position:absolute;left:${el.x}%;top:${el.y}%;width:${el.w}%;`;
      if (el.type === "text") {
        parts.push(`<div style="${common}font-size:${el.fontSizeMm ?? 3}mm;font-weight:${el.bold ? 700 : 400};text-align:${el.align};color:${el.color};line-height:1.1;white-space:pre-wrap;word-break:break-word;">${escapeHtml(resolveInline(el.content ?? "", subs))}</div>`);
      } else if (el.type === "image" && el.src) {
        parts.push(`<img src="${el.src}" style="${common}height:auto;" />`);
      } else if (el.type === "qr") {
        const url = await QRCode.toDataURL(resolveInline(el.content ?? " ", subs) || " ", { margin: 0 });
        parts.push(`<img src="${url}" style="${common}height:auto;" />`);
      } else if (el.type === "barcode") {
        parts.push(`<img src="${barcodeDataUrl(resolveInline(el.content ?? "0", subs))}" style="${common}height:auto;" />`);
      } else if (el.type === "rect") {
        const border = (el.borderWidthMm ?? 0) > 0 ? `${el.borderWidthMm}mm solid ${el.borderColor}` : "none";
        parts.push(`<div style="${common}height:${el.h ?? 20}%;background:${el.fill};border:${border};box-sizing:border-box;"></div>`);
      } else if (el.type === "line") {
        parts.push(`<div style="${common}height:${el.thicknessMm ?? 0.5}mm;background:${el.color};"></div>`);
      }
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${effW}mm ${effH}mm; margin: 0; }
      html,body { margin:0; padding:0; }
      .label { position:relative; width:${effW}mm; height:${effH}mm; overflow:hidden; background:${layout.bg}; font-family: system-ui, sans-serif; }
    </style></head><body><div class="label">${parts.join("")}</div>
    </body></html>`;

    // Route through the same "Labels & stickers" printer the rest of the app
    // uses, so a designed label and a product label land on the same device.
    // The popup keeps its self-printing script; the bridge renders headlessly
    // where that would be a no-op.
    const openPopup = () => {
      const w = window.open("", "_blank");
      if (!w) { toast.error("Allow pop-ups to print"); return; }
      w.document.write(
        html.replace("</body>", "<script>window.onload=function(){window.focus();window.print();}<\/script></body>"),
      );
      w.document.close();
    };

    void printDocument({
      purpose: "label",
      hw: hardware,
      // The markup declares its own exact die-cut size, so don't override it.
      paper: "auto",
      jobName: "KoaPOS label",
      html: () => html,
      browserFallback: openPopup,
    }).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Couldn't print the label");
    });
  };

  const insertCode = (code: string) => {
    if (!selected) return;
    updateEl(selected.id, { content: `${selected.content ?? ""}${code}` });
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sticker className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Stickers</h1>
              <p className="text-sm text-muted-foreground">Design custom labels for DYMO LabelWriter &amp; Brother VC-500W. Drag elements, drop in live data, save templates.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={newSticker}><Plus className="w-4 h-4 mr-1.5" /> New</Button>
            <Button size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1.5" /> Print</Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* ── Canvas + toolbar (full width) ── */}
          <div>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addEl("text")}><Type className="w-3.5 h-3.5" /> Text</Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addEl("image")}><ImagePlus className="w-3.5 h-3.5" /> Image</Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addEl("qr")}><QrCode className="w-3.5 h-3.5" /> QR</Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addEl("barcode")}><Barcode className="w-3.5 h-3.5" /> Barcode</Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addEl("rect")}><Square className="w-3.5 h-3.5" /> Shape</Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addEl("line")}><Minus className="w-3.5 h-3.5" /> Line</Button>
                  <div className="ml-auto flex items-center gap-3">
                    {/* Zoom controls */}
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustZoom(-0.25)} disabled={previewZoom <= 0.5} aria-label="Zoom out">
                        <ZoomOut className="w-3.5 h-3.5" />
                      </Button>
                      <button
                        type="button"
                        onClick={() => setPreviewZoom(1)}
                        className="text-xs tabular-nums text-muted-foreground w-10 text-center hover:text-foreground"
                        title="Reset zoom"
                      >
                        {Math.round(previewZoom * 100)}%
                      </button>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustZoom(0.25)} disabled={previewZoom >= 3} aria-label="Zoom in">
                        <ZoomIn className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Live data</Label>
                      <Switch checked={showResolved} onCheckedChange={setShowResolved} />
                    </div>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg min-h-[420px] max-h-[600px] overflow-auto">
                  {/* Inner wrapper grows with the zoomed canvas so it stays centred
                      when small and scrolls in both axes when larger than the box. */}
                  <div className="flex items-center justify-center p-6" style={{ minWidth: "100%", minHeight: 420 }}>
                  <div
                    ref={canvasRef}
                    onMouseDown={() => setSelectedId(null)}
                    className="relative shadow-md border shrink-0"
                    style={{ width: labelW, height: labelH, background: layout.bg }}
                  >
                    {layout.elements.map((el) => (
                      <div
                        key={el.id}
                        onMouseDown={(e) => onElMouseDown(e, el)}
                        className={`absolute cursor-move ${selectedId === el.id ? "outline outline-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-primary/40"}`}
                        style={{
                          left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`,
                          ...(el.type === "rect" ? { height: `${el.h ?? 20}%` } : {}),
                          ...(el.type === "line" ? { height: (el.thicknessMm ?? 0.5) * scale } : {}),
                        }}
                      >
                        {renderEl(el)}
                      </div>
                    ))}
                    {layout.elements.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground text-center px-2">Add an element to start designing</div>
                    )}
                  </div>
                  </div>
                </div>
                <p className="text-center text-xs text-muted-foreground">{size.name} — {effW}×{effH}mm {landscape ? "(horizontal)" : ""}</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Options, evenly distributed below the builder ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            {/* Label size */}
            <Card><CardContent className="p-4 space-y-3">
              <Label className="text-xs font-semibold">Label size</Label>
              <Select value={layout.sizeId} onValueChange={(v) => update({ sizeId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {SERIES_ORDER.map((series) => (
                    <SelectGroup key={series}>
                      <SelectLabel>{SERIES_LABEL[series]}</SelectLabel>
                      {SIZES.filter((s) => s.series === series).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Orientation</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button type="button" size="sm" variant={!landscape ? "default" : "outline"} onClick={() => update({ orientation: "portrait" })}>Portrait</Button>
                  <Button type="button" size="sm" variant={landscape ? "default" : "outline"} onClick={() => update({ orientation: "landscape" })}>Horizontal</Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Background</Label>
                <input type="color" value={layout.bg} onChange={(e) => update({ bg: e.target.value })} className="h-7 w-10 rounded border cursor-pointer" />
              </div>
            </CardContent></Card>

            {/* Import live data */}
            <Card><CardContent className="p-4 space-y-3">
              <Label className="text-xs font-semibold flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Import data</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">Quick codes fill from your business{logoUrl ? "" : ""}, plus a chosen product &amp; customer.</p>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Product</Label>
                <ProductSearchInput value={product ? String(product.id) : ""} onChange={(_id, p) => setProduct(p)} placeholder="Search a product…" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Customer</Label>
                <CustomerSearchInput value={customer ? String(customer.id) : ""} onChange={(_id, c) => setCustomer(c)} />
              </div>
              {logoUrl && (
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => { const e: StickerEl = { id: uid(), type: "image", x: 8, y: 6, w: 30, src: logoUrl }; setLayout((l) => ({ ...l, elements: [...l.elements, e] })); setSelectedId(e.id); }}>
                  <ImagePlus className="w-3.5 h-3.5" /> Add business logo
                </Button>
              )}
            </CardContent></Card>

            {/* Selected element */}
            {selected ? (
              <Card><CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold capitalize">{selected.type} element</Label>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { removeEl(selected.id); setSelectedId(null); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>

                {selected.type === "image" && (
                  <div className="space-y-2">
                    <ImageUploader value={selected.src ?? ""} onChange={(url) => updateEl(selected.id, { src: url })} aspectRatio="free" label="Image" />
                    <div className="flex items-center gap-2">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">or paste a URL</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <Input
                      value={selected.src ?? ""}
                      onChange={(e) => updateEl(selected.id, { src: e.target.value.trim() })}
                      placeholder="https://example.com/logo.png"
                      className="h-8 text-xs"
                    />
                  </div>
                )}

                {(selected.type === "text" || selected.type === "qr" || selected.type === "barcode") && (
                  <>
                    {selected.type === "qr" && savedQrCodes.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Import from saved QR codes</Label>
                        <Select value="" onValueChange={(v) => updateEl(selected.id, { content: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a saved QR code…" /></SelectTrigger>
                          <SelectContent className="max-h-[260px]">
                            {savedQrCodes.map((q) => (
                              <SelectItem key={q.id} value={q.url || q.entryId}>{q.label || q.url}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] text-muted-foreground">{selected.type === "text" ? "Text" : "Value"}</Label>
                      <QuickCodeMenu onPick={insertCode} />
                    </div>
                    <Textarea value={selected.content ?? ""} onChange={(e) => updateEl(selected.id, { content: e.target.value })} rows={selected.type === "text" ? 2 : 1} className="text-sm" />
                  </>
                )}

                {selected.type === "text" && (
                  <>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground w-16">Font {selected.fontSizeMm ?? 3}mm</Label>
                      <input type="range" min={1.5} max={12} step={0.5} value={selected.fontSizeMm ?? 3} onChange={(e) => updateEl(selected.id, { fontSizeMm: Number(e.target.value) })} className="flex-1" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant={selected.bold ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => updateEl(selected.id, { bold: !selected.bold })}><Bold className="w-3.5 h-3.5" /></Button>
                      <Button variant={selected.align === "left" ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => updateEl(selected.id, { align: "left" })}><AlignLeft className="w-3.5 h-3.5" /></Button>
                      <Button variant={selected.align === "center" ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => updateEl(selected.id, { align: "center" })}><AlignCenter className="w-3.5 h-3.5" /></Button>
                      <Button variant={selected.align === "right" ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => updateEl(selected.id, { align: "right" })}><AlignRight className="w-3.5 h-3.5" /></Button>
                      <input type="color" value={selected.color ?? "#000000"} onChange={(e) => updateEl(selected.id, { color: e.target.value })} className="h-7 w-9 rounded border cursor-pointer ml-auto" />
                    </div>
                  </>
                )}

                {selected.type === "rect" && (
                  <>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground w-24">Height {selected.h ?? 20}%</Label>
                      <input type="range" min={2} max={100} step={1} value={selected.h ?? 20} onChange={(e) => updateEl(selected.id, { h: Number(e.target.value) })} className="flex-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground w-24">Border {selected.borderWidthMm ?? 0.4}mm</Label>
                      <input type="range" min={0} max={3} step={0.1} value={selected.borderWidthMm ?? 0.4} onChange={(e) => updateEl(selected.id, { borderWidthMm: Number(e.target.value) })} className="flex-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Fill</span>
                      <input type="color" value={selected.fill && selected.fill !== "transparent" ? selected.fill : "#000000"} onChange={(e) => updateEl(selected.id, { fill: e.target.value })} className="h-7 w-9 rounded border cursor-pointer" />
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => updateEl(selected.id, { fill: "transparent" })}>No fill</Button>
                      <span className="text-[11px] text-muted-foreground ml-auto">Border</span>
                      <input type="color" value={selected.borderColor ?? "#000000"} onChange={(e) => updateEl(selected.id, { borderColor: e.target.value })} className="h-7 w-9 rounded border cursor-pointer" />
                    </div>
                  </>
                )}

                {selected.type === "line" && (
                  <>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground w-24">Thickness {selected.thicknessMm ?? 0.5}mm</Label>
                      <input type="range" min={0.2} max={5} step={0.1} value={selected.thicknessMm ?? 0.5} onChange={(e) => updateEl(selected.id, { thicknessMm: Number(e.target.value) })} className="flex-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Colour</span>
                      <input type="color" value={selected.color ?? "#000000"} onChange={(e) => updateEl(selected.id, { color: e.target.value })} className="h-7 w-9 rounded border cursor-pointer" />
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground w-16">{selected.type === "line" ? "Length" : "Width"} {selected.w}%</Label>
                  <input type="range" min={8} max={100} step={1} value={selected.w} onChange={(e) => updateEl(selected.id, { w: Number(e.target.value) })} className="flex-1" />
                </div>
              </CardContent></Card>
            ) : (
              <Card><CardContent className="p-4 text-xs text-muted-foreground text-center">Select an element to edit it, or add one from the toolbar.</CardContent></Card>
            )}

            {/* Templates */}
            <Card><CardContent className="p-4 space-y-3">
              <Label className="text-xs font-semibold flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> Templates</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" className="h-8 text-sm" />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1.5" onClick={saveTemplate} disabled={createTpl.isPending || updateTpl.isPending}><Save className="w-3.5 h-3.5" /> {editingTplId ? "Update" : "Save"}</Button>
              </div>
              {templates.length > 0 && (
                <div className="border rounded-md divide-y max-h-[200px] overflow-y-auto">
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-2 py-1.5">
                      <button type="button" onClick={() => loadTemplate(t.id)} className="flex-1 min-w-0 text-left text-xs hover:underline truncate">
                        {t.name} <span className="text-muted-foreground">· {t.typeId === "custom" ? "custom" : t.typeId}</span>
                      </button>
                      {t.typeId === "custom" && (
                        <button type="button" onClick={async () => { await deleteTpl.mutateAsync({ id: t.id }); if (editingTplId === t.id) setEditingTplId(null); refetchTemplates(); }} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-3 h-3" /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">Custom designs and your Settings → Templates → Stickers all appear here. Loading a fixed template seeds its fields as editable text.</p>
            </CardContent></Card>
          </div>
        </div>
      </div>
      <UnsavedGuard />
    </AppLayout>
  );
}
