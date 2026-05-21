import { useState, useRef, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeCanvas } from "qrcode.react";
import QRCodeStyling, { type Options as QROptions, type DotType, type CornerSquareType, type CornerDotType } from "qr-code-styling";
import { QrCode, Download, Trash2, Copy, Settings2, Clock, Plus, ExternalLink, Save, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

/* ── Types ─────────────────────────────────────────────────────────────── */

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

interface QREntry {
  id: string;
  label: string;
  url: string;
  createdAt: string;
  settings: QRSettings;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const HISTORY_KEY  = "koapos_qr_history";
const SETTINGS_KEY = "koapos_qr_settings";

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
  { value: "square",         label: "Square"   },
  { value: "extra-rounded",  label: "Chunky"   },
  { value: "dots",           label: "Dots"     },
  { value: "rounded",        label: "Rounded"  },
  { value: "classy",         label: "Classy"   },
  { value: "classy-rounded", label: "Mixed"    },
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
  { value: "L", label: "Low (7%)",      desc: "Fastest to scan"  },
  { value: "M", label: "Medium (15%)",  desc: "Recommended"      },
  { value: "Q", label: "Quartile (25%)", desc: "Good for logos"  },
  { value: "H", label: "High (30%)",    desc: "Most resilient"   },
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

/* ── QR options builder ────────────────────────────────────────────────── */

function buildQROptions(settings: QRSettings, url: string, size: number): QROptions {
  const isCircleTemplate = TEMPLATES.find((t) => t.id === settings.template)?.circle ?? false;
  return {
    type: "svg",
    data: url || "https://koapos.com",
    width: size,
    height: size,
    shape: isCircleTemplate ? "circle" : "square",
    dotsOptions: {
      type: settings.dotStyle,
      color: settings.patternColor,
    },
    cornersSquareOptions: {
      type: settings.cornerSquareStyle,
      color: settings.eyeColor,
    },
    cornersDotOptions: {
      type: settings.cornerDotStyle,
      color: settings.eyeDotColor,
    },
    backgroundOptions: {
      color: settings.bgColor === "transparent" ? "rgba(0,0,0,0)" : settings.bgColor,
    },
    ...(settings.logoUrl ? {
      image: settings.logoUrl,
      imageOptions: {
        crossOrigin: "anonymous",
        hideBackgroundDots: true,
        imageSize: 0.35,
        margin: 4,
      },
    } : {}),
    qrOptions: {
      errorCorrectionLevel: settings.level,
    },
  };
}

/* ── Template wrapper ──────────────────────────────────────────────────── */

function TemplateWrapper({
  template, bgColor, patternColor, children, scale = 1,
}: {
  template: string;
  bgColor: string;
  patternColor: string;
  children: React.ReactNode;
  scale?: number;
}) {
  const isCircle = TEMPLATES.find((t) => t.id === template)?.circle ?? false;
  const p = Math.round(8 * scale);
  const br = Math.round(16 * scale);
  const borderW = Math.max(1, Math.round(3 * scale));
  const fw = `${Math.round(40 * scale)}px`;
  const fontSize = Math.round(11 * scale);

  const inner = (
    <div
      style={{
        borderRadius: isCircle ? "50%" : 0,
        overflow: isCircle ? "hidden" : undefined,
        display: "inline-block",
        lineHeight: 0,
        background: template === "dark-circle" ? patternColor : undefined,
      }}
    >
      {template === "dark-circle"
        ? <div style={{ opacity: 0.85, lineHeight: 0 }}>{children}</div>
        : children}
    </div>
  );

  if (template === "standard") {
    return <div style={{ lineHeight: 0, borderRadius: br, overflow: "hidden" }}>{children}</div>;
  }

  if (template === "border") {
    return (
      <div style={{
        border: `${borderW}px solid ${patternColor}`,
        borderRadius: br, padding: p,
        background: bgColor === "transparent" ? "white" : bgColor,
        display: "inline-block", lineHeight: 0,
      }}>{children}</div>
    );
  }

  if (template === "scan-me-dark") {
    return (
      <div style={{ display: "inline-flex", flexDirection: "column", borderRadius: br, overflow: "hidden" }}>
        {children}
        <div style={{
          background: patternColor, color: bgColor === "transparent" ? "white" : bgColor,
          textAlign: "center", fontSize, fontWeight: 700,
          letterSpacing: "0.15em", padding: `${Math.round(5 * scale)}px 0`,
          fontFamily: "system-ui, sans-serif",
        }}>SCAN ME ▲</div>
      </div>
    );
  }

  if (template === "scan-me-light") {
    return (
      <div style={{
        display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.round(4 * scale),
        border: `${borderW}px solid ${patternColor}`, borderRadius: br, padding: p,
        background: bgColor === "transparent" ? "white" : bgColor,
      }}>
        <div style={{ lineHeight: 0, borderRadius: Math.round(8 * scale), overflow: "hidden" }}>{children}</div>
        <div style={{
          fontSize, fontWeight: 700, letterSpacing: "0.12em",
          color: patternColor, fontFamily: "system-ui, sans-serif",
        }}>▲ SCAN ME</div>
      </div>
    );
  }

  if (template === "circle") {
    return <div style={{ borderRadius: "50%", overflow: "hidden", lineHeight: 0 }}>{inner}</div>;
  }

  if (template === "circle-dashed") {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: Math.round(6 * scale),
        border: `${Math.max(2, Math.round(3 * scale))}px dashed ${patternColor}`,
        borderRadius: "50%", lineHeight: 0,
      }}>{inner}</div>
    );
  }

  if (template === "circle-dots") {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: Math.round(6 * scale),
        border: `${Math.max(2, Math.round(3 * scale))}px dotted ${patternColor}`,
        borderRadius: "50%", lineHeight: 0,
      }}>{inner}</div>
    );
  }

  if (template === "dark-circle") {
    return (
      <div style={{
        background: patternColor, borderRadius: "50%", overflow: "hidden",
        padding: Math.round(4 * scale), lineHeight: 0, display: "inline-block",
      }}>
        <div style={{ borderRadius: "50%", overflow: "hidden", lineHeight: 0 }}>{children}</div>
      </div>
    );
  }

  if (template === "circle-ring") {
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: Math.round(6 * scale),
        outline: `${Math.max(2, Math.round(2 * scale))}px solid ${patternColor}`,
        outlineOffset: Math.round(4 * scale),
        border: `${Math.max(2, Math.round(2 * scale))}px solid ${patternColor}`,
        borderRadius: "50%", lineHeight: 0,
      }}>{inner}</div>
    );
  }

  return <div style={{ lineHeight: 0 }}>{children}</div>;
}

