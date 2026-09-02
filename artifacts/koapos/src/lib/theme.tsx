import { createContext, useContext, useEffect, useState } from "react";

/** What the user picked. "system" follows the OS colour-scheme preference. */
export type ThemeMode = "light" | "dark" | "system";
/** The effective theme after resolving "system". */
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** Effective theme actually applied to the document ("light" | "dark"). */
  theme: ResolvedTheme;
  /** The user's preference, including "system". */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Flip between an explicit light/dark (used by the header toggle). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "koapos-theme";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || "light";
    } catch {
      return "light";
    }
  });

  const [theme, setTheme] = useState<ResolvedTheme>(() => resolve(mode));

  // Apply the resolved theme + persist the preference whenever the mode changes.
  useEffect(() => {
    const apply = () => {
      const next = resolve(mode);
      setTheme(next);
      document.documentElement.classList.toggle("dark", next === "dark");
    };
    apply();
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}

    // While following the system, react live to OS changes.
    if (mode !== "system" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [mode]);

  const setMode = (m: ThemeMode) => setModeState(m);
  const toggleTheme = () => setModeState(resolve(mode) === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
