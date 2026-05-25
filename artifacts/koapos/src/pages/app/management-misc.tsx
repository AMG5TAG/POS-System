import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Map, ExternalLink } from "lucide-react";
import { toast } from "sonner";

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
  const p = provider ?? ((localStorage.getItem(MAP_PROVIDER_KEY) as MapProvider) ?? "google");
  const q = encodeURIComponent(address);
  switch (p) {
    case "apple":          return `https://maps.apple.com/?q=${q}`;
    case "openstreetmap":  return `https://www.openstreetmap.org/search?query=${q}`;
    case "waze":           return `https://waze.com/ul?q=${q}`;
    case "google":
    default:               return `https://maps.google.com/maps?q=${q}`;
  }
}

export default function ManagementMiscPage() {
  const [provider, setProvider] = useState<MapProvider>("google");

  useEffect(() => {
    const stored = localStorage.getItem(MAP_PROVIDER_KEY) as MapProvider | null;
    if (stored) setProvider(stored);
  }, []);

  function save() {
    localStorage.setItem(MAP_PROVIDER_KEY, provider);
    toast.success("Map provider saved");
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Misc Settings</h1>
          <p className="text-muted-foreground mt-1">Miscellaneous preferences for your KoaPOS system.</p>
        </div>

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

            <Button onClick={save} className="mt-2">
              Save
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