/* ── Colour swatch row ─────────────────────────────────────────────────── */

function ColourRow({
  label, value, swatches, onChange, onCopy, copyLabel,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (v: string) => void;
  onCopy?: () => void;
  copyLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{label}</Label>
        {onCopy && (
          <button onClick={onCopy}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <Copy className="w-3 h-3" />{copyLabel ?? "Copy pattern color"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {swatches.map((s) => (
          <button
            key={s}
            title={s}
            onClick={() => onChange(s)}
            className={cn(
              "w-6 h-6 rounded border-2 transition-all shrink-0",
              value === s ? "border-primary scale-110 shadow-sm" : "border-border hover:border-primary/50 hover:scale-105"
            )}
            style={
              s === "transparent"
                ? { background: "linear-gradient(135deg, white 45%, #e5e7eb 45%, #e5e7eb 55%, white 55%)", backgroundSize: "8px 8px" }
                : { background: s }
            }
          />
        ))}
        <div className="flex items-center gap-1 ml-auto">
          {value !== "transparent" && (
            <input
              type="color"
              value={value === "transparent" ? "#ffffff" : value}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded border cursor-pointer p-0.5 shrink-0"
            />
          )}
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-24 h-7 font-mono text-xs px-2"
            placeholder="#000000"
          />
        </div>
      </div>
    </div>
  );
}

/* ── Dot style icons (inline SVG) ──────────────────────────────────────── */

function DotIcon({ style }: { style: DotType }) {
  const size = 32;
  const positions = [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => ({ r, c })));
  const gap = 7.5;

  const shape = (x: number, y: number) => {
    const s = 5;
    if (style === "dots")          return <circle cx={x + s / 2} cy={y + s / 2} r={s / 2} />;
    if (style === "rounded")       return <rect x={x} y={y} width={s} height={s} rx={1.5} />;
    if (style === "extra-rounded") return <rect x={x} y={y} width={s} height={s} rx={2.5} />;
    if (style === "classy")        return <rect x={x} y={y} width={s} height={4} rx={0} />;
    if (style === "classy-rounded") return <rect x={x} y={y} width={s} height={4} rx={1.5} />;
    return <rect x={x} y={y} width={s} height={s} rx={0} />;
  };

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor">
      {positions.map(({ r, c }) => (
        <g key={`${r}-${c}`}>{shape(c * gap + 1, r * gap + 1)}</g>
      ))}
    </svg>
  );
}

/* ── Eye style icons ───────────────────────────────────────────────────── */

function EyeIcon({ csStyle, cdStyle }: { csStyle: CornerSquareType; cdStyle: CornerDotType }) {
  const outerR = csStyle === "extra-rounded" ? 5 : csStyle === "dot" ? 10 : 1;
  const innerR = cdStyle === "dot" ? 3 : 0;
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" fill="currentColor">
      <rect x={2} y={2} width={28} height={28} rx={outerR} fillOpacity={0} stroke="currentColor" strokeWidth={3} />
      <rect x={8} y={8} width={16} height={16} rx={outerR > 2 ? outerR - 1 : 0} fillOpacity={0} stroke="currentColor" strokeWidth={2} />
      {cdStyle === "dot"
        ? <circle cx={16} cy={16} r={5} />
        : <rect x={11} y={11} width={10} height={10} rx={innerR} />
      }
    </svg>
  );
}

