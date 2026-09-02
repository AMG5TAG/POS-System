/**
 * Online Store \u203a Design \u2014 how a KoaPOS-built store looks: theme, the block
 * builder that lays out each page, and the global footer.
 *
 * The builder holds a lot of editor-only state (active page and block, saved
 * sections, clipboard, drag) which lives here rather than in `useOnlineStore`:
 * none of it is part of the saved record, and no other page needs it.
 */
import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Palette, Wand2, Layout, Layers, FileText, Plus, Trash2, Eye, EyeOff, Clock,
  Settings2, Sparkles, Copy, CopyPlus, ArrowUp, ArrowDown, Maximize2, Minimize2, Check,
} from "lucide-react";
import { useGetMerchant, useListProducts } from "@workspace/api-client-react";
import { isProductBlock } from "@/pages/marketing/storefront-commerce";
import { useStoreSlug } from "@/lib/online-store-slug";
import {
  useOnlineStore, StoreHeader, BuilderOnlyNotice, Field, BlockPreview, BlockEditor,
  BlockStyleSection, CanvasProductPreview, BLOCK_LIBRARY, PAGE_TEMPLATES, COLOUR_PRESETS,
  FONT_OPTIONS, RADIUS_OPTIONS, PRODUCT_LAYOUTS, blockWrapperStyle, blockColSpan,
  blockHasSchedule, isBlockLive,
  type Block, type BlockMeta, type CanvasProduct, type Page, type PageTemplate, type SavedSection,
  type ThemeSettings,
} from "./shared";

