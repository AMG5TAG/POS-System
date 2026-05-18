import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Tag, Plus, Pencil, Trash2, Printer, Check, Save,
  LayoutTemplate, Copy, Clock,
} from "lucide-react";
import {
  STICKER_TYPES, DYMO_SIZES, RECOMMENDED_SIZES,
  LabelPreview, useStickerTemplates, StickerTemplate,
} from "@/lib/sticker-config";
import { toast } from "sonner";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60)    return "Just now";
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

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

/* ─── Form state ─────────────────────────────────────────────────────────── */

interface FormState {
  name: string;
  description: string;
  typeId: string;
  sizeId: string;
  fields: Record<string, string>;
}

function blankForm(typeId = "product"): FormState {
  const type = STICKER_TYPES.find((t) => t.id === typeId) ?? STICKER_TYPES[0];
  return {
    name: "",
    description: "",
    typeId: type.id,
    sizeId: type.defaultSize,
    fields: Object.fromEntries(type.fields.map((f) => [f.key, f.defaultValue])),
  };
}

function formFromTemplate(tpl: StickerTemplate): FormState {
  const type    = STICKER_TYPES.find((t) => t.id === tpl.typeId) ?? STICKER_TYPES[0];
  const defaults = Object.fromEntries(type.fields.map((f) => [f.key, f.defaultValue]));
  return {
    name:        tpl.name,
    description: tpl.description ?? "",
    typeId:      tpl.typeId,
    sizeId:      tpl.sizeId,
    fields:      { ...defaults, ...tpl.fields },
  };
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementStickerTemplatesPage() {
  const [, navigate]                           = useLocation();
  const { templates, create, update, remove }  = useStickerTemplates();

  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [form,          setForm]          = useState<FormState>(blankForm);
  const [dirty,         setDirty]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile }        = useBusinessProfile();
  const businessName = merchant?.businessName || "Your Business";
  const brandColor   = profile.brandColors?.[0] || "#efbf04";

  const selectedType = STICKER_TYPES.find((t) => t.id === form.typeId) ?? STICKER_TYPES[0];
  const selectedSize = DYMO_SIZES.find((s) => s.id === form.sizeId) ?? DYMO_SIZES[2];
  const sizeGroups   = DYMO_SIZES.reduce<Record<string, typeof DYMO_SIZES>>((acc, s) => {
    (acc[s.series] ??= []).push(s);
    return acc;
  }, {});

  /* Preview container sizing */
  const previewRef  = useRef<HTMLDivElement>(null);
  const previewSize = useContainerSize(previewRef);

  /* ── handlers ── */

  const setField = (key: string, value: string) => {
    setForm((p) => ({ ...p, fields: { ...p.fields, [key]: value } }));
    setDirty(true);
  };

  const handleTypeChange = (typeId: string) => {
    const type    = STICKER_TYPES.find((t) => t.id === typeId) ?? STICKER_TYPES[0];
    const defaults = Object.fromEntries(type.fields.map((f) => [f.key, f.defaultValue]));
    setForm((p) => ({ ...p, typeId, sizeId: type.defaultSize, fields: defaults }));
    setDirty(true);
  };

  const startNew = () => {
    setEditingId(null);
    setForm(blankForm(form.typeId));
    setDirty(false);
    setConfirmDelete(null);
  };

  const startEdit = (tpl: StickerTemplate) => {
    setEditingId(tpl.id);
    setForm(formFromTemplate(tpl));
    setDirty(false);
    setConfirmDelete(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Please enter a template name."); return; }
    const data = {
      name:        form.name.trim(),
      description: form.description.trim() || undefined,
      typeId:      form.typeId,
      sizeId:      form.sizeId,
      fields:      form.fields,
    };
    if (editingId) {
      update(editingId, data);
      toast.success("Template updated.");
    } else {
      const tpl = create(data);
      setEditingId(tpl.id);
      toast.success("Template saved.");
    }
    setDirty(false);
  };

  const handleDelete = (id: string) => {
    remove(id);
    if (editingId === id) { setEditingId(null); setForm(blankForm(form.typeId)); }
    setConfirmDelete(null);
    toast.success("Template deleted.");
  };

  const handleDuplicate = (tpl: StickerTemplate) => {
    const newTpl = create({ name: `${tpl.name} (copy)`, description: tpl.description, typeId: tpl.typeId, sizeId: tpl.sizeId, fields: { ...tpl.fields } });
    startEdit(newTpl);
    toast.success("Template duplicated.");
  };

  const handleUsePrint = (tpl: StickerTemplate) => {
    sessionStorage.setItem("koapos_sticker_tpl_load", JSON.stringify({ typeId: tpl.typeId, sizeId: tpl.sizeId, fields: tpl.fields }));
    navigate("/management/stickers");
  };

  const currentTpl = editingId ? templates.find((t) => t.id === editingId) : null;

  /* ──────────────────────────────────────────────────────────────────────── */

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <LayoutTemplate className="w-6 h-6 text-primary shrink-0" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Sticker Templates</h1>
              <p className="text-sm text-muted-foreground">Save and reuse label configurations for fast, consistent printing.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/management/stickers")}>
              <Printer className="w-3.5 h-3.5" /> Print Labels
            </Button>
            <Button size="sm" className="gap-1.5" onClick={startNew}>
              <Plus className="w-3.5 h-3.5" /> New Template
            </Button>
          </div>
        </div>

        {/* ── Saved templates strip ── */}
        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-5 flex items-center gap-4">
            <Tag className="w-8 h-8 text-muted-foreground/30 shrink-0" />
            <div>
              <p className="font-medium text-muted-foreground">No templates yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Fill in the form below and click <strong>Save Template</strong> to create your first reusable label configuration.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <div className="flex gap-2.5 w-max">
              {/* New template shortcut */}
              <button
                onClick={startNew}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-3 w-36 transition-colors shrink-0",
                  editingId === null
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs font-medium">New</span>
              </button>

              {templates.map((tpl) => {
                const type    = STICKER_TYPES.find((t) => t.id === tpl.typeId);
                const size    = DYMO_SIZES.find((s) => s.id === tpl.sizeId);
                const Icon    = type?.icon ?? Tag;
                const isActive = editingId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => startEdit(tpl)}
                    className={cn(
                      "group relative w-44 shrink-0 rounded-xl border px-3 py-2.5 cursor-pointer transition-all",
                      isActive
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:border-muted-foreground/30 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", type?.color ?? "text-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate leading-tight">{tpl.name}</p>
                        {size && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{size.id} · {size.widthMm}×{size.heightMm}mm</p>}
                        <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />{timeAgo(tpl.updatedAt)}
                        </p>
                      </div>
                      {isActive && <Check className="w-3 h-3 text-primary shrink-0" />}
                    </div>
                    {/* Hover actions */}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUsePrint(tpl); }}
                        title="Use for Printing"
                        className="flex-1 flex items-center justify-center gap-1 text-[10px] py-0.5 rounded border bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                      >
                        <Printer className="w-2.5 h-2.5" /> Print
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(tpl); }}
                        title="Duplicate"
                        className="p-1 rounded border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy className="w-2.5 h-2.5" />
                      </button>
                      {confirmDelete === tpl.id ? (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-destructive bg-destructive text-destructive-foreground"
                          >Yes</button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                            className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted text-muted-foreground"
                          >No</button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(tpl.id); }}
                          title="Delete"
                          className="p-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Label type tab bar ── */}
        <div className="flex flex-wrap items-center bg-muted rounded-xl p-1 gap-0.5">
          {STICKER_TYPES.map((t) => {
            const Icon   = t.icon;
            const active = form.typeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTypeChange(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer select-none",
                  active
                    ? "bg-background shadow-sm text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Editor: 2-col equal-height grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch" style={{ minHeight: 560 }}>

          {/* ── Col 1: Form ── */}
          <div className="rounded-xl border bg-card flex flex-col overflow-hidden h-full">

            {/* Editor sub-header */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b bg-muted/20 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {editingId
                  ? <><Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-semibold text-sm truncate">{currentTpl?.name}</span></>
                  : <><Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-semibold text-sm text-muted-foreground">New Template</span></>
                }
                {dirty && <Badge variant="outline" className="text-[10px] h-4 px-1 text-amber-600 border-amber-300 shrink-0">Unsaved</Badge>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editingId && (
                  <Button variant="outline" size="sm" className="gap-1.5 text-primary border-primary/30"
                    onClick={() => handleUsePrint(templates.find((t) => t.id === editingId)!)}
                  >
                    <Printer className="w-3.5 h-3.5" /> Use for Printing
                  </Button>
                )}
                <Button size="sm" className="gap-1.5" onClick={handleSave}>
                  <Save className="w-3.5 h-3.5" /> {editingId ? "Update" : "Save"}
                </Button>
              </div>
            </div>

            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto">

              {/* Identity */}
              <div className="px-5 py-4 border-b space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Template Identity</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Template Name <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.name}
                      onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setDirty(true); }}
                      placeholder="e.g. Coffee Products, VIP Loyalty Card…"
                      className="font-medium"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => { setForm((p) => ({ ...p, description: e.target.value })); setDirty(true); }}
                      placeholder="What is this template used for?"
                      className="text-sm resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Size selector */}
              <div className="px-5 py-4 border-b space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">DYMO Label Size</p>
                <Select value={form.sizeId} onValueChange={(v) => { setForm((p) => ({ ...p, sizeId: v })); setDirty(true); }}>
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
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] text-muted-foreground">Recommended:</span>
                  {(RECOMMENDED_SIZES[form.typeId] ?? []).map((sid) => {
                    const s = DYMO_SIZES.find((d) => d.id === sid);
                    if (!s) return null;
                    return (
                      <button key={sid}
                        onClick={() => { setForm((p) => ({ ...p, sizeId: sid })); setDirty(true); }}
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded border transition-colors",
                          form.sizeId === sid ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"
                        )}
                      >{sid}</button>
                    );
                  })}
                </div>
              </div>

              {/* Fields */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Label Fields</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedType.fields.map((field) => {
                    if (field.type === "toggle") {
                      return (
                        <div key={field.key} className="flex items-center justify-between col-span-2 sm:col-span-1 py-1">
                          <Label className="cursor-pointer">{field.label}</Label>
                          <Switch
                            checked={form.fields[field.key] === "true"}
                            onCheckedChange={(v) => setField(field.key, v ? "true" : "false")}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <Label className="text-xs">{field.label}</Label>
                        <Input
                          value={form.fields[field.key] ?? ""}
                          onChange={(e) => setField(field.key, e.target.value)}
                          placeholder={field.defaultValue}
                          className="text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            {editingId ? (
              <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between gap-2 shrink-0">
                <p className="text-[11px] text-muted-foreground">
                  Created {new Date(currentTpl?.createdAt ?? 0).toLocaleDateString("en-AU")} · Updated {timeAgo(currentTpl?.updatedAt ?? 0)}
                </p>
                {confirmDelete === editingId ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(editingId)}>Confirm Delete</Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline"
                    className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDelete(editingId)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                )}
              </div>
            ) : (
              <div className="px-5 py-3 border-t bg-muted/20 shrink-0">
                <p className="text-xs text-muted-foreground">Fill in the fields above then click <strong>Save</strong> to store this template.</p>
              </div>
            )}
          </div>

          {/* ── Col 2: Preview ── */}
          <div className="rounded-xl border bg-card flex flex-col overflow-hidden h-full">

            {/* Preview header */}
            <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <selectedType.icon className={cn("w-4 h-4", selectedType.color)} />
                <span className="text-sm font-semibold">Live Preview</span>
                <span className="text-xs text-muted-foreground">· {selectedType.label}</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {selectedSize.widthMm}×{selectedSize.heightMm}mm · {selectedSize.id}
              </Badge>
            </div>

            {/* Preview area — fills all remaining height */}
            <div
              ref={previewRef}
              className="flex-1 flex items-center justify-center bg-[radial-gradient(circle,_#e5e7eb_1px,_transparent_1px)] [background-size:16px_16px] min-h-0"
            >
              <LabelPreview
                type={selectedType}
                fields={form.fields}
                size={selectedSize}
                businessName={businessName}
                brandColor={brandColor}
                fillWidth={previewSize.w}
                fillHeight={previewSize.h}
              />
            </div>

            {/* Preview footer */}
            <div className="px-5 py-3 border-t bg-muted/20 shrink-0">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Dimensions</span>
                  <span className="font-medium">{selectedSize.widthMm} × {selectedSize.heightMm} mm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">DYMO Part #</span>
                  <span className="font-mono font-medium">{selectedSize.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Series</span>
                  <span className="font-medium">
                    {selectedSize.series === "LW" ? "LabelWriter 400/450" : selectedSize.series === "LW550" ? "LabelWriter 550" : "D1 Tape"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fields</span>
                  <span className="font-medium">{selectedType.fields.filter((f) => f.type !== "toggle").length} fields</span>
                </div>
              </div>
              <Separator className="my-2" />
              <p className="text-[11px] text-muted-foreground text-center">
                Preview scales to fit — actual printed size is {selectedSize.widthMm}mm × {selectedSize.heightMm}mm
              </p>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
