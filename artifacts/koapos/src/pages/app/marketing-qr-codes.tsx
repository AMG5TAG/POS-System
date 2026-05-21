import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import QRCodeStyling, { type Options as QROptions, type DotType, type CornerSquareType, type CornerDotType } from "qr-code-styling";
import {
  QrCode, Download, Trash2, Copy, Clock, Plus, ExternalLink, Save,
  ChevronDown, ChevronUp, Globe, FileText, RefreshCcw, User, Share2,
  File, Wifi, Calendar, Mail, MessageSquare, Minimize2, LayoutTemplate,
  Lock, Grid3x3, Upload, X, Info, BookmarkPlus, Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface SavedQRTemplate {
  id: string;
  name: string;
  settings: QRSettings;
  createdAt: string;
}

interface QRSettings {
  patternColor: string;
  eyeColor: string;
  eyeDotColor: string;
  bgColor: string;
  dotStyle: DotType;
  cornerSquareStyle: CornerSquareType;
  cornerDotStyle: CornerDotType;
  template: string;
  size: number;
  level: "L" | "M" | "Q" | "H";
  logoUrl: string;
}

type QRCodeType =
  | "website" | "static" | "dynamic" | "vcard" | "social" | "document"
  | "wifi" | "event" | "email" | "sms" | "micro" | "frame" | "sqrc" | "iqr";

interface QRTypeContent {
  url?: string;
  text?: string;
  vcName?: string; vcPhone?: string; vcEmail?: string; vcOrg?: string; vcUrl?: string; vcAddress?: string;
  socialPlatform?: string; socialHandle?: string;
  wifiSsid?: string; wifiPass?: string; wifiSec?: "WPA" | "WEP" | "nopass";
  evTitle?: string; evStart?: string; evEnd?: string; evLocation?: string; evDesc?: string;
  emailTo?: string; emailSubject?: string; emailBody?: string;
  smsTo?: string; smsMsg?: string;
}

interface QREntry {
  id: string;
  label: string;
  url: string;
  qrType?: QRCodeType;
  content?: QRTypeContent;
  createdAt: string;
  settings: QRSettings;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const HISTORY_KEY    = "koapos_qr_history";
const SETTINGS_KEY   = "koapos_qr_settings";
const SAVED_TMPL_KEY = "koapos_qr_saved_templates";

const DEFAULT_SETTINGS: QRSettings = {
  patternColor: "#000000",
  eyeColor: "#000000",
  eyeDotColor: "#000000",
  bgColor: "#ffffff",
  dotStyle: "square",
  cornerSquareStyle: "square",
  cornerDotStyle: "square",
  template: "standard",
  size: 256,
  level: "M",
  logoUrl: "",
};

const DARK_SWATCHES  = ["#000000", "#166534", "#1d4ed8", "#4338ca", "#7e22ce", "#be185d", "#b91c1c", "#c2410c"];
const LIGHT_SWATCHES = ["transparent", "#ffffff", "#e8e4f7", "#fde8e8", "#fef3c7", "#e9d5ff", "#dcfce7", "#bae6fd"];

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

const TEMPLATES = [
  { id: "standard",      label: "Standard",     circle: false },
  { id: "border",        label: "Framed",        circle: false },
  { id: "scan-me-dark",  label: "Scan Me",       circle: false },
  { id: "scan-me-light", label: "Scan Me Light", circle: false },
  { id: "circle",        label: "Circle",        circle: true  },
  { id: "circle-dashed", label: "Dashed Ring",   circle: true  },
  { id: "circle-dots",   label: "Dotted Ring",   circle: true  },
  { id: "dark-circle",   label: "Dark Circle",   circle: true  },
  { id: "circle-ring",   label: "Double Ring",   circle: true  },
];

const ECC_LEVELS = [
  { value: "L", label: "Low (7%)",       desc: "Fastest to scan" },
  { value: "M", label: "Medium (15%)",   desc: "Recommended"     },
  { value: "Q", label: "Quartile (25%)", desc: "Good for logos"  },
  { value: "H", label: "High (30%)",     desc: "Most resilient"  },
];

const QR_TYPES: { id: QRCodeType; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { id: "website",  label: "Website URL",   icon: Globe,          desc: "Link to any webpage"          },
  { id: "static",   label: "Static",        icon: FileText,       desc: "Plain text or custom data"    },
  { id: "dynamic",  label: "Dynamic",       icon: RefreshCcw,     desc: "Editable redirect URL"        },
  { id: "vcard",    label: "vCard / meCard",icon: User,           desc: "Shareable contact card"       },
  { id: "social",   label: "Social Media",  icon: Share2,         desc: "Social profile link"          },
  { id: "document", label: "PDF / Doc",     icon: File,           desc: "Link to a file or PDF"        },
  { id: "wifi",     label: "Wi-Fi",         icon: Wifi,           desc: "Network credentials"          },
  { id: "event",    label: "Event",         icon: Calendar,       desc: "Calendar event"               },
  { id: "email",    label: "Email",         icon: Mail,           desc: "Pre-filled email"             },
  { id: "sms",      label: "SMS",           icon: MessageSquare,  desc: "Pre-filled text message"      },
  { id: "micro",    label: "Micro QR",      icon: Minimize2,      desc: "Compact format"               },
  { id: "frame",    label: "Frame QR",      icon: LayoutTemplate, desc: "With call-to-action frame"    },
  { id: "sqrc",     label: "SQRC",          icon: Lock,           desc: "Secure / encrypted format"    },
  { id: "iqr",      label: "iQR Code",      icon: Grid3x3,        desc: "Extended data density"        },
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

/* ── Storage helpers ───────────────────────────────────────────────────── */

function loadHistory(): QREntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}
function saveHistory(h: QREntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50))); } catch { /* ignore */ }
}
function loadStoredSettings(): QRSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<QRSettings>;
    return { ...DEFAULT_SETTINGS, ...s };
  } catch { return DEFAULT_SETTINGS; }
}
function loadSavedTemplates(): SavedQRTemplate[] {
  try { return JSON.parse(localStorage.getItem(SAVED_TMPL_KEY) ?? "[]"); } catch { return []; }
}
function saveSavedTemplates(t: SavedQRTemplate[]) {
  try { localStorage.setItem(SAVED_TMPL_KEY, JSON.stringify(t.slice(0, 30))); } catch { /* ignore */ }
}

