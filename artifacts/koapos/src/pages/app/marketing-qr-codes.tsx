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
import { QrCode, Download, Trash2, Copy, Settings2, Clock, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface QRSettings {
  fgColor: string;
  bgColor: string;
  size: number;
  level: "L" | "M" | "Q" | "H";
  logoUrl: string;
  includeMargin: boolean;
}

interface QREntry {
  id: string;
  label: string;
  url: string;
  createdAt: string;
  settings: QRSettings;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const HISTORY_KEY   = "koapos_qr_history";
const SETTINGS_KEY  = "koapos_qr_settings";

const DEFAULT_SETTINGS: QRSettings = {
  fgColor: "#000000",
  bgColor: "#ffffff",
  size: 256,
  level: "M",
  logoUrl: "",
  includeMargin: true,
};

const ECC_LEVELS = [
  { value: "L", label: "Low (7%)",    desc: "Fastest to scan" },
  { value: "M", label: "Medium (15%)", desc: "Recommended" },
  { value: "Q", label: "Quartile (25%)", desc: "Good for logos" },
  { value: "H", label: "High (30%)",  desc: "Most resilient" },
];

/* ── Helpers ───────────────────────────────────────────────────────────── */

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

/* ── Component ─────────────────────────────────────────────────────────── */

export default function MarketingQRCodesPage() {
  const [url, setUrl]         = useState("https://");
  const [label, setLabel]     = useState("");
  const [settings, setSettings] = useState<QRSettings>(loadStoredSettings);
  const [history, setHistory] = useState<QREntry[]>(loadHistory);
  const [preview, setPreview] = useState<QREntry | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const setField = <K extends keyof QRSettings>(k: K, v: QRSettings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  const isValidUrl = url.trim().length > 3;

  const generate = useCallback(() => {
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
    toast.success("QR code generated");
  }, [url, label, settings, history, isValidUrl]);

  const downloadCanvas = useCallback((entry: QREntry) => {
    const container = document.getElementById(`qr-canvas-${entry.id}`);
    const canvas = container?.querySelector("canvas");
    if (!canvas) { toast.error("Canvas not found"); return; }
    const link = document.createElement("a");
    link.download = `${(entry.label || "qrcode").replace(/\s+/g, "_")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Downloaded");
  }, []);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast.success("Copied to clipboard")).catch(() => toast.error("Copy failed"));
  };

  const deleteEntry = (id: string) => {
    const next = history.filter((e) => e.id !== id);
    setHistory(next);
    saveHistory(next);
    if (preview?.id === id) setPreview(null);
    toast.success("Deleted");
  };

  const activeEntry = preview ?? (history[0] ?? null);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <QrCode className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">QR Code Generator</h1>
              <p className="text-sm text-muted-foreground">Create custom QR codes for webpages, promotions, and marketing campaigns.</p>
            </div>
          </div>
          <Link href="/management/marketing/generators">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="w-3.5 h-3.5" /> Default Settings
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── Left: Config ── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> New QR Code</CardTitle>
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
                  <p className="text-[11px] text-muted-foreground">Can be any URL, text, phone number, email, or vCard.</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Label <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input placeholder="e.g. Summer Sale 2026" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>

                {/* Styling */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Foreground colour</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={settings.fgColor} onChange={(e) => setField("fgColor", e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer shrink-0 p-0.5" />
                      <Input value={settings.fgColor} onChange={(e) => setField("fgColor", e.target.value)} className="font-mono text-sm h-8" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Background colour</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={settings.bgColor} onChange={(e) => setField("bgColor", e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer shrink-0 p-0.5" />
                      <Input value={settings.bgColor} onChange={(e) => setField("bgColor", e.target.value)} className="font-mono text-sm h-8" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Size (px)</Label>
                    <Select value={settings.size.toString()} onValueChange={(v) => setField("size", parseInt(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[128, 192, 256, 320, 400, 512].map((s) => (
                          <SelectItem key={s} value={s.toString()}>{s} × {s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Error correction</Label>
                    <Select value={settings.level} onValueChange={(v) => setField("level", v as QRSettings["level"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ECC_LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            <span>{l.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">{ECC_LEVELS.find((l) => l.value === settings.level)?.desc}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Centre logo URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    placeholder="https://yoursite.com/logo.png"
                    value={settings.logoUrl}
                    onChange={(e) => setField("logoUrl", e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">Use level Q or H when adding a logo to ensure scannability.</p>
                </div>

                <Button className="w-full gap-1.5" onClick={generate} disabled={!isValidUrl}>
                  <QrCode className="w-4 h-4" /> Generate QR Code
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Preview ── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {activeEntry ? (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center gap-4 py-4">
                      <div
                        id={`qr-canvas-${activeEntry.id}`}
                        ref={canvasRef}
                        className="rounded-xl overflow-hidden shadow-sm border p-3"
                        style={{ background: activeEntry.settings.bgColor }}
                      >
                        <QRCodeCanvas
                          value={activeEntry.url}
                          size={Math.min(activeEntry.settings.size, 260)}
                          fgColor={activeEntry.settings.fgColor}
                          bgColor={activeEntry.settings.bgColor}
                          level={activeEntry.settings.level}
                          marginSize={activeEntry.settings.includeMargin ? 4 : 0}
                          {...(activeEntry.settings.logoUrl ? {
                            imageSettings: {
                              src: activeEntry.settings.logoUrl,
                              height: Math.round(Math.min(activeEntry.settings.size, 260) * 0.18),
                              width:  Math.round(Math.min(activeEntry.settings.size, 260) * 0.18),
                              excavate: true,
                            }
                          } : {})}
                        />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="font-semibold text-sm">{activeEntry.label}</p>
                        <p className="text-xs text-muted-foreground break-all max-w-xs">{activeEntry.url}</p>
                        <Badge variant="outline" className="text-[10px]">
                          ECC {activeEntry.settings.level} · {activeEntry.settings.size}px
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 gap-1.5" onClick={() => downloadCanvas(activeEntry)}>
                        <Download className="w-4 h-4" /> Download PNG
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => copyUrl(activeEntry.url)} title="Copy URL">
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
                    <QrCode className="w-14 h-14 opacity-15" />
                    <p className="text-sm">Enter a URL and click Generate to create your first QR code.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── History ── */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Recent QR Codes</h2>
              <Badge variant="secondary" className="text-xs">{history.length}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {history.map((entry) => (
                <Card
                  key={entry.id}
                  className={cn("cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm",
                    activeEntry?.id === entry.id && "border-primary ring-1 ring-primary/30")}
                  onClick={() => setPreview(entry)}
                >
                  <CardContent className="p-3 flex items-start gap-3">
                    {/* Hidden canvas for download */}
                    <div id={`qr-canvas-${entry.id}`} className="hidden">
                      <QRCodeCanvas
                        value={entry.url}
                        size={entry.settings.size}
                        fgColor={entry.settings.fgColor}
                        bgColor={entry.settings.bgColor}
                        level={entry.settings.level}
                        marginSize={entry.settings.includeMargin ? 4 : 0}
                        {...(entry.settings.logoUrl ? {
                          imageSettings: {
                            src: entry.settings.logoUrl,
                            height: Math.round(entry.settings.size * 0.18),
                            width:  Math.round(entry.settings.size * 0.18),
                            excavate: true,
                          }
                        } : {})}
                      />
                    </div>
                    {/* Mini preview */}
                    <div className="shrink-0 rounded overflow-hidden border" style={{ background: entry.settings.bgColor }}>
                      <QRCodeCanvas
                        value={entry.url}
                        size={52}
                        fgColor={entry.settings.fgColor}
                        bgColor={entry.settings.bgColor}
                        level={entry.settings.level}
                        marginSize={1}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{entry.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{entry.url}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(entry.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <div className="flex gap-1 mt-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadCanvas(entry); }}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          title="Download PNG"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyUrl(entry.url); }}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          title="Copy URL"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); window.open(entry.url, "_blank"); }}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          title="Open URL"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                          className="text-muted-foreground hover:text-destructive transition-colors p-0.5 ml-auto"
                          title="Delete"
                        >
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
