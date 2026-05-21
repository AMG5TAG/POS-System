import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { QrCode, Link2, Save, RotateCcw } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface QRDefaults {
  fgColor: string;
  bgColor: string;
  size: number;
  level: "L" | "M" | "Q" | "H";
  logoUrl: string;
  includeMargin: boolean;
}

interface ShortlinkDefaults {
  baseDomain: string;
  prefix: string;
  enableRedirects: boolean;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const QR_SETTINGS_KEY = "koapos_qr_settings";
const SL_SETTINGS_KEY = "koapos_shortlink_settings";

const DEFAULT_QR: QRDefaults = {
  fgColor: "#000000",
  bgColor: "#ffffff",
  size: 256,
  level: "M",
  logoUrl: "",
  includeMargin: true,
};

const DEFAULT_SL: ShortlinkDefaults = {
  baseDomain: typeof window !== "undefined" ? window.location.hostname : "koapos.com",
  prefix: "s",
  enableRedirects: false,
};

const ECC_LEVELS = [
  { value: "L", label: "Low (7%)" },
  { value: "M", label: "Medium (15%)" },
  { value: "Q", label: "Quartile (25%)" },
  { value: "H", label: "High (30%)" },
];

/* ── Helpers ───────────────────────────────────────────────────────────── */

function load<T>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<T>) };
  } catch { return defaults; }
}

function save(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function ManagementMarketingGeneratorsPage() {
  const [qr, setQR]   = useState<QRDefaults>(() => load(QR_SETTINGS_KEY, DEFAULT_QR));
  const [sl, setSL]   = useState<ShortlinkDefaults>(() => load(SL_SETTINGS_KEY, DEFAULT_SL));

  const setQRField = <K extends keyof QRDefaults>(k: K, v: QRDefaults[K]) =>
    setQR((p) => ({ ...p, [k]: v }));
  const setSLField = <K extends keyof ShortlinkDefaults>(k: K, v: ShortlinkDefaults[K]) =>
    setSL((p) => ({ ...p, [k]: v }));

  const saveAll = () => {
    save(QR_SETTINGS_KEY, qr);
    save(SL_SETTINGS_KEY, sl);
    toast.success("Generator settings saved");
  };

  const resetQR = () => {
    setQR(DEFAULT_QR);
    save(QR_SETTINGS_KEY, DEFAULT_QR);
    toast.success("QR defaults reset");
  };

  const resetSL = () => {
    setSL(DEFAULT_SL);
    save(SL_SETTINGS_KEY, DEFAULT_SL);
    toast.success("Shortlink defaults reset");
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Generator Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure the default appearance and behaviour of your QR codes and shortlinks.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── QR Code Defaults ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">QR Code Defaults</CardTitle>
                </div>
                <button onClick={resetQR} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              <CardDescription className="text-xs">
                These defaults pre-fill the QR code generator. You can still override them per-code.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Foreground colour</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={qr.fgColor} onChange={(e) => setQRField("fgColor", e.target.value)}
                      className="w-8 h-8 rounded border cursor-pointer shrink-0 p-0.5" />
                    <Input value={qr.fgColor} onChange={(e) => setQRField("fgColor", e.target.value)}
                      className="font-mono text-sm h-8" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Background colour</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={qr.bgColor} onChange={(e) => setQRField("bgColor", e.target.value)}
                      className="w-8 h-8 rounded border cursor-pointer shrink-0 p-0.5" />
                    <Input value={qr.bgColor} onChange={(e) => setQRField("bgColor", e.target.value)}
                      className="font-mono text-sm h-8" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Default size (px)</Label>
                  <Select value={qr.size.toString()} onValueChange={(v) => setQRField("size", parseInt(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[128, 192, 256, 320, 400, 512].map((s) => (
                        <SelectItem key={s} value={s.toString()}>{s} × {s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Error correction level</Label>
                  <Select value={qr.level} onValueChange={(v) => setQRField("level", v as QRDefaults["level"])}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ECC_LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Default centre logo URL</Label>
                <Input
                  placeholder="https://yoursite.com/logo.png"
                  value={qr.logoUrl}
                  onChange={(e) => setQRField("logoUrl", e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank for no logo. Recommend using level Q or H when a logo is set.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Include margin</p>
                  <p className="text-xs text-muted-foreground">Adds quiet zone around the code for better scanning.</p>
                </div>
                <Switch
                  checked={qr.includeMargin}
                  onCheckedChange={(v) => setQRField("includeMargin", v)}
                />
              </div>

              {/* Live preview */}
              <div className="flex justify-center pt-2">
                <div className="rounded-xl border p-3 shadow-sm" style={{ background: qr.bgColor }}>
                  <QRCodeCanvas
                    value="https://koapos.com"
                    size={120}
                    fgColor={qr.fgColor}
                    bgColor={qr.bgColor}
                    level={qr.level}
                    marginSize={qr.includeMargin ? 4 : 0}
                    {...(qr.logoUrl ? {
                      imageSettings: { src: qr.logoUrl, height: 22, width: 22, excavate: true }
                    } : {})}
                  />
                </div>
              </div>
              <p className="text-center text-[10px] text-muted-foreground">Preview (koapos.com)</p>
            </CardContent>
          </Card>

          {/* ── Shortlink Defaults ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Shortlink Defaults</CardTitle>
                </div>
                <button onClick={resetSL} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              <CardDescription className="text-xs">
                Configure the base domain and path prefix used when generating shortlinks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Base domain</Label>
                <Input
                  placeholder="mystore.com.au"
                  value={sl.baseDomain}
                  onChange={(e) => setSLField("baseDomain", e.target.value.trim())}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Your store's primary domain. Shortlinks will appear as <span className="font-mono">https://{sl.baseDomain}/{sl.prefix}/abc123</span>.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">URL prefix</Label>
                <div className="flex items-center gap-0 rounded-md border overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                  <span className="bg-muted px-3 py-2 text-sm text-muted-foreground whitespace-nowrap border-r shrink-0">
                    {sl.baseDomain}/
                  </span>
                  <input
                    className="flex-1 px-3 py-2 text-sm font-mono bg-background outline-none min-w-0"
                    placeholder="s"
                    value={sl.prefix}
                    onChange={(e) => setSLField("prefix", e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The segment between your domain and the short code. Common choices: <code>s</code>, <code>go</code>, <code>link</code>.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Enable redirect routing</p>
                  <p className="text-xs text-muted-foreground">Allow KoaPOS to serve redirects from <span className="font-mono">/{sl.prefix}/…</span> paths.</p>
                </div>
                <Switch
                  checked={sl.enableRedirects}
                  onCheckedChange={(v) => setSLField("enableRedirects", v)}
                />
              </div>

              {sl.enableRedirects && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-700/30 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                  <p className="font-semibold">Redirect routing active</p>
                  <p>KoaPOS will intercept requests to <span className="font-mono">/{sl.prefix}/[code]</span> and redirect visitors to the saved destination URL.</p>
                  <p>Make sure your domain's DNS is pointed to KoaPOS for this to work on your custom domain.</p>
                </div>
              )}

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Example shortlink preview</p>
                <p className="font-mono text-sm text-primary break-all">
                  https://{sl.baseDomain}/{sl.prefix}/abc123
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveAll} className="gap-1.5">
            <Save className="w-4 h-4" /> Save Settings
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
