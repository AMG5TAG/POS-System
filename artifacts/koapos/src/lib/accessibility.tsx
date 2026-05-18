import { createContext, useContext, useEffect, useState } from "react";

export type FontSize = "normal" | "large" | "xl";
export type ContrastMode = "normal" | "high";

interface AccessibilityContextValue {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  contrastMode: ContrastMode;
  setContrastMode: (mode: ContrastMode) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    try { return (localStorage.getItem("koapos-font-size") as FontSize) || "normal"; } catch { return "normal"; }
  });

  const [contrastMode, setContrastModeState] = useState<ContrastMode>(() => {
    try { return (localStorage.getItem("koapos-contrast") as ContrastMode) || "normal"; } catch { return "normal"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("fs-large", "fs-xl");
    if (fontSize === "large") root.classList.add("fs-large");
    if (fontSize === "xl") root.classList.add("fs-xl");
    try { localStorage.setItem("koapos-font-size", fontSize); } catch {}
  }, [fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("high-contrast", contrastMode === "high");
    try { localStorage.setItem("koapos-contrast", contrastMode); } catch {}
  }, [contrastMode]);

  return (
    <AccessibilityContext.Provider value={{
      fontSize,
      setFontSize: setFontSizeState,
      contrastMode,
      setContrastMode: setContrastModeState,
    }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return ctx;
}