/* ── QR data string builder ────────────────────────────────────────────── */

function buildQRDataString(type: QRCodeType, content: QRTypeContent): string {
  switch (type) {
    case "website":
    case "document":
    case "frame":
    case "dynamic":
      return (content.url ?? "").trim() || "https://koapos.com";

    case "static":
    case "micro":
    case "sqrc":
    case "iqr":
      return (content.text ?? "").trim() || "Hello";

    case "vcard": {
      const lines = ["BEGIN:VCARD", "VERSION:3.0"];
      if (content.vcName)    lines.push(`FN:${content.vcName}`);
      if (content.vcPhone)   lines.push(`TEL;TYPE=CELL:${content.vcPhone}`);
      if (content.vcEmail)   lines.push(`EMAIL:${content.vcEmail}`);
      if (content.vcOrg)     lines.push(`ORG:${content.vcOrg}`);
      if (content.vcUrl)     lines.push(`URL:${content.vcUrl}`);
      if (content.vcAddress) lines.push(`ADR:;;${content.vcAddress};;;;`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }

    case "social": {
      const handle = (content.socialHandle ?? "").replace(/^@/, "");
      const platform = content.socialPlatform ?? "instagram";
      const urls: Record<string, string> = {
        instagram: `https://instagram.com/${handle}`,
        facebook:  `https://facebook.com/${handle}`,
        x:         `https://x.com/${handle}`,
        linkedin:  `https://linkedin.com/in/${handle}`,
        tiktok:    `https://tiktok.com/@${handle}`,
        youtube:   `https://youtube.com/@${handle}`,
        pinterest: `https://pinterest.com/${handle}`,
        snapchat:  `https://snapchat.com/add/${handle}`,
      };
      return urls[platform] ?? `https://${platform}.com/${handle}`;
    }

    case "wifi": {
      const sec  = content.wifiSec  ?? "WPA";
      const ssid = content.wifiSsid ?? "";
      const pass = content.wifiPass ?? "";
      return `WIFI:T:${sec};S:${ssid};P:${pass};;`;
    }

    case "event": {
      const fmt = (d: string) => d ? d.replace(/[-T:]/g, "").slice(0, 15) : "";
      const lines = ["BEGIN:VEVENT"];
      if (content.evTitle)    lines.push(`SUMMARY:${content.evTitle}`);
      if (content.evStart)    lines.push(`DTSTART:${fmt(content.evStart)}`);
      if (content.evEnd)      lines.push(`DTEND:${fmt(content.evEnd)}`);
      if (content.evLocation) lines.push(`LOCATION:${content.evLocation}`);
      if (content.evDesc)     lines.push(`DESCRIPTION:${content.evDesc}`);
      lines.push("END:VEVENT");
      return lines.join("\n");
    }

    case "email":
      return `mailto:${content.emailTo ?? ""}?subject=${encodeURIComponent(content.emailSubject ?? "")}&body=${encodeURIComponent(content.emailBody ?? "")}`;

    case "sms":
      return `SMSTO:${content.smsTo ?? ""}:${content.smsMsg ?? ""}`;

    default:
      return "https://koapos.com";
  }
}

/* ── QR options builder ────────────────────────────────────────────────── */

function buildQROptions(settings: QRSettings, data: string, size: number): QROptions {
  const isCircleTemplate = TEMPLATES.find((t) => t.id === settings.template)?.circle ?? false;
  return {
    type: "svg",
    data: data || "https://koapos.com",
    width: size,
    height: size,
    shape: isCircleTemplate ? "circle" : "square",
    dotsOptions: { type: settings.dotStyle, color: settings.patternColor },
    cornersSquareOptions: { type: settings.cornerSquareStyle, color: settings.eyeColor },
    cornersDotOptions: { type: settings.cornerDotStyle, color: settings.eyeDotColor },
    backgroundOptions: { color: settings.bgColor === "transparent" ? "rgba(0,0,0,0)" : settings.bgColor },
    ...(settings.logoUrl ? {
      image: settings.logoUrl,
      imageOptions: { crossOrigin: "anonymous", hideBackgroundDots: true, imageSize: 0.35, margin: 4 },
    } : {}),
    qrOptions: { errorCorrectionLevel: settings.level },
  };
}

/* ── Template wrapper ──────────────────────────────────────────────────── */

function TemplateWrapper({
  template, bgColor, patternColor, children, scale = 1,
}: {
  template: string; bgColor: string; patternColor: string; children: React.ReactNode; scale?: number;
}) {
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
      <div style={{ background: patternColor, color: bgColor === "transparent" ? "white" : bgColor, textAlign: "center", fontSize: fs, fontWeight: 700, letterSpacing: "0.15em", padding: `${Math.round(5 * scale)}px 0`, fontFamily: "system-ui, sans-serif" }}>SCAN ME ▲</div>
    </div>
  );
  if (template === "scan-me-light") return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(4 * scale), border: `${bw}px solid ${patternColor}`, borderRadius: br, padding: p, background: bgColor === "transparent" ? "white" : bgColor }}>
      <div style={{ lineHeight: 0, borderRadius: Math.round(8 * scale), overflow: "hidden" }}>{children}</div>
      <div style={{ fontSize: fs, fontWeight: 700, letterSpacing: "0.12em", color: patternColor, fontFamily: "system-ui, sans-serif" }}>▲ SCAN ME</div>
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

