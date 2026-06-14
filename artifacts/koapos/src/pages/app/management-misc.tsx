import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Map, ExternalLink, Hash, Shuffle, LayoutPanelLeft, Type, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPosSettings, useUpsertPosSettings,
  useGetPosCodePrefixes, useUpdatePosCodePrefixes,
  useGetInventorySettings, useUpdateInventorySettings,
} from "@workspace/api-client-react";

// Map provider preference now lives in @/lib/map-provider so every address link
// across the app can share it. Re-exported here for backwards-compatibility.
import { MAP_PROVIDER_KEY, MAP_PROVIDERS, buildMapUrl, type MapProvider } from "@/lib/map-provider";
export { MAP_PROVIDER_KEY, MAP_PROVIDERS, buildMapUrl, type MapProvider };

/* ─── Code Prefixes ──────────────────────────────────────────────────────── */

export const CODE_PREFIX_KEY = "koapos_code_prefixes";

export interface CodePrefixSettings {
  receiptPrefix:     string; receiptDigits:     number;
  invoicePrefix:     string; invoiceDigits:     number;
  servicePrefix:     string; serviceDigits:     number;
  appointmentPrefix: string; appointmentDigits: number;
  poPrefix:          string; poDigits:          number;
}

export const CODE_PREFIX_DEFAULTS: CodePrefixSettings = {
  receiptPrefix: "KR",     receiptDigits: 5,
  invoicePrefix: "KI",     invoiceDigits: 5,
  servicePrefix: "KS",     serviceDigits: 5,
  appointmentPrefix: "KA", appointmentDigits: 5,
  poPrefix: "KP",          poDigits: 5,
};

export function loadCodePrefixes(): CodePrefixSettings {
  return CODE_PREFIX_DEFAULTS;
}

export function saveCodePrefixes(_s: CodePrefixSettings) {
  /* no-op */
}

export function previewCode(prefix: string, digits: number) {
  return `${prefix}${"0".repeat(Math.max(1, digits - 1))}1`;
}

function previewSKU(prefix: string) {
  return `${prefix || "KP"}-${Math.floor(10000 + Math.random() * 90000)}`;
}

