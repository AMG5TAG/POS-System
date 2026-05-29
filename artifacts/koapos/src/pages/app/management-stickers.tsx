import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, useListProducts, Product } from "@workspace/api-client-react";
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
import { toast } from "sonner";
import {
  Printer, Tag, Info, Barcode, Search, X, ChevronRight, LayoutTemplate, Check,
} from "lucide-react";
import {
  STICKER_TYPES, DYMO_SIZES, RECOMMENDED_SIZES, LabelPreview,
  useStickerTemplates, DymoSize,
} from "@/lib/sticker-config";

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ManagementStickersPage() {
  const [selectedTypeId, setSelectedTypeId]   = useState<string>("product");
  const [selectedSizeId, setSelectedSizeId]   = useState<string>("S0722520");
  const [orientation,    setOrientation]      = useState<"horizontal" | "vertical">("horizontal");
  const [quantity,       setQuantity]         = useState(1);
  const [showBusiness,   setShowBusiness]     = useState(true);
  const [showTplPicker,  setShowTplPicker]    = useState(false);
  const tplPickerRef = useRef<HTMLDivElement>(null);

  // Product search
  const [productQuery,       setProductQuery]      = useState("");
  const [showProdDropdown,   setShowProdDropdown]  = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const selectedType = STICKER_TYPES.find((t) => t.id === selectedTypeId)!;
  const hasProductSearch = selectedType.fields.some((f) => f.key === "productName");

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
  const { profile }        = useBusinessProfile();
  const { templates }      = useStickerTemplates();
  const businessName = showBusiness ? (merchant?.businessName || "Your Business") : "";
  const brandColor   = profile.brandColors?.[0] || "#efbf04";

  const selectedSize = DYMO_SIZES.find((s) => s.id === selectedSizeId) ?? DYMO_SIZES[0];

  // Product search
  const { data: productSearchData } = useListProducts(
    { search: productQuery || undefined, limit: 8 },
    { query: { queryKey: ["sticker-product-search", productQuery], enabled: hasProductSearch } }
  );
  const productSearchResults: Product[] = productSearchData?.items ?? [];

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    const t = STICKER_TYPES.find((x) => x.id === typeId);
    if (t) setSelectedSizeId(t.defaultSize);
    setProductQuery("");
    setShowProdDropdown(false);
  };

  // Apply a saved template to the current state
  const applyTemplate = (tpl: { typeId: string; sizeId: string; fields: Record<string, string> }) => {
    const type    = STICKER_TYPES.find((t) => t.id === tpl.typeId);
    const defaults = type ? Object.fromEntries(type.fields.map((f) => [f.key, f.defaultValue])) : {};
    setSelectedTypeId(tpl.typeId);
    setSelectedSizeId(tpl.sizeId);
    setFields((prev) => ({ ...prev, [tpl.typeId]: { ...defaults, ...tpl.fields } }));
    setProductQuery("");
    setShowTplPicker(false);
  };

  // Fill from product
  const fillFromProduct = (p: Product) => {
    setProductQuery(p.name);
    setShowProdDropdown(false);
    const type = STICKER_TYPES.find((t) => t.id === selectedTypeId);
    if (!type) return;
    const has = (key: string) => type.fields.some((f) => f.key === key);
    const updates: Record<string, string> = {};
    if (has("productName")) updates.productName = p.name;
    if (has("sku"))         updates.sku         = p.sku         ?? "";
    if (has("price"))       updates.price       = p.price != null ? `$${Number(p.price).toFixed(2)}` : "";
    if (has("barcode"))     updates.barcode     = p.barcode     ?? "";
    if (has("category"))    updates.category    = (p as Product & { category?: { name: string } }).category?.name ?? "";
    setFields((prev) => ({ ...prev, [selectedTypeId]: { ...prev[selectedTypeId], ...updates } }));
  };

  // Pre-fill from Products page "Print Sticker" or Templates page "Use for Printing"
  useEffect(() => {
    const tplRaw = sessionStorage.getItem("koapos_sticker_tpl_load");
    if (tplRaw) {
      try {
        const tpl = JSON.parse(tplRaw) as { typeId: string; sizeId: string; fields: Record<string, string> };
        sessionStorage.removeItem("koapos_sticker_tpl_load");
        applyTemplate(tpl);
        return;
      } catch {}
    }

    const prodRaw = sessionStorage.getItem("koapos_sticker_product");
    if (prodRaw) {
      try {
        const p = JSON.parse(prodRaw) as { name: string; sku: string; price: number; barcode: string; category: string };
        sessionStorage.removeItem("koapos_sticker_product");
        setSelectedTypeId("product");
        setSelectedSizeId("11354");
        setProductQuery(p.name || "");
        setFields((prev) => ({
          ...prev,
          product: {
            ...prev.product,
            productName: p.name       || "",
            sku:         p.sku        || "",
            price:       p.price != null ? `$${Number(p.price).toFixed(2)}` : "",
            barcode:     p.barcode    || "",
            category:    p.category   || "",
          },
        }));
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close template picker on outside click
  useEffect(() => {
    if (!showTplPicker) return;
    const handler = (e: MouseEvent) => {
      if (tplPickerRef.current && !tplPickerRef.current.contains(e.target as Node)) {
        setShowTplPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTplPicker]);

  const sizeGroups = DYMO_SIZES.reduce<Record<string, DymoSize[]>>((acc, s) => {
    (acc[s.series] ??= []).push(s);
    return acc;
  }, {});

  /* ── Print handler ───────────────────────────────────────────────────────
     Opens a dedicated popup (same pattern as Z-report / cash movement) so
     the full app UI is never sent to the printer.  @page sets the exact
     label dimensions and writing-mode + transform guard against browser
     auto-rotation on narrow labels.                                        */
  const handlePrint = () => {
    const isHoriz = orientation === "horizontal";
    const pageW = isHoriz
      ? Math.max(selectedSize.widthMm, selectedSize.heightMm)
      : Math.min(selectedSize.widthMm, selectedSize.heightMm);
    const pageH = isHoriz
      ? Math.min(selectedSize.widthMm, selectedSize.heightMm)
      : Math.max(selectedSize.widthMm, selectedSize.heightMm);

    const f = (k: string) => currentFields[k] ?? "";
    const showBarcode = f("showBarcode") === "true";
    const showWas     = f("showWas") === "true";
    const biz         = businessName;

    // Base font size proportional to the shorter label dimension
    const shorter = Math.min(pageW, pageH);
    const bp      = Math.max(4.5, shorter * 0.36); // pt

    // Simulated barcode bars (cosmetic)
    const barsBars = Array.from({ length: 20 }).map((_, i) =>
      `<div style="background:#000;width:${i % 3 === 0 ? "0.8" : "0.5"}mm;height:3mm;display:inline-block;"></div>`
    ).join("");

    const inner = (() => {
      switch (selectedTypeId) {
        case "product": return `
          <div>
            <div style="font-weight:700;font-size:${(bp*1.15).toFixed(1)}pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("productName")||"Product Name"}</div>
            ${f("category")?`<div style="color:#888;white-space:nowrap;overflow:hidden">${f("category")}</div>`:""}
            ${f("sku")?`<div style="color:#888">SKU: ${f("sku")}</div>`:""}
          </div>
          <div>
            ${showBarcode&&f("barcode")?`<div style="display:flex;gap:.3mm;margin-bottom:.5mm;opacity:.6">${barsBars}</div><div style="color:#888;font-size:${(bp*.8).toFixed(1)}pt">${f("barcode")}</div>`:""}
            <div style="font-weight:700;font-size:${(bp*1.35).toFixed(1)}pt;color:${brandColor}">${f("price")||"$0.00"}</div>
            ${biz?`<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>`:""}
          </div>`;
        case "customer": return `
          <div style="font-weight:700;font-size:${(bp*1.15).toFixed(1)}pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("customerName")||"Customer"}</div>
          ${f("group")?`<div style="background:${brandColor};color:#fff;padding:0 1mm;border-radius:.5mm;white-space:nowrap;overflow:hidden;font-size:${(bp*.85).toFixed(1)}pt">${f("group")}</div>`:""}
          ${f("customerId")?`<div style="color:#888">${f("customerId")}</div>`:""}
          ${f("loyaltyNo")?`<div style="color:#888">${f("loyaltyNo")}</div>`:""}
          ${f("phone")?`<div style="color:#888">${f("phone")}</div>`:""}
          ${biz?`<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>`:""}`;
        case "return": return `
          <div style="font-weight:700;color:#ef4444;font-size:${(bp*1.1).toFixed(1)}pt">RETURN ${f("returnNo")}</div>
          ${f("item")?`<div style="font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${f("item")}</div>`:""}
          ${f("reason")?`<div style="color:#888;white-space:nowrap;overflow:hidden">${f("reason")}</div>`:""}
          ${f("status")?`<div style="background:#ef4444;color:#fff;padding:0 1mm;border-radius:.5mm;font-size:${(bp*.85).toFixed(1)}pt;white-space:nowrap;overflow:hidden">${f("status")}</div>`:""}
          ${f("date")?`<div style="color:#888">${f("date")}</div>`:""}
          ${biz?`<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>`:""}`;
        case "repair": return `
          <div style="font-weight:700;color:#ef4444;font-size:${(bp*1.1).toFixed(1)}pt">SERVICE ${f("jobNo")}</div>
          ${f("customer")?`<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("customer")}</div>`:""}
          ${f("device")?`<div style="color:#888;white-space:nowrap;overflow:hidden">${f("device")}</div>`:""}
          ${f("fault")?`<div style="color:#aaa;white-space:nowrap;overflow:hidden">Fault: ${f("fault")}</div>`:""}
          ${f("dueDate")?`<div style="font-weight:600">Due: ${f("dueDate")}</div>`:""}
          ${f("tech")?`<div style="color:#888;white-space:nowrap;overflow:hidden">Tech: ${f("tech")}</div>`:""}`;
        case "address": return `
          ${f("name")?`<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("name")}</div>`:""}
          ${f("company")?`<div style="white-space:nowrap;overflow:hidden">${f("company")}</div>`:""}
          ${f("street")?`<div style="white-space:nowrap;overflow:hidden">${f("street")}</div>`:""}
          <div style="white-space:nowrap;overflow:hidden">${[f("suburb"),f("state"),f("postcode")].filter(Boolean).join(" ")}</div>
          ${biz?`<div style="color:#888;font-size:${(bp*.85).toFixed(1)}pt;text-align:right;white-space:nowrap;overflow:hidden">${biz}</div>`:""}`;
        case "pricetag": return `
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("productName")||"Product"}</div>
          ${f("sku")?`<div style="color:#888">#${f("sku")}</div>`:""}
          <div>
            ${showWas&&f("wasPrice")?`<div style="text-decoration:line-through;color:#aaa">${f("wasPrice")}</div>`:""}
            <div style="font-weight:700;font-size:${(bp*1.5).toFixed(1)}pt;color:${brandColor}">${f("price")||"$0.00"}</div>
          </div>`;
        case "shelf": return `
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f("productName")||"Product"}</div>
          ${f("unitPrice")?`<div style="color:#888;white-space:nowrap;overflow:hidden">${f("unitPrice")}</div>`:""}
          ${f("sku")?`<div style="color:#888">SKU ${f("sku")}</div>`:""}
          <div style="font-weight:700;font-size:${(bp*1.5).toFixed(1)}pt;color:${brandColor}">${f("price")||"$0.00"}</div>`;
        default: return "";
      }
    })();

    // One label HTML block — repeated quantity times, each on its own @page
    const labelBlock = `
      <div style="
        width:${pageW}mm;height:${pageH}mm;
        box-sizing:border-box;overflow:hidden;
        position:relative;
        font-family:Arial,Helvetica,sans-serif;
        font-size:${bp.toFixed(1)}pt;line-height:1.25;
        padding:1.5mm 1.5mm 1.5mm 1.5mm;padding-top:2mm;
        display:flex;flex-direction:column;justify-content:space-between;
        background:#fff;
        writing-mode:horizontal-tb;
        page-break-after:always;break-after:page;
        page-break-inside:avoid;break-inside:avoid;
      ">
        <div style="position:absolute;top:0;left:0;right:0;height:1.5mm;background:${brandColor}"></div>
        ${inner}
      </div>`;

    const html = `<!DOCTYPE html>
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
${Array.from({ length: quantity }).map(() => labelBlock).join("\n")}
</body>
</html>`;

    const pxW = Math.round(pageW * 3.78);
    const pxH = Math.round(pageH * 3.78);
    const w = window.open("", "_blank", `width=${pxW},height=${Math.min(pxH * quantity, 900)}`);
    if (!w) {
      toast.error("Pop-up blocked — please allow pop-ups for this site and try again");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Labels</h1>
              <p className="text-sm text-muted-foreground">Design and print labels on DYMO LabelWriter printers</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="showBiz" className="text-muted-foreground cursor-pointer">Show business name</Label>
              <Switch id="showBiz" checked={showBusiness} onCheckedChange={setShowBusiness} />
            </div>

            {/* Load Template button */}
            <div className="relative" ref={tplPickerRef}>
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => setShowTplPicker((p) => !p)}
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                Load Template
                {templates.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{templates.length}</Badge>
                )}
              </Button>
              {showTplPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-popover border rounded-xl shadow-xl overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                    <span className="text-xs font-semibold">Saved Templates</span>
                    <a href="/management/sticker-templates" className="text-[10px] text-primary hover:underline">Manage →</a>
                  </div>
                  {templates.length === 0 ? (
                    <div className="px-4 py-5 text-center text-sm text-muted-foreground">
                      <LayoutTemplate className="w-6 h-6 mx-auto mb-1 opacity-30" />
                      <p>No templates saved yet.</p>
                      <a href="/management/sticker-templates" className="text-xs text-primary hover:underline">Create one →</a>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {templates.map((tpl) => {
                        const type = STICKER_TYPES.find((t) => t.id === tpl.typeId);
                        const Icon = type?.icon ?? Tag;
                        return (
                          <button
                            key={tpl.id}
                            onClick={() => applyTemplate(tpl)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 text-left transition-colors"
                          >
                            <Icon className={cn("w-4 h-4 shrink-0", type?.color ?? "text-muted-foreground")} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{tpl.name}</p>
                              <p className="text-[10px] text-muted-foreground">{type?.label} · {tpl.sizeId}</p>
                            </div>
                            <Check className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Left: sticker type selector + field editor */}
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Label Type</p>
            <div className="rounded-xl border overflow-hidden">
              {STICKER_TYPES.map((type) => {
                const Icon = type.icon;
                const active = type.id === selectedTypeId;
                return (
                  <button key={type.id} onClick={() => handleTypeChange(type.id)}
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

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 flex gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-0.5">DYMO Printer Setup</p>
                <p>Connect your DYMO LabelWriter via USB. Install DYMO Connect software for direct printing. Click Print to send to your default label printer.</p>
              </div>
            </div>

          {/* Field editor */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <selectedType.icon className={cn("w-4 h-4", selectedType.color)} />
                <CardTitle className="text-base">{selectedType.label} Label Fields</CardTitle>
              </div>
              <CardDescription>{selectedType.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Product search — only for types with productName field */}
              {hasProductSearch && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    Search Products to Auto-Fill
                  </Label>
                  <div ref={searchRef} className="relative">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        value={productQuery}
                        onChange={(e) => { setProductQuery(e.target.value); setShowProdDropdown(true); }}
                        onFocus={() => setShowProdDropdown(true)}
                        onBlur={() => setTimeout(() => setShowProdDropdown(false), 150)}
                        placeholder="Type a product name, SKU or barcode…"
                        className="pl-8 pr-8"
                      />
                      {productQuery && (
                        <button
                          onMouseDown={(e) => { e.preventDefault(); setProductQuery(""); setShowProdDropdown(false); }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {showProdDropdown && productSearchResults.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-xl shadow-lg max-h-[min(280px,50dvh)] overflow-y-auto">
                        {productSearchResults.map((p) => (
                          <button key={p.id}
                            onMouseDown={(e) => { e.preventDefault(); fillFromProduct(p); }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/60 text-left border-b last:border-b-0 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">{p.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {[p.sku && `SKU: ${p.sku}`, p.barcode && `Barcode: ${p.barcode}`, (p as Product & { category?: { name: string } }).category?.name].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              {p.price != null && <span className="text-xs font-semibold text-emerald-600">${Number(p.price).toFixed(2)}</span>}
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {showProdDropdown && productQuery.length > 0 && productSearchResults.length === 0 && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-xl shadow-lg px-4 py-3 text-sm text-muted-foreground">
                        No products found for "{productQuery}"
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Select a product to fill Name, SKU, Price, Barcode and Category automatically.</p>
                </div>
              )}

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
          </div>{/* end left col */}

          {/* Right: preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Label Preview</p>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-md border overflow-hidden">
                  <button
                    onClick={() => setOrientation("horizontal")}
                    className={cn("px-2 py-1 text-[11px] font-medium transition-colors", orientation === "horizontal" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                    title="Horizontal (landscape)"
                  >
                    <span className="inline-flex items-center gap-1">
                      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="shrink-0"><rect x="1" y="1" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                      H
                    </span>
                  </button>
                  <button
                    onClick={() => setOrientation("vertical")}
                    className={cn("px-2 py-1 text-[11px] font-medium transition-colors border-l", orientation === "vertical" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                    title="Vertical (portrait)"
                  >
                    <span className="inline-flex items-center gap-1">
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="shrink-0"><rect x="1" y="1" width="8" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                      V
                    </span>
                  </button>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {selectedSize.widthMm}×{selectedSize.heightMm}mm · #{selectedSize.id}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl border bg-gray-50 p-6 flex items-center justify-center min-h-64">
              <LabelPreview
                type={selectedType}
                fields={currentFields}
                size={selectedSize}
                businessName={businessName}
                brandColor={brandColor}
                orientation={orientation}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">Preview is scaled — actual size: {selectedSize.widthMm}mm × {selectedSize.heightMm}mm</p>

            <Separator />

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Recommended sizes for {selectedType.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {(RECOMMENDED_SIZES[selectedTypeId] ?? []).map((sid) => {
                  const s = DYMO_SIZES.find((d) => d.id === sid);
                  if (!s) return null;
                  return (
                    <button key={sid} onClick={() => setSelectedSizeId(sid)}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded border transition-colors",
                        sid === selectedSizeId ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"
                      )}
                    >{sid}</button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
