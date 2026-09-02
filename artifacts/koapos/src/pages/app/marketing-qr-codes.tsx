import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import QRCodeStyling, { type DotType, type CornerSquareType, type CornerDotType } from "qr-code-styling";
import {
  DEFAULT_QR_SETTINGS as DEFAULT_SETTINGS,
  QR_FRAME_TEMPLATES as TEMPLATES,
  TRACKABLE_QR_TYPES as TRACKABLE_TYPES,
  ENTITY_QR_TYPES,
  apiToQrEntry as apiToEntry,
  buildQRDataString, buildQROptions, buildFramedQrSvg, svgToImageBlob, qrEntryData,
  type QREntry, type QRCodeType, type QRSettings, type QRTypeContent,
} from "@/lib/qr-render";
import {
  QrCode, Download, Trash2, Copy, Clock, Plus, ExternalLink, Save,
  ChevronDown, ChevronUp, Globe, FileText, RefreshCcw, User, Share2,
  File, Wifi, Calendar, Mail, MessageSquare, Minimize2, LayoutTemplate,
  Lock, Grid3x3, X, Info, BookmarkPlus, Check, Rocket, Link2, Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBusinessProfile } from "@/lib/business-profile";
import { publicOrigin } from "@/lib/public-url";
import { useLandingPageNames } from "@/lib/landing-page-names";
import {
  useListQrCodes,
  useCreateQrCode,
  useDeleteQrCode,
  useGetQrSettings,
  useUpsertQrSettings,
  useListQrSavedTemplates,
  useCreateQrSavedTemplate,
  useDeleteQrSavedTemplate,
  useListLandingPages,
  useListShortlinks,
  useGetShortlinkSettings,
  useGetMerchant,
} from "@workspace/api-client-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface SavedQRTemplate {
  id: string;
  name: string;
  settings: QRSettings;
  createdAt: string;
}


/* ── Constants ─────────────────────────────────────────────────────────── */


const DARK_SWATCHES  = ["#000000", "#166534", "#1d4ed8", "#4338ca", "#7e22ce", "#be185d", "#b91c1c", "#c2410c"];
const LIGHT_SWATCHES = ["transparent", "#ffffff", "#e8e4f7", "#fde8e8", "#fef3c7", "#e9d5ff", "#dcfce7", "#bae6fd"];

const DEFAULT_FONT_STACK = "system-ui, sans-serif";

/* Resolve the merchant's brand font into a CSS font-family stack (with fallback). */
function brandFontStack(brandFont?: string): string {
  return brandFont ? `'${brandFont}', ${DEFAULT_FONT_STACK}` : DEFAULT_FONT_STACK;
}

/* Lazily pull the brand font in from Google Fonts so the preview/export render it. */
const loadedBrandFonts = new Set<string>();
function loadBrandFont(name?: string) {
  if (!name || loadedBrandFonts.has(name)) return;
  loadedBrandFonts.add(name);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

/* De-duplicate swatches while preserving order (brand colours lead the palette). */
function mergeSwatches(brand: string[], base: string[]): string[] {
  return Array.from(new Set([...brand.filter(Boolean), ...base]));
}

const DOT_STYLES: { value: DotType; label: string }[] = [
  { value: "square",         label: "Square"  },
  { value: "extra-rounded",  label: "Chunky"  },
  { value: "dots",           label: "Dots"    },
  { value: "rounded",        label: "Rounded" },
  { value: "classy",         label: "Classy"  },
  { value: "classy-rounded", label: "Mixed"   },
];

const EYE_STYLES: { csStyle: CornerSquareType; cdStyle: CornerDotType; label: string }[] = [
  { csStyle: "square",        cdStyle: "square", label: "Classic"  },
  { csStyle: "extra-rounded", cdStyle: "dot",    label: "Pill"     },
  { csStyle: "square",        cdStyle: "dot",    label: "Dot in"   },
  { csStyle: "dot",           cdStyle: "dot",    label: "All dots" },
];


const ECC_LEVELS = [
  { value: "L", label: "Low (7%)",       desc: "Fastest to scan" },
  { value: "M", label: "Medium (15%)",   desc: "Recommended"     },
  { value: "Q", label: "Quartile (25%)", desc: "Good for logos"  },
  { value: "H", label: "High (30%)",     desc: "Most resilient"  },
];

const QR_TYPES: { id: QRCodeType; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { id: "website",  label: "Website URL",    icon: Globe,          desc: "Link to any webpage"          },
  { id: "landing",  label: "Landing Page",   icon: Rocket,         desc: "Link to a landing page"       },
  { id: "shortlink",label: "Shortlink",      icon: Link2,          desc: "Link to a shortlink"          },
  { id: "static",   label: "Static",         icon: FileText,       desc: "Plain text or custom data"    },
  { id: "dynamic",  label: "Dynamic",        icon: RefreshCcw,     desc: "Editable redirect URL"        },
  { id: "vcard",    label: "vCard / meCard", icon: User,           desc: "Shareable contact card"       },
  { id: "social",   label: "Social Media",   icon: Share2,         desc: "Social profile link"          },
  { id: "document", label: "PDF / Doc",      icon: File,           desc: "Link to a file or PDF"        },
  { id: "wifi",     label: "Wi-Fi",          icon: Wifi,           desc: "Network credentials"          },
  { id: "event",    label: "Event",          icon: Calendar,       desc: "Calendar event"               },
  { id: "email",    label: "Email",          icon: Mail,           desc: "Pre-filled email"             },
  { id: "sms",      label: "SMS",            icon: MessageSquare,  desc: "Pre-filled text message"      },
  { id: "micro",    label: "Micro QR",       icon: Minimize2,      desc: "Compact format"               },
  { id: "frame",    label: "Frame QR",       icon: LayoutTemplate, desc: "With call-to-action frame"    },
  { id: "sqrc",     label: "SQRC",           icon: Lock,           desc: "Secure / encrypted format"    },
  { id: "iqr",      label: "iQR Code",       icon: Grid3x3,        desc: "Extended data density"        },
];

const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram"    },
  { value: "facebook",  label: "Facebook"     },
  { value: "x",         label: "X (Twitter)"  },
  { value: "linkedin",  label: "LinkedIn"     },
  { value: "tiktok",    label: "TikTok"       },
  { value: "youtube",   label: "YouTube"      },
  { value: "pinterest", label: "Pinterest"    },
  { value: "snapchat",  label: "Snapchat"     },
];

/* ── API converters ────────────────────────────────────────────────────── */


function apiToTemplate(r: Record<string, unknown>): SavedQRTemplate {
  let settings = { ...DEFAULT_SETTINGS };
  try { if (r.settings) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(r.settings as string) }; } catch { /* ignore */ }
  return {
    id:        String(r.id ?? ""),
    name:      String(r.name ?? ""),
    settings,
    createdAt: String(r.createdAt ?? new Date().toISOString()),
  };
}

