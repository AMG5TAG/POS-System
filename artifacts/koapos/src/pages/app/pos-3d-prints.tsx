import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useCreateProduct } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Cpu, Clock, RotateCcw, Info, ChevronRight, Settings,
  Package, Weight, Printer, Calculator, ShoppingCart,
} from "lucide-react";
import { load3DSettings, PRINTER_PRESETS, type Settings3D } from "./management-calculators-3d";

/* ─── Filament data ──────────────────────────────────────────────────────── */

export interface Filament {
  id: string;
  name: string;
  brand: string;
  type: string;
  pricePerKg: number;
  density: number;         // g/cm³
  nozzleTemp: number;      // °C
  bedTemp: number;         // °C
  notes?: string;
  color?: string;          // tailwind colour hint
}

export const ELEGOO_FILAMENTS: Filament[] = [
  /* PLA family */
  { id: "pla-basic",    brand: "Elegoo", type: "PLA",     name: "PLA Basic",         pricePerKg: 26.99, density: 1.24, nozzleTemp: 220, bedTemp: 60,  color: "blue",   notes: "Great all-rounder, easy to print" },
  { id: "pla-plus",     brand: "Elegoo", type: "PLA+",    name: "PLA+",               pricePerKg: 28.99, density: 1.24, nozzleTemp: 225, bedTemp: 65,  color: "indigo", notes: "Higher toughness than standard PLA" },
  { id: "pla-matte",    brand: "Elegoo", type: "PLA",     name: "PLA Matte",          pricePerKg: 29.99, density: 1.24, nozzleTemp: 220, bedTemp: 60,  color: "gray",   notes: "Matte finish, no glare" },
  { id: "pla-silk",     brand: "Elegoo", type: "PLA",     name: "PLA Silk",           pricePerKg: 32.99, density: 1.24, nozzleTemp: 230, bedTemp: 60,  color: "yellow", notes: "Shiny metallic-like surface" },
  { id: "pla-luminous", brand: "Elegoo", type: "PLA",     name: "PLA Luminous",       pricePerKg: 34.99, density: 1.24, nozzleTemp: 220, bedTemp: 60,  color: "green",  notes: "Glow-in-the-dark" },
  { id: "pla-metal",    brand: "Elegoo", type: "PLA",     name: "PLA Metal",          pricePerKg: 36.99, density: 1.26, nozzleTemp: 225, bedTemp: 60,  color: "zinc",   notes: "Metallic look with copper/gold/silver finishes" },
  { id: "pla-marble",   brand: "Elegoo", type: "PLA",     name: "PLA Marble",         pricePerKg: 33.99, density: 1.24, nozzleTemp: 220, bedTemp: 60,  color: "stone",  notes: "Marble-look stone finish" },
  { id: "pla-hs",       brand: "Elegoo", type: "PLA-HS",  name: "PLA High Speed",     pricePerKg: 31.99, density: 1.24, nozzleTemp: 220, bedTemp: 60,  color: "sky",    notes: "Optimised for high-speed printing (200+ mm/s)" },
  { id: "pla-cf",       brand: "Elegoo", type: "PLA-CF",  name: "PLA Carbon Fibre",   pricePerKg: 54.99, density: 1.29, nozzleTemp: 230, bedTemp: 65,  color: "neutral",notes: "Carbon-fibre fill; hardened nozzle required" },
  /* PETG family */
  { id: "petg-basic",   brand: "Elegoo", type: "PETG",    name: "PETG",               pricePerKg: 31.99, density: 1.27, nozzleTemp: 240, bedTemp: 80,  color: "teal",   notes: "Food-safe, chemical resistant, flexible" },
  { id: "petg-cf",      brand: "Elegoo", type: "PETG-CF", name: "PETG Carbon Fibre",  pricePerKg: 57.99, density: 1.30, nozzleTemp: 250, bedTemp: 85,  color: "zinc",   notes: "High rigidity; hardened nozzle required" },
  { id: "petg-hs",      brand: "Elegoo", type: "PETG-HS", name: "PETG High Speed",    pricePerKg: 34.99, density: 1.27, nozzleTemp: 240, bedTemp: 80,  color: "cyan",   notes: "Fast printing PETG" },
  /* ABS / ASA */
  { id: "abs",          brand: "Elegoo", type: "ABS",     name: "ABS",                pricePerKg: 29.99, density: 1.04, nozzleTemp: 245, bedTemp: 105, color: "orange", notes: "Impact resistant; requires enclosure" },
  { id: "asa",          brand: "Elegoo", type: "ASA",     name: "ASA",                pricePerKg: 37.99, density: 1.07, nozzleTemp: 255, bedTemp: 100, color: "amber",  notes: "UV & weather resistant; outdoor use" },
  /* TPU */
  { id: "tpu-95a",      brand: "Elegoo", type: "TPU",     name: "TPU 95A",            pricePerKg: 41.99, density: 1.21, nozzleTemp: 230, bedTemp: 40,  color: "violet", notes: "Flexible, rubber-like; shore 95A" },
  { id: "tpu-85a",      brand: "Elegoo", type: "TPU",     name: "TPU 85A (Soft)",     pricePerKg: 43.99, density: 1.21, nozzleTemp: 225, bedTemp: 40,  color: "purple", notes: "Extra-soft flexible; shore 85A" },
  /* Engineering */
  { id: "pa-cf",        brand: "Elegoo", type: "PA-CF",   name: "PA-CF (Nylon+CF)",   pricePerKg: 64.99, density: 1.12, nozzleTemp: 285, bedTemp: 90,  color: "red",    notes: "High-strength; needs dry box & hardened nozzle" },
  { id: "pa12-cf",      brand: "Elegoo", type: "PA12-CF", name: "PA12-CF",            pricePerKg: 69.99, density: 1.14, nozzleTemp: 280, bedTemp: 90,  color: "rose",   notes: "High dimensional stability nylon+CF" },
  /* Custom */
  { id: "custom",       brand: "Other",  type: "Custom",  name: "Custom Filament",    pricePerKg: 30.00, density: 1.24, nozzleTemp: 220, bedTemp: 60 },
];

