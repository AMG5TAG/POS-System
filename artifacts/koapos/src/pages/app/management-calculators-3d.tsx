import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Cpu, Zap, DollarSign, Clock, Wrench, AlertTriangle,
  TrendingUp, Save, RotateCcw, ChevronDown, ChevronUp, Info,
  Calculator,
} from "lucide-react";

/* ─── Storage ────────────────────────────────────────────────────────────── */

const STORAGE_KEY = "koapos_3d_settings";

export interface Settings3D {
  printerId: string;
  customPrinterName: string;
  printerWattage: number;
  purchasePrice: number;
  lifetimeHours: number;
  profitMargin: number;
  electricityRate: number;
  overheadPerHour: number;
  laborRate: number;
  setupTimeMinutes: number;
  failureRate: number;
  filamentWastePercent: number;
  postProcessingMinutes: number;
  coolingFactor: number;
  roundingMode: "none" | "dollar" | "custom";
  roundingValue: number;
}

const DEFAULTS: Settings3D = {
  printerId: "elegoo-centauri-carbon-2-combo",
  customPrinterName: "",
  printerWattage: 350,
  purchasePrice: 649,
  lifetimeHours: 2000,
  profitMargin: 40,
  electricityRate: 0.32,
  overheadPerHour: 0.50,
  laborRate: 25.00,
  setupTimeMinutes: 15,
  failureRate: 5,
  filamentWastePercent: 3,
  postProcessingMinutes: 10,
  coolingFactor: 0.7,
  roundingMode: "none",
  roundingValue: 0.5,
};

export function load3DSettings(): Settings3D {
  return DEFAULTS;
}

function save3DSettings(_s: Settings3D) {
  /* no-op */
}

/* ─── Printer data ───────────────────────────────────────────────────────── */

export interface PrinterPreset {
  id: string;
  brand: string;
  model: string;
  type: "FDM" | "Resin" | "SLS";
  wattage: number;
  buildVolume: string;
  purchasePrice: number;
  notes?: string;
}