function apiToSettings(r: Record<string, unknown>, defaults: QRSettings = DEFAULT_SETTINGS): QRSettings {
  return {
    patternColor:       String(r.patternColor       ?? defaults.patternColor),
    eyeColor:           String(r.eyeColor           ?? defaults.eyeColor),
    eyeDotColor:        String(r.eyeDotColor        ?? defaults.eyeDotColor),
    borderColor:        String(r.borderColor        ?? defaults.borderColor),
    bgColor:            String(r.bgColor            ?? defaults.bgColor),
    dotStyle:           (String(r.dotStyle          ?? defaults.dotStyle)) as QRSettings["dotStyle"],
    cornerSquareStyle:  (String(r.cornerSquareStyle ?? defaults.cornerSquareStyle)) as QRSettings["cornerSquareStyle"],
    cornerDotStyle:     (String(r.cornerDotStyle    ?? defaults.cornerDotStyle)) as QRSettings["cornerDotStyle"],
    template:           String(r.template           ?? defaults.template),
    size:               Number(r.size               ?? defaults.size),
    level:              (String(r.level             ?? defaults.level)) as QRSettings["level"],
    logoUrl:            String(r.logoUrl            ?? defaults.logoUrl),
    logoSize:           Number(r.logoSize           ?? defaults.logoSize),
    customCode:         String(r.customCode         ?? defaults.customCode),
    trackScans:         Boolean(r.trackScans        ?? defaults.trackScans),
  };
}


/* ── Template wrapper ──────────────────────────────────────────────────── */

