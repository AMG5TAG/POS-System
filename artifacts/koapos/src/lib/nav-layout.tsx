import { createContext, useContext, useState } from "react";

export type NavLayoutMode = "left" | "right" | "top" | "bottom" | "auto-hide";

interface NavLayoutContextValue {
  navLayout: NavLayoutMode;
  setNavLayout: (mode: NavLayoutMode) => void;
}

const NavLayoutContext = createContext<NavLayoutContextValue | undefined>(undefined);

export function NavLayoutProvider({ children }: { children: React.ReactNode }) {
  const [navLayout, setNavLayoutState] = useState<NavLayoutMode>(() => {
    try {
      return (localStorage.getItem("koapos-nav-layout") as NavLayoutMode) || "left";
    } catch {
      return "left";
    }
  });

  const setNavLayout = (mode: NavLayoutMode) => {
    setNavLayoutState(mode);
    try { localStorage.setItem("koapos-nav-layout", mode); } catch {}
  };

  return (
    <NavLayoutContext.Provider value={{ navLayout, setNavLayout }}>
      {children}
    </NavLayoutContext.Provider>
  );
}

export function useNavLayout() {
  const ctx = useContext(NavLayoutContext);
  if (!ctx) throw new Error("useNavLayout must be used within NavLayoutProvider");
  return ctx;
}