const FILAMENT_TYPES = [...new Set(ELEGOO_FILAMENTS.map((f) => f.type))];

/* ─── Calculation ────────────────────────────────────────────────────────── */

interface CalcInputs {
  printWeightGrams: number;
  printHours: number;
  printMinutes: number;
  filamentId: string;
  customPricePerKg: number;
}

interface CalcResult {
  printTimeHours: number;
  materialCost: number;
  wasteAdjustedMaterialCost: number;
  electricityCost: number;
  depreciationCost: number;
  laborCost: number;
  overheadCost: number;
  failureBuffer: number;
  totalCost: number;
  sellingPrice: number;
  pricePerGram: number;
}

function calculate(inputs: CalcInputs, settings: Settings3D): CalcResult {
  const filament = ELEGOO_FILAMENTS.find((f) => f.id === inputs.filamentId) ?? ELEGOO_FILAMENTS[0];
  const pricePerKg = inputs.filamentId === "custom" ? inputs.customPricePerKg : inputs.customPricePerKg;
  const pricePerGram = pricePerKg / 1000;

  const printTimeHours = inputs.printHours + inputs.printMinutes / 60;
  const setupHours = settings.setupTimeMinutes / 60;
  const postHours = settings.postProcessingMinutes / 60;
  const totalLaborHours = setupHours + postHours;

  // Material cost with waste adjustment
  const effectiveWeight = inputs.printWeightGrams * (1 + settings.filamentWastePercent / 100);
  const wasteAdjustedMaterialCost = effectiveWeight * pricePerGram;
  const materialCost = inputs.printWeightGrams * pricePerGram;

  // Electricity: wattage × cooling factor × hours / 1000 × rate
  const effectiveKw = (settings.printerWattage * settings.coolingFactor) / 1000;
  const electricityCost = effectiveKw * printTimeHours * settings.electricityRate;

  // Machine depreciation
  const depreciationPerHour = settings.lifetimeHours > 0
    ? settings.purchasePrice / settings.lifetimeHours
    : 0;
  const depreciationCost = depreciationPerHour * printTimeHours;

  // Labor
  const laborCost = totalLaborHours * settings.laborRate;

  // Overhead
  const overheadCost = (printTimeHours + totalLaborHours) * settings.overheadPerHour;

  // Failure buffer on variable costs
  const variableCost = wasteAdjustedMaterialCost + electricityCost;
  const failureBuffer = variableCost * (settings.failureRate / 100);

  const totalCost = wasteAdjustedMaterialCost + electricityCost + depreciationCost + laborCost + overheadCost + failureBuffer;
  const rawSellingPrice = totalCost * (1 + settings.profitMargin / 100);
  let sellingPrice = rawSellingPrice;
  if (settings.roundingMode === "dollar") {
    sellingPrice = Math.round(rawSellingPrice);
  } else if (settings.roundingMode === "custom" && settings.roundingValue > 0) {
    sellingPrice = Math.round(rawSellingPrice / settings.roundingValue) * settings.roundingValue;
  }

  return {
    printTimeHours,
    materialCost,
    wasteAdjustedMaterialCost,
    electricityCost,
    depreciationCost,
    laborCost,
    overheadCost,
    failureBuffer,
    totalCost,
    sellingPrice,
    pricePerGram,
  };
}