function TemplateWrapper({
  template, bgColor, patternColor: dotColor, borderColor = "", children, scale = 1, fontFamily = DEFAULT_FONT_STACK, code = "",
}: {
  template: string; bgColor: string; patternColor: string; borderColor?: string; children: React.ReactNode; scale?: number; fontFamily?: string; code?: string;
}) {
  // Everything this wrapper draws is frame decoration — the QR dots come in as
  // `children`. So the frame uses the border colour, falling back to the pattern
  // colour when none is set.
  const patternColor = borderColor || dotColor;
  const isCircle = TEMPLATES.find((t) => t.id === template)?.circle ?? false;
  const p  = Math.round(8 * scale);
  const br = Math.round(16 * scale);
  const bw = Math.max(1, Math.round(3 * scale));
  const fs = Math.round(11 * scale);

  const inner = (
    <div style={{ borderRadius: isCircle ? "50%" : 0, overflow: isCircle ? "hidden" : undefined,
      display: "inline-block", lineHeight: 0,
      background: template === "dark-circle" ? patternColor : undefined }}>
      {template === "dark-circle"
        ? <div style={{ opacity: 0.85, lineHeight: 0 }}>{children}</div>
        : children}
    </div>
  );

  if (template === "standard")     return <div style={{ lineHeight: 0, borderRadius: br, overflow: "hidden" }}>{children}</div>;
  if (template === "border")       return <div style={{ border: `${bw}px solid ${patternColor}`, borderRadius: br, padding: p, background: bgColor === "transparent" ? "white" : bgColor, display: "inline-block", lineHeight: 0 }}>{children}</div>;
  if (template === "scan-me-dark") return (
    <div style={{ display: "inline-flex", flexDirection: "column", borderRadius: br, overflow: "hidden" }}>
      {children}
      <div style={{ background: patternColor, color: bgColor === "transparent" ? "white" : bgColor, textAlign: "center", fontSize: fs, fontWeight: 700, letterSpacing: "0.15em", padding: `${Math.round(5 * scale)}px 0`, fontFamily }}>SCAN ME ▲</div>
    </div>
  );
  if (template === "scan-me-light") return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(4 * scale), border: `${bw}px solid ${patternColor}`, borderRadius: br, padding: p, background: bgColor === "transparent" ? "white" : bgColor }}>
      <div style={{ lineHeight: 0, borderRadius: Math.round(8 * scale), overflow: "hidden" }}>{children}</div>
      <div style={{ fontSize: fs, fontWeight: 700, letterSpacing: "0.12em", color: patternColor, fontFamily }}>▲ SCAN ME</div>
    </div>
  );
  if (template === "circle")        return <div style={{ borderRadius: "50%", overflow: "hidden", lineHeight: 0 }}>{inner}</div>;
  if (template === "circle-dashed") return (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: Math.round(6 * scale), border: `${Math.max(2, Math.round(3 * scale))}px dashed ${patternColor}`, borderRadius: "50%", lineHeight: 0 }}>{inner}</div>
  );
  if (template === "circle-dots") return (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: Math.round(6 * scale), border: `${Math.max(2, Math.round(3 * scale))}px dotted ${patternColor}`, borderRadius: "50%", lineHeight: 0 }}>{inner}</div>
  );
  if (template === "dark-circle") return (
    <div style={{ background: patternColor, borderRadius: "50%", overflow: "hidden", padding: Math.round(4 * scale), lineHeight: 0, display: "inline-block" }}>
      <div style={{ borderRadius: "50%", overflow: "hidden", lineHeight: 0 }}>{children}</div>
    </div>
  );
  if (template === "circle-ring") return (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: Math.round(6 * scale), outline: `${Math.max(2, Math.round(2 * scale))}px solid ${patternColor}`, outlineOffset: Math.round(4 * scale), border: `${Math.max(2, Math.round(2 * scale))}px solid ${patternColor}`, borderRadius: "50%", lineHeight: 0 }}>{inner}</div>
  );
  if (template === "code") return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(4 * scale), border: `${bw}px solid ${patternColor}`, borderRadius: br, padding: p, background: bgColor === "transparent" ? "white" : bgColor }}>
      <div style={{ lineHeight: 0, borderRadius: Math.round(8 * scale), overflow: "hidden" }}>{children}</div>
      <div style={{ fontSize: Math.round(fs * 1.15), fontWeight: 700, letterSpacing: "0.18em", color: patternColor, fontFamily: "ui-monospace, monospace" }}>{(code || "A1B2C3D").toUpperCase()}</div>
    </div>
  );
  if (template === "scan-me-top") return (
    <div style={{ display: "inline-flex", flexDirection: "column", borderRadius: br, overflow: "hidden" }}>
      <div style={{ background: patternColor, color: bgColor === "transparent" ? "white" : bgColor, textAlign: "center", fontSize: fs, fontWeight: 700, letterSpacing: "0.15em", padding: `${Math.round(5 * scale)}px 0`, fontFamily }}>SCAN ME ▼</div>
      {children}
    </div>
  );
  if (template === "pill") return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(6 * scale) }}>
      <div style={{ lineHeight: 0, borderRadius: br, overflow: "hidden" }}>{children}</div>
      <div style={{ background: patternColor, color: bgColor === "transparent" ? "white" : bgColor, fontSize: fs, fontWeight: 700, letterSpacing: "0.1em", padding: `${Math.round(4 * scale)}px ${Math.round(12 * scale)}px`, borderRadius: 999, fontFamily }}>SCAN ME</div>
    </div>
  );
  if (template === "card") return (
    <div style={{ borderRadius: br, padding: Math.round(12 * scale), background: bgColor === "transparent" ? "white" : bgColor, boxShadow: `0 ${Math.round(3 * scale)}px ${Math.round(12 * scale)}px rgba(0,0,0,0.18)`, display: "inline-block", lineHeight: 0 }}>
      <div style={{ lineHeight: 0, borderRadius: Math.round(8 * scale), overflow: "hidden" }}>{children}</div>
    </div>
  );
  if (template === "bold-card") return (
    <div style={{ background: patternColor, borderRadius: br, padding: Math.round(8 * scale), display: "inline-block", lineHeight: 0 }}>
      <div style={{ background: bgColor === "transparent" ? "white" : bgColor, borderRadius: Math.round(10 * scale), padding: Math.round(6 * scale), lineHeight: 0 }}>
        <div style={{ lineHeight: 0, borderRadius: Math.round(6 * scale), overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
  if (template === "square-ring") return (
    <div style={{ display: "inline-block", padding: Math.round(6 * scale), border: `${Math.max(2, Math.round(2 * scale))}px solid ${patternColor}`, outline: `${Math.max(2, Math.round(2 * scale))}px solid ${patternColor}`, outlineOffset: Math.round(4 * scale), borderRadius: Math.round(6 * scale), lineHeight: 0 }}>{children}</div>
  );
  if (template === "square-dashed") return (
    <div style={{ display: "inline-block", padding: Math.round(6 * scale), border: `${Math.max(2, Math.round(3 * scale))}px dashed ${patternColor}`, borderRadius: Math.round(8 * scale), lineHeight: 0 }}>{children}</div>
  );
  if (template === "square-dots") return (
    <div style={{ display: "inline-block", padding: Math.round(6 * scale), border: `${Math.max(2, Math.round(3 * scale))}px dotted ${patternColor}`, borderRadius: Math.round(8 * scale), lineHeight: 0 }}>{children}</div>
  );
  if (template === "corner-ticks") {
    const tick = Math.round(16 * scale), tb = Math.max(2, Math.round(3 * scale)), pd = Math.round(8 * scale);
    return (
      <div style={{ position: "relative", display: "inline-block", padding: pd, lineHeight: 0 }}>
        {children}
        <span style={{ position: "absolute", top: 0, left: 0, width: tick, height: tick, borderTop: `${tb}px solid ${patternColor}`, borderLeft: `${tb}px solid ${patternColor}` }} />
        <span style={{ position: "absolute", top: 0, right: 0, width: tick, height: tick, borderTop: `${tb}px solid ${patternColor}`, borderRight: `${tb}px solid ${patternColor}` }} />
        <span style={{ position: "absolute", bottom: 0, left: 0, width: tick, height: tick, borderBottom: `${tb}px solid ${patternColor}`, borderLeft: `${tb}px solid ${patternColor}` }} />
        <span style={{ position: "absolute", bottom: 0, right: 0, width: tick, height: tick, borderBottom: `${tb}px solid ${patternColor}`, borderRight: `${tb}px solid ${patternColor}` }} />
      </div>
    );
  }
  return <div style={{ lineHeight: 0 }}>{children}</div>;
}

/* ── Colour swatch row ─────────────────────────────────────────────────── */

function ColourRow({ label, value, swatches, onChange, onCopy, copyLabel }: {
  label: string; value: string; swatches: string[];
  onChange: (v: string) => void; onCopy?: () => void; copyLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{label}</Label>
        {onCopy && (
          <button onClick={onCopy} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <Copy className="w-3 h-3" />{copyLabel ?? "Copy pattern color"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {swatches.map((s) => (
          <button key={s} title={s} onClick={() => onChange(s)}
            className={cn("w-6 h-6 rounded border-2 transition-all shrink-0", value === s ? "border-primary scale-110 shadow-sm" : "border-border hover:border-primary/50 hover:scale-105")}
            style={s === "transparent" ? { background: "linear-gradient(135deg,white 45%,#e5e7eb 45%,#e5e7eb 55%,white 55%)", backgroundSize: "8px 8px" } : { background: s }}
          />
        ))}
        <div className="flex items-center gap-1 ml-auto">
          {value !== "transparent" && (
            <input type="color" value={value === "transparent" ? "#ffffff" : value}
              onChange={(e) => onChange(e.target.value)} className="w-6 h-6 rounded border cursor-pointer p-0.5 shrink-0" />
          )}
          <Input value={value} onChange={(e) => onChange(e.target.value)} className="w-24 h-7 font-mono text-xs px-2" placeholder="#000000" />
        </div>
      </div>
    </div>
  );
}

/* ── Dot style icons ───────────────────────────────────────────────────── */

function DotIcon({ style }: { style: DotType }) {
  const positions = [0,1,2,3].flatMap((r) => [0,1,2,3].map((c) => ({ r, c })));
  const gap = 7.5;
  const shape = (x: number, y: number) => {
    const s = 5;
    if (style === "dots")           return <circle cx={x+s/2} cy={y+s/2} r={s/2} />;
    if (style === "rounded")        return <rect x={x} y={y} width={s} height={s} rx={1.5} />;
    if (style === "extra-rounded")  return <rect x={x} y={y} width={s} height={s} rx={2.5} />;
    if (style === "classy")         return <rect x={x} y={y} width={s} height={4} rx={0} />;
    if (style === "classy-rounded") return <rect x={x} y={y} width={s} height={4} rx={1.5} />;
    return <rect x={x} y={y} width={s} height={s} rx={0} />;
  };
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" fill="currentColor">
      {positions.map(({ r, c }) => <g key={`${r}-${c}`}>{shape(c*gap+1, r*gap+1)}</g>)}
    </svg>
  );
}

/* ── Eye style icons ───────────────────────────────────────────────────── */

function EyeIcon({ csStyle, cdStyle }: { csStyle: CornerSquareType; cdStyle: CornerDotType }) {
  const outerR = csStyle === "extra-rounded" ? 5 : csStyle === "dot" ? 10 : 1;
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" fill="currentColor">
      <rect x={2} y={2} width={28} height={28} rx={outerR} fillOpacity={0} stroke="currentColor" strokeWidth={3} />
      <rect x={8} y={8} width={16} height={16} rx={outerR > 2 ? outerR-1 : 0} fillOpacity={0} stroke="currentColor" strokeWidth={2} />
      {cdStyle === "dot" ? <circle cx={16} cy={16} r={5} /> : <rect x={11} y={11} width={10} height={10} rx={0} />}
    </svg>
  );
}

/* ── Live QR preview ───────────────────────────────────────────────────── */

/* Module-level cache of rendered QR SVG markup, keyed by the *resolved QR
   options* (not the settings). The page mounts many <StyledQR> at once — one per
   built-in template, saved template and history entry. The built-in template
   swatches all encode the same sample data with the same colours/pattern; only
   the frame differs, and the frame is applied by <TemplateWrapper> *outside* the
   QR. So the underlying QR is identical across all square frames (and again
   across all circle frames), yet without dedup we ran qr-code-styling's matrix +
   SVG build ~9 times on load, blocking the main thread and making the page slow
   to appear. Keying on the options collapses those to one render the rest reuse
   via innerHTML. Skipped when a logo is set: qr-code-styling loads the logo image
   asynchronously, so the markup isn't complete synchronously after append(). */
const qrSvgCache = new Map<string, string>();
const QR_CACHE_LIMIT = 300;

function StyledQR({ settings, data, size }: { settings: QRSettings; data: string; size: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const opts = useMemo(() => buildQROptions(settings, data, size), [settings, data, size]);
  const cacheKey = useMemo(() => JSON.stringify(opts), [opts]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Cache hit — reuse the rendered markup, skipping QR computation entirely.
    const cached = qrSvgCache.get(cacheKey);
    if (cached !== undefined) {
      container.innerHTML = cached;
      return;
    }

    // Miss — render once with qr-code-styling, then memoise the markup. The QR has no
    // embedded image, so append() builds the complete SVG synchronously and the
    // innerHTML read below always captures the final markup.
    container.innerHTML = "";
    new QRCodeStyling(opts).append(container);
    const markup = container.innerHTML;
    if (markup) {
      if (qrSvgCache.size >= QR_CACHE_LIMIT) qrSvgCache.clear();
      qrSvgCache.set(cacheKey, markup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    return () => { if (containerRef.current) containerRef.current.innerHTML = ""; };
  }, []);

  // Returns ONLY the imperatively-managed container — no React-managed siblings. The
  // container's children are owned by qr-code-styling (via innerHTML/append) and torn
  // down by the cleanup above; mixing a React sibling (e.g. a logo overlay) alongside
  // it here makes React's unmount-time removeChild collide with that imperative DOM
  // ("node to be removed is not a child") when a saved-code thumbnail is deleted. The
  // centre logo is shown in the live preview and exports instead — it isn't legible at
  // these 52–72px thumbnail sizes anyway.
  return <div ref={containerRef} style={{ lineHeight: 0, display: "inline-block" }} />;
}

/* ── Template mini preview ─────────────────────────────────────────────── */

function TemplateMini({ template, settings, data, selected, onClick, fontFamily }: {
  template: typeof TEMPLATES[number]; settings: QRSettings; data: string; selected: boolean; onClick: () => void; fontFamily?: string;
}) {
  const previewSettings = { ...settings, template: template.id };
  return (
    <button type="button" onClick={onClick}
      className={cn("flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all shrink-0",
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/40")}
      style={{ width: 100 }}>
      <div className="flex items-center justify-center w-full h-[88px] overflow-hidden">
        <TemplateWrapper template={template.id} bgColor={settings.bgColor} patternColor={settings.patternColor} borderColor={settings.borderColor} scale={0.6} fontFamily={fontFamily} code={settings.customCode}>
          <StyledQR settings={previewSettings} data={data || "https://koapos.com"} size={72} />
        </TemplateWrapper>
      </div>
      <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">{template.label}</span>
    </button>
  );
}

/* ── QR Content Editor (type-specific fields) ──────────────────────────── */

function SpecialtyNote({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="text-xs"><p className="font-semibold">{title}</p><p className="opacity-80 mt-0.5">{desc}</p></div>
    </div>
  );
}

interface LinkOption { id: string; label: string; url: string; }

function QRContentEditor({ type, content, onChange, landingPages = [], shortlinks = [] }: {
  type: QRCodeType; content: QRTypeContent; onChange: (c: QRTypeContent) => void;
  landingPages?: LinkOption[]; shortlinks?: LinkOption[];
}) {
  const set = <K extends keyof QRTypeContent>(k: K, v: QRTypeContent[K]) => onChange({ ...content, [k]: v });

  if (type === "website" || type === "document") {
    return (
      <div className="space-y-1.5">
        <Label>{type === "document" ? "Document / File URL" : "URL"}</Label>
        <Input
          placeholder={type === "document" ? "https://example.com/brochure.pdf" : "https://yourwebsite.com"}
          value={content.url ?? "https://"}
          onChange={(e) => set("url", e.target.value)}
          className="font-mono text-sm"
        />
      </div>
    );
  }

  if (type === "frame") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>URL</Label>
          <Input placeholder="https://yourwebsite.com" value={content.url ?? "https://"}
            onChange={(e) => set("url", e.target.value)} className="font-mono text-sm" />
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Info className="w-3 h-3 shrink-0" /> Select a Scan Me template below to add a frame with a call-to-action.
        </p>
      </div>
    );
  }

  if (type === "landing") {
    return (
      <div className="space-y-2">
        {landingPages.length === 0 ? (
          <SpecialtyNote title="No landing pages yet" desc="Create one under Marketing → Landing Pages, then return here to generate its QR code." />
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">Choose a landing page</Label>
            <Select value={content.landingId ?? ""} onValueChange={(v) => {
              const p = landingPages.find((x) => x.id === v);
              onChange({ ...content, landingId: v, url: p?.url ?? "" });
            }}>
              <SelectTrigger><SelectValue placeholder="Select a landing page…" /></SelectTrigger>
              <SelectContent>
                {landingPages.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {content.url && <p className="text-[11px] text-muted-foreground font-mono break-all">{content.url}</p>}
      </div>
    );
  }

  if (type === "shortlink") {
    return (
      <div className="space-y-2">
        {shortlinks.length === 0 ? (
          <SpecialtyNote title="No shortlinks yet" desc="Create one under Marketing → Shortlinks, then return here to generate its QR code." />
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">Choose a shortlink</Label>
            <Select value={content.shortlinkId ?? ""} onValueChange={(v) => {
              const s = shortlinks.find((x) => x.id === v);
              onChange({ ...content, shortlinkId: v, url: s?.url ?? "" });
            }}>
              <SelectTrigger><SelectValue placeholder="Select a shortlink…" /></SelectTrigger>
              <SelectContent>
                {shortlinks.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {content.url && <p className="text-[11px] text-muted-foreground font-mono break-all">{content.url}</p>}
      </div>
    );
  }

  if (type === "static") {
    return (
      <div className="space-y-1.5">
        <Label>Text / Data</Label>
        <Textarea placeholder="Any text, number, or custom data to encode…"
          value={content.text ?? ""} onChange={(e) => set("text", e.target.value)}
          className="min-h-[80px] font-mono text-sm resize-none" />
      </div>
    );
  }

  if (type === "dynamic") {
    return (
      <div className="space-y-3">
        <div className="flex gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs"><strong>Dynamic QR codes</strong> encode a redirect URL so the destination can be changed later without reprinting. A redirect/shortlink service is required.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Redirect / Short URL</Label>
          <Input placeholder="https://short.ly/abc123" value={content.url ?? "https://"}
            onChange={(e) => set("url", e.target.value)} className="font-mono text-sm" />
        </div>
      </div>
    );
  }

  if (type === "vcard") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
          <Input placeholder="Jane Smith" value={content.vcName ?? ""} onChange={(e) => set("vcName", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Organisation</Label>
          <Input placeholder="ACME Co." value={content.vcOrg ?? ""} onChange={(e) => set("vcOrg", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input placeholder="+61 400 000 000" value={content.vcPhone ?? ""} onChange={(e) => set("vcPhone", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input type="email" placeholder="jane@example.com" value={content.vcEmail ?? ""} onChange={(e) => set("vcEmail", e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Website</Label>
          <Input placeholder="https://example.com" value={content.vcUrl ?? ""} onChange={(e) => set("vcUrl", e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Address</Label>
          <Input placeholder="123 Main St, Sydney NSW 2000" value={content.vcAddress ?? ""} onChange={(e) => set("vcAddress", e.target.value)} />
        </div>
      </div>
    );
  }

  if (type === "social") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Platform</Label>
          <Select value={content.socialPlatform ?? "instagram"} onValueChange={(v) => set("socialPlatform", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOCIAL_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Username / Handle</Label>
          <Input placeholder="@yourusername" value={content.socialHandle ?? ""} onChange={(e) => set("socialHandle", e.target.value)} />
        </div>
      </div>
    );
  }

  if (type === "wifi") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Network Name (SSID) <span className="text-destructive">*</span></Label>
          <Input placeholder="MyNetwork" value={content.wifiSsid ?? ""} onChange={(e) => set("wifiSsid", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Password</Label>
          <Input type="password" placeholder="••••••••" value={content.wifiPass ?? ""} onChange={(e) => set("wifiPass", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Security Type</Label>
          <Select value={content.wifiSec ?? "WPA"} onValueChange={(v) => set("wifiSec", v as "WPA" | "WEP" | "nopass")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WPA">WPA / WPA2</SelectItem>
              <SelectItem value="WEP">WEP</SelectItem>
              <SelectItem value="nopass">No Password (Open)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (type === "event") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Event Name <span className="text-destructive">*</span></Label>
          <Input placeholder="Annual Sale 2026" value={content.evTitle ?? ""} onChange={(e) => set("evTitle", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Start</Label>
            <Input type="datetime-local" value={content.evStart ?? ""} onChange={(e) => set("evStart", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">End</Label>
            <Input type="datetime-local" value={content.evEnd ?? ""} onChange={(e) => set("evEnd", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Location</Label>
          <Input placeholder="123 Main St, Sydney" value={content.evLocation ?? ""} onChange={(e) => set("evLocation", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea placeholder="Event details…" value={content.evDesc ?? ""} onChange={(e) => set("evDesc", e.target.value)} className="min-h-[60px] resize-none text-sm" />
        </div>
      </div>
    );
  }

  if (type === "email") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">To <span className="text-destructive">*</span></Label>
          <Input type="email" placeholder="recipient@example.com" value={content.emailTo ?? ""} onChange={(e) => set("emailTo", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Subject</Label>
          <Input placeholder="Hi there" value={content.emailSubject ?? ""} onChange={(e) => set("emailSubject", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Message</Label>
          <Textarea placeholder="Pre-filled message body…" value={content.emailBody ?? ""} onChange={(e) => set("emailBody", e.target.value)} className="min-h-[70px] resize-none text-sm" />
        </div>
      </div>
    );
  }

  if (type === "sms") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Phone Number <span className="text-destructive">*</span></Label>
          <Input placeholder="+61 400 000 000" value={content.smsTo ?? ""} onChange={(e) => set("smsTo", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Message</Label>
          <Textarea placeholder="Pre-filled message…" value={content.smsMsg ?? ""} onChange={(e) => set("smsMsg", e.target.value)} className="min-h-[70px] resize-none text-sm" />
        </div>
      </div>
    );
  }

  if (type === "micro") {
    return (
      <div className="space-y-3">
        <SpecialtyNote title="Micro QR Code" desc="A miniaturised QR variant for very small surfaces (max ~35 chars). This preview shows a standard QR — use a dedicated Micro QR generator for production printing." />
        <div className="space-y-1.5">
          <Label className="text-xs">Content <span className="text-muted-foreground">(keep short)</span></Label>
          <Input placeholder="Short URL or text (max ~35 chars)" value={content.text ?? ""} onChange={(e) => set("text", e.target.value)} />
        </div>
      </div>
    );
  }

  if (type === "sqrc") {
    return (
      <div className="space-y-3">
        <SpecialtyNote title="SQRC — Secure QR Code" desc="A proprietary Denso Wave format with encrypted private data. The preview uses a standard QR code — hardware-based SQRC encoding is required for the real secure format." />
        <div className="space-y-1.5">
          <Label>Content</Label>
          <Textarea placeholder="Text or data to encode…" value={content.text ?? ""} onChange={(e) => set("text", e.target.value)} className="min-h-[70px] resize-none text-sm" />
        </div>
      </div>
    );
  }

  if (type === "iqr") {
    return (
      <div className="space-y-3">
        <SpecialtyNote title="iQR Code" desc="An extended Denso Wave format that supports rectangular shapes and higher data density. The preview uses a standard square QR — a dedicated iQR generator is required for production." />
        <div className="space-y-1.5">
          <Label>Content</Label>
          <Textarea placeholder="Text or URL to encode…" value={content.text ?? ""} onChange={(e) => set("text", e.target.value)} className="min-h-[70px] resize-none text-sm" />
        </div>
      </div>
    );
  }

  return null;
}

/* ── Main page ─────────────────────────────────────────────────────────── */

export default function MarketingQRCodesPage() {
  const { data: codesResponse,     refetch: refetchCodes }     = useListQrCodes({ query: { queryKey: ["qr-codes"] } });
  const { data: rawSettings, isFetched: settingsFetched }       = useGetQrSettings({ query: { queryKey: ["qr-settings"] } });
  const { data: templatesResponse, refetch: refetchTemplates }  = useListQrSavedTemplates({ query: { queryKey: ["qr-saved-templates"] } });

  // Landing pages & shortlinks the merchant has already created — selectable as QR targets.
  const { data: landingResponse }   = useListLandingPages({ query: { queryKey: ["landing-pages"] } });
  const landingNames                 = useLandingPageNames();
  const { data: shortlinksResponse } = useListShortlinks({ query: { queryKey: ["shortlinks"] } });
  const { data: merchant }           = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { data: shortlinkSettings }  = useGetShortlinkSettings({ query: { queryKey: ["shortlink-settings"] } });

  // Brand colours & font from Management > Settings & Integrations > Business Details
  const { profile, isLoading: profileLoading } = useBusinessProfile();

  // Brand-aware default QR settings: primary brand colour drives the QR, the
  // lightest brand background drives the canvas. These seed the colour pickers.
  const brandDefaults = useMemo<QRSettings>(() => {
    const primary = profile.brandColors?.[0];
    const bg      = profile.bgColors?.[0];
    return {
      ...DEFAULT_SETTINGS,
      patternColor: primary || DEFAULT_SETTINGS.patternColor,
      eyeColor:     primary || DEFAULT_SETTINGS.eyeColor,
      eyeDotColor:  primary || DEFAULT_SETTINGS.eyeDotColor,
      bgColor:      bg      || DEFAULT_SETTINGS.bgColor,
    };
  }, [profile.brandColors, profile.bgColors]);

  // Surface brand colours as the leading swatches in each picker.
  const darkSwatches  = useMemo(() => mergeSwatches(profile.brandColors ?? [], DARK_SWATCHES),  [profile.brandColors]);
  const lightSwatches = useMemo(() => mergeSwatches(profile.bgColors    ?? [], LIGHT_SWATCHES), [profile.bgColors]);

  const brandFontFamily = useMemo(() => brandFontStack(profile.brandFont), [profile.brandFont]);
  useEffect(() => { loadBrandFont(profile.brandFont); }, [profile.brandFont]);

  const createCode     = useCreateQrCode();
  const deleteCode     = useDeleteQrCode();
  const upsertSettings = useUpsertQrSettings();
  const createTemplate = useCreateQrSavedTemplate();
  const deleteTemplate = useDeleteQrSavedTemplate();

  // The /qr-codes endpoint is shared: it also returns the auto-generated QR codes
  // for products, customers and services (tagged with those qrType values by
  // services/entityQr.ts). Those belong to their own pages — the generator's
  // "Saved QR Codes" list must show only codes created here, so exclude entity
  // types. An exclusion list (rather than an allow-list) keeps new generator types
  // working without changes here.
  const history:        QREntry[]          = ((codesResponse?.items     ?? []) as unknown as Record<string, unknown>[])
    .map(apiToEntry)
    .filter((e) => !ENTITY_QR_TYPES.has(e.qrType ?? "website"));
  const savedTemplates: SavedQRTemplate[]  = ((templatesResponse?.items ?? []) as unknown as Record<string, unknown>[]).map(apiToTemplate);

  // Resolve the merchant's landing pages and shortlinks into selectable QR targets.
  const landingOptions = useMemo<LinkOption[]>(() => {
    const username = String((merchant as Record<string, unknown> | undefined)?.username ?? "").toLowerCase();
    return ((landingResponse?.items ?? []) as unknown as Record<string, unknown>[])
      // Templates are reusable styles, not live pages — they can't be a QR target.
      .filter((p) => String(p.isTemplate ?? "false") !== "true")
      .map((p) => {
        const slug = String(p.slug ?? "");
        const id = String(p.id ?? slug);
        // Prefer the page's internal Name (admin-side label); fall back to the
        // public title, then the slug.
        return {
          id,
          label: String(landingNames[id] || p.title || slug || "Untitled page"),
          url:   `${publicOrigin()}/b/${username || "your-username"}/l/${slug}`,
        };
      });
  }, [landingResponse, merchant, landingNames]);

  const shortlinkOptions = useMemo<LinkOption[]>(() => {
    const sl = shortlinkSettings as Record<string, unknown> | undefined;
    const fallbackBase = `${String(sl?.baseDomain ?? "go.koapos.com")}/${String(sl?.prefix ?? "s")}`;
    return ((shortlinksResponse?.items ?? []) as unknown as Record<string, unknown>[]).map((s) => {
      const slug = String(s.slug ?? s.linkId ?? "");
      const base = String(s.baseDomain ?? fallbackBase);
      return {
        id:    String(s.linkId ?? s.id ?? slug),
        label: String(s.label || s.longUrl || slug || "Shortlink"),
        url:   `https://${base}/${slug}`,
      };
    });
  }, [shortlinksResponse, shortlinkSettings]);

  const [qrType,       setQrType]       = useState<QRCodeType>("website");
  const [content,      setContent]      = useState<QRTypeContent>({ url: "https://" });
  const [label,        setLabel]        = useState("");
  const [settings,     setSettings]     = useState<QRSettings>({ ...DEFAULT_SETTINGS });
  const [preview,      setPreview]      = useState<QREntry | null>(null);
  const [advanced,     setAdvanced]     = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName,   setTemplateName]   = useState("");
  const [historySearch,  setHistorySearch]  = useState("");

  // Saved QR Codes list: custom-made (Static / custom-data) codes float to the
  // top, then newest-first within each group, filtered by the search box.
  const displayedHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const filtered = q
      ? history.filter((e) =>
          e.label.toLowerCase().includes(q) ||
          e.url.toLowerCase().includes(q) ||
          (QR_TYPES.find((t) => t.id === (e.qrType ?? "website"))?.label.toLowerCase().includes(q) ?? false))
      : history;
    const isCustom = (e: QREntry) => (e.qrType ?? "website") === "static";
    return [...filtered].sort((a, b) => {
      if (isCustom(a) !== isCustom(b)) return isCustom(a) ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [history, historySearch]);

  /* Lazy-render the saved list: show 10, then 10 more each time the sentinel
     scrolls into view. Reset whenever the filtered set changes. */
  const HISTORY_PAGE = 10;
  const [historyVisible, setHistoryVisible] = useState(HISTORY_PAGE);
  useEffect(() => { setHistoryVisible(HISTORY_PAGE); }, [historySearch, history.length]);
  const historyHasMore = historyVisible < displayedHistory.length;
  const historySentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = historySentinelRef.current;
    if (!el || !historyHasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setHistoryVisible((c) => c + HISTORY_PAGE);
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [historyHasMore, historyVisible]);

  const liveQrRef        = useRef<QRCodeStyling | null>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const templateNameRef  = useRef<HTMLInputElement>(null);
  const saveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate settings once both the saved QR settings and the business profile
  // have loaded: saved values win, otherwise the brand colours/font defaults apply.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !settingsFetched || profileLoading) return;
    hydratedRef.current = true;
    setSettings(apiToSettings((rawSettings ?? {}) as unknown as Record<string, unknown>, brandDefaults));
  }, [settingsFetched, profileLoading, rawSettings, brandDefaults]);

  // Debounce settings save to API
  const scheduleSettingsSave = useCallback((next: QRSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      upsertSettings.mutate({ data: { ...next } }, {
        onError: () => toast.error("Failed to save settings"),
      });
    }, 600);
  }, [upsertSettings]);

  const set = <K extends keyof QRSettings>(k: K, v: QRSettings[K]) => {
    setSettings((s) => {
      const next = { ...s, [k]: v };
      scheduleSettingsSave(next);
      return next;
    });
  };

  const qrData = useMemo(() => buildQRDataString(qrType, content), [qrType, content]);

  // Dynamic ("trackable") QR: when enabled for a URL-type QR, the *encoded* data
  // becomes a redirect through /api/qr/r/:id so each scan is logged. The id only
  // exists after the QR is saved, so we encode the real destination until then.
  const canTrack = TRACKABLE_TYPES.has(qrType);
  const [trackedId, setTrackedId] = useState<number | null>(null);
  const trackedUrl = trackedId != null ? `${publicOrigin()}/api/qr/r/${trackedId}` : null;
  const isTracking = settings.trackScans && canTrack;
  const effectiveData = isTracking && trackedUrl ? trackedUrl : qrData;
  const needsSaveForTracking = isTracking && !trackedId;
  // A saved tracked QR is tied to its destination; if that (or the toggle)
  // changes, the saved id no longer matches — drop it so the user re-saves.
  useEffect(() => { setTrackedId(null); }, [qrData, qrType, settings.trackScans]);

  const hasValidContent = useMemo(() => {
    if (qrType === "website" || qrType === "dynamic" || qrType === "document" || qrType === "frame") {
      return (content.url ?? "").trim().length > 5;
    }
    if (qrType === "landing")   return !!(content.landingId && (content.url ?? "").trim());
    if (qrType === "shortlink") return !!(content.shortlinkId && (content.url ?? "").trim());
    if (qrType === "vcard")  return !!(content.vcName?.trim());
    if (qrType === "wifi")   return !!(content.wifiSsid?.trim());
    if (qrType === "event")  return !!(content.evTitle?.trim());
    if (qrType === "email")  return !!(content.emailTo?.trim());
    if (qrType === "sms")    return !!(content.smsTo?.trim());
    if (qrType === "social") return !!(content.socialHandle?.trim());
    return (content.text ?? "").trim().length > 0;
  }, [qrType, content]);

  const activeEntry = preview ?? (history[0] ?? null);

  /* Save to history via API */
  const saveToHistory = useCallback(() => {
    if (!hasValidContent) { toast.error("Enter valid content first"); return; }
    createCode.mutate({
      data: {
        entryId:  `qr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label:    label.trim() || qrData.slice(0, 50),
        url:      qrData,
        qrType,
        content:  JSON.stringify(content),
        settings: JSON.stringify(settings),
      },
    }, {
      onSuccess: (res) => {
        refetchCodes();
        const newEntry = apiToEntry(res as unknown as Record<string, unknown>);
        setPreview(newEntry);
        if (settings.trackScans && canTrack && Number.isFinite(Number(newEntry.id))) {
          setTrackedId(Number(newEntry.id));
          toast.success("Tracked QR ready — download it now to capture scans");
        } else {
          toast.success("QR code saved");
        }
      },
      onError: () => toast.error("Failed to save QR code"),
    });
  }, [qrData, label, settings, hasValidContent, qrType, content, createCode, refetchCodes, canTrack]);

  /* Download helpers — export the framed SVG so the file matches the preview. */
  const downloadFile = useCallback((blob: Blob, name: string, ext: string) => {
    // The anchor must be in the DOM for click() to trigger a download in Firefox,
    // and the object URL must stay alive until the download starts — revoking it
    // synchronously after click() aborts the download in Chrome/Safari, which is
    // why downloads were silently failing. Defer cleanup to a later tick.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_") || "qrcode"}.${ext}`;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
    toast.success("Downloaded");
  }, []);

  const downloadFramed = useCallback(async (s: QRSettings, data: string, name: string, format: "png" | "svg") => {
    try {
      const { svg, width, height } = await buildFramedQrSvg(s, data, s.size);
      const blob = await svgToImageBlob(svg, format, width, height);
      downloadFile(blob, name, format);
    } catch (err) {
      console.error("QR download failed", err);
      toast.error("Download failed");
    }
  }, [downloadFile]);

  const downloadLive = useCallback((format: "png" | "svg" = "png") =>
    downloadFramed(settings, effectiveData || "https://koapos.com", label || "qrcode", format),
    [settings, effectiveData, label, downloadFramed]);

  // Tracked entries encode the redirect (/api/qr/r/:id), so re-downloads from
  // history stay trackable — see qrEntryData.
  const downloadEntry = useCallback((entry: QREntry, format: "png" | "svg" = "png") =>
    downloadFramed(entry.settings, qrEntryData(entry), entry.label || "qrcode", format),
    [downloadFramed]);

  const deleteEntry = (id: string) => {
    deleteCode.mutate({ id: Number(id) }, {
      onSuccess: () => {
        refetchCodes();
        if (preview?.id === id) setPreview(null);
        toast.success("Deleted");
      },
      onError: () => toast.error("Failed to delete"),
    });
  };

  /* Template save / delete */
  const confirmSaveTemplate = useCallback(() => {
    const name = templateName.trim() || `Style ${savedTemplates.length + 1}`;
    createTemplate.mutate({
      data: { templateId: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, settings: JSON.stringify(settings) },
    }, {
      onSuccess: () => {
        refetchTemplates();
        setTemplateName("");
        setSavingTemplate(false);
        toast.success(`Template "${name}" saved`);
      },
      onError: () => toast.error("Failed to save template"),
    });
  }, [templateName, settings, savedTemplates.length, createTemplate, refetchTemplates]);

  const handleDeleteTemplate = (id: string) => {
    deleteTemplate.mutate({ id: Number(id) }, {
      onSuccess: () => { refetchTemplates(); toast.success("Template removed"); },
      onError: () => toast.error("Failed to remove template"),
    });
  };

  const applyTemplate = (t: SavedQRTemplate) => {
    setSettings(t.settings);
    scheduleSettingsSave(t.settings);
    toast.success(`Applied "${t.name}"`);
  };

  const copyUrl = (u: string) =>
    navigator.clipboard.writeText(u).then(() => toast.success("Copied")).catch(() => toast.error("Copy failed"));

  /* Live preview — gated on a stable signature so it only re-renders when the
     QR actually changes, not on every parent render (e.g. as queries resolve). */
  const liveSig = JSON.stringify({ settings, effectiveData });
  useEffect(() => {
    const opts = buildQROptions(settings, effectiveData || "https://koapos.com", Math.min(settings.size, 240));
    if (!liveQrRef.current) {
      liveQrRef.current = new QRCodeStyling(opts);
      if (liveContainerRef.current) { liveContainerRef.current.innerHTML = ""; liveQrRef.current.append(liveContainerRef.current); }
    } else {
      liveQrRef.current.update(opts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSig]);

  const previewSize = Math.min(settings.size, 240);
  const activeTypeMeta = QR_TYPES.find((t) => t.id === qrType);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <QrCode className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">QR Code Generator</h1>
            <p className="text-sm text-muted-foreground">Custom QR codes with 14 types, patterns, colours, and templates.</p>
          </div>
        </div>

        {/* ── Content + Live Preview side by side ── */}
        {/* items-stretch keeps both columns the same height, so the Content card
            grows to match the Live Preview column dynamically. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

          {/* ── Content ── */}
          <div className="space-y-4 flex flex-col">

            {/* QR Type + Content */}
            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {activeTypeMeta && <activeTypeMeta.icon className="w-4 h-4" />}
                  Content
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex-1">

                {/* Type selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">QR Code Type</Label>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
                    {QR_TYPES.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button key={t.id} type="button" onClick={() => setQrType(t.id)} title={t.desc}
                          className={cn(
                            "flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all",
                            qrType === t.id
                              ? "border-primary bg-primary/5 text-primary shadow-sm"
                              : "pill-selector border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40"
                          )}>
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-[9px] font-medium leading-tight text-center">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <QRContentEditor type={qrType} content={content} onChange={setContent}
                    landingPages={landingOptions} shortlinks={shortlinkOptions} />
                </div>

                {/* Label */}
                <div className="space-y-1.5">
                  <Label>Label <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Input placeholder="e.g. Summer Sale 2026" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>

                {/* Colours */}
                <div className="space-y-4 border-t pt-4">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Colours</Label>
                  <ColourRow label="Pattern color" value={settings.patternColor} swatches={darkSwatches} onChange={(v) => set("patternColor", v)} />
                  <ColourRow label="Eye color" value={settings.eyeColor} swatches={darkSwatches} onChange={(v) => set("eyeColor", v)}
                    onCopy={() => set("eyeColor", settings.patternColor)} copyLabel="Copy pattern color" />
                  <ColourRow label="Eye dot color" value={settings.eyeDotColor} swatches={darkSwatches} onChange={(v) => set("eyeDotColor", v)}
                    onCopy={() => set("eyeDotColor", settings.patternColor)} copyLabel="Copy pattern color" />
                  {!["standard", "circle"].includes(settings.template) && (
                    <ColourRow label="Border color" value={settings.borderColor || settings.patternColor} swatches={darkSwatches}
                      onChange={(v) => set("borderColor", v)}
                      onCopy={() => set("borderColor", "")} copyLabel="Match pattern color" />
                  )}
                  <ColourRow label="Background color" value={settings.bgColor} swatches={lightSwatches} onChange={(v) => set("bgColor", v)} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Live Preview (beside Content) ── */}
          <div className="md:sticky md:top-4 space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Live Preview</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center gap-4 py-2">
                  <TemplateWrapper template={settings.template} bgColor={settings.bgColor} patternColor={settings.patternColor} borderColor={settings.borderColor} fontFamily={brandFontFamily} code={settings.customCode}>
                    <div ref={liveContainerRef} style={{ lineHeight: 0, display: "inline-block", width: previewSize, height: previewSize }} />
                  </TemplateWrapper>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-medium">{label || <span className="text-muted-foreground italic">No label</span>}</p>
                    <p className="text-[10px] text-muted-foreground break-all max-w-[260px] line-clamp-2">{qrData}</p>
                    <div className="flex flex-wrap gap-1 justify-center">
                      <Badge variant="secondary" className="text-[10px]">{activeTypeMeta?.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">ECC {settings.level} · {settings.size}px</Badge>
                      {isTracking && trackedId && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">Tracked</Badge>}
                    </div>
                  </div>
                </div>

                {/* Track scans (dynamic QR) — only for URL-type QR codes. */}
                {canTrack && (
                  <label className="flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                    <input type="checkbox" checked={settings.trackScans} onChange={(e) => set("trackScans", e.target.checked)} className="mt-0.5 accent-primary" />
                    <div className="text-xs">
                      <p className="font-medium">Track scans (dynamic QR)</p>
                      <p className="text-muted-foreground">
                        Each scan's device &amp; location is recorded in Analytics.
                        {needsSaveForTracking && <span className="text-amber-600"> Save to generate the tracked code, then download.</span>}
                      </p>
                    </div>
                  </label>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-1.5" disabled={!hasValidContent || needsSaveForTracking}
                        title={needsSaveForTracking ? "Save first to download the tracked QR" : undefined}>
                        <Download className="w-4 h-4" /> Download <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => downloadLive("png")}>
                        <File className="w-3.5 h-3.5 mr-2" /> PNG image
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadLive("svg")}>
                        <FileText className="w-3.5 h-3.5 mr-2" /> SVG vector
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button className="gap-1.5" onClick={saveToHistory} disabled={!hasValidContent || createCode.isPending}>
                    <Save className="w-4 h-4" /> Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            {activeEntry && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selected</p>
                  <p className="text-sm font-medium truncate">{activeEntry.label}</p>
                  <p className="text-[10px] text-muted-foreground break-all line-clamp-2">{activeEntry.url}</p>
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs flex-1" onClick={() => downloadEntry(activeEntry)}>
                      <Download className="w-3 h-3" /> PNG
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs flex-1" onClick={() => copyUrl(activeEntry.url)}>
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 text-xs p-0" onClick={() => window.open(activeEntry.url, "_blank")}>
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ── Styling controls ── */}
        <div className="space-y-4">

          {/* Template — full-width so its frames wrap into ~two rows instead of a
              single horizontally-scrolling strip. */}
          <div className="grid grid-cols-1 gap-4 items-start">
            {/* Templates */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Template</CardTitle>
                  {!savingTemplate ? (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                      onClick={() => { setSavingTemplate(true); setTimeout(() => templateNameRef.current?.focus(), 50); }}>
                      <BookmarkPlus className="w-3.5 h-3.5" /> Save current style
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Input
                        ref={templateNameRef}
                        placeholder="Template name…"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmSaveTemplate();
                          if (e.key === "Escape") { setSavingTemplate(false); setTemplateName(""); }
                        }}
                        className="h-7 text-xs w-36"
                      />
                      <Button type="button" size="sm" className="h-7 w-7 p-0" onClick={confirmSaveTemplate}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground"
                        onClick={() => { setSavingTemplate(false); setTemplateName(""); }}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Custom code — only relevant to the "Code" template. */}
                {settings.template === "code" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Custom code <span className="text-muted-foreground font-normal">(7 letters/numbers)</span></Label>
                    <Input
                      value={settings.customCode}
                      maxLength={7}
                      onChange={(e) => set("customCode", e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 7))}
                      placeholder="A1B2C3D"
                      className="font-mono tracking-widest uppercase w-44"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <p className="text-[10px] text-muted-foreground">Shown beneath the QR as a manual fallback code customers can type.</p>
                  </div>
                )}

                {/* Saved templates row */}
                {savedTemplates.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Saved styles</p>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                      {savedTemplates.map((tmpl) => (
                        <div key={tmpl.id} className="relative shrink-0 group">
                          <button type="button" onClick={() => applyTemplate(tmpl)}
                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/40 transition-all"
                            style={{ width: 100 }}>
                            <div className="flex items-center justify-center w-full h-[88px] overflow-hidden">
                              <TemplateWrapper
                                template={tmpl.settings.template}
                                bgColor={tmpl.settings.bgColor}
                                patternColor={tmpl.settings.patternColor}
                                borderColor={tmpl.settings.borderColor}
                                scale={0.6}
                                code={tmpl.settings.customCode}
                              >
                                <StyledQR settings={tmpl.settings} data={qrData || "https://koapos.com"} size={72} />
                              </TemplateWrapper>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap overflow-hidden max-w-full text-ellipsis px-1">
                              {tmpl.name}
                            </span>
                          </button>
                          <button type="button" title="Remove template"
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tmpl.id); }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="border-t mt-3 mb-1" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2 mt-3">Built-in frames</p>
                  </div>
                )}

                {/* Built-in templates. These are style swatches, so they use a
                    fixed sample string — keeping the live destination out of them
                    means typing the content doesn't re-render all of them. */}
                {/* Wrap into rows instead of a single horizontally-scrolling strip
                    so every frame is visible at once (≈ two rows on a wide card). */}
                <div className="flex flex-wrap gap-3 pb-1">
                  {TEMPLATES.map((t) => (
                    <TemplateMini key={t.id} template={t} settings={settings} data="https://koapos.com"
                      selected={settings.template === t.id} onClick={() => set("template", t.id)} fontFamily={brandFontFamily} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pattern + Eye Style side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* Pattern */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Pattern</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {DOT_STYLES.map((s) => (
                    <button key={s.value} type="button" onClick={() => set("dotStyle", s.value)}
                      className={cn("flex flex-col items-center gap-1.5 py-2 px-1 rounded-lg border-2 transition-all",
                        settings.dotStyle === s.value
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "pill-selector border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40")}>
                      <DotIcon style={s.value} />
                      <span className="text-[10px] font-medium">{s.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Eye style */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Eye Style</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {EYE_STYLES.map((s) => (
                    <button key={`${s.csStyle}-${s.cdStyle}`} type="button"
                      onClick={() => { set("cornerSquareStyle", s.csStyle); set("cornerDotStyle", s.cdStyle); }}
                      className={cn("flex flex-col items-center gap-1.5 py-2 px-1 rounded-lg border-2 transition-all",
                        settings.cornerSquareStyle === s.csStyle && settings.cornerDotStyle === s.cdStyle
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "pill-selector border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40")}>
                      <EyeIcon csStyle={s.csStyle} cdStyle={s.cdStyle} />
                      <span className="text-[10px] font-medium">{s.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

            {/* Advanced */}
            <Card>
              <button type="button" className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold"
                onClick={() => setAdvanced((a) => !a)}>
                Advanced
                {advanced ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {advanced && (
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Size (px)</Label>
                      <Select value={settings.size.toString()} onValueChange={(v) => set("size", parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[128, 192, 256, 320, 400, 512].map((s) => (
                            <SelectItem key={s} value={s.toString()}>{s} × {s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Error Correction</Label>
                      <Select value={settings.level} onValueChange={(v) => set("level", v as QRSettings["level"])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ECC_LEVELS.map((l) => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
        </div>

        {/* ── History ── */}
        {history.length > 0 && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Saved QR Codes</h2>
                <Badge variant="secondary" className="text-xs">{history.length}</Badge>
              </div>
              <div className="relative sm:ml-auto w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search saved QR codes…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
            {displayedHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No saved QR codes match “{historySearch}”.</p>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayedHistory.slice(0, historyVisible).map((entry) => {
                const typeMeta = QR_TYPES.find((t) => t.id === (entry.qrType ?? "website"));
                return (
                  <Card key={entry.id}
                    className={cn("cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm",
                      activeEntry?.id === entry.id && "border-primary ring-1 ring-primary/30")}
                    onClick={() => {
                      setPreview(entry);
                      setQrType(entry.qrType ?? "website");
                      setContent(entry.content ?? { url: entry.url });
                      setLabel(entry.label);
                      setSettings(entry.settings);
                    }}>
                    <CardContent className="p-3 flex items-start gap-3">
                      <div className="shrink-0 rounded overflow-hidden border flex items-center justify-center bg-white" style={{ width: 52, height: 52 }}>
                        <TemplateWrapper template={entry.settings.template} bgColor={entry.settings.bgColor} patternColor={entry.settings.patternColor} borderColor={entry.settings.borderColor} scale={0.35} code={entry.settings.customCode}>
                          <StyledQR settings={entry.settings} data={entry.url} size={52} />
                        </TemplateWrapper>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          {typeMeta && <typeMeta.icon className="w-3 h-3 text-muted-foreground shrink-0" />}
                          <p className="text-xs font-medium truncate">{entry.label}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{entry.url}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(entry.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <div className="flex gap-1 mt-1.5">
                          <button onClick={(e) => { e.stopPropagation(); downloadEntry(entry); }}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5" title="Download PNG">
                            <Download className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); copyUrl(entry.url); }}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5" title="Copy data">
                            <Copy className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); window.open(entry.url, "_blank"); }}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5" title="Open URL">
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                            className="text-muted-foreground hover:text-destructive transition-colors p-0.5 ml-auto" title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            )}
            {historyHasMore && (
              <div ref={historySentinelRef} className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                Loading more… ({historyVisible} of {displayedHistory.length})
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
