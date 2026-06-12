import { useGetPosSettings } from "@workspace/api-client-react";

/**
 * Single source of truth for the "Maps Provider" preference
 * (Management → Settings & Integrations → Misc → Maps Provider).
 *
 * The chosen provider is persisted server-side on POS settings (`mapProvider`).
 * Every place in the app that turns an address into an "open in maps" link must
 * go through `useMapUrl()` / `buildMapUrl()` so they all honour this one setting
 * — on desktop *and* on the mobile app.
 */

export const MAP_PROVIDER_KEY = "koapos_map_provider";

export type MapProvider = "google" | "apple" | "openstreetmap" | "waze";

export const DEFAULT_MAP_PROVIDER: MapProvider = "google";

export const MAP_PROVIDERS: { id: MapProvider; label: string; description: string; testUrl: string }[] = [
  {
    id: "google",
    label: "Google Maps",
    description: "Opens addresses in Google Maps (works on all devices).",
    testUrl: buildMapUrl("Sydney Opera House", "google"),
  },
  {
    id: "apple",
    label: "Apple Maps",
    description: "Opens addresses in Apple Maps (best on iPhone, iPad, and Mac).",
    testUrl: buildMapUrl("Sydney Opera House", "apple"),
  },
  {
    id: "openstreetmap",
    label: "OpenStreetMap",
    description: "Opens addresses in OpenStreetMap — free and open-source.",
    testUrl: buildMapUrl("Sydney Opera House", "openstreetmap"),
  },
  {
    id: "waze",
    label: "Waze",
    description: "Opens addresses in Waze for navigation with live traffic.",
    testUrl: buildMapUrl("Sydney Opera House", "waze"),
  },
];

/**
 * Build a maps URL for `address` using `provider` (defaults to Google).
 *
 * These are the cross-platform "universal" URLs for each provider: on a mobile
 * device they hand off to the installed native app (Google Maps / Apple Maps /
 * Waze) and otherwise fall back to the web, so the same link works in the
 * browser and in the mobile app shell.
 */
export function buildMapUrl(address: string, provider: MapProvider = DEFAULT_MAP_PROVIDER): string {
  const q = encodeURIComponent(address);
  switch (provider) {
    // Apple Maps universal link — opens the app on iOS/iPadOS/macOS, web elsewhere.
    case "apple":          return `https://maps.apple.com/?q=${q}`;
    case "openstreetmap":  return `https://www.openstreetmap.org/search?query=${q}`;
    // Waze universal link — opens the Waze app on mobile, web elsewhere.
    case "waze":           return `https://waze.com/ul?q=${q}&navigate=yes`;
    // Google Maps universal URL (api=1) — opens the app on mobile, web elsewhere.
    case "google":
    default:               return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
}

/** Resolve the merchant's configured map provider (defaults to Google). */
export function useMapProvider(): MapProvider {
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const p = (posSettings as { mapProvider?: string } | undefined)?.mapProvider;
  return (p && MAP_PROVIDERS.some((m) => m.id === p) ? p : DEFAULT_MAP_PROVIDER) as MapProvider;
}

/**
 * Returns a `buildMapUrl`-style function already bound to the merchant's
 * configured provider. Use this anywhere an address is rendered as a link.
 */
export function useMapUrl(): (address: string) => string {
  const provider = useMapProvider();
  return (address: string) => buildMapUrl(address, provider);
}