function StyledQR({ settings, data, size }: { settings: QRSettings; data: string; size: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    const opts = buildQROptions(settings, data, size);
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling(opts);
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        qrRef.current.append(containerRef.current);
      }
    } else {
      qrRef.current.update(opts);
    }
  });

  useEffect(() => {
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      qrRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ lineHeight: 0, display: "inline-block" }} />;
}

/* ── Template mini preview ─────────────────────────────────────────────── */

function TemplateMini({ template, settings, data, selected, onClick }: {
  template: typeof TEMPLATES[number]; settings: QRSettings; data: string; selected: boolean; onClick: () => void;
}) {
  const previewSettings = { ...settings, template: template.id };
  return (
    <button type="button" onClick={onClick}
      className={cn("flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all shrink-0",
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/40")}
      style={{ width: 100 }}>
      <div className="flex items-center justify-center w-full h-[88px] overflow-hidden">
        <TemplateWrapper template={template.id} bgColor={settings.bgColor} patternColor={settings.patternColor} scale={0.6}>
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

function QRContentEditor({ type, content, onChange }: {
  type: QRCodeType; content: QRTypeContent; onChange: (c: QRTypeContent) => void;
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
  const [qrType,         setQrType]         = useState<QRCodeType>("website");
  const [content,        setContent]        = useState<QRTypeContent>({ url: "https://" });
  const [label,          setLabel]          = useState("");
  const [settings,       setSettings]       = useState<QRSettings>(loadStoredSettings);
  const [history,        setHistory]        = useState<QREntry[]>(loadHistory);
  const [preview,        setPreview]        = useState<QREntry | null>(null);
  const [advanced,       setAdvanced]       = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedQRTemplate[]>(loadSavedTemplates);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName,   setTemplateName]   = useState("");

  const liveQrRef        = useRef<QRCodeStyling | null>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const logoFileRef      = useRef<HTMLInputElement>(null);
  const templateNameRef  = useRef<HTMLInputElement>(null);

  const set = <K extends keyof QRSettings>(k: K, v: QRSettings[K]) => {
    setSettings((s) => {
      const next = { ...s, [k]: v };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const qrData = useMemo(() => buildQRDataString(qrType, content), [qrType, content]);

  const hasValidContent = useMemo(() => {
    if (qrType === "website" || qrType === "dynamic" || qrType === "document" || qrType === "frame") {
      return (content.url ?? "").trim().length > 5;
    }
    if (qrType === "vcard")  return !!(content.vcName?.trim());
    if (qrType === "wifi")   return !!(content.wifiSsid?.trim());
    if (qrType === "event")  return !!(content.evTitle?.trim());
    if (qrType === "email")  return !!(content.emailTo?.trim());
    if (qrType === "sms")    return !!(content.smsTo?.trim());
    if (qrType === "social") return !!(content.socialHandle?.trim());
    return (content.text ?? "").trim().length > 0;
  }, [qrType, content]);

  const activeEntry = preview ?? (history[0] ?? null);

  /* Logo upload */
  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      set("logoUrl", dataUrl);
      if (settings.level === "L" || settings.level === "M") set("level", "Q");
      toast.success("Logo uploaded");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [settings.level]);

  /* Save to history */
  const saveToHistory = useCallback(() => {
    if (!hasValidContent) { toast.error("Enter valid content first"); return; }
    const entry: QREntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label: label.trim() || qrData.slice(0, 50),
      url: qrData,
      qrType,
      content: { ...content },
      createdAt: new Date().toISOString(),
      settings: { ...settings },
    };
    const next = [entry, ...history];
    setHistory(next);
    saveHistory(next);
    setPreview(entry);
    toast.success("QR code saved");
  }, [qrData, label, settings, history, hasValidContent, qrType, content]);

  /* Download helpers */
  const downloadBlob = useCallback((blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Downloaded");
  }, []);

  const downloadLive = useCallback(async () => {
    const qr = new QRCodeStyling(buildQROptions(settings, qrData || "https://koapos.com", settings.size));
    const raw = await qr.getRawData("png");
    if (!raw) { toast.error("Download failed"); return; }
    downloadBlob(raw as Blob, label || "qrcode");
  }, [settings, qrData, label, downloadBlob]);

  const downloadEntry = useCallback(async (entry: QREntry) => {
    const qr = new QRCodeStyling(buildQROptions(entry.settings, entry.url, entry.settings.size));
    const raw = await qr.getRawData("png");
    if (!raw) { toast.error("Download failed"); return; }
    downloadBlob(raw as Blob, entry.label || "qrcode");
  }, [downloadBlob]);

  const deleteEntry = (id: string) => {
    const next = history.filter((e) => e.id !== id);
    setHistory(next);
    saveHistory(next);
    if (preview?.id === id) setPreview(null);
    toast.success("Deleted");
  };

  /* Template save / delete */
  const confirmSaveTemplate = useCallback(() => {
    const name = templateName.trim() || `Style ${savedTemplates.length + 1}`;
    const entry: SavedQRTemplate = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name,
      settings: { ...settings },
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...savedTemplates];
    setSavedTemplates(next);
    saveSavedTemplates(next);
    setTemplateName("");
    setSavingTemplate(false);
    toast.success(`Template "${name}" saved`);
  }, [templateName, settings, savedTemplates]);

  const deleteTemplate = (id: string) => {
    const next = savedTemplates.filter((t) => t.id !== id);
    setSavedTemplates(next);
    saveSavedTemplates(next);
    toast.success("Template removed");
  };

  const applyTemplate = (t: SavedQRTemplate) => {
    setSettings(t.settings);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(t.settings)); } catch { /* ignore */ }
    toast.success(`Applied "${t.name}"`);
  };

  const copyUrl = (u: string) =>
    navigator.clipboard.writeText(u).then(() => toast.success("Copied")).catch(() => toast.error("Copy failed"));

  /* Live preview */
  useEffect(() => {
    const opts = buildQROptions(settings, qrData || "https://koapos.com", Math.min(settings.size, 240));
    if (!liveQrRef.current) {
      liveQrRef.current = new QRCodeStyling(opts);
      if (liveContainerRef.current) { liveContainerRef.current.innerHTML = ""; liveQrRef.current.append(liveContainerRef.current); }
    } else {
      liveQrRef.current.update(opts);
    }
  });

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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

          {/* ── Left: Config ── */}
          <div className="space-y-4">

            {/* QR Type + Content */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {activeTypeMeta && <activeTypeMeta.icon className="w-4 h-4" />}
                  Content
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Type selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">QR Code Type</Label>
                  <div className="grid grid-cols-7 gap-1">
                    {QR_TYPES.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button key={t.id} type="button" onClick={() => setQrType(t.id)} title={t.desc}
                          className={cn(
                            "flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all",
                            qrType === t.id
                              ? "border-primary bg-primary/5 text-primary shadow-sm"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40"
                          )}>
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-[9px] font-medium leading-tight text-center">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <QRContentEditor type={qrType} content={content} onChange={setContent} />
                </div>

                {/* Label */}
                <div className="space-y-1.5">
                  <Label>Label <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Input placeholder="e.g. Summer Sale 2026" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Colors */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Colours</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ColourRow label="Pattern color" value={settings.patternColor} swatches={DARK_SWATCHES} onChange={(v) => set("patternColor", v)} />
                <ColourRow label="Eye color" value={settings.eyeColor} swatches={DARK_SWATCHES} onChange={(v) => set("eyeColor", v)}
                  onCopy={() => set("eyeColor", settings.patternColor)} copyLabel="Copy pattern color" />
                <ColourRow label="Eye dot color" value={settings.eyeDotColor} swatches={DARK_SWATCHES} onChange={(v) => set("eyeDotColor", v)}
                  onCopy={() => set("eyeDotColor", settings.patternColor)} copyLabel="Copy pattern color" />
                <ColourRow label="Background color" value={settings.bgColor} swatches={LIGHT_SWATCHES} onChange={(v) => set("bgColor", v)} />
              </CardContent>
            </Card>

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
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40")}>
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
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40")}>
                      <EyeIcon csStyle={s.csStyle} cdStyle={s.cdStyle} />
                      <span className="text-[10px] font-medium">{s.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Templates */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Template</CardTitle>
                  {!savingTemplate ? (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                      onClick={() => {
                        setSavingTemplate(true);
                        setTimeout(() => templateNameRef.current?.focus(), 50);
                      }}>
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

                {/* Saved templates row */}
                {savedTemplates.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Saved styles</p>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                      {savedTemplates.map((tmpl) => (
                        <div key={tmpl.id} className="relative shrink-0 group">
                          <button
                            type="button"
                            onClick={() => applyTemplate(tmpl)}
                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/40 transition-all"
                            style={{ width: 100 }}
                          >
                            <div className="flex items-center justify-center w-full h-[88px] overflow-hidden">
                              <TemplateWrapper
                                template={tmpl.settings.template}
                                bgColor={tmpl.settings.bgColor}
                                patternColor={tmpl.settings.patternColor}
                                scale={0.6}
                              >
                                <StyledQR settings={tmpl.settings} data={qrData || "https://koapos.com"} size={72} />
                              </TemplateWrapper>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap overflow-hidden max-w-full text-ellipsis px-1">
                              {tmpl.name}
                            </span>
                          </button>
                          <button
                            type="button"
                            title="Remove template"
                            onClick={(e) => { e.stopPropagation(); deleteTemplate(tmpl.id); }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="border-t mt-3 mb-1" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2 mt-3">Built-in frames</p>
                  </div>
                )}

                {/* Built-in templates */}
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
                  {TEMPLATES.map((t) => (
                    <TemplateMini key={t.id} template={t} settings={settings} data={qrData || "https://koapos.com"}
                      selected={settings.template === t.id} onClick={() => set("template", t.id)} />
                  ))}
                </div>
              </CardContent>
            </Card>

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

                  {/* Logo upload */}
                  <div className="space-y-2">
                    <Label className="text-xs">Centre Logo <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0"
                        onClick={() => logoFileRef.current?.click()}>
                        <Upload className="w-3.5 h-3.5" /> Upload image
                      </Button>
                      <Input placeholder="…or paste image URL" value={settings.logoUrl.startsWith("data:") ? "" : settings.logoUrl}
                        onChange={(e) => set("logoUrl", e.target.value)}
                        className="font-mono text-xs flex-1 min-w-0" />
                      {settings.logoUrl && (
                        <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2 text-muted-foreground"
                          onClick={() => set("logoUrl", "")}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    {settings.logoUrl && (
                      <div className="flex items-center gap-2.5 mt-1 p-2 rounded-lg bg-muted/40 border">
                        <img src={settings.logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded border bg-white" />
                        <p className="text-[10px] text-muted-foreground">
                          Logo active · {settings.level === "L" || settings.level === "M"
                            ? <span className="text-amber-600">Switch to ECC Q or H for best results</span>
                            : "ECC level is good"}
                        </p>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">Use Error Correction Q or H when adding a logo.</p>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {/* ── Right: Live Preview ── */}
          <div className="lg:sticky lg:top-4 space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Live Preview</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center gap-4 py-2">
                  <TemplateWrapper template={settings.template} bgColor={settings.bgColor} patternColor={settings.patternColor}>
                    <div ref={liveContainerRef} style={{ lineHeight: 0, display: "inline-block", width: previewSize, height: previewSize }} />
                  </TemplateWrapper>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-medium">{label || <span className="text-muted-foreground italic">No label</span>}</p>
                    <p className="text-[10px] text-muted-foreground break-all max-w-[260px] line-clamp-2">{qrData}</p>
                    <div className="flex flex-wrap gap-1 justify-center">
                      <Badge variant="secondary" className="text-[10px]">{activeTypeMeta?.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">ECC {settings.level} · {settings.size}px</Badge>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-1.5" onClick={downloadLive} disabled={!hasValidContent}>
                    <Download className="w-4 h-4" /> Download
                  </Button>
                  <Button className="gap-1.5" onClick={saveToHistory} disabled={!hasValidContent}>
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

        {/* ── History ── */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Saved QR Codes</h2>
              <Badge variant="secondary" className="text-xs">{history.length}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {history.map((entry) => {
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
                        <TemplateWrapper template={entry.settings.template} bgColor={entry.settings.bgColor} patternColor={entry.settings.patternColor} scale={0.35}>
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
          </div>
        )}
      </div>
    </AppLayout>
  );
}
