import { useState, useCallback, useRef } from "react";
import { ColourPicker } from "@/components/ui/colour-picker";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Globe, Plus, Trash2, Copy, ExternalLink, Pencil, Image, AlignLeft, Palette,
  Link2, GripVertical, ChevronUp, ChevronDown, ToggleLeft, ToggleRight,
  X, Check, ArrowLeft, Eye,
} from "lucide-react";
import { Link } from "wouter";
import {
  useListLandingPages,
  useCreateLandingPage,
  useUpdateLandingPage,
  useDeleteLandingPage,
} from "@workspace/api-client-react";
import type { LandingPageInput } from "@workspace/api-client-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface LandingPageLink {
  id: string; label: string; url: string; emoji: string; enabled: boolean;
}

export interface LandingPage {
  id: string; slug: string; title: string; subtitle: string; bio: string;
  profileImage: string;
  bgType: "color" | "gradient" | "image";
  bgColor: string; bgFrom: string; bgTo: string; bgDir: string; bgImage: string;
  btnStyle: "pill" | "rounded" | "square";
  btnVariant: "filled" | "outline" | "ghost";
  btnBg: string; btnText: string; btnBorder: string;
  textColor: string; font: string;
  links: LandingPageLink[];
  createdAt: string; updatedAt: string;
}

/* ── API converters ────────────────────────────────────────────────────── */

function apiToLocal(r: Record<string, unknown>): LandingPage {
  let links: LandingPageLink[] = [];
  try {
    links = typeof r.links === "string" ? JSON.parse(r.links as string) : Array.isArray(r.links) ? r.links as LandingPageLink[] : [];
  } catch { links = []; }
  return {
    id: String(r.id ?? ""),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    subtitle: String(r.subtitle ?? ""),
    bio: String(r.bio ?? ""),
    profileImage: String(r.profileImage ?? ""),
    bgType: (String(r.bgType ?? "gradient")) as LandingPage["bgType"],
    bgColor: String(r.bgColor ?? "#007b7d"),
    bgFrom: String(r.bgFrom ?? "#007b7d"),
    bgTo: String(r.bgTo ?? "#1a2340"),
    bgDir: String(r.bgDir ?? "to bottom"),
    bgImage: String(r.bgImage ?? ""),
    btnStyle: (String(r.btnStyle ?? "pill")) as LandingPage["btnStyle"],
    btnVariant: (String(r.btnVariant ?? "filled")) as LandingPage["btnVariant"],
    btnBg: String(r.btnBg ?? "#ffffff"),
    btnText: String(r.btnText ?? "#111827"),
    btnBorder: String(r.btnBorder ?? "#ffffff"),
    textColor: String(r.textColor ?? "#ffffff"),
    font: String(r.font ?? "Inter"),
    links,
    createdAt: String(r.createdAt ?? new Date().toISOString()),
    updatedAt: String(r.updatedAt ?? new Date().toISOString()),
  };
}

function localToApi(p: LandingPage): LandingPageInput {
  return {
    pageId: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    bio: p.bio,
    profileImage: p.profileImage,
    bgType: p.bgType,
    bgColor: p.bgColor,
    bgFrom: p.bgFrom,
    bgTo: p.bgTo,
    bgDir: p.bgDir,
    bgImage: p.bgImage,
    btnStyle: p.btnStyle,
    btnVariant: p.btnVariant,
    btnBg: p.btnBg,
    btnText: p.btnText,
    btnBorder: p.btnBorder,
    textColor: p.textColor,
    font: p.font,
    links: JSON.stringify(p.links),
  };
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    + "-" + Math.random().toString(36).slice(2, 6);
}

const DEFAULT: Omit<LandingPage, "id" | "slug" | "createdAt" | "updatedAt"> = {
  title: "My Business", subtitle: "Follow us for updates & deals", bio: "",
  profileImage: "",
  bgType: "gradient", bgColor: "#007b7d", bgFrom: "#007b7d", bgTo: "#1a2340",
  bgDir: "to bottom", bgImage: "",
  btnStyle: "pill", btnVariant: "filled",
  btnBg: "#ffffff", btnText: "#111827", btnBorder: "#ffffff",
  textColor: "#ffffff", font: "Inter", links: [],
};

