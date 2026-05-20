import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Cpu, HardDrive, Layers, Box, Zap, Wind, Laptop, Monitor,
  Package, Save, RotateCcw, DollarSign, Clock, Wrench,
  CircuitBoard, MemoryStick, Keyboard, MousePointer2,
  Headphones, Volume2, AlertTriangle, Settings,
} from "lucide-react";

/* ─── PC Part Slots ──────────────────────────────────────────────────────── */

export const PC_PART_SLOTS = [
  { id: "cpu",         label: "CPU",               icon: Cpu           },
  { id: "motherboard", label: "Motherboard",        icon: CircuitBoard  },
  { id: "memory",      label: "Memory / RAM",       icon: MemoryStick   },
  { id: "storage",     label: "Storage",            icon: HardDrive     },
  { id: "gpu",         label: "Video Card",         icon: Layers        },
  { id: "case",        label: "Case",               icon: Box           },
  { id: "psu",         label: "Power Supply",       icon: Zap           },
  { id: "cooler",      label: "CPU Cooler",         icon: Wind          },
  { id: "os",          label: "Operating System",   icon: Laptop        },
  { id: "monitor",     label: "Monitor",            icon: Monitor       },
  { id: "keyboard",    label: "Keyboard",           icon: Keyboard      },
  { id: "mouse",       label: "Mouse",              icon: MousePointer2 },
  { id: "headset",     label: "Headset",            icon: Headphones    },
  { id: "speakers",    label: "Speakers",           icon: Volume2       },
  { id: "other",       label: "Other / Accessory",  icon: Package       },
] as const;

export type PCPartSlotId = typeof PC_PART_SLOTS[number]["id"];

/* ─── Compat storage ─────────────────────────────────────────────────────── */

export interface PCPartCompat {
  partType: string;
  socket: string;
  specs: string;
}

export const PC_COMPAT_STORAGE_KEY = "koapos_pc_compat";
export type PCCompatMap = Record<string, PCPartCompat>;

export function loadPCCompat(): PCCompatMap {
  try {
    const raw = localStorage.getItem(PC_COMPAT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PCCompatMap) : {};
  } catch { return {}; }
}

export function savePCCompat(map: PCCompatMap) {
  localStorage.setItem(PC_COMPAT_STORAGE_KEY, JSON.stringify(map));
}

/* ─── Builder settings ───────────────────────────────────────────────────── */

export interface PCBuilderSettings {
  applyDefaultMarkup: boolean;
  defaultMarkup: number;
  laborRate: number;
  assemblyTimeMinutes: number;
  includeGST: boolean;
  showCompatWarnings: boolean;
  enabledSlots: string[];
}

const PC_BUILDER_SETTINGS_KEY = "koapos_pc_builder_settings";

const ALL_SLOT_IDS = PC_PART_SLOTS.map((s) => s.id);

const DEFAULTS: PCBuilderSettings = {
  applyDefaultMarkup: false,
  defaultMarkup: 20,
  laborRate: 75,
  assemblyTimeMinutes: 90,
  includeGST: true,
  showCompatWarnings: true,
  enabledSlots: ALL_SLOT_IDS.filter((id) =>
    ["cpu","motherboard","memory","storage","gpu","case","psu","cooler","os"].includes(id)
  ),
};

