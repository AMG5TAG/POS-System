import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Map, ExternalLink, Hash } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPosSettings, useUpsertPosSettings,
  useGetPosCodePrefixes, useUpdatePosCodePrefixes,
} from "@workspace/api-client-react";

export const MAP_PROVIDER_KEY = "koapos_map_provider";

export type MapProvider = "google" | "apple" | "openstreetmap" | "waze";

export const MAP_PROVIDERS: { id: MapProvider; label: string; description: string; testUrl: string }[] = [
  {
    id: "google",
    label: "Google Maps",
    description: "Opens addresses in Google Maps (works on all devices).",
    testUrl: "https://maps.google.com/maps?q=Sydney+Opera+House",
  },
  {
    id: "apple",
    label: "Apple Maps",
    description: "Opens addresses in Apple Maps (best on iPhone, iPad, and Mac).",
    testUrl: "https://maps.apple.com/?q=Sydney+Opera+House",
  },
  {
    id: "openstreetmap",
    label: "OpenStreetMap",
    description: "Opens addresses in OpenStreetMap — free and open-source.",
    testUrl: "https://www.openstreetmap.org/search?query=Sydney+Opera+House",
  },
  {
    id: "waze",
    label: "Waze",
    description: "Opens addresses in Waze for navigation with live traffic.",
    testUrl: "https://waze.com/ul?q=Sydney+Opera+House",
  },
];

export function buildMapUrl(address: string, provider?: MapProvider): string {
  const p = provider ?? "google";
  const q = encodeURIComponent(address);
  switch (p) {
    case "apple":          return `https://maps.apple.com/?q=${q}`;
    case "openstreetmap":  return `https://www.openstreetmap.org/search?query=${q}`;
    case "waze":           return `https://waze.com/ul?q=${q}`;
    case "google":
    default:               return `https://maps.google.com/maps?q=${q}`;
  }
}

/* ─── Document Code Prefixes ─────────────────────────────────────────────── */

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

export default function ManagementMiscPage() {
  const queryClient = useQueryClient();
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const { data: prefixesData } = useGetPosCodePrefixes({ query: { queryKey: ["pos-code-prefixes"] } });
  const upsertPosSettings = useUpsertPosSettings();
  const updatePrefixes = useUpdatePosCodePrefixes();

  const [provider, setProvider] = useState<MapProvider>("google");
  const [codePrefixes, setCodePrefixes] = useState<CodePrefixSettings>(CODE_PREFIX_DEFAULTS);

  useEffect(() => {
    if (posSettings?.mapProvider) setProvider(posSettings.mapProvider as MapProvider);
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

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

        {/* Document Code Prefixes */}
        <Card id="code-prefixes">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="w-5 h-5" /> Document Code Prefixes
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
          </CardContent>
        </Card>

        </div>
      </div>
    </AppLayout>
  );
}
