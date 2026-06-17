import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useBusinessProfile } from "./business-profile";

/* ───────────────────────────────────────────────────────────────────────────
 * App-wide theming engine.
 *
 * Owns the "Themes" settings surfaced under Management › Settings & Integrations
 * › Themes: brand-colour / brand-font usage, a custom primary colour, the
 * universal search-bar layout & visibility, and a reduced-motion toggle.
 *
 * Light/dark mode and accessibility (font size, high contrast) continue to live
 * in their existing providers (`useTheme`, `useAccessibility`); the Themes page
 * drives those directly and theme *templates* snapshot all of them together.
 * ───────────────────────────────────────────────────────────────────────── */

export type SearchBarLayout = "expanded" | "compact" | "icon";

export interface AppThemeSettings {
  /** Use the brand colours from Business Details as the app's primary colour. */
  useBrandColors: boolean;
  /** Use the brand font from Business Details as the app's default font. */
  useBrandFont: boolean;
  /** Custom primary colour (hex) — applied when `useBrandColors` is false. Empty = CSS default. */
  primaryColor: string;
  /** Layout of the universal search bar. */
  searchBarLayout: SearchBarLayout;
  /** Hide the universal search bar entirely. */
  hideSearchBar: boolean;
  /** Disable non-essential motion/animations app-wide. */
  reducedMotion: boolean;
}

export const DEFAULT_APP_THEME: AppThemeSettings = {
  useBrandColors: false,
  useBrandFont: false,
  primaryColor: "",
  searchBarLayout: "expanded",
  hideSearchBar: false,
  reducedMotion: false,
};

const STORAGE_KEY = "koapos-app-theme";

interface AppThemeContextValue {
  settings: AppThemeSettings;
  setSettings: (patch: Partial<AppThemeSettings>) => void;
  replaceSettings: (next: AppThemeSettings) => void;
  reset: () => void;
}

const AppThemeContext = createContext<AppThemeContextValue | undefined>(undefined);

/* ── hex → "H S% L%" (the triple format the CSS variables expect) ──────────── */
export function hexToHslTriple(hex: string): string | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const lum = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4; break;
    }
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lum * 100)}%`;
}

/** Relative luminance based foreground (#000 / #fff) for a hex background. */
function readableForeground(hex: string): string {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "0 0% 8%";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "0 0% 8%" : "0 0% 100%";
}

function load(): AppThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_THEME;
    return { ...DEFAULT_APP_THEME, ...(JSON.parse(raw) as Partial<AppThemeSettings>) };
  } catch {
    return DEFAULT_APP_THEME;
  }
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useBusinessProfile();
  const [settings, setState] = useState<AppThemeSettings>(load);

  const setSettings = (patch: Partial<AppThemeSettings>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

  const replaceSettings = (next: AppThemeSettings) => {
    const merged = { ...DEFAULT_APP_THEME, ...next };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
    setState(merged);
  };

  const reset = () => replaceSettings(DEFAULT_APP_THEME);

  /* Apply primary colour (brand or custom override). */
  useEffect(() => {
    const root = document.documentElement;
    const hex = settings.useBrandColors ? profile.brandColors?.[0] : settings.primaryColor;
    const triple = hex ? hexToHslTriple(hex) : null;
    // Sidebar selected-menu highlight uses the --sidebar-accent / --sidebar-primary
    // tokens (not --primary), so drive those too — that way the active menu item
    // is highlighted in the brand / chosen colour.
    const sidebarTokens = ["--sidebar-primary", "--sidebar-primary-foreground", "--sidebar-accent", "--sidebar-accent-foreground", "--sidebar-ring"];
    if (triple && hex) {
      const fg = readableForeground(hex);
      root.style.setProperty("--primary", triple);
      root.style.setProperty("--ring", triple);
      root.style.setProperty("--primary-foreground", fg);
      root.style.setProperty("--sidebar-primary", triple);
      root.style.setProperty("--sidebar-primary-foreground", fg);
      root.style.setProperty("--sidebar-accent", triple);
      root.style.setProperty("--sidebar-accent-foreground", fg);
      root.style.setProperty("--sidebar-ring", triple);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--primary-foreground");
      sidebarTokens.forEach((t) => root.style.removeProperty(t));
    }
  }, [settings.useBrandColors, settings.primaryColor, profile.brandColors]);

  /* Apply brand font. */
  useEffect(() => {
    const root = document.documentElement;
    if (settings.useBrandFont && profile.brandFont) {
      root.style.setProperty(
        "--app-font-sans",
        `'${profile.brandFont}', 'Atkinson Hyperlegible', 'Inter', sans-serif`,
      );
    } else {
      root.style.removeProperty("--app-font-sans");
    }
  }, [settings.useBrandFont, profile.brandFont]);

  /* Apply reduced motion. */
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", settings.reducedMotion);
  }, [settings.reducedMotion]);

  const value = useMemo<AppThemeContextValue>(
    () => ({ settings, setSettings, replaceSettings, reset }),
    [settings],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within AppThemeProvider");
  return ctx;
}