export const PRINTER_PRESETS: PrinterPreset[] = [
  /* Elegoo FDM */
  { id: "elegoo-centauri-carbon-2-combo", brand: "Elegoo",      model: "Centauri Carbon 2 Combo",  type: "FDM",   wattage: 350,  buildVolume: "220×220×250 mm", purchasePrice: 649,  notes: "Multi-material FDM, carbon-fibre frame" },
  { id: "elegoo-neptune-4",               brand: "Elegoo",      model: "Neptune 4",                type: "FDM",   wattage: 350,  buildVolume: "225×225×265 mm", purchasePrice: 299 },
  { id: "elegoo-neptune-4-pro",           brand: "Elegoo",      model: "Neptune 4 Pro",            type: "FDM",   wattage: 350,  buildVolume: "225×225×265 mm", purchasePrice: 399 },
  { id: "elegoo-neptune-4-max",           brand: "Elegoo",      model: "Neptune 4 Max",            type: "FDM",   wattage: 500,  buildVolume: "420×420×480 mm", purchasePrice: 549 },
  { id: "elegoo-neptune-4-plus",          brand: "Elegoo",      model: "Neptune 4 Plus",           type: "FDM",   wattage: 400,  buildVolume: "320×320×380 mm", purchasePrice: 449 },
  /* Elegoo Resin */
  { id: "elegoo-saturn-4-ultra",          brand: "Elegoo",      model: "Saturn 4 Ultra 16K",       type: "Resin", wattage: 60,   buildVolume: "218×123×260 mm", purchasePrice: 699 },
  { id: "elegoo-saturn-3-ultra",          brand: "Elegoo",      model: "Saturn 3 Ultra 12K",       type: "Resin", wattage: 60,   buildVolume: "218×123×260 mm", purchasePrice: 499 },
  { id: "elegoo-mars-4-ultra",            brand: "Elegoo",      model: "Mars 4 Ultra",             type: "Resin", wattage: 35,   buildVolume: "153×77×165 mm",  purchasePrice: 299 },
  { id: "elegoo-jupiter-se",              brand: "Elegoo",      model: "Jupiter SE 6K",            type: "Resin", wattage: 120,  buildVolume: "277×156×300 mm", purchasePrice: 899 },
  /* Bambu Lab */
  { id: "bambu-x1-carbon",               brand: "Bambu Lab",   model: "X1 Carbon",               type: "FDM",   wattage: 1000, buildVolume: "256×256×256 mm", purchasePrice: 1699, notes: "Multi-material AMS included" },
  { id: "bambu-p1s",                      brand: "Bambu Lab",   model: "P1S",                      type: "FDM",   wattage: 1000, buildVolume: "256×256×256 mm", purchasePrice: 1099 },
  { id: "bambu-p1p",                      brand: "Bambu Lab",   model: "P1P",                      type: "FDM",   wattage: 1000, buildVolume: "256×256×256 mm", purchasePrice: 799 },
  { id: "bambu-a1",                       brand: "Bambu Lab",   model: "A1 (AMS Lite)",            type: "FDM",   wattage: 1000, buildVolume: "256×256×256 mm", purchasePrice: 599 },
  { id: "bambu-a1-mini",                  brand: "Bambu Lab",   model: "A1 Mini",                  type: "FDM",   wattage: 500,  buildVolume: "180×180×180 mm", purchasePrice: 449 },
  /* Creality */
  { id: "creality-ender-3-v3",            brand: "Creality",    model: "Ender 3 V3",               type: "FDM",   wattage: 350,  buildVolume: "220×220×250 mm", purchasePrice: 299 },
  { id: "creality-ender-3-s1-pro",        brand: "Creality",    model: "Ender 3 S1 Pro",           type: "FDM",   wattage: 350,  buildVolume: "220×220×270 mm", purchasePrice: 349 },
  { id: "creality-k1-max",                brand: "Creality",    model: "K1 Max",                   type: "FDM",   wattage: 1500, buildVolume: "300×300×300 mm", purchasePrice: 799 },
  { id: "creality-k1c",                   brand: "Creality",    model: "K1C",                      type: "FDM",   wattage: 800,  buildVolume: "220×220×250 mm", purchasePrice: 549 },
  { id: "creality-cr-10-smart-pro",       brand: "Creality",    model: "CR-10 Smart Pro",          type: "FDM",   wattage: 500,  buildVolume: "300×300×400 mm", purchasePrice: 449 },
  /* Prusa */
  { id: "prusa-mk4",                      brand: "Prusa",       model: "MK4",                      type: "FDM",   wattage: 450,  buildVolume: "250×210×220 mm", purchasePrice: 999 },
  { id: "prusa-mini-plus",                brand: "Prusa",       model: "MINI+",                    type: "FDM",   wattage: 200,  buildVolume: "180×180×180 mm", purchasePrice: 559 },
  { id: "prusa-xl",                       brand: "Prusa",       model: "XL",                       type: "FDM",   wattage: 700,  buildVolume: "360×360×360 mm", purchasePrice: 2299 },
  { id: "prusa-sl1s",                     brand: "Prusa",       model: "SL1S Speed",               type: "Resin", wattage: 85,   buildVolume: "127×80×150 mm",  purchasePrice: 1999 },
  /* Anycubic */
  { id: "anycubic-kobra-2-max",           brand: "Anycubic",    model: "Kobra 2 Max",              type: "FDM",   wattage: 500,  buildVolume: "420×420×500 mm", purchasePrice: 599 },
  { id: "anycubic-kobra-2-pro",           brand: "Anycubic",    model: "Kobra 2 Pro",              type: "FDM",   wattage: 350,  buildVolume: "220×220×250 mm", purchasePrice: 349 },
  { id: "anycubic-photon-m3-ultra",       brand: "Anycubic",    model: "Photon M3 Ultra",          type: "Resin", wattage: 60,   buildVolume: "299×164×300 mm", purchasePrice: 799 },
  { id: "anycubic-photon-mono-x2",        brand: "Anycubic",    model: "Photon Mono X2",           type: "Resin", wattage: 45,   buildVolume: "196×122×200 mm", purchasePrice: 399 },
  /* Flashforge */
  { id: "flashforge-adventurer-5m-pro",   brand: "Flashforge",  model: "Adventurer 5M Pro",        type: "FDM",   wattage: 1000, buildVolume: "220×220×220 mm", purchasePrice: 799 },
  { id: "flashforge-creator-3-pro",       brand: "Flashforge",  model: "Creator 3 Pro",            type: "FDM",   wattage: 800,  buildVolume: "300×250×200 mm", purchasePrice: 1499 },
  { id: "flashforge-guider-3-ultra",      brand: "Flashforge",  model: "Guider 3 Ultra",           type: "FDM",   wattage: 1000, buildVolume: "300×300×600 mm", purchasePrice: 1999 },
  /* Artillery */
  { id: "artillery-sidewinder-x3-pro",    brand: "Artillery",   model: "Sidewinder X3 Pro",        type: "FDM",   wattage: 800,  buildVolume: "300×300×400 mm", purchasePrice: 499 },
  { id: "artillery-genius-pro",           brand: "Artillery",   model: "Genius Pro",               type: "FDM",   wattage: 400,  buildVolume: "220×220×250 mm", purchasePrice: 299 },
  /* Raise3D */
  { id: "raise3d-pro3-plus",              brand: "Raise3D",     model: "Pro3 Plus",                type: "FDM",   wattage: 800,  buildVolume: "300×300×605 mm", purchasePrice: 4499 },
  { id: "raise3d-e2cf",                   brand: "Raise3D",     model: "E2CF",                     type: "FDM",   wattage: 600,  buildVolume: "330×240×240 mm", purchasePrice: 3499 },
  /* Ultimaker */
  { id: "ultimaker-s3",                   brand: "Ultimaker",   model: "S3",                       type: "FDM",   wattage: 500,  buildVolume: "230×190×200 mm", purchasePrice: 4499 },
  { id: "ultimaker-s5",                   brand: "Ultimaker",   model: "S5",                       type: "FDM",   wattage: 600,  buildVolume: "330×240×300 mm", purchasePrice: 6499 },
  { id: "ultimaker-s7",                   brand: "Ultimaker",   model: "S7",                       type: "FDM",   wattage: 700,  buildVolume: "330×240×300 mm", purchasePrice: 7499 },
  /* Formlabs */
  { id: "formlabs-form-3",                brand: "Formlabs",    model: "Form 3",                   type: "Resin", wattage: 65,   buildVolume: "145×145×185 mm", purchasePrice: 3999 },
  { id: "formlabs-form-4",                brand: "Formlabs",    model: "Form 4",                   type: "Resin", wattage: 85,   buildVolume: "200×125×210 mm", purchasePrice: 4999 },
  /* Qidi Tech */
  { id: "qidi-x-cf-pro",                  brand: "Qidi Tech",   model: "X-CF Pro",                 type: "FDM",   wattage: 1000, buildVolume: "260×200×200 mm", purchasePrice: 999 },
  { id: "qidi-q1-pro",                    brand: "Qidi Tech",   model: "Q1 Pro",                   type: "FDM",   wattage: 1000, buildVolume: "245×245×245 mm", purchasePrice: 699 },
  /* Sovol */
  { id: "sovol-sv07-plus",                brand: "Sovol",       model: "SV07 Plus",                type: "FDM",   wattage: 500,  buildVolume: "300×300×350 mm", purchasePrice: 399 },
  /* AnkerMake */
  { id: "ankermake-m5c",                  brand: "AnkerMake",   model: "M5C",                      type: "FDM",   wattage: 800,  buildVolume: "220×220×250 mm", purchasePrice: 399 },
  /* Custom */
  { id: "custom",                         brand: "Custom",      model: "Custom Printer",           type: "FDM",   wattage: 350,  buildVolume: "Custom",         purchasePrice: 500 },
];