export function loadPCBuilderSettings(): PCBuilderSettings {
  try {
    const raw = localStorage.getItem(PC_BUILDER_SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return DEFAULTS; }
}

function savePCBuilderSettings(s: PCBuilderSettings) {
  localStorage.setItem(PC_BUILDER_SETTINGS_KEY, JSON.stringify(s));
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementCalculatorsPCBuilderPage() {
  const [settings, setSettings] = useState<PCBuilderSettings>(() => loadPCBuilderSettings());
  const [dirty, setDirty]       = useState(false);

  const update = <K extends keyof PCBuilderSettings>(k: K, v: PCBuilderSettings[K]) => {
    setSettings((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };

  const toggleSlot = (id: string) => {
    const next = settings.enabledSlots.includes(id)
      ? settings.enabledSlots.filter((s) => s !== id)
      : [...settings.enabledSlots, id];
    update("enabledSlots", next);
  };

  const handleSave = () => {
    savePCBuilderSettings(settings);
    setDirty(false);
    toast.success("PC Builder settings saved");
  };

  const handleReset = () => {
    setSettings(DEFAULTS);
    savePCBuilderSettings(DEFAULTS);
    setDirty(false);
    toast.success("Settings reset to defaults");
  };

  return (
    <AppLayout>
      <div className="w-full px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PC Builder Defaults</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure default settings used when quoting custom PC builds in the POS.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty} className="gap-1.5">
              <Save className="w-3.5 h-3.5" /> Save Settings
            </Button>
          </div>
        </div>

        {dirty && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            You have unsaved changes. Click Save Settings to apply them.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── Pricing Defaults ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Pricing Defaults</CardTitle>
              </div>
              <CardDescription>Applied to all PC builds unless overridden on the build itself.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              <div>
                <div className="flex items-center justify-between p-3.5 border rounded-xl hover:bg-muted/20 transition-colors mb-3">
                  <div>
                    <p className="text-sm font-medium">Apply Default Markup</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Pre-fill a markup % on every new build</p>
                  </div>
                  <Switch
                    checked={settings.applyDefaultMarkup}
                    onCheckedChange={(v) => update("applyDefaultMarkup", v)}
                  />
                </div>
                {settings.applyDefaultMarkup && (
                  <>
                    <Label className="text-xs text-muted-foreground">Default Markup (%)</Label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Input
                        type="number" min="0" max="500" step="1"
                        value={settings.defaultMarkup}
                        onChange={(e) => update("defaultMarkup", parseFloat(e.target.value) || 0)}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">% above cost price</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Applied on top of parts + assembly cost.
                    </p>
                  </>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Assembly Labor Rate ($/hr)</Label>
                  <div className="flex items-center mt-1.5">
                    <span className="text-sm text-muted-foreground px-2.5 py-2 bg-muted border border-r-0 rounded-l-md">$</span>
                    <Input
                      type="number" min="0" step="5"
                      value={settings.laborRate}
                      onChange={(e) => update("laborRate", parseFloat(e.target.value) || 0)}
                      className="rounded-l-none"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Assembly Time (minutes)</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type="number" min="0" step="15"
                      value={settings.assemblyTimeMinutes}
                      onChange={(e) => update("assemblyTimeMinutes", parseInt(e.target.value) || 0)}
                    />
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                Estimated assembly cost:{" "}
                <span className="font-medium text-foreground">
                  ${((settings.laborRate / 60) * settings.assemblyTimeMinutes).toFixed(2)}
                </span>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 border rounded-xl hover:bg-muted/20 transition-colors">
                  <div>
                    <p className="text-sm font-medium">Include GST (10%)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Add GST to the quoted build price</p>
                  </div>
                  <Switch checked={settings.includeGST} onCheckedChange={(v) => update("includeGST", v)} />
                </div>
                <div className="flex items-center justify-between p-3.5 border rounded-xl hover:bg-muted/20 transition-colors">
                  <div>
                    <p className="text-sm font-medium">Compatibility Warnings</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Flag socket or spec mismatches between parts</p>
                  </div>
                  <Switch checked={settings.showCompatWarnings} onCheckedChange={(v) => update("showCompatWarnings", v)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Component Slots ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Default Component Slots</CardTitle>
              </div>
              <CardDescription>
                Choose which slots appear by default when starting a new PC build. You can always add more slots on the build itself.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {PC_PART_SLOTS.map(({ id, label, icon: Icon }) => {
                  const enabled = settings.enabledSlots.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleSlot(id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all text-sm",
                        enabled
                          ? "border-primary/30 bg-primary/5 text-foreground"
                          : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", enabled ? "text-primary" : "text-muted-foreground")} />
                      <span className="flex-1 font-medium">{label}</span>
                      <Badge
                        variant={enabled ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {enabled ? "Shown" : "Hidden"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1"
                  onClick={() => update("enabledSlots", ALL_SLOT_IDS)}>
                  Show All
                </Button>
                <Button variant="outline" size="sm" className="flex-1"
                  onClick={() => update("enabledSlots", DEFAULTS.enabledSlots)}>
                  Reset to Default
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* ── About Compatibility ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">How PC Compatibility Works</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
              {[
                { step: "1", title: "Tag products in Inventory", desc: "Open any product and go to the Compatibility tab. Set its PC Part Type (CPU, Motherboard, etc.) and socket/spec info." },
                { step: "2", title: "Build in POS", desc: "Go to POS → PC Builder and select components for each slot. Only products tagged for that slot will appear." },
                { step: "3", title: "Compatibility check", desc: "When warnings are enabled, mismatched sockets (e.g. AM5 CPU with LGA1700 Motherboard) are highlighted automatically." },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground text-xs mt-1">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
