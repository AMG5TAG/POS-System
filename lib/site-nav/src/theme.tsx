import { useState, useEffect, useRef } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";

/* Light / dark / system theme, shared by the website and the shop. The choice
   is saved as `kk-theme` in localStorage; the two apps share an origin, so one
   choice holds on both. "Dark" is a `dark` class on <html>, which is what both
   apps' `dark:` variant and their dark palettes key on (each index.css). */

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "kk-theme";

function storedMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (stored && ["light", "dark", "system"].includes(stored)) return stored;
  } catch { /* localStorage not available */ }
  return "system";
}

function prefersDark(): boolean {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && prefersDark()));
}

/** Apply the saved theme now — call before the first render to avoid a flash. */
export function applyStoredTheme() {
  applyTheme(storedMode());
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(storedMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(mode);
    try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* noop */ }
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  const options: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Toggle theme"
        className="p-2 text-gray-500 hover:text-[#007b7d] rounded-md transition-colors"
        title="Theme"
      >
        <Icon className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#111d1d] border border-gray-200 dark:border-gray-700 shadow-lg rounded-md py-1 min-w-[140px] z-50">
          {options.map(({ value, label, Icon: OptIcon }) => (
            <button
              key={value}
              onClick={() => { setMode(value); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${mode === value ? "font-semibold text-[#007b7d]" : ""}`}
            >
              <span className="flex items-center gap-2">
                <OptIcon className="h-4 w-4" />
                {label}
              </span>
              {mode === value && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
