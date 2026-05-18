import { useState, useEffect } from "react";
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
  LayoutTemplate, Copy, Clock, Package,
} from "lucide-react";
import {
  STICKER_TYPES, DYMO_SIZES, RECOMMENDED_SIZES,
  LabelPreview, useStickerTemplates, StickerTemplate,
} from "@/lib/sticker-config";
import { toast } from "sonner";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60)   return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/* ─── Blank form state ───────────────────────────────────────────────────── */

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
  const type = STICKER_TYPES.find((t) => t.id === tpl.typeId) ?? STICKER_TYPES[0];
  const defaults = Object.fromEntries(type.fields.map((f) => [f.key, f.defaultValue]));
  return {
    name: tpl.name,
    description: tpl.description ?? "",
    typeId: tpl.typeId,
    sizeId: tpl.sizeId,
    fields: { ...defaults, ...tpl.fields },
  };
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementStickerTemplatesPage() {
  const [, navigate] = useLocation();
  const { templates, create, update, remove } = useStickerTemplates();

  // null = creating new, string = editing existing id
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();
  const businessName = merchant?.businessName || "Your Business";
  const brandColor   = profile.brandColors?.[0] || "#efbf04";

  const selectedType = STICKER_TYPES.find((t) => t.id === form.typeId) ?? STICKER_TYPES[0];
  const selectedSize = DYMO_SIZES.find((s) => s.id === form.sizeId) ?? DYMO_SIZES[2];
  const sizeGroups   = DYMO_SIZES.reduce<Record<string, typeof DYMO_SIZES>>((acc, s) => {
    (acc[s.series] ??= []).push(s);
    return acc;
  }, {});

  // Group templates by type
  const grouped = STICKER_TYPES.map((t) => ({
    type: t,
    items: templates.filter((tpl) => tpl.typeId === t.id),
  })).filter((g) => g.items.length > 0);

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }));
    setDirty(true);
  };

  const handleTypeChange = (typeId: string) => {
    const type = STICKER_TYPES.find((t) => t.id === typeId) ?? STICKER_TYPES[0];
    const defaults = Object.fromEntries(type.fields.map((f) => [f.key, f.defaultValue]));
    setForm((prev) => ({
      ...prev,
      typeId,
      sizeId: type.defaultSize,
      fields: defaults,
    }));
    setDirty(true);
  };

  const startNew = () => {
    setEditingId(null);
    setForm(blankForm());
    setDirty(false);
  };

  const startEdit = (tpl: StickerTemplate) => {
    setEditingId(tpl.id);
    setForm(formFromTemplate(tpl));
    setDirty(false);
    setConfirmDelete(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter a template name.");
      return;
    }
    const data = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      typeId: form.typeId,
      sizeId: form.sizeId,
      fields: form.fields,
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
    if (editingId === id) {
      setEditingId(null);
      setForm(blankForm());
    }
    setConfirmDelete(null);
    toast.success("Template deleted.");
  };

  const handleDuplicate = (tpl: StickerTemplate) => {
    const data = {
      name: `${tpl.name} (copy)`,
      description: tpl.description,
      typeId: tpl.typeId,
      sizeId: tpl.sizeId,
      fields: { ...tpl.fields },
    };
    const newTpl = create(data);
    startEdit(newTpl);
    toast.success("Template duplicated.");
  };

  const handleUsePrint = (tpl: StickerTemplate) => {
    sessionStorage.setItem("koapos_sticker_tpl_load", JSON.stringify({
      typeId: tpl.typeId,
      sizeId: tpl.sizeId,
      fields: tpl.fields,
    }));
    navigate("/management/stickers");
  };

  const isNewUnsaved = editingId === null;
  const currentTpl = editingId ? templates.find((t) => t.id === editingId) : null;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <LayoutTemplate className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Sticker Templates</h1>
              <p className="text-sm text-muted-foreground">Save and reuse label configurations for fast, consistent printing.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/management/stickers")}>
              <Printer className="w-3.5 h-3.5" /> Print Labels
            </Button>
            <Button size="sm" className="gap-1.5" onClick={startNew}>
              <Plus className="w-3.5 h-3.5" /> New Template
            </Button>
          </div>
        </div>

        <div className="flex gap-5 items-start">

          {/* Left: template list */}
          <div className="w-72 shrink-0 space-y-3">
            {/* New template entry */}
            <button
              onClick={startNew}
              className={cn(
                "w-full rounded-xl border-2 border-dashed p-3 text-sm flex items-center gap-2 transition-colors",
                isNewUnsaved && !form.name
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
              )}
            >
              <Plus className={cn("w-4 h-4", isNewUnsaved && !form.name ? "text-primary" : "")} />
              <span className="font-medium">New Template</span>
            </button>

            {templates.length === 0 ? (
              <div className="rounded-xl border bg-muted/20 p-6 text-center space-y-2">
                <Tag className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">No templates yet</p>
                <p className="text-xs text-muted-foreground">Create your first template to quickly reuse label layouts when printing.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {grouped.map(({ type, items }) => {
                  const Icon = type.icon;
                  return (
                    <div key={type.id}>
                      <div className={cn("flex items-center gap-1.5 px-0.5 mb-1.5 text-xs font-semibold uppercase tracking-wider", type.color)}>
                        <Icon className="w-3.5 h-3.5" />
                        {type.label}
                        <span className="text-muted-foreground font-normal ml-auto">{items.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {items.map((tpl) => {
                          const size = DYMO_SIZES.find((s) => s.id === tpl.sizeId);
                          const isActive = editingId === tpl.id;
                          return (
                            <div
                              key={tpl.id}
                              onClick={() => startEdit(tpl)}
                              className={cn(
                                "rounded-xl border p-3 cursor-pointer transition-all group",
                                isActive
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                  : "hover:border-muted-foreground/30 hover:bg-muted/30"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-sm truncate">{tpl.name}</p>
                                  {tpl.description && (
                                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{tpl.description}</p>
                                  )}
                                </div>
                                {isActive && <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {size && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{size.id}</Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" />{timeAgo(tpl.updatedAt)}
                                </span>
                              </div>

                              {/* Action row — visible on hover/active */}
                              <div className={cn(
                                "flex items-center gap-1 mt-2 pt-2 border-t transition-opacity",
                                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              )}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleUsePrint(tpl); }}
                                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                                >
                                  <Printer className="w-2.5 h-2.5" /> Use for Printing
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDuplicate(tpl); }}
                                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                >
                                  <Copy className="w-2.5 h-2.5" /> Copy
                                </button>
                                {confirmDelete === tpl.id ? (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
                                      className="text-[10px] px-2 py-0.5 rounded border border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors ml-auto"
                                    >Confirm</button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                                      className="text-[10px] px-2 py-0.5 rounded border hover:bg-muted transition-colors text-muted-foreground"
                                    >Cancel</button>
                                  </>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(tpl.id); }}
                                    className="ml-auto text-[10px] px-2 py-0.5 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
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
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: editor */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Editor header */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                {editingId ? (
                  <><Pencil className="w-4 h-4 text-muted-foreground shrink-0" /><span className="font-semibold text-sm truncate">Editing: {currentTpl?.name}</span></>
                ) : (
                  <><Plus className="w-4 h-4 text-muted-foreground shrink-0" /><span className="font-semibold text-sm">New Template</span></>
                )}
                {dirty && <Badge variant="outline" className="text-[10px] h-4 px-1 text-amber-600 border-amber-300">Unsaved changes</Badge>}
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
                  <Save className="w-3.5 h-3.5" /> {editingId ? "Update" : "Save Template"}
                </Button>
              </div>
            </div>

            {/* Form + preview grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

              {/* Left: form */}
              <div className="rounded-xl border bg-card space-y-0 overflow-hidden">

                {/* Identity section */}
                <div className="px-5 py-4 border-b bg-muted/20 space-y-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Template Identity</p>
                  <div className="space-y-1.5">
                    <Label>Template Name <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.name}
                      onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setDirty(true); }}
                      placeholder="e.g. Coffee Products, VIP Loyalty Card…"
                      className="font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => { setForm((p) => ({ ...p, description: e.target.value })); setDirty(true); }}
                      placeholder="What is this template used for?"
                      className="text-sm resize-none"
                      rows={2}
                    />
                  </div>
                </div>

                {/* Configuration section */}
                <div className="px-5 py-4 border-b space-y-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Configuration</p>
                  <div className="space-y-1.5">
                    <Label>Label Type</Label>
                    <Select value={form.typeId} onValueChange={handleTypeChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STICKER_TYPES.map((t) => {
                          const Icon = t.icon;
                          return (
                            <SelectItem key={t.id} value={t.id}>
                              <span className="flex items-center gap-2">
                                <Icon className={cn("w-3.5 h-3.5", t.color)} /> {t.label}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{selectedType.description}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>DYMO Label Size</Label>
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
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[10px] text-muted-foreground self-center">Recommended:</span>
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
                </div>

                {/* Dynamic fields section */}
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

                {/* Footer actions */}
                {editingId && (
                  <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Created {new Date(currentTpl?.createdAt ?? 0).toLocaleDateString("en-AU")} · Updated {timeAgo(currentTpl?.updatedAt ?? 0)}
                    </p>
                    {confirmDelete === editingId ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(editingId)}>Confirm Delete</Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirmDelete(editingId)}>
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Right: live preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Live Preview</p>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedSize.widthMm}×{selectedSize.heightMm}mm · #{selectedSize.id}
                  </Badge>
                </div>
                <div className="rounded-xl border bg-gray-50 p-8 flex items-center justify-center min-h-64">
                  <LabelPreview
                    type={selectedType}
                    fields={form.fields}
                    size={selectedSize}
                    businessName={businessName}
                    brandColor={brandColor}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Preview is scaled — actual size: {selectedSize.widthMm}mm × {selectedSize.heightMm}mm
                </p>

                <Separator />

                {/* Template stats / info */}
                <div className="rounded-xl border bg-muted/20 divide-y">
                  <div className="px-4 py-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Label type</span>
                    <div className={cn("flex items-center gap-1.5 font-medium", selectedType.color)}>
                      <selectedType.icon className="w-3.5 h-3.5" />
                      {selectedType.label}
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">DYMO part #</span>
                    <span className="font-mono text-xs font-medium">{selectedSize.id}</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Dimensions</span>
                    <span className="font-medium">{selectedSize.widthMm} × {selectedSize.heightMm} mm</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fields</span>
                    <span className="font-medium">{selectedType.fields.filter((f) => f.type !== "toggle").length} fields</span>
                  </div>
                </div>

                {/* Hint */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 flex gap-2">
                  <Package className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>
                    Click <strong>Use for Printing</strong> on any saved template to jump straight to the label printer with all fields pre-filled.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