export default function ManagementMiscPage() {
  const queryClient = useQueryClient();
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const { data: prefixesData } = useGetPosCodePrefixes({ query: { queryKey: ["pos-code-prefixes"] } });
  const { data: invSettings } = useGetInventorySettings({ query: { queryKey: ["inventory-settings"] } });
  const upsertPosSettings = useUpsertPosSettings();
  const updatePrefixes = useUpdatePosCodePrefixes();
  const updateInventory = useUpdateInventorySettings();

  const [provider, setProvider] = useState<MapProvider>("google");
  const [buttonStyle, setButtonStyle] = useState<"icon" | "icon_text" | "text">("icon");
  const [codePrefixes, setCodePrefixes] = useState<CodePrefixSettings>(CODE_PREFIX_DEFAULTS);
  const [skuPrefix, setSkuPrefix] = useState("KP");
  const [skuPreview, setSkuPreview] = useState(() => previewSKU("KP"));

  useEffect(() => {
    if (posSettings?.mapProvider) setProvider(posSettings.mapProvider as MapProvider);
    if (posSettings?.buttonStyle) setButtonStyle(posSettings.buttonStyle as "icon" | "icon_text" | "text");
  }, [posSettings]);

  useEffect(() => {
    if (prefixesData) {
      setCodePrefixes({
        receiptPrefix: prefixesData.receiptPrefix, receiptDigits: prefixesData.receiptDigits,
        invoicePrefix: prefixesData.invoicePrefix, invoiceDigits: prefixesData.invoiceDigits,
        servicePrefix: prefixesData.servicePrefix, serviceDigits: prefixesData.serviceDigits,
        appointmentPrefix: prefixesData.appointmentPrefix, appointmentDigits: prefixesData.appointmentDigits,
        poPrefix: prefixesData.poPrefix, poDigits: prefixesData.poDigits,
      });
    }
  }, [prefixesData]);

  useEffect(() => {
    if (invSettings?.skuPrefix) {
      setSkuPrefix(invSettings.skuPrefix);
      setSkuPreview(previewSKU(invSettings.skuPrefix));
    }
  }, [invSettings]);

  function handleSkuPrefixChange(v: string) {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setSkuPrefix(clean);
    setSkuPreview(previewSKU(clean));
    updateInventory.mutate({ data: { skuPrefix: clean } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory-settings"] }),
      onError: () => toast.error("Failed to save SKU prefix"),
    });
  }

  const updatePrefix = <K extends keyof CodePrefixSettings>(key: K, value: CodePrefixSettings[K]) =>
    setCodePrefixes((prev) => ({ ...prev, [key]: value }));

  function saveMap() {
    upsertPosSettings.mutate({ data: { mapProvider: provider } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["pos-settings"] });
        toast.success("Map provider saved");
      },
      onError: () => toast.error("Failed to save map provider"),
    });
  }

  function saveButtonStyle(style: "icon" | "icon_text" | "text") {
    setButtonStyle(style);
    upsertPosSettings.mutate({ data: { buttonStyle: style } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos-settings"] }),
      onError: () => toast.error("Failed to save button style"),
    });
  }

  function saveCodePrefixesHandler() {
    updatePrefixes.mutate({ data: codePrefixes }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["pos-code-prefixes"] });
        toast.success("Document code prefixes saved");
      },
      onError: () => toast.error("Failed to save code prefixes"),
    });
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Misc Settings</h1>
          <p className="text-muted-foreground mt-1">Miscellaneous preferences for your KoaPOS system.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Left column: Maps Provider + POS Button Style each keep their natural
            height. The Code Prefixes card on the right stretches to match the
            combined height of these two, rather than Maps Provider stretching to
            match Code Prefixes. */}
        <div className="space-y-6">

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="w-5 h-5" />
              Maps Provider
            </CardTitle>
            <CardDescription>
              Choose which map app opens when you tap an address anywhere in KoaPOS (appointments, customers, etc.).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={provider}
              onValueChange={(v) => setProvider(v as MapProvider)}
              className="space-y-3"
            >
              {MAP_PROVIDERS.map((p) => (
                <div key={p.id} className="flex items-start gap-3">
                  <RadioGroupItem value={p.id} id={`map-${p.id}`} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Label htmlFor={`map-${p.id}`} className="font-medium cursor-pointer">
                      {p.label}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-0.5">{p.description}</p>
                    <a
                      href={p.testUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Test with Sydney Opera House
                    </a>
                  </div>
                </div>
              ))}
            </RadioGroup>

            <Button onClick={saveMap} className="mt-2">
              Save Map Provider
            </Button>
          </CardContent>
        </Card>

        {/* POS Button Style */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutPanelLeft className="w-5 h-5" />
              POS Button Style
            </CardTitle>
            <CardDescription>
              Choose how action buttons are displayed throughout KoaPOS — icon only, icon with text, or text only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={buttonStyle}
              onValueChange={(v) => saveButtonStyle(v as "icon" | "icon_text" | "text")}
              className="grid grid-cols-3 gap-3"
            >
              {([
                {
                  value: "icon",
                  label: "Icon",
                  Icon: LayoutTemplate,
                  description: "Icon only",
                  preview: (
                    <div className="flex items-center gap-1.5 mt-2">
                      {["🗑", "📝", "🔗"].map((e, i) => (
                        <span key={i} className="w-7 h-7 rounded border flex items-center justify-center text-sm bg-muted/50">{e}</span>
                      ))}
                    </div>
                  ),
                },
                {
                  value: "icon_text",
                  label: "Icon + Text",
                  Icon: LayoutPanelLeft,
                  description: "Icon with label",
                  preview: (
                    <div className="flex flex-col gap-1 mt-2">
                      {[["🗑", "Clear"], ["📝", "Notes"]].map(([e, t], i) => (
                        <span key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded border bg-muted/50 text-[10px] w-fit">
                          <span>{e}</span><span>{t}</span>
                        </span>
                      ))}
                    </div>
                  ),
                },
                {
                  value: "text",
                  label: "Text",
                  Icon: Type,
                  description: "Text only",
                  preview: (
                    <div className="flex flex-col gap-1 mt-2">
                      {["Clear", "Notes", "Link"].map((t, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded border bg-muted/50 text-[10px] w-fit">{t}</span>
                      ))}
                    </div>
                  ),
                },
              ] as const).map(({ value, label, description, preview }) => (
                <label
                  key={value}
                  htmlFor={`btn-style-${value}`}
                  className={`cursor-pointer rounded-xl border-2 p-3 transition-colors flex flex-col ${
                    buttonStyle === value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={value} id={`btn-style-${value}`} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-5">{description}</p>
                  <div className="ml-5">{preview}</div>
                </label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        </div>

        {/* Code Prefixes — fills the right column so it dynamically matches the
            combined height of Maps Provider + POS Button Style on the left. */}
        <Card id="code-prefixes" className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="w-5 h-5" /> Code Prefixes
            </CardTitle>
            <CardDescription>
              Set the prefix and number length for receipts, invoices, service jobs, appointments and purchase orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  { label: "Receipt",         prefixKey: "receiptPrefix",     digitsKey: "receiptDigits"     },
                  { label: "Invoice",         prefixKey: "invoicePrefix",     digitsKey: "invoiceDigits"     },
                  { label: "Service Job",     prefixKey: "servicePrefix",     digitsKey: "serviceDigits"     },
                  { label: "Appointment",     prefixKey: "appointmentPrefix", digitsKey: "appointmentDigits" },
                  { label: "Purchase Order",  prefixKey: "poPrefix",          digitsKey: "poDigits"          },
                ] as { label: string; prefixKey: keyof CodePrefixSettings; digitsKey: keyof CodePrefixSettings }[]
              ).map(({ label, prefixKey, digitsKey }) => (
                <div key={prefixKey} className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{label}</p>
                    <Badge variant="outline" className="font-mono text-xs">
                      {previewCode(String(codePrefixes[prefixKey]), Number(codePrefixes[digitsKey]))}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Prefix</Label>
                      <Input
                        value={String(codePrefixes[prefixKey])}
                        onChange={(e) => updatePrefix(prefixKey, e.target.value.toUpperCase())}
                        className="font-mono"
                        maxLength={6}
                        placeholder="KR"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Digits</Label>
                      <Input
                        type="number" min={1} max={10}
                        value={Number(codePrefixes[digitsKey])}
                        onChange={(e) => updatePrefix(digitsKey, Math.min(10, Math.max(1, parseInt(e.target.value) || 1)) as CodePrefixSettings[typeof digitsKey])}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={saveCodePrefixesHandler}>Save Code Prefixes</Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">SKU Generator</p>
              </div>
              <p className="text-xs text-muted-foreground">Set the prefix used when auto-generating SKU codes for products.</p>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="w-[160px] space-y-1">
                  <Label className="text-xs text-muted-foreground">SKU Prefix</Label>
                  <Input
                    value={skuPrefix}
                    onChange={(e) => handleSkuPrefixChange(e.target.value)}
                    placeholder="KP"
                    maxLength={6}
                    className="font-mono uppercase"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 mb-0.5"
                  onClick={() => setSkuPreview(previewSKU(skuPrefix))}>
                  <Shuffle className="w-3.5 h-3.5" /> Preview
                </Button>
                <span className="text-sm text-muted-foreground mb-1 font-mono">{skuPreview}</span>
              </div>
              <p className="text-xs text-muted-foreground">Format: <span className="font-mono">{skuPrefix || "KP"}-NNNNN</span></p>
            </div>
          </CardContent>
        </Card>

        </div>
      </div>
    </AppLayout>
  );
}