/* ── Font picker ───────────────────────────────────────────────────────── */

const FONTS = ["Inter", "Roboto", "Playfair Display", "Lora", "Montserrat", "Open Sans", "Poppins", "DM Sans"];

function FontPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FONTS.map((f) => (
        <button key={f} onClick={() => onChange(f)}
          className={cn("px-2 py-1 text-xs rounded border transition-colors", value === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50")}
          style={{ fontFamily: `"${f}", sans-serif` }}>
          {f}
        </button>
      ))}
    </div>
  );
}

/* ── Landing page renderer (shared with public view) ──────────────────── */

export function LandingPageRenderer({ page, scale = 1 }: { page: LandingPage; scale?: number }) {
  const bgStyle: React.CSSProperties =
    page.bgType === "gradient"
      ? { background: `linear-gradient(${page.bgDir}, ${page.bgFrom}, ${page.bgTo})` }
      : page.bgType === "image" && page.bgImage
      ? { backgroundImage: `url(${page.bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: page.bgColor };

  const btnRadius =
    page.btnStyle === "pill" ? "9999px"
    : page.btnStyle === "rounded" ? "12px"
    : "4px";

  const btnStyle: React.CSSProperties =
    page.btnVariant === "filled"
      ? { background: page.btnBg, color: page.btnText, border: "none" }
      : page.btnVariant === "outline"
      ? { background: "transparent", color: page.btnBg, border: `2px solid ${page.btnBorder || page.btnBg}` }
      : { background: "rgba(255,255,255,0.1)", color: page.btnText, border: "none", backdropFilter: "blur(4px)" };

  return (
    <div
      className="w-full min-h-full flex flex-col items-center py-10 px-5"
      style={{ ...bgStyle, fontFamily: page.font ? `"${page.font}", sans-serif` : "inherit", color: page.textColor }}
    >
      {page.profileImage ? (
        <img src={page.profileImage} alt={page.title} className="w-20 h-20 rounded-full object-cover mb-4 ring-4 ring-white/30" />
      ) : (
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-4 text-3xl">🏪</div>
      )}
      <h1 className="text-xl font-bold text-center leading-tight" style={{ color: page.textColor }}>
        {page.title || "My Business"}
      </h1>
      {page.subtitle && (
        <p className="text-sm mt-1 text-center opacity-80" style={{ color: page.textColor }}>{page.subtitle}</p>
      )}
      {page.bio && (
        <p className="text-xs mt-2 text-center opacity-70 max-w-xs leading-relaxed" style={{ color: page.textColor }}>{page.bio}</p>
      )}
      <div className="w-full max-w-xs mt-6 space-y-3">
        {page.links.filter((l) => l.enabled).map((link) => (
          <a key={link.id} href={link.url} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 font-medium text-sm transition-opacity hover:opacity-90 active:opacity-75"
            style={{ ...btnStyle, borderRadius: btnRadius }}>
            {link.emoji && <span>{link.emoji}</span>}
            {link.label}
          </a>
        ))}
        {page.links.filter((l) => l.enabled).length === 0 && (
          <div className="text-center text-sm opacity-40 py-4">No links yet</div>
        )}
      </div>
    </div>
  );
}

/* ── Phone frame preview ───────────────────────────────────────────────── */

function PhonePreview({ page }: { page: LandingPage }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: 240, height: 480 }}>
        <div className="absolute inset-0 rounded-[2.5rem] bg-gray-900 shadow-2xl border border-gray-700/60 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 bg-gray-900 rounded-b-xl z-10" />
          <div className="absolute inset-[4px] rounded-[2rem] overflow-hidden">
            <div className="w-full h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <LandingPageRenderer page={page} />
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Mobile preview</p>
    </div>
  );
}

/* ── Link editor row ───────────────────────────────────────────────────── */

function LinkRow({ link, onUpdate, onDelete, onMove, isFirst, isLast }: {
  link: LandingPageLink; onUpdate: (patch: Partial<LandingPageLink>) => void;
  onDelete: () => void; onMove: (dir: "up" | "down") => void; isFirst: boolean; isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={cn("border rounded-lg overflow-hidden", !link.enabled && "opacity-50")}>
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Input value={link.emoji} onChange={(e) => onUpdate({ emoji: e.target.value })}
          className="w-10 h-7 text-sm text-center px-1 font-mono bg-background" placeholder="🔗" maxLength={2} />
        <span className="flex-1 text-sm font-medium truncate">{link.label || <span className="text-muted-foreground italic">Untitled link</span>}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => onMove("up")} disabled={isFirst} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onMove("down")} disabled={isLast} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onUpdate({ enabled: !link.enabled })} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            {link.enabled ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={() => setEditing((e) => !e)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            {editing ? <Check className="w-3.5 h-3.5 text-primary" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {editing && (
        <div className="px-3 pb-3 pt-2 space-y-2 bg-background border-t">
          <div className="space-y-1"><Label className="text-xs">Label</Label>
            <Input value={link.label} onChange={(e) => onUpdate({ label: e.target.value })} placeholder="e.g. Visit our website" className="h-8 text-sm" />
          </div>
          <div className="space-y-1"><Label className="text-xs">URL</Label>
            <Input value={link.url} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://" className="h-8 text-sm font-mono" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Editor panel ──────────────────────────────────────────────────────── */

function EditorPanel({ page, onChange }: { page: LandingPage; onChange: (patch: Partial<LandingPage>) => void }) {
  const [tab, setTab] = useState<"content" | "style" | "links">("content");
  const profileRef = useRef<HTMLInputElement>(null);
  const bgImageRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof LandingPage>(k: K, v: LandingPage[K]) => onChange({ [k]: v });

  const handleImageUpload = (ref: React.RefObject<HTMLInputElement | null>, field: keyof LandingPage) => {
    ref.current?.click();
    if (ref.current) {
      ref.current.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => set(field, reader.result as string);
        reader.readAsDataURL(file);
      };
    }
  };

  const addLink = () => {
    const id = Date.now().toString(36);
    set("links", [...page.links, { id, label: "", url: "", emoji: "🔗", enabled: true }]);
  };

  const updateLink = (id: string, patch: Partial<LandingPageLink>) =>
    set("links", page.links.map((l) => l.id === id ? { ...l, ...patch } : l));
  const deleteLink = (id: string) =>
    set("links", page.links.filter((l) => l.id !== id));
  const moveLink = (id: string, dir: "up" | "down") => {
    const idx = page.links.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const next = [...page.links];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    set("links", next);
  };

  const TABS = [
    { id: "content" as const, label: "Content", icon: AlignLeft },
    { id: "style"   as const, label: "Style",   icon: Palette   },
    { id: "links"   as const, label: "Links",    icon: Link2     },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b shrink-0">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {tab === "content" && (
          <>
            <div>
              <Label className="block mb-2">Profile Image</Label>
              <input ref={profileRef} type="file" accept="image/*" className="hidden" />
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-muted border-2 border-dashed border-border overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleImageUpload(profileRef, "profileImage")}>
                  {page.profileImage ? <img src={page.profileImage} alt="" className="w-full h-full object-cover" /> : <Image className="w-6 h-6 text-muted-foreground" />}
                </div>
                <div className="space-y-1">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => handleImageUpload(profileRef, "profileImage")}>
                    <Image className="w-3.5 h-3.5" /> Upload photo
                  </Button>
                  {page.profileImage && (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => set("profileImage", "")}>
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Title</Label>
              <Input value={page.title} onChange={(e) => set("title", e.target.value)} placeholder="My Business" />
            </div>
            <div className="space-y-1"><Label className="text-xs">Subtitle</Label>
              <Input value={page.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="Follow us for updates" />
            </div>
            <div className="space-y-1"><Label className="text-xs">Bio / Description</Label>
              <Textarea value={page.bio} onChange={(e) => set("bio", e.target.value)}
                placeholder="A short description of your business…" className="resize-none text-sm min-h-[80px]" />
            </div>
          </>
        )}

        {tab === "style" && (
          <>
            <div>
              <Label className="block mb-2">Background</Label>
              <div className="flex rounded-lg border overflow-hidden mb-3">
                {(["color", "gradient", "image"] as const).map((t) => (
                  <button key={t} onClick={() => set("bgType", t)}
                    className={cn("flex-1 py-1.5 text-xs font-medium capitalize transition-colors",
                      page.bgType === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                    )}>
                    {t}
                  </button>
                ))}
              </div>
              {page.bgType === "color" && <ColourPicker value={page.bgColor} onChange={(v) => set("bgColor", v)} />}
              {page.bgType === "gradient" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs mb-1 block">From</Label><ColourPicker value={page.bgFrom} onChange={(v) => set("bgFrom", v)} /></div>
                    <div><Label className="text-xs mb-1 block">To</Label><ColourPicker value={page.bgTo} onChange={(v) => set("bgTo", v)} /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Direction</Label>
                    <div className="grid grid-cols-3 gap-1">
                      {["to bottom", "to right", "135deg"].map((d) => (
                        <button key={d} onClick={() => set("bgDir", d)}
                          className={cn("py-1 text-xs rounded border transition-colors", page.bgDir === d ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted/50")}>
                          {d === "to bottom" ? "↓ Down" : d === "to right" ? "→ Right" : "↘ Diagonal"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {page.bgType === "image" && (
                <div className="space-y-2">
                  <input ref={bgImageRef} type="file" accept="image/*" className="hidden" />
                  <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={() => handleImageUpload(bgImageRef, "bgImage")}>
                    <Image className="w-3.5 h-3.5" />{page.bgImage ? "Change background image" : "Upload background image"}
                  </Button>
                  {page.bgImage && <div className="rounded-lg overflow-hidden h-24 border"><img src={page.bgImage} alt="" className="w-full h-full object-cover" /></div>}
                </div>
              )}
            </div>
            <div className="space-y-1"><Label className="text-xs">Text colour</Label><ColourPicker value={page.textColor} onChange={(v) => set("textColor", v)} /></div>
            <div className="space-y-1"><Label className="text-xs">Font</Label><FontPicker value={page.font} onChange={(v) => set("font", v)} /></div>
            <div>
              <Label className="block mb-2">Button shape</Label>
              <div className="flex gap-2">
                {(["pill", "rounded", "square"] as const).map((s) => (
                  <button key={s} onClick={() => set("btnStyle", s)}
                    className={cn("flex-1 py-1.5 text-xs font-medium border transition-colors capitalize", { pill: "rounded-full", rounded: "rounded-lg", square: "rounded-sm" }[s],
                      page.btnStyle === s ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted/50")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="block mb-2">Button style</Label>
              <div className="flex gap-2">
                {(["filled", "outline", "ghost"] as const).map((v) => (
                  <button key={v} onClick={() => set("btnVariant", v)}
                    className={cn("flex-1 py-1.5 text-xs font-medium border transition-colors capitalize rounded",
                      page.btnVariant === v ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted/50")}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Button fill</Label><ColourPicker value={page.btnBg} onChange={(v) => set("btnBg", v)} /></div>
              <div className="space-y-1"><Label className="text-xs">Button text</Label><ColourPicker value={page.btnText} onChange={(v) => set("btnText", v)} /></div>
            </div>
            {page.btnVariant === "outline" && (
              <div className="space-y-1"><Label className="text-xs">Button border</Label><ColourPicker value={page.btnBorder} onChange={(v) => set("btnBorder", v)} /></div>
            )}
          </>
        )}

        {tab === "links" && (
          <>
            <div className="space-y-2">
              {page.links.map((link, i) => (
                <LinkRow key={link.id} link={link}
                  onUpdate={(patch) => updateLink(link.id, patch)}
                  onDelete={() => deleteLink(link.id)}
                  onMove={(dir) => moveLink(link.id, dir)}
                  isFirst={i === 0} isLast={i === page.links.length - 1}
                />
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full gap-1.5" onClick={addLink}>
              <Plus className="w-4 h-4" /> Add link
            </Button>
            {page.links.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No links yet. Add links that will appear as buttons on your landing page.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Page URL helpers ──────────────────────────────────────────────────── */

function getPageUrl(slug: string): string {
  return `${window.location.origin}/p/${slug}`;
}

/* ── Pages list view ───────────────────────────────────────────────────── */

function PagesListView({ pages, onSelect, onCreate, onDelete }: {
  pages: LandingPage[]; onSelect: (id: string) => void; onCreate: () => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Globe className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Landing Pages</h1>
            <p className="text-sm text-muted-foreground">Build Linktree-style landing pages for your business. Share via a shortlink.</p>
          </div>
        </div>
        <Button onClick={onCreate} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Landing Page
        </Button>
      </div>

      {pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-4">
          <Globe className="w-16 h-16 opacity-10" />
          <div>
            <p className="font-semibold text-foreground">No landing pages yet</p>
            <p className="text-sm">Create your first mobile-ready landing page to share with customers.</p>
          </div>
          <Button onClick={onCreate} className="gap-1.5 mt-2"><Plus className="w-4 h-4" /> Create Landing Page</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pages.map((page) => (
            <Card key={page.id} className="overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group">
              <div className="h-40 relative overflow-hidden"
                style={page.bgType === "gradient" ? { background: `linear-gradient(${page.bgDir}, ${page.bgFrom}, ${page.bgTo})` } : page.bgType === "image" && page.bgImage ? { backgroundImage: `url(${page.bgImage})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: page.bgColor }}
                onClick={() => onSelect(page.id)}>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4">
                  {page.profileImage ? <img src={page.profileImage} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-white/40" /> : <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl">🏪</div>}
                  <p className="text-sm font-bold truncate max-w-full" style={{ color: page.textColor, fontFamily: page.font ? `"${page.font}", sans-serif` : "inherit" }}>{page.title}</p>
                  <p className="text-xs opacity-70 truncate max-w-full text-center" style={{ color: page.textColor }}>{page.subtitle}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1">
                    {page.links.filter((l) => l.enabled).length} link{page.links.filter((l) => l.enabled).length !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground truncate">/p/{page.slug}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(page.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(getPageUrl(page.slug)); toast.success("Link copied"); }}><Copy className="w-3 h-3" /></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); window.open(getPageUrl(page.slug), "_blank"); }}><ExternalLink className="w-3 h-3" /></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onSelect(page.id)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────── */

export default function MarketingLandingPagesPage() {
  const { data: rawPages = [], refetch } = useListLandingPages({ query: { queryKey: ["landing-pages"] } });
  const createMutation = useCreateLandingPage();
  const updateMutation = useUpdateLandingPage();
  const deleteMutation = useDeleteLandingPage();

  const serverPages: LandingPage[] = (rawPages as Record<string, unknown>[]).map(apiToLocal);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localPage, setLocalPage] = useState<LandingPage | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const pages = serverPages.map((p) => (p.id === selectedId && localPage) ? localPage : p);
  const selected = localPage && selectedId ? localPage : serverPages.find((p) => p.id === selectedId) ?? null;

  const createPage = () => {
    const slug = slugify("my-business");
    createMutation.mutate({
      data: {
        pageId: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        slug,
        title: DEFAULT.title,
        subtitle: DEFAULT.subtitle,
        bio: DEFAULT.bio,
        profileImage: DEFAULT.profileImage,
        bgType: DEFAULT.bgType,
        bgColor: DEFAULT.bgColor,
        bgFrom: DEFAULT.bgFrom,
        bgTo: DEFAULT.bgTo,
        bgDir: DEFAULT.bgDir,
        bgImage: DEFAULT.bgImage,
        btnStyle: DEFAULT.btnStyle,
        btnVariant: DEFAULT.btnVariant,
        btnBg: DEFAULT.btnBg,
        btnText: DEFAULT.btnText,
        btnBorder: DEFAULT.btnBorder,
        textColor: DEFAULT.textColor,
        font: DEFAULT.font,
        links: "[]",
      },
    }, {
      onSuccess: (res) => {
        refetch();
        const newPage = apiToLocal(res as unknown as Record<string, unknown>);
        setSelectedId(newPage.id);
        setLocalPage(newPage);
      },
      onError: () => toast.error("Failed to create landing page"),
    });
  };

  const deletePage = (id: string) => {
    deleteMutation.mutate({ id: Number(id) }, {
      onSuccess: () => {
        refetch();
        if (selectedId === id) { setSelectedId(null); setLocalPage(null); }
        toast.success("Landing page deleted");
      },
      onError: () => toast.error("Failed to delete landing page"),
    });
  };

  const handleChange = useCallback((patch: Partial<LandingPage>) => {
    if (!selectedId || !selected) return;
    const now = new Date().toISOString();
    const updated = { ...selected, ...patch, updatedAt: now };
    setLocalPage(updated);
    setSaveState("saving");
    updateMutation.mutate({
      id: Number(selectedId!),
      data: localToApi(updated),
    }, {
      onSuccess: () => { refetch(); setSaveState("saved"); setTimeout(() => setSaveState("idle"), 1500); },
      onError: () => { setSaveState("idle"); toast.error("Failed to save changes"); },
    });
  }, [selectedId, selected]);

  if (!selected) {
    return (
      <AppLayout>
        <PagesListView pages={pages} onSelect={(id) => { setSelectedId(id); setLocalPage(serverPages.find((p) => p.id === id) ?? null); }} onCreate={createPage} onDelete={deletePage} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0 flex-wrap gap-y-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { setSelectedId(null); setLocalPage(null); refetch(); }}>
            <ArrowLeft className="w-4 h-4" /> All Pages
          </Button>
          <div className="flex-1 min-w-0">
            <Input
              value={selected.title}
              onChange={(e) => handleChange({ title: e.target.value, slug: slugify(e.target.value) })}
              className="h-8 font-semibold border-transparent hover:border-border focus:border-ring bg-transparent text-sm"
              placeholder="Page title"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {saveState === "saved" && <span className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3 text-green-500" /> Saved</span>}
            {saveState === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
            <Button variant="outline" size="sm" className="gap-1.5 h-8"
              onClick={() => { navigator.clipboard.writeText(getPageUrl(selected.slug)); toast.success("Link copied"); }}>
              <Copy className="w-3.5 h-3.5" /> Copy link
            </Button>
            <Link href={`/marketing/generators/shortlinks?url=${encodeURIComponent(getPageUrl(selected.slug))}`}>
              <Button variant="outline" size="sm" className="gap-1.5 h-8">
                <Link2 className="w-3.5 h-3.5" /> Shortlink
              </Button>
            </Link>
            <Button size="sm" className="gap-1.5 h-8" onClick={() => window.open(getPageUrl(selected.slug), "_blank")}>
              <Eye className="w-3.5 h-3.5" /> Preview
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-80 shrink-0 border-r overflow-hidden flex flex-col bg-background">
            <EditorPanel page={selected} onChange={handleChange} />
          </div>
          <div className="flex-1 bg-muted/30 overflow-auto flex items-start justify-center p-8">
            <div className="flex flex-col gap-8 items-center">
              <PhonePreview page={selected} />
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">Page URL</p>
                <p className="font-mono text-sm text-primary">{getPageUrl(selected.slug)}</p>
                <p className="text-xs text-muted-foreground">Create a shortlink to share with customers.</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">{window.location.origin}/p/</span>
                <input
                  className="font-mono outline-none bg-transparent text-primary min-w-0 w-28"
                  value={selected.slug.replace(/-[a-z0-9]{4}$/, "")}
                  onChange={(e) => {
                    const base = e.target.value.replace(/[^a-z0-9-]/g, "").slice(0, 40);
                    const suffix = selected.slug.match(/-([a-z0-9]{4})$/)?.[1] ?? Math.random().toString(36).slice(2, 6);
                    handleChange({ slug: `${base}-${suffix}` });
                  }}
                />
                <span className="text-muted-foreground font-mono">-{selected.slug.match(/-([a-z0-9]{4})$/)?.[1]}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
