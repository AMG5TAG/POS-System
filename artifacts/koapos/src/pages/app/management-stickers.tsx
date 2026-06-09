import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, useListProducts, Product } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Printer, Tag, Info, Barcode, Search, X, ChevronRight, LayoutTemplate, Check,
  Save, Star, Copy, Trash2, Plus,
} from "lucide-react";
import {
  STICKER_TYPES, DYMO_SIZES, RECOMMENDED_SIZES, LabelPreview,
  useStickerTemplates, useStickerPrinter, DymoSize,
} from "@/lib/sticker-config";

/* ─── On/Off pill toggle ──────────────────────────────────────────────────── */

function FieldPill({
  label,
  isOn,
  onToggle,
}: {
  label: string;
  isOn: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-b-0 gap-3">
      <span className="text-sm font-medium leading-none">{label}</span>
      <div className="flex rounded-full border overflow-hidden text-xs font-semibold shrink-0">
        <button
          type="button"
          onClick={() => onToggle(true)}
          className={cn(
            "px-3 py-1.5 transition-colors",
            isOn
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted/60",
          )}
        >
          On
        </button>
        <button
          type="button"
          onClick={() => onToggle(false)}
          className={cn(
            "px-3 py-1.5 border-l transition-colors",
            !isOn
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60",
          )}
        >
          Off
        </button>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ManagementStickersPage() {
  const [selectedTypeId, setSelectedTypeId] = useState<string>("product");
  const [selectedSizeId, setSelectedSizeId] = useState<string>("S0722520");
  const [orientation,   setOrientation]     = useState<"horizontal" | "vertical">("horizontal");
  const [quantity,      setQuantity]        = useState(1);
  const [showTplPicker, setShowTplPicker]   = useState(false);
  const tplPickerRef = useRef<HTMLDivElement>(null);

  // Template save/manage (folded in from the former Sticker Templates page)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [tplName, setTplName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const saveFormRef = useRef<HTMLDivElement>(null);

  // Product search
  const [productQuery,     setProductQuery]     = useState("");
  const [showProdDropdown, setShowProdDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const selectedType = STICKER_TYPES.find((t) => t.id === selectedTypeId)!;
  const hasProductSearch = ["product", "pricetag", "shelf"].includes(selectedTypeId);

  const [fields, setFields] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      STICKER_TYPES.map((t) => [
        t.id,
        Object.fromEntries(t.fields.map((f) => [f.key, f.defaultValue])),
      ])
    )
  );

  const currentFields = fields[selectedTypeId] ?? {};
  const setField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [selectedTypeId]: { ...prev[selectedTypeId], [key]: value } }));
  };

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile }        = useBusinessProfile();
  const { templates, create, update, remove, setDefault } = useStickerTemplates();
  const { printStickers }  = useStickerPrinter();
  const businessName = merchant?.businessName || "Your Business";
  const brandColor   = profile.brandColors?.[0] || "#efbf04";

  const selectedSize = DYMO_SIZES.find((s) => s.id === selectedSizeId) ?? DYMO_SIZES[0];

  // Product search query
  const { data: productSearchData } = useListProducts(
    { search: productQuery || undefined, limit: 8 },
    { query: { queryKey: ["sticker-product-search", productQuery], enabled: hasProductSearch && productQuery.length > 0 } }
  );
  const productSearchResults: Product[] = productSearchData?.items ?? [];

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    const t = STICKER_TYPES.find((x) => x.id === typeId);
    // Seed the editable fields from the type's default saved template (falling
    // back to the type's built-in defaults), so the form — and therefore the
    // print — reflects what was configured in Sticker Templates.
    const defaultTpl = templates.find((tp) => tp.typeId === typeId && tp.isDefault);
    if (t) {
      setSelectedSizeId(defaultTpl?.sizeId ?? t.defaultSize);
      const defaults = Object.fromEntries(t.fields.map((fld) => [fld.key, fld.defaultValue]));
      setFields((prev) => ({ ...prev, [typeId]: { ...defaults, ...(defaultTpl?.fields ?? {}) } }));
    }
    setProductQuery("");
    setShowProdDropdown(false);
    // Switching type detaches any template currently loaded for editing.
    setEditingTemplateId(null);
    setTplName("");
  };

  const applyTemplate = (
    tpl: { id?: string; name?: string; typeId: string; sizeId: string; fields: Record<string, string> },
  ) => {
    const type     = STICKER_TYPES.find((t) => t.id === tpl.typeId);
    const defaults = type ? Object.fromEntries(type.fields.map((f) => [f.key, f.defaultValue])) : {};
    setSelectedTypeId(tpl.typeId);
    setSelectedSizeId(tpl.sizeId);
    setFields((prev) => ({ ...prev, [tpl.typeId]: { ...defaults, ...tpl.fields } }));
    setProductQuery("");
    setShowTplPicker(false);
    setEditingTemplateId(tpl.id ?? null);
    setTplName(tpl.name ?? "");
  };

  /* ── Template save / manage (in-page, replacing the old Templates screen) ── */

  // Templates only persist the configurable on/off fields for a type — not the
  // transient product auto-fill text (which is filled per-print), matching the
  // original template semantics.
  const templateFieldsForSave = () =>
    Object.fromEntries(selectedType.fields.map((f) => [f.key, currentFields[f.key] ?? f.defaultValue]));

  const startNewTemplate = () => {
    setEditingTemplateId(null);
    setTplName("");
    setShowSaveForm(true);
  };

  const saveTemplate = () => {
    const name = tplName.trim();
    if (!name) { toast.error("Please enter a template name."); return; }
    const data = {
      name,
      typeId: selectedTypeId,
      sizeId: selectedSizeId,
      fields: templateFieldsForSave(),
    };
    if (editingTemplateId) {
      update(editingTemplateId, data);
      toast.success("Template updated.");
    } else {
      const tpl = create(data);
      setEditingTemplateId(tpl.id);
      toast.success("Template saved.");
    }
    setShowSaveForm(false);
  };

  const duplicateTemplate = (tpl: { name: string; typeId: string; sizeId: string; fields: Record<string, string> }) => {
    const copy = create({ name: `${tpl.name} (copy)`, typeId: tpl.typeId, sizeId: tpl.sizeId, fields: { ...tpl.fields } });
    setEditingTemplateId(copy.id);
    setTplName(copy.name);
    toast.success("Template duplicated.");
  };

  const deleteTemplate = (id: string) => {
    remove(id);
    if (editingTemplateId === id) { setEditingTemplateId(null); setTplName(""); }
    setConfirmDeleteId(null);
    toast.success("Template deleted.");
  };

  const fillFromProduct = (p: Product) => {
    setProductQuery(p.name);
    setShowProdDropdown(false);
    const updates: Record<string, string> = {
      productName: p.name,
      sku:         p.sku         ?? "",
      price:       p.price != null ? `$${Number(p.price).toFixed(2)}` : "",
      barcode:     p.barcode     ?? "",
      category:    (p as Product & { category?: { name: string } }).category?.name ?? "",
    };
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

  useEffect(() => {
    if (!showTplPicker) return;
    const handler = (e: MouseEvent) => {
      if (tplPickerRef.current && !tplPickerRef.current.contains(e.target as Node)) {
        setShowTplPicker(false);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTplPicker]);

  useEffect(() => {
    if (!showSaveForm) return;
    const handler = (e: MouseEvent) => {
      if (saveFormRef.current && !saveFormRef.current.contains(e.target as Node)) {
        setShowSaveForm(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSaveForm]);

  const sizeGroups = DYMO_SIZES.reduce<Record<string, DymoSize[]>>((acc, s) => {
    (acc[s.series] ??= []).push(s);
    return acc;
  }, {});

  /* ── Print handler ─────────────────────────────────────────────────────── */
  /* Delegates to the shared sticker printer so the Stickers manager and every
   * other "Print label" entry point render through one code path. The on-screen
   * field values (which already start from the type's default saved template —
   * see handleTypeChange) are passed as literal overrides so manual tweaks print. */
  const handlePrint = () => {
    const ok = printStickers({
      typeId: selectedTypeId,
      sizeOverride: selectedSizeId,
      orientation,
      quantity,
      fieldsOverride: currentFields,
    });
    if (!ok) toast.error("Couldn't open the print dialog — please try again");
  };

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Labels</h1>
              <p className="text-sm text-muted-foreground">Design, save reusable templates and print labels on DYMO LabelWriter printers</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Templates: load / set-default / duplicate / delete */}
            <div className="relative" ref={tplPickerRef}>
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => setShowTplPicker((p) => !p)}
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                Templates
                {templates.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{templates.length}</Badge>
                )}
              </Button>
              {showTplPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-popover border rounded-xl shadow-xl overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                    <span className="text-xs font-semibold">Saved Templates</span>
                    <span className="text-[10px] text-muted-foreground">Tap to load</span>
                  </div>
                  {templates.length === 0 ? (
                    <div className="px-4 py-5 text-center text-sm text-muted-foreground">
                      <LayoutTemplate className="w-6 h-6 mx-auto mb-1 opacity-30" />
                      <p>No templates saved yet.</p>
                      <p className="text-xs mt-0.5">Configure a label, then <strong>Save as Template</strong>.</p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y">
                      {templates.map((tpl) => {
                        const type = STICKER_TYPES.find((t) => t.id === tpl.typeId);
                        const Icon = type?.icon ?? Tag;
                        const isActive = editingTemplateId === tpl.id;
                        return (
                          <div key={tpl.id} className={cn("px-3 py-2.5", isActive && "bg-primary/5")}>
                            <button
                              onClick={() => applyTemplate(tpl)}
                              className="w-full flex items-center gap-2.5 text-left"
                            >
                              <Icon className={cn("w-4 h-4 shrink-0", type?.color ?? "text-muted-foreground")} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                  {tpl.name}
                                  {tpl.isDefault && (
                                    <Badge className="h-4 px-1 text-[9px] gap-0.5 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                                      <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />Default
                                    </Badge>
                                  )}
                                  {isActive && <Check className="w-3 h-3 text-primary shrink-0" />}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{type?.label} · {tpl.sizeId}</p>
                              </div>
                            </button>
                            {/* Row actions — labelled so each is obvious */}
                            <div className="flex items-center gap-1.5 mt-2">
                              <button onClick={() => setDefault(tpl.id)}
                                title={tpl.isDefault ? "Remove as default for this type" : "Set as default for this type"}
                                className={cn(
                                  "flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors",
                                  tpl.isDefault
                                    ? "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                              >
                                <Star className={cn("w-3 h-3", tpl.isDefault && "fill-amber-500 text-amber-500")} />
                                {tpl.isDefault ? "Default" : "Set default"}
                              </button>
                              <button onClick={() => duplicateTemplate(tpl)}
                                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                              {confirmDeleteId === tpl.id ? (
                                <div className="ml-auto flex items-center gap-1">
                                  <button onClick={() => deleteTemplate(tpl.id)}
                                    className="text-[11px] px-2 py-1 rounded border border-destructive bg-destructive text-destructive-foreground">
                                    Delete?
                                  </button>
                                  <button onClick={() => setConfirmDeleteId(null)}
                                    className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted">
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmDeleteId(tpl.id)} title="Delete template"
                                  className="ml-auto flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Save current label as a (new or updated) template */}
            <div className="relative" ref={saveFormRef}>
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => { if (!editingTemplateId) setTplName(""); setShowSaveForm((p) => !p); }}
              >
                <Save className="w-3.5 h-3.5" />
                {editingTemplateId ? "Update Template" : "Save as Template"}
              </Button>
              {showSaveForm && (
                <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-popover border rounded-xl shadow-xl p-3 space-y-2.5">
                  <p className="text-xs font-semibold">
                    {editingTemplateId ? "Update template" : "Save current label as a template"}
                  </p>
                  <Input
                    autoFocus
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveTemplate(); }}
                    placeholder="Template name…"
                    className="h-8 text-sm"
                  />
                  <div className="flex items-center justify-between gap-2">
                    {editingTemplateId ? (
                      <button onClick={() => { setEditingTemplateId(null); setTplName(""); }}
                        className="text-[11px] text-muted-foreground hover:underline inline-flex items-center gap-0.5">
                        <Plus className="w-3 h-3" /> Save as new
                      </button>
                    ) : <span />}
                    <Button size="sm" className="gap-1.5 h-8" onClick={saveTemplate}>
                      <Save className="w-3.5 h-3.5" /> {editingTemplateId ? "Update" : "Save"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm">Qty</Label>
              <Input
                type="number" min={1} max={999} value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-8 text-center text-sm"
              />
            </div>
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" /> Print {quantity > 1 ? `${quantity} Labels` : "Label"}
            </Button>
          </div>
        </div>

        {/* ── Three-column body ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-6 items-stretch">

          {/* ── Column 1: Label ────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Label</p>

            {/* Type selector */}
            <div className="rounded-xl border overflow-hidden">
              {STICKER_TYPES.map((type) => {
                const Icon = type.icon;
                const active = type.id === selectedTypeId;
                return (
                  <button key={type.id} onClick={() => handleTypeChange(type.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b last:border-b-0 text-left",
                      active ? "bg-primary/5 text-primary font-semibold" : "hover:bg-muted/50",
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

            {/* Size + orientation settings card — flex-1 fills remaining column height */}
            <Card className="flex-1">
              <CardContent className="p-4 space-y-4">
                {/* Size selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Label Size</Label>
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
                  <p className="text-[11px] text-muted-foreground">
                    {selectedSize.widthMm}mm × {selectedSize.heightMm}mm · Part #{selectedSize.id}
                  </p>
                </div>

                {/* Orientation */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orientation</Label>
                  <div className="flex rounded-lg border overflow-hidden w-fit">
                    <button
                      onClick={() => setOrientation("horizontal")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                        orientation === "horizontal" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="shrink-0"><rect x="1" y="1" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                      Landscape
                    </button>
                    <button
                      onClick={() => setOrientation("vertical")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l transition-colors",
                        orientation === "vertical" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="shrink-0"><rect x="1" y="1" width="8" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                      Portrait
                    </button>
                  </div>
                </div>

                {/* DYMO info */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-0.5">DYMO Setup</p>
                    <p>Connect your DYMO LabelWriter via USB. Install DYMO Connect for direct printing.</p>
                  </div>
                </div>

                {selectedType.fields.some((fld) => fld.key === "showBarcode") && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Barcode className="w-3.5 h-3.5 shrink-0" />
                    <span>A scannable barcode prints full-width along the bottom — any text value is encoded automatically.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Column 2: Label Preview ─────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Label Preview</p>
              <Badge variant="outline" className="text-[10px]">
                {selectedSize.widthMm}×{selectedSize.heightMm}mm · #{selectedSize.id}
              </Badge>
            </div>

            {/* Preview card — flex-1 so it fills column height */}
            <Card className="flex-1 flex flex-col">
              <CardContent className="p-5 flex flex-col flex-1 gap-4">
                {/* Preview canvas — flex-1 to fill card */}
                <div className="flex-1 flex items-center justify-center rounded-xl border bg-gray-50 min-h-48">
                  <LabelPreview
                    type={selectedType}
                    fields={currentFields}
                    size={selectedSize}
                    businessName={businessName}
                    brandColor={brandColor}
                    orientation={orientation}
                  />
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Preview is scaled — actual size: {selectedSize.widthMm}mm × {selectedSize.heightMm}mm
                </p>

                {/* Recommended sizes */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Recommended sizes for {selectedType.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(RECOMMENDED_SIZES[selectedTypeId] ?? []).map((sid) => {
                      const s = DYMO_SIZES.find((d) => d.id === sid);
                      if (!s) return null;
                      return (
                        <button
                          key={sid}
                          onClick={() => setSelectedSizeId(sid)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded border transition-colors",
                            sid === selectedSizeId
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted border-border",
                          )}
                        >
                          {sid}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Column 3: Label Fields ──────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Label Fields</p>

            {/* Fields card — flex-1 fills column height */}
            <Card className="flex-1 flex flex-col">
              <CardContent className="p-4 flex flex-col flex-1">

                {/* Product search (product / pricetag / shelf types) */}
                {hasProductSearch && (
                  <div className="mb-4 pb-4 border-b space-y-2">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Search className="w-3.5 h-3.5" /> Auto-fill from Product
                    </Label>
                    <div ref={searchRef} className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        value={productQuery}
                        onChange={(e) => { setProductQuery(e.target.value); setShowProdDropdown(true); }}
                        onFocus={() => setShowProdDropdown(true)}
                        onBlur={() => setTimeout(() => setShowProdDropdown(false), 150)}
                        placeholder="Search product…"
                        className="pl-8 pr-8 h-8 text-sm"
                      />
                      {productQuery && (
                        <button
                          onMouseDown={(e) => { e.preventDefault(); setProductQuery(""); setShowProdDropdown(false); }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {showProdDropdown && productSearchResults.length > 0 && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-xl shadow-lg max-h-[min(240px,50dvh)] overflow-y-auto">
                          {productSearchResults.map((p) => (
                            <button
                              key={p.id}
                              onMouseDown={(e) => { e.preventDefault(); fillFromProduct(p); }}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/60 text-left border-b last:border-b-0 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="font-medium truncate">{p.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {[p.sku && `SKU: ${p.sku}`, p.price != null && `$${Number(p.price).toFixed(2)}`].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                      {showProdDropdown && productQuery.length > 0 && productSearchResults.length === 0 && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-xl shadow-lg px-4 py-3 text-sm text-muted-foreground">
                          No products found
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* On/Off pill toggles for every field */}
                <div className="flex-1">
                  {selectedType.fields.map((field) => (
                    <FieldPill
                      key={field.key}
                      label={field.label}
                      isOn={currentFields[field.key] !== "false"}
                      onToggle={(v) => setField(field.key, v ? "true" : "false")}
                    />
                  ))}
                </div>

              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