const PRINTER_BRANDS = [...new Set(PRINTER_PRESETS.map((p) => p.brand))];

/* ─── Section component ──────────────────────────────────────────────────── */

function Section({
  icon: Icon,
  title,
  description,
  children,
  defaultOpen = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none pb-3"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              {description && (
                <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
              )}
            </div>
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 space-y-4">
          <Separator className="mb-4" />
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
      <div className="pt-1">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  prefix,
  suffix,
  step = "0.01",
  min = "0",
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
  min?: string;
}) {
  return (
    <div className="flex items-center">
      {prefix && (
        <span className="inline-flex h-9 items-center border border-r-0 rounded-l-md px-3 bg-muted text-sm text-muted-foreground shrink-0">
          {prefix}
        </span>
      )}
      <Input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={cn(
          "h-9",
          prefix && "rounded-l-none",
          suffix && "rounded-r-none"
        )}
      />
      {suffix && (
        <span className="inline-flex h-9 items-center border border-l-0 rounded-r-md px-3 bg-muted text-sm text-muted-foreground shrink-0">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementCalculators3DPage() {
  const [settings, setSettings] = useState<Settings3D>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<string>("Elegoo");

  useEffect(() => {
    const loaded = load3DSettings();
    setSettings(loaded);
    const preset = PRINTER_PRESETS.find((p) => p.id === loaded.printerId);
    if (preset) setSelectedBrand(preset.brand);
  }, []);

  function update<K extends keyof Settings3D>(key: K, value: Settings3D[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function handlePrinterChange(id: string) {
    const preset = PRINTER_PRESETS.find((p) => p.id === id);
    if (preset) {
      setSettings((s) => ({
        ...s,
        printerId: id,
        printerWattage: preset.wattage,
        purchasePrice: preset.purchasePrice,
      }));
      setDirty(true);
    }
  }

  function handleSave() {
    save3DSettings(settings);
    setDirty(false);
    toast.success("3D Printing settings saved");
  }

  function handleReset() {
    setSettings(DEFAULTS);
    save3DSettings(DEFAULTS);
    setDirty(false);
    const preset = PRINTER_PRESETS.find((p) => p.id === DEFAULTS.printerId);
    if (preset) setSelectedBrand(preset.brand);
    toast.success("Settings reset to defaults");
  }

  const selectedPreset = PRINTER_PRESETS.find((p) => p.id === settings.printerId);
  const filteredPrinters = PRINTER_PRESETS.filter((p) => p.brand === selectedBrand);

  /* Computed values */
  const depreciationPerHour =
    settings.lifetimeHours > 0
      ? settings.purchasePrice / settings.lifetimeHours
      : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold">3D Printing Calculator</h1>
              <Badge variant="outline" className="text-xs">Settings</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure printer, energy costs, labour and margin — used by the POS 3D Prints calculator.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={!dirty}>
              <Save className="w-3.5 h-3.5" />
              {dirty ? "Save Changes" : "Saved"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Left column */}
          <div className="space-y-5">

            {/* Printer Setup */}
            <Section icon={Cpu} title="Printer Setup" description="Select your 3D printer to auto-fill wattage and purchase price">
              <FieldRow label="Brand">
                <Select value={selectedBrand} onValueChange={(v) => { setSelectedBrand(v); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRINTER_BRANDS.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Model">
                <Select value={settings.printerId} onValueChange={handlePrinterChange}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {filteredPrinters.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.model}
                        {p.type === "Resin" && <span className="ml-1 text-xs text-muted-foreground">(Resin)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              {settings.printerId === "custom" && (
                <FieldRow label="Custom Printer Name">
                  <Input
                    value={settings.customPrinterName}
                    onChange={(e) => update("customPrinterName", e.target.value)}
                    placeholder="e.g. My Ender 3 Modified"
                    className="h-9 text-sm"
                  />
                </FieldRow>
              )}

              {selectedPreset && (
                <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 font-medium text-primary text-xs uppercase tracking-wider mb-1">
                    <Cpu className="w-3.5 h-3.5" />
                    Printer Specifications
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                    <div className="text-muted-foreground">Type</div>
                    <div className="font-medium">
                      <Badge variant="outline" className="text-[10px] h-4">{selectedPreset.type}</Badge>
                    </div>
                    <div className="text-muted-foreground">Build Volume</div>
                    <div className="font-medium">{selectedPreset.buildVolume}</div>
                    {selectedPreset.notes && (
                      <>
                        <div className="text-muted-foreground">Notes</div>
                        <div className="font-medium">{selectedPreset.notes}</div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <FieldRow label="Printer Wattage" hint="Peak wattage during printing">
                <NumInput value={settings.printerWattage} onChange={(v) => update("printerWattage", v)} suffix="W" step="10" />
              </FieldRow>
            </Section>

            {/* Machine Depreciation */}
            <Section icon={Wrench} title="Machine Depreciation" description="Spreads printer cost over estimated print lifetime">
              <FieldRow label="Purchase Price (AUD)" hint="Original printer cost">
                <NumInput value={settings.purchasePrice} onChange={(v) => update("purchasePrice", v)} prefix="$" step="1" />
              </FieldRow>
              <FieldRow label="Estimated Lifetime" hint="Total hours before replacement">
                <NumInput value={settings.lifetimeHours} onChange={(v) => update("lifetimeHours", v)} suffix="hrs" step="100" min="1" />
              </FieldRow>
              <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">Computed depreciation rate</span>
                <span className="font-semibold text-primary">
                  ${depreciationPerHour.toFixed(4)} / hr
                </span>
              </div>
            </Section>

            {/* Labor & Setup */}
            <Section icon={Clock} title="Labour & Setup" description="Staff time spent preparing and monitoring prints">
              <FieldRow label="Labour Rate" hint="Hourly rate for staff time">
                <NumInput value={settings.laborRate} onChange={(v) => update("laborRate", v)} prefix="$" suffix="/hr" />
              </FieldRow>
              <FieldRow label="Setup Time" hint="Average time to prepare a print job">
                <NumInput value={settings.setupTimeMinutes} onChange={(v) => update("setupTimeMinutes", v)} suffix="min" step="1" />
              </FieldRow>
              <FieldRow label="Post-Processing" hint="Removal, cleaning, support stripping">
                <NumInput value={settings.postProcessingMinutes} onChange={(v) => update("postProcessingMinutes", v)} suffix="min" step="1" />
              </FieldRow>
            </Section>

          </div>

          {/* Right column */}
          <div className="space-y-5">

            {/* Profit & Pricing */}
            <Section icon={TrendingUp} title="Profit & Pricing" description="Default margin and rounding applied in the 3D Prints POS calculator">
              <FieldRow label="Default Profit Margin" hint="Applied as markup on total cost price">
                <NumInput value={settings.profitMargin} onChange={(v) => update("profitMargin", v)} suffix="%" step="1" />
              </FieldRow>

              <FieldRow label="Price Rounding" hint="Round the selling price for cleaner quotes">
                <Select
                  value={settings.roundingMode}
                  onValueChange={(v) => update("roundingMode", v as Settings3D["roundingMode"])}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No rounding (exact)</SelectItem>
                    <SelectItem value="dollar">Round to nearest $1</SelectItem>
                    <SelectItem value="custom">Round to nearest…</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              {settings.roundingMode === "custom" && (
                <FieldRow label="Round to nearest" hint="e.g. 0.50, 1, 5, 10">
                  <NumInput value={settings.roundingValue} onChange={(v) => update("roundingValue", v)} prefix="$" step="0.5" min="0.1" />
                </FieldRow>
              )}

              <div className="rounded-xl border bg-primary/5 border-primary/20 p-4 flex items-start gap-3">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Selling price = <strong>Cost × (1 + margin%)</strong>
                  {settings.roundingMode !== "none" && (
                    <>, then rounded to the nearest <strong>{settings.roundingMode === "dollar" ? "$1" : `$${settings.roundingValue}`}</strong></>
                  )}.
                  {" "}This is read-only in the POS calculator — update here to change all future quotes.
                </p>
              </div>
            </Section>

            {/* Energy & Overhead */}
            <Section icon={Zap} title="Energy & Operating Costs" description="Electricity and facility overhead per print hour">
              <FieldRow label="Electricity Rate" hint="Australian average ~$0.28–0.38 / kWh">
                <NumInput value={settings.electricityRate} onChange={(v) => update("electricityRate", v)} prefix="$" suffix="/kWh" step="0.01" />
              </FieldRow>
              <FieldRow label="Overhead per Hour" hint="Rent, cooling, ventilation, Internet">
                <NumInput value={settings.overheadPerHour} onChange={(v) => update("overheadPerHour", v)} prefix="$" suffix="/hr" step="0.05" />
              </FieldRow>
              <FieldRow label="Printer Cooling Factor" hint="Average power vs peak (0.7 = 70% of peak)">
                <NumInput value={settings.coolingFactor} onChange={(v) => update("coolingFactor", v)} suffix="×" step="0.05" min="0.1" />
              </FieldRow>

              <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">Effective power draw</span>
                <span className="font-semibold text-primary">
                  {(settings.printerWattage * settings.coolingFactor).toFixed(0)} W avg
                </span>
              </div>
            </Section>

            {/* Risk & Waste */}
            <Section icon={AlertTriangle} title="Risk & Waste" description="Accounts for failed prints and filament waste">
              <FieldRow label="Failure Rate" hint="Percentage of prints that fail on average">
                <NumInput value={settings.failureRate} onChange={(v) => update("failureRate", v)} suffix="%" step="0.5" />
              </FieldRow>
              <FieldRow label="Filament Waste" hint="Purge lines, supports, brims, skirts">
                <NumInput value={settings.filamentWastePercent} onChange={(v) => update("filamentWastePercent", v)} suffix="%" step="0.5" />
              </FieldRow>

              <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  A <strong>{settings.failureRate}%</strong> failure rate adds a
                  {" "}<strong>{settings.failureRate}%</strong> buffer to every job's material &amp; energy costs,
                  ensuring failed prints are covered over time.
                </p>
              </div>
            </Section>

            {/* Summary card */}
            <Card className="border-primary/20 bg-primary/3">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Settings Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {[
                    ["Printer", selectedPreset ? `${selectedPreset.brand} ${selectedPreset.model}` : "Custom"],
                    ["Wattage", `${settings.printerWattage} W (${(settings.printerWattage * settings.coolingFactor).toFixed(0)} W avg)`],
                    ["Electricity", `$${settings.electricityRate}/kWh`],
                    ["Overhead", `$${settings.overheadPerHour}/hr`],
                    ["Depreciation", `$${depreciationPerHour.toFixed(4)}/hr`],
                    ["Labour Rate", `$${settings.laborRate}/hr`],
                    ["Setup Time", `${settings.setupTimeMinutes} min`],
                    ["Post-Process", `${settings.postProcessingMinutes} min`],
                    ["Failure Rate", `${settings.failureRate}%`],
                    ["Filament Waste", `${settings.filamentWastePercent}%`],
                    ["Profit Margin", `${settings.profitMargin}%`],
                    ["Rounding", settings.roundingMode === "none" ? "None" : settings.roundingMode === "dollar" ? "Nearest $1" : `Nearest $${settings.roundingValue}`],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-medium truncate">{v}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Bottom save bar */}
        {dirty && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-background border shadow-lg rounded-xl px-4 py-3 z-40">
            <span className="text-sm text-muted-foreground">You have unsaved changes</span>
            <Button variant="outline" size="sm" onClick={handleReset}>Discard</Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave}>
              <Save className="w-3.5 h-3.5" /> Save Settings
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