function fmt(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Row component ──────────────────────────────────────────────────────── */

function CostRow({
  icon: Icon,
  label,
  sublabel,
  value,
  highlight,
  dim,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sublabel?: string;
  value: number;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between py-2.5 px-3 rounded-lg",
      highlight ? "bg-primary/8 border border-primary/20" : "hover:bg-muted/30",
      dim && "opacity-60"
    )}>
      <div className="flex items-center gap-2.5">
        <Icon className={cn("w-3.5 h-3.5 shrink-0", highlight ? "text-primary" : "text-muted-foreground")} />
        <div>
          <p className={cn("text-sm", highlight && "font-semibold")}>{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
        </div>
      </div>
      <span className={cn("text-sm tabular-nums", highlight ? "text-primary font-bold text-base" : "font-medium")}>
        {fmt(value)}
      </span>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function POS3DPrintsPage() {
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState<Settings3D | null>(null);
  const [filamentId, setFilamentId] = useState("pla-basic");
  const [filterType, setFilterType] = useState("All");
  const [printWeightGrams, setPrintWeightGrams] = useState(50);
  const [printHours, setPrintHours] = useState(4);
  const [printMinutes, setPrintMinutes] = useState(30);
  const [customPricePerKg, setCustomPricePerKg] = useState(26.99);

  const createProductMutation = useCreateProduct();

  useEffect(() => {
    setSettings(load3DSettings());
  }, []);

  // Keep customPricePerKg in sync with filament selection
  useEffect(() => {
    const f = ELEGOO_FILAMENTS.find((f) => f.id === filamentId);
    if (f) setCustomPricePerKg(f.pricePerKg);
  }, [filamentId]);

  const selectedFilament = ELEGOO_FILAMENTS.find((f) => f.id === filamentId) ?? ELEGOO_FILAMENTS[0];

  const result = useMemo<CalcResult | null>(() => {
    if (!settings) return null;
    return calculate(
      { printWeightGrams, printHours, printMinutes, filamentId, customPricePerKg },
      settings
    );
  }, [settings, printWeightGrams, printHours, printMinutes, filamentId, customPricePerKg]);

  const filteredFilaments = filterType === "All"
    ? ELEGOO_FILAMENTS
    : ELEGOO_FILAMENTS.filter((f) => f.type === filterType);

  function handleReset() {
    setFilamentId("pla-basic");
    setPrintWeightGrams(50);
    setPrintHours(4);
    setPrintMinutes(30);
    setFilterType("All");
    toast.success("Calculator reset");
  }

  function handleAddToSale() {
    if (!result) return;
    const filament = ELEGOO_FILAMENTS.find((f) => f.id === filamentId) ?? ELEGOO_FILAMENTS[0];
    const name = `3D Print — ${filament.type} ${printWeightGrams}g`;
    createProductMutation.mutate(
      {
        data: {
          name,
          price: parseFloat(result.sellingPrice.toFixed(2)),
          costPrice: parseFloat(result.totalCost.toFixed(2)),
          trackInventory: false,
          stockQuantity: 1,
          isActive: true,
        },
      },
      {
        onSuccess: () => {
          toast.success(`"${name}" added to products`, {
            description: "Find it in Products or search on the POS register.",
            action: { label: "Go to POS", onClick: () => navigate("/pos") },
          });
        },
        onError: () => toast.error("Failed to create product"),
      }
    );
  }

  if (!settings) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center h-64">
          <p className="text-muted-foreground text-sm">Loading settings...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 pb-12">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold">3D Prints</h1>
              <Badge variant="outline" className="text-xs">Cost Calculator</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Calculate material, energy and labour costs for 3D print jobs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => navigate("/management/calculators/3d-printing")}>
              <Settings className="w-3.5 h-3.5" /> Settings
            </Button>
          </div>
        </div>

        {/* Active printer info bar */}
        <div className="flex items-center gap-3 border rounded-xl px-4 py-3 bg-muted/20 text-sm">
          <Printer className="w-4 h-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Active printer:</span>
          <span className="font-medium">
            {settings.printerId === "custom"
              ? settings.customPrinterName || "Custom Printer"
              : (() => {
                  const p = PRINTER_PRESETS.find((p) => p.id === settings.printerId);
                  return p ? `${p.brand} ${p.model}` : settings.printerId;
                })()}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{settings.printerWattage} W</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Margin: <strong className="text-foreground">{settings.profitMargin}%</strong></span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

          {/* Filament Selection */}
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  Filament
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">

                {/* Type filter tabs */}
                <div className="flex flex-wrap gap-1.5">
                  {["All", ...FILAMENT_TYPES].map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                        filterType === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Filament grid */}
                <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto pr-1">
                  {filteredFilaments.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilamentId(f.id)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors w-full",
                        filamentId === f.id
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:bg-muted/30"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
                        filamentId === f.id ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}>
                        {filamentId === f.id && <div className="w-1.5 h-1.5 rounded-full bg-white m-auto mt-0.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{f.name}</span>
                          <Badge variant="outline" className="text-[10px] h-4 shrink-0">{f.type}</Badge>
                        </div>
                        {f.notes && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{f.notes}</p>}
                      </div>
                      <span className="text-sm font-semibold text-primary shrink-0">
                        ${f.pricePerKg.toFixed(2)}/kg
                      </span>
                    </button>
                  ))}
                </div>

                {/* Filament specs & price */}
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Selected: {selectedFilament.name}</span>
                    <Badge variant="secondary" className="text-xs">{selectedFilament.brand}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="text-center">
                      <p className="text-muted-foreground mb-0.5">Nozzle</p>
                      <p className="font-semibold">{selectedFilament.nozzleTemp}°C</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground mb-0.5">Bed</p>
                      <p className="font-semibold">{selectedFilament.bedTemp}°C</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground mb-0.5">Density</p>
                      <p className="font-semibold">{selectedFilament.density} g/cm³</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Price per kg (AUD) — editable</Label>
                    <div className="flex items-center">
                      <span className="inline-flex h-9 items-center border border-r-0 rounded-l-md px-3 bg-muted text-sm text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={customPricePerKg}
                        onChange={(e) => setCustomPricePerKg(parseFloat(e.target.value) || 0)}
                        className="h-9 rounded-l-none"
                      />
                      <span className="inline-flex h-9 items-center border border-l-0 rounded-r-md px-3 bg-muted text-sm text-muted-foreground">/kg</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      = ${result ? result.pricePerGram.toFixed(4) : "—"} per gram
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

          <div className="flex flex-col gap-4 h-full">

            {/* Print Parameters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-primary" />
                  Print Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">

                {/* Weight */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Weight className="w-3.5 h-3.5 text-muted-foreground" />
                    Print Weight
                  </Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center flex-1">
                      <span className="inline-flex h-9 items-center border border-r-0 rounded-l-md px-3 bg-muted text-sm text-muted-foreground shrink-0">
                        <Weight className="w-3 h-3" />
                      </span>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={printWeightGrams}
                        onChange={(e) => setPrintWeightGrams(parseFloat(e.target.value) || 0)}
                        className="h-9 rounded-l-none rounded-r-none"
                      />
                      <span className="inline-flex h-9 items-center border border-l-0 rounded-r-md px-3 bg-muted text-sm text-muted-foreground shrink-0">g</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ≈ {(printWeightGrams / 1000).toFixed(3)} kg
                    </span>
                  </div>
                  {/* Quick preset buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 10, 25, 50, 100, 200, 500].map((g) => (
                      <button
                        key={g}
                        onClick={() => setPrintWeightGrams(g)}
                        className={cn(
                          "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                          printWeightGrams === g
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:bg-muted/40"
                        )}
                      >
                        {g}g
                      </button>
                    ))}
                  </div>
                </div>

                {/* Print time */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    Print Time
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Hours</p>
                      <div className="flex items-center">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={printHours}
                          onChange={(e) => setPrintHours(parseInt(e.target.value) || 0)}
                          className="h-9 rounded-r-none"
                        />
                        <span className="inline-flex h-9 items-center border border-l-0 rounded-r-md px-3 bg-muted text-sm text-muted-foreground shrink-0">hrs</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Minutes</p>
                      <div className="flex items-center">
                        <Input
                          type="number"
                          step="5"
                          min="0"
                          max="59"
                          value={printMinutes}
                          onChange={(e) => setPrintMinutes(parseInt(e.target.value) || 0)}
                          className="h-9 rounded-r-none"
                        />
                        <span className="inline-flex h-9 items-center border border-l-0 rounded-r-md px-3 bg-muted text-sm text-muted-foreground shrink-0">min</span>
                      </div>
                    </div>
                  </div>
                  {/* Time presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "30m", h: 0, m: 30 },
                      { label: "1h", h: 1, m: 0 },
                      { label: "2h", h: 2, m: 0 },
                      { label: "4h", h: 4, m: 0 },
                      { label: "8h", h: 8, m: 0 },
                      { label: "12h", h: 12, m: 0 },
                      { label: "24h", h: 24, m: 0 },
                    ].map(({ label, h, m }) => (
                      <button
                        key={label}
                        onClick={() => { setPrintHours(h); setPrintMinutes(m); }}
                        className={cn(
                          "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                          printHours === h && printMinutes === m
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:bg-muted/40"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Total: {(printHours + printMinutes / 60).toFixed(2)} hours
                  </p>
                </div>

              </CardContent>
            </Card>

            {result && (
              <>
                {/* Selling price hero */}
                <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 flex-1 flex flex-col">
                  <CardContent className="pt-5 pb-5 flex flex-col flex-1 justify-center">
                    <div className="text-center space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended Selling Price</p>
                      <p className="text-4xl font-bold text-primary">{fmt(result.sellingPrice)}</p>
                      {settings.roundingMode !== "none" && (
                        <p className="text-xs text-muted-foreground">
                          Rounded to nearest {settings.roundingMode === "dollar" ? "$1" : `$${settings.roundingValue}`}
                        </p>
                      )}
                    </div>

                    <Separator className="my-4" />

                    <div className="grid grid-cols-3 gap-3 text-center text-xs">
                      <div>
                        <p className="text-muted-foreground mb-0.5">Print Weight</p>
                        <p className="font-semibold">{printWeightGrams} g</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Print Time</p>
                        <p className="font-semibold">{result.printTimeHours.toFixed(2)} hrs</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">$/gram</p>
                        <p className="font-semibold">${(result.sellingPrice / printWeightGrams).toFixed(3)}</p>
                      </div>
                    </div>

                    <Separator className="mt-4" />

                    <Button
                      className="w-full gap-2 mt-4"
                      onClick={handleAddToSale}
                      disabled={createProductMutation.isPending}
                    >
                      <ShoppingCart className="w-4 h-4" />
                      {createProductMutation.isPending ? "Adding…" : `Add to Sale — ${fmt(result.sellingPrice)}`}
                    </Button>
                  </CardContent>
                </Card>

            {/* Info note */}
            <div className="flex items-start gap-3 rounded-xl border bg-muted/20 px-4 py-3">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Costs are estimates. Actual energy usage varies by print type, room temperature, and slicer settings.</p>
                <button
                  onClick={() => navigate("/management/calculators/3d-printing")}
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium mt-1"
                >
                  Adjust printer settings &amp; margin <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