export default function OnlineStoreDesignPage() {
  const { site, mutateSite, updateSite, updateTheme, updateFooter, togglePublish } = useOnlineStore();

  const { data: productsData } = useListProducts({ limit: 500 }, { query: { queryKey: ["products", "store-builder"] } });
  const liveProducts: CanvasProduct[] = ((productsData?.items ?? []) as Array<{ id: number; name: string; price?: string | number; imageUrl?: string | null; categoryId?: number | null }>)
    .map((p) => ({ id: p.id, name: p.name, price: typeof p.price === "number" ? p.price : parseFloat(String(p.price ?? "0")) || 0, imageUrl: p.imageUrl ?? "", categoryId: p.categoryId ?? null }));

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const merchantUsername = (merchant?.username ?? "").toLowerCase();
  const [storeSlug] = useStoreSlug();

  /* ─── Builder-only editor state ──────────────────────────────────── */
  const [activePageId, setActivePageId] = useState<string>("");
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"sm" | "md" | "lg">("lg");
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [newPage, setNewPage] = useState({ name: "", slug: "" });
  const [fullScreen, setFullScreen] = useState(false);
  const [clipboardBlock, setClipboardBlock] = useState<Block | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [savedSections, setSavedSections] = useState<SavedSection[]>([]);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);

  /* Select the first page once the record has loaded (or after the selected
     page is deleted). */
  useEffect(() => {
    if (!site.pages.some((p) => p.id === activePageId)) setActivePageId(site.pages[0]?.id ?? "");
  }, [site.pages, activePageId]);

  // Opened from the "Full screen" button (new tab) → start in full-screen builder.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("builder") === "fullscreen") setFullScreen(true);
  }, []);

  const activePage  = useMemo(() => site.pages.find((p) => p.id === activePageId) ?? site.pages[0], [site.pages, activePageId]);
  const activeBlock = useMemo(() => activePage?.blocks.find((b) => b.id === activeBlockId) ?? null, [activePage, activeBlockId]);
  const previewWidthClass = previewWidth === "sm" ? "max-w-sm" : previewWidth === "md" ? "max-w-2xl" : "max-w-full";

  /* ─── Page mutators ──────────────────────────────────────────────── */
  const addPage = () => {
    if (!newPage.name.trim()) return;
    const slug = (newPage.slug.trim() || "/" + newPage.name.toLowerCase().replace(/\s+/g, "-")).replace(/^\/+/, "/");
    const id = `p${Date.now()}`;
    mutateSite((s) => ({ ...s, pages: [...s.pages, { id, name: newPage.name.trim(), slug, visible: true, blocks: [] }] }));
    setActivePageId(id);
    setAddPageOpen(false);
    setNewPage({ name: "", slug: "" });
    toast.success("Page added");
  };

  const deletePage = (id: string) => {
    if (site.pages.length <= 1) { toast.error("You need at least one page"); return; }
    mutateSite((s) => ({ ...s, pages: s.pages.filter((p) => p.id !== id) }));
    if (activePageId === id) setActivePageId(site.pages[0].id);
    toast.success("Page deleted");
  };

  const togglePageVisibility = (id: string) =>
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === id ? { ...p, visible: !p.visible } : p) }));

  const updatePage = (patch: Partial<Page>) => {
    if (!activePage) return;
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, ...patch } : p) }));
  };

  /* ─── Block mutators ─────────────────────────────────────────────── */
  const addBlock = (meta: BlockMeta) => {
    if (!activePage) return;
    const id = `b${Date.now()}`;
    const newBlock: Block = { id, type: meta.type, data: { ...meta.defaultData } };
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: [...p.blocks, newBlock] } : p) }));
    setActiveBlockId(id);
  };

  const updateBlock = (b: Block) => {
    if (!activePage) return;
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: p.blocks.map((x) => x.id === b.id ? b : x) } : p) }));
  };

  const deleteBlock = (id: string) => {
    if (!activePage) return;
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: p.blocks.filter((b) => b.id !== id) } : p) }));
    if (activeBlockId === id) setActiveBlockId(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    if (!activePage) return;
    mutateSite((s) => ({
      ...s,
      pages: s.pages.map((p) => {
        if (p.id !== activePage.id) return p;
        const idx = p.blocks.findIndex((b) => b.id === id);
        const newIdx = idx + dir;
        if (idx < 0 || newIdx < 0 || newIdx >= p.blocks.length) return p;
        const arr = [...p.blocks];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { ...p, blocks: arr };
      }),
    }));
  };

  /* Insert a (cloned) block right after `afterId`, or at the end. */
  const insertBlockAfter = (block: Block, afterId: string | null) => {
    if (!activePage) return;
    const fresh: Block = { ...block, id: `b${Date.now()}`, data: { ...block.data } };
    mutateSite((s) => ({
      ...s,
      pages: s.pages.map((p) => {
        if (p.id !== activePage.id) return p;
        const at = afterId ? p.blocks.findIndex((b) => b.id === afterId) + 1 : p.blocks.length;
        const arr = [...p.blocks];
        arr.splice(at > 0 ? at : arr.length, 0, fresh);
        return { ...p, blocks: arr };
      }),
    }));
    setActiveBlockId(fresh.id);
  };

  const duplicateBlock = (id: string) => {
    const b = activePage?.blocks.find((x) => x.id === id);
    if (b) { insertBlockAfter(b, id); toast.success("Block duplicated"); }
  };

  const copyBlock = (id: string) => {
    const b = activePage?.blocks.find((x) => x.id === id);
    if (b) { setClipboardBlock(b); toast.success("Block copied — paste it on any page"); }
  };

  const pasteBlock = () => {
    if (clipboardBlock) { insertBlockAfter(clipboardBlock, activeBlockId); toast.success("Block pasted"); }
  };

  /* Drag-and-drop reorder within the active page. */
  const reorderBlock = (fromId: string, toId: string) => {
    if (!activePage || fromId === toId) return;
    mutateSite((s) => ({
      ...s,
      pages: s.pages.map((p) => {
        if (p.id !== activePage.id) return p;
        const arr = [...p.blocks];
        const from = arr.findIndex((b) => b.id === fromId);
        const to   = arr.findIndex((b) => b.id === toId);
        if (from < 0 || to < 0) return p;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        return { ...p, blocks: arr };
      }),
    }));
  };

  /* ─── Starter templates ──────────────────────────────────────────── */
  const applyTemplate = (tpl: PageTemplate) => {
    if (!activePage) return;
    if (activePage.blocks.length > 0 && !window.confirm(`Replace the contents of "${activePage.name}" with the "${tpl.name}" template?`)) return;
    const base = Date.now();
    const blocks: Block[] = tpl.blocks.map((b, i) => ({ id: `b${base}${i}`, type: b.type, data: { ...b.data } }));
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks } : p) }));
    setActiveBlockId(null);
    setTemplatesOpen(false);
    toast.success(`Applied "${tpl.name}" template`);
  };

  /* ─── Reusable saved sections (localStorage, per merchant) ────────── */
  const sectionsKey = `koapos-store-sections:${merchantUsername || "default"}`;
  useEffect(() => {
    try { const raw = localStorage.getItem(sectionsKey); setSavedSections(raw ? (JSON.parse(raw) as SavedSection[]) : []); }
    catch { setSavedSections([]); }
  }, [sectionsKey]);
  const persistSections = (next: SavedSection[]) => {
    setSavedSections(next);
    try { localStorage.setItem(sectionsKey, JSON.stringify(next)); } catch { /* quota / private mode */ }
  };
  const saveActiveAsSection = () => {
    if (!activeBlock) return;
    const label = BLOCK_LIBRARY.find((m) => m.type === activeBlock.type)?.label ?? activeBlock.type;
    const name = window.prompt("Name this saved section:", label)?.trim();
    if (!name) return;
    persistSections([...savedSections, { id: `sec${Date.now()}`, name, block: { ...activeBlock, data: { ...activeBlock.data } } }]);
    toast.success("Section saved — reuse it on any page");
  };
  const insertSavedSection = (sec: SavedSection) => { insertBlockAfter(sec.block, activeBlockId); toast.success(`Inserted "${sec.name}"`); };
  const deleteSavedSection = (id: string) => persistSections(savedSections.filter((s) => s.id !== id));

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <StoreHeader
          icon={Palette} title="Design" site={site} onTogglePublish={togglePublish}
          description="Theme your store and lay out its pages with the block builder."
        />

        {site.mode === "thirdparty" ? (
          <BuilderOnlyNotice />
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4" /> Theme & Branding</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs mb-2 block">Colour presets</Label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {COLOUR_PRESETS.map((p) => (
                      <button key={p.name} onClick={() => updateTheme({ primary: p.primary, accent: p.accent, bg: p.bg, text: p.text })}
                        className="rounded-lg border p-2 hover:ring-2 hover:ring-primary transition-all text-left">
                        <div className="flex gap-1 mb-1.5">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: p.primary }} />
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: p.accent }} />
                          <div className="w-4 h-4 rounded border" style={{ backgroundColor: p.bg }} />
                        </div>
                        <p className="text-[10px] font-medium">{p.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="Primary">    <Input type="color" value={site.theme.primary} onChange={(e) => updateTheme({ primary: e.target.value })} className="h-9" /></Field>
                  <Field label="Accent">     <Input type="color" value={site.theme.accent}  onChange={(e) => updateTheme({ accent:  e.target.value })} className="h-9" /></Field>
                  <Field label="Background"> <Input type="color" value={site.theme.bg}      onChange={(e) => updateTheme({ bg:      e.target.value })} className="h-9" /></Field>
                  <Field label="Text">       <Input type="color" value={site.theme.text}    onChange={(e) => updateTheme({ text:    e.target.value })} className="h-9" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Font">
                    <Select value={site.theme.font} onValueChange={(v) => updateTheme({ font: v as ThemeSettings["font"] })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Corner radius">
                    <Select value={site.theme.radius} onValueChange={(v) => updateTheme({ radius: v as ThemeSettings["radius"] })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{RADIUS_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
                {/* Default product page layout — applied to every product when a customer opens it. */}
                <div>
                  <Label className="text-xs mb-2 block">Default product page layout</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {PRODUCT_LAYOUTS.map((opt) => {
                      const active = (site.theme.productLayout ?? "standard") === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateTheme({ productLayout: opt.value })}
                          className={cn("text-left rounded-lg border p-3 transition-colors", active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted")}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            {active && <Check className="w-3.5 h-3.5 text-primary" />}{opt.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{opt.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">Every product in your store uses this layout when a customer opens it.</p>
                </div>
              </CardContent>
            </Card>

            <Card className={cn(fullScreen && "fixed inset-0 z-50 m-0 rounded-none border-0 overflow-y-auto")}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div><CardTitle className="text-base flex items-center gap-2"><Wand2 className="w-4 h-4" /> Store Builder</CardTitle><CardDescription>Drag-style block editor for your pages</CardDescription></div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 bg-muted rounded-lg p-1">
                      {(["sm", "md", "lg"] as const).map((w) => (
                        <button key={w} onClick={() => setPreviewWidth(w)}
                          className={cn("px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all", previewWidth === w ? "bg-background shadow-sm" : "pill-selector text-muted-foreground")}>
                          {w === "sm" ? "Mobile" : w === "md" ? "Tablet" : "Desktop"}
                        </button>
                      ))}
                    </div>
                    {fullScreen ? (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setFullScreen(false)} title="Exit full screen">
                        <Minimize2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Exit full screen</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm" variant="outline" className="gap-1.5"
                        onClick={() => window.open(`${window.location.pathname}?builder=fullscreen`, "_blank", "noopener")}
                        title="Open the Store Builder in a new full-size tab"
                      >
                        <Maximize2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Full screen</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px] border-t min-h-[600px]">
                  <div className="border-r p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pages</p>
                      <div className="flex">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPageSettingsOpen(true)} title="Page settings & SEO"><Settings2 className="w-3 h-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddPageOpen(true)} title="Add page"><Plus className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {site.pages.map((p) => (
                        <div key={p.id} className={cn("group flex items-center gap-1 rounded px-2 py-1.5 text-sm cursor-pointer transition-colors", activePageId === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                          <button onClick={() => { setActivePageId(p.id); setActiveBlockId(null); }} className="flex-1 text-left flex items-center gap-2 min-w-0">
                            <FileText className="w-3 h-3 shrink-0 opacity-60" />
                            <span className="truncate text-xs">{p.name}</span>
                            {!p.visible && <EyeOff className="w-3 h-3 ml-auto text-muted-foreground" />}
                          </button>
                          <div className="opacity-0 group-hover:opacity-100 flex">
                            <button onClick={() => togglePageVisibility(p.id)} className="p-0.5 hover:text-foreground text-muted-foreground" title="Toggle visibility">
                              {p.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            </button>
                            <button onClick={() => deletePage(p.id)} className="p-0.5 hover:text-destructive text-muted-foreground" title="Delete page"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator className="my-3" />
                    <Button size="sm" variant="outline" className="w-full gap-1.5 mb-2 h-7 text-xs" onClick={() => setTemplatesOpen(true)} title="Start this page from a ready-made layout">
                      <Sparkles className="w-3 h-3" /> Templates
                    </Button>
                    {clipboardBlock && (
                      <Button size="sm" variant="outline" className="w-full gap-1.5 mb-2 h-7 text-xs" onClick={pasteBlock} title="Paste copied block onto this page">
                        <Copy className="w-3 h-3" /> Paste block
                      </Button>
                    )}
                    {savedSections.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Saved sections</p>
                        <div className="space-y-1">
                          {savedSections.map((sec) => (
                            <div key={sec.id} className="flex items-center gap-1">
                              <button onClick={() => insertSavedSection(sec)} className="flex-1 text-left text-[11px] px-2 py-1 rounded border bg-background/60 hover:bg-muted truncate" title={`Insert "${sec.name}"`}>{sec.name}</button>
                              <button onClick={() => deleteSavedSection(sec.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Delete saved section"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Add block</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {BLOCK_LIBRARY.map((b) => {
                        const Icon = b.icon;
                        return (
                          <button key={b.type} onClick={() => addBlock(b)} title={b.description}
                            className="flex flex-col items-center justify-center gap-1 rounded-md border bg-background/60 px-1.5 py-2 text-[10px] text-center leading-tight hover:bg-muted hover:border-primary/40 transition-colors">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                            <span className="line-clamp-2">{b.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-muted/30 p-4 overflow-auto">
                    {activePage && (
                      <div className={cn("mx-auto rounded-lg shadow-sm overflow-hidden transition-all", previewWidthClass)}
                        style={{ backgroundColor: site.theme.bg, fontFamily: site.theme.font === "serif" ? "serif" : site.theme.font === "mono" ? "monospace" : "system-ui" }}>
                        <div className="flex items-center gap-1.5 border-b px-3 py-2 bg-background/60">
                          <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" />
                          <p className="text-[10px] text-muted-foreground ml-2 truncate">{(site.domain.trim() || `koapos.com.au/b/${merchantUsername || "your-username"}/o/${storeSlug}`)}{activePage.slug}</p>
                        </div>
                        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${site.theme.text}15` }}>
                          <p className="font-bold text-sm" style={{ color: site.theme.text }}>{site.storeName}</p>
                          <div className="flex gap-3 text-xs" style={{ color: site.theme.text }}>
                            {site.pages.filter((p) => p.visible).slice(0, 4).map((p) => (
                              <span key={p.id} className={p.id === activePage.id ? "font-semibold" : "opacity-70"}>{p.name}</span>
                            ))}
                          </div>
                        </div>
                        <div className="p-4 grid grid-cols-12 gap-3 items-start">
                          {activePage.blocks.length === 0 ? (
                            <div className="col-span-12 py-12 text-center text-sm text-muted-foreground"><Layout className="w-8 h-8 mx-auto mb-2 opacity-30" />No blocks yet. Add one from the left.</div>
                          ) : activePage.blocks.map((b) => (
                            <div key={b.id}
                              draggable
                              onDragStart={() => setDragBlockId(b.id)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => { e.preventDefault(); if (dragBlockId) reorderBlock(dragBlockId, b.id); setDragBlockId(null); }}
                              onDragEnd={() => setDragBlockId(null)}
                              onClick={() => setActiveBlockId(b.id)}
                              style={blockWrapperStyle(b.data)}
                              className={cn("relative rounded cursor-pointer transition-all", blockColSpan(b.data), dragBlockId === b.id && "opacity-50", !isBlockLive(b) && "opacity-50", activeBlockId === b.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-muted-foreground/30")}>
                              {blockHasSchedule(b) && (
                                <div className="absolute -top-2 -left-2 z-10">
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-background border shadow-sm flex items-center gap-0.5 text-muted-foreground"
                                    title={isBlockLive(b) ? "Scheduled — currently visible on your live store" : "Scheduled — hidden on your live store right now"}>
                                    <Clock className="w-2.5 h-2.5" />{isBlockLive(b) ? "Scheduled" : "Hidden now"}
                                  </span>
                                </div>
                              )}
                              {activeBlockId === b.id && (
                                <div className="absolute -top-2 -right-2 flex gap-1 z-10">
                                  <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1); }} className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Move up"><ArrowUp className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 1); }}  className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Move down"><ArrowDown className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); duplicateBlock(b.id); }} className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Duplicate"><CopyPlus className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); copyBlock(b.id); }} className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Copy"><Copy className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }}  className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              )}
                              {isProductBlock(b) && liveProducts.length > 0
                                ? <CanvasProductPreview block={b} products={liveProducts} theme={site.theme} />
                                : <BlockPreview block={b} theme={site.theme} />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-l p-4 bg-background overflow-auto">
                    {activeBlock ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{BLOCK_LIBRARY.find((m) => m.type === activeBlock.type)?.label}</p>
                          <div className="flex items-center gap-0.5">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={saveActiveAsSection} title="Save as reusable section"><Layers className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteBlock(activeBlock.id)} title="Delete block"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                        <BlockEditor block={activeBlock} onChange={updateBlock} />
                        <BlockStyleSection block={activeBlock} onChange={updateBlock} />
                      </>
                    ) : (
                      <div className="text-center text-xs text-muted-foreground py-12">
                        <Wand2 className="w-7 h-7 mx-auto mb-2 opacity-40" />Click a block in the preview to edit it, or add a new one from the left panel.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div><CardTitle className="text-base flex items-center gap-2"><Layout className="w-4 h-4" /> Global Footer</CardTitle><CardDescription>Shown at the bottom of every page on your live store</CardDescription></div>
                  <Switch checked={site.footer.enabled} onCheckedChange={(v) => updateFooter({ enabled: v })} />
                </div>
              </CardHeader>
              {site.footer.enabled && (
                <CardContent className="space-y-3">
                  <Field label="Footer text"><Textarea rows={2} value={site.footer.text} onChange={(e) => updateFooter({ text: e.target.value })} placeholder="© 2026 Your Business. All rights reserved." /></Field>
                  <Field label="Footer links (one per line: Label | /url)">
                    <Textarea rows={3} value={site.footer.linksRaw} onChange={(e) => updateFooter({ linksRaw: e.target.value })} placeholder={"About | /about\nContact | /contact\nReturns | /returns"} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Contact email"><Input value={site.footer.email} onChange={(e) => updateFooter({ email: e.target.value })} placeholder="hello@store.com" /></Field>
                    <Field label="Contact phone"><Input value={site.footer.phone} onChange={(e) => updateFooter({ phone: e.target.value })} placeholder="(02) 1234 5678" /></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Facebook"><Input value={site.footer.facebook} onChange={(e) => updateFooter({ facebook: e.target.value })} placeholder="https://…" /></Field>
                    <Field label="Instagram"><Input value={site.footer.instagram} onChange={(e) => updateFooter({ instagram: e.target.value })} placeholder="https://…" /></Field>
                    <Field label="X / Twitter"><Input value={site.footer.twitter} onChange={(e) => updateFooter({ twitter: e.target.value })} placeholder="https://…" /></Field>
                  </div>
                </CardContent>
              )}
            </Card>
          </>
        )}
      </div>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Page templates</DialogTitle>
            <DialogDescription>Apply a ready-made layout to "{activePage?.name}". This replaces the page's current blocks.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
            {PAGE_TEMPLATES.map((tpl) => (
              <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                className="text-left rounded-lg border p-3 hover:border-primary/50 hover:bg-muted/40 transition-colors">
                <p className="text-sm font-semibold">{tpl.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-2">{tpl.blocks.length} blocks</p>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatesOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addPageOpen} onOpenChange={setAddPageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New page</DialogTitle><DialogDescription>Add a new page to your site.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Field label="Page name"><Input value={newPage.name} onChange={(e) => setNewPage((p) => ({ ...p, name: e.target.value }))} placeholder="FAQ" /></Field>
            <Field label="Slug (optional)"><Input value={newPage.slug} onChange={(e) => setNewPage((p) => ({ ...p, slug: e.target.value }))} placeholder="/faq" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPageOpen(false)}>Cancel</Button>
            <Button onClick={addPage}>Add page</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pageSettingsOpen} onOpenChange={setPageSettingsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Page settings &amp; SEO</DialogTitle>
            <DialogDescription>Settings for <strong>{activePage?.name}</strong>. Used by search engines and social shares.</DialogDescription>
          </DialogHeader>
          {activePage && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Page name"><Input value={activePage.name} onChange={(e) => updatePage({ name: e.target.value })} /></Field>
                <Field label="Slug"><Input value={activePage.slug} onChange={(e) => updatePage({ slug: e.target.value })} placeholder="/about" /></Field>
              </div>
              <Field label="SEO title"><Input value={activePage.seoTitle ?? ""} onChange={(e) => updatePage({ seoTitle: e.target.value })} placeholder={activePage.name} /></Field>
              <Field label="SEO description"><Textarea rows={3} value={activePage.seoDescription ?? ""} onChange={(e) => updatePage({ seoDescription: e.target.value })} placeholder="A short summary shown in search results (max ~160 characters)." /></Field>
              <Field label="Social share image URL"><Input value={activePage.shareImage ?? ""} onChange={(e) => updatePage({ shareImage: e.target.value })} placeholder="https://…" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Publish date (optional)"><Input type="datetime-local" value={activePage.publishAt ?? ""} onChange={(e) => updatePage({ publishAt: e.target.value })} /></Field>
                <Field label="Visibility">
                  <Select value={activePage.visible ? "visible" : "hidden"} onValueChange={(v) => updatePage({ visible: v === "visible" })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="visible">Visible</SelectItem><SelectItem value="hidden">Hidden</SelectItem></SelectContent>
                  </Select>
                </Field>
              </div>
              {activePage.publishAt && (
                <p className="text-xs text-muted-foreground">
                  Scheduled to go live on {new Date(activePage.publishAt).toLocaleString("en-AU")}. Until then it stays hidden from visitors.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPageSettingsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