/* ── Live QR preview using qr-code-styling ─────────────────────────────── */

function StyledQR({
  settings, url, size, id,
}: {
  settings: QRSettings; url: string; size: number; id?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    const opts = buildQROptions(settings, url, size);
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

  return <div id={id} ref={containerRef} style={{ lineHeight: 0, display: "inline-block" }} />;
}

/* ── Template mini preview (for picker) ────────────────────────────────── */

function TemplateMini({
  template, settings, url, selected, onClick,
}: {
  template: typeof TEMPLATES[number];
  settings: QRSettings;
  url: string;
  selected: boolean;
  onClick: () => void;
}) {
  const previewSettings = { ...settings, template: template.id };
  const MINI = 72;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all shrink-0",
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/40"
      )}
      style={{ width: 100 }}
    >
      <div className="flex items-center justify-center w-full h-[88px] overflow-hidden">
        <TemplateWrapper template={template.id} bgColor={settings.bgColor} patternColor={settings.patternColor} scale={0.6}>
          <StyledQR settings={previewSettings} url={url || "https://koapos.com"} size={MINI} />
        </TemplateWrapper>
      </div>
      <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">{template.label}</span>
    </button>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────── */

export default function MarketingQRCodesPage() {
  const [url,      setUrl]      = useState("https://");
  const [label,    setLabel]    = useState("");
  const [settings, setSettings] = useState<QRSettings>(loadStoredSettings);
  const [history,  setHistory]  = useState<QREntry[]>(loadHistory);
  const [preview,  setPreview]  = useState<QREntry | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const liveQrRef = useRef<QRCodeStyling | null>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof QRSettings>(k: K, v: QRSettings[K]) => {
    setSettings((s) => {
      const next = { ...s, [k]: v };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const isValidUrl = url.trim().length > 3;
  const activeEntry = preview ?? (history[0] ?? null);

  const saveToHistory = useCallback(() => {
    if (!isValidUrl) { toast.error("Enter a valid URL"); return; }
    const entry: QREntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label: label.trim() || url,
      url: url.trim(),
      createdAt: new Date().toISOString(),
      settings: { ...settings },
    };
    const next = [entry, ...history];
    setHistory(next);
    saveHistory(next);
    setPreview(entry);
    toast.success("QR code saved");
  }, [url, label, settings, history, isValidUrl]);

  const downloadBlob = useCallback((blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Downloaded");
  }, []);

  const downloadLive = useCallback(async () => {
    const qr = new QRCodeStyling(buildQROptions(settings, url || "https://koapos.com", settings.size));
    const raw = await qr.getRawData("png");
    if (!raw) { toast.error("Download failed"); return; }
    downloadBlob(raw as Blob, label || "qrcode");
  }, [settings, url, label, downloadBlob]);

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

  const copyUrl = (u: string) =>
    navigator.clipboard.writeText(u).then(() => toast.success("Copied")).catch(() => toast.error("Copy failed"));

  /* Live preview update via qr-code-styling */
  useEffect(() => {
    const opts = buildQROptions(settings, url || "https://koapos.com", Math.min(settings.size, 240));
    if (!liveQrRef.current) {
      liveQrRef.current = new QRCodeStyling(opts);
      if (liveContainerRef.current) {
        liveContainerRef.current.innerHTML = "";
        liveQrRef.current.append(liveContainerRef.current);
      }
    } else {
      liveQrRef.current.update(opts);
    }
  });

  const previewSize = Math.min(settings.size, 240);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <QrCode className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">QR Code Generator</h1>
              <p className="text-sm text-muted-foreground">Custom QR codes with patterns, colours, and templates.</p>
            </div>
          </div>
          <Link href="/management/marketing/generators">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="w-3.5 h-3.5" /> Settings
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

          {/* ── Left: Config ── */}
          <div className="space-y-4">

            {/* Content */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>URL / Content</Label>
                  <Textarea
                    placeholder="https://yourwebsite.com/promotion"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="min-h-[70px] font-mono text-sm resize-none"
                  />
                  <p className="text-[11px] text-muted-foreground">Any URL, text, phone number, email, or vCard.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Label <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Input placeholder="e.g. Summer Sale 2026" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Colors */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Colours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ColourRow label="Pattern color" value={settings.patternColor} swatches={DARK_SWATCHES}
                  onChange={(v) => set("patternColor", v)} />
                <ColourRow label="Eye color" value={settings.eyeColor} swatches={DARK_SWATCHES}
                  onChange={(v) => set("eyeColor", v)}
                  onCopy={() => set("eyeColor", settings.patternColor)} copyLabel="Copy pattern color" />
                <ColourRow label="Eye dot color" value={settings.eyeDotColor} swatches={DARK_SWATCHES}
                  onChange={(v) => set("eyeDotColor", v)}
                  onCopy={() => set("eyeDotColor", settings.patternColor)} copyLabel="Copy pattern color" />
                <ColourRow label="Background color" value={settings.bgColor} swatches={LIGHT_SWATCHES}
                  onChange={(v) => set("bgColor", v)} />
              </CardContent>
            </Card>

            {/* Pattern */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pattern</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {DOT_STYLES.map((s) => (
                    <button key={s.value} type="button" onClick={() => set("dotStyle", s.value)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 py-2 px-1 rounded-lg border-2 transition-all",
                        settings.dotStyle === s.value
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40"
                      )}>
                      <DotIcon style={s.value} />
                      <span className="text-[10px] font-medium">{s.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Eye style */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Eye Style</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {EYE_STYLES.map((s) => (
                    <button key={`${s.csStyle}-${s.cdStyle}`} type="button"
                      onClick={() => { set("cornerSquareStyle", s.csStyle); set("cornerDotStyle", s.cdStyle); }}
                      className={cn(
                        "flex flex-col items-center gap-1.5 py-2 px-1 rounded-lg border-2 transition-all",
                        settings.cornerSquareStyle === s.csStyle && settings.cornerDotStyle === s.cdStyle
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40"
                      )}>
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
                <CardTitle className="text-base">Template</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
                  {TEMPLATES.map((t) => (
                    <TemplateMini
                      key={t.id}
                      template={t}
                      settings={settings}
                      url={url || "https://koapos.com"}
                      selected={settings.template === t.id}
                      onClick={() => set("template", t.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Advanced (collapsible) */}
            <Card>
              <button
                type="button"
                className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold"
                onClick={() => setAdvanced((a) => !a)}
              >
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
                      <Label className="text-xs">Error correction</Label>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs">Centre logo URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                      placeholder="https://yoursite.com/logo.png"
                      value={settings.logoUrl}
                      onChange={(e) => set("logoUrl", e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">Use level Q or H when adding a logo.</p>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {/* ── Right: Live Preview ── */}
          <div className="lg:sticky lg:top-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Live Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center gap-4 py-2">
                  <TemplateWrapper
                    template={settings.template}
                    bgColor={settings.bgColor}
                    patternColor={settings.patternColor}
                    scale={1}
                  >
                    <div ref={liveContainerRef} style={{ lineHeight: 0, display: "inline-block", width: previewSize, height: previewSize }} />
                  </TemplateWrapper>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-medium">{label || <span className="text-muted-foreground italic">No label</span>}</p>
                    <p className="text-[11px] text-muted-foreground break-all max-w-[260px]">{url}</p>
                    <Badge variant="outline" className="text-[10px]">
                      ECC {settings.level} · {settings.size}px · {DOT_STYLES.find((d) => d.value === settings.dotStyle)?.label}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-1.5" onClick={downloadLive} disabled={!isValidUrl}>
                    <Download className="w-4 h-4" /> Download
                  </Button>
                  <Button className="gap-1.5" onClick={saveToHistory} disabled={!isValidUrl}>
                    <Save className="w-4 h-4" /> Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Active entry info */}
            {activeEntry && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selected</p>
                  <p className="text-sm font-medium truncate">{activeEntry.label}</p>
                  <p className="text-[11px] text-muted-foreground break-all">{activeEntry.url}</p>
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs flex-1" onClick={() => downloadEntry(activeEntry)}>
                      <Download className="w-3 h-3" /> PNG
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs flex-1" onClick={() => copyUrl(activeEntry.url)}>
                      <Copy className="w-3 h-3" /> URL
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
              {history.map((entry) => (
                <Card
                  key={entry.id}
                  className={cn("cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm",
                    activeEntry?.id === entry.id && "border-primary ring-1 ring-primary/30")}
                  onClick={() => { setPreview(entry); setUrl(entry.url); setLabel(entry.label); setSettings(entry.settings); }}
                >
                  <CardContent className="p-3 flex items-start gap-3">
                    {/* Mini thumbnail */}
                    <div className="shrink-0 rounded overflow-hidden border flex items-center justify-center bg-white"
                      style={{ width: 52, height: 52 }}>
                      <TemplateWrapper template={entry.settings.template} bgColor={entry.settings.bgColor} patternColor={entry.settings.patternColor} scale={0.35}>
                        <StyledQR settings={entry.settings} url={entry.url} size={52} />
                      </TemplateWrapper>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{entry.label}</p>
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
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5" title="Copy URL">
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
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
