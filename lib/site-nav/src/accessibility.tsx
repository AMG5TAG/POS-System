import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Accessibility, BookOpen, Check, Contrast, EyeOff, Type } from "lucide-react";

/*
 * The accessibility options — Large Text, High Contrast, Dyslexia-Friendly
 * Font, Reduce Motion — for the whole site. They live here, in the shared
 * header, so the website and the shop show the same menu and honour the same
 * choice: it is saved in localStorage (`kk-accessibility`), which both apps
 * share because they share an origin (koastal.com.au and /shop), and applied
 * as classes on <html> that ./accessibility.css styles. Both apps import that
 * stylesheet; each loads the OpenDyslexic font itself (main.tsx).
 *
 * The header button and the phone menu's list are two views of one store, so
 * a change in either shows in the other at once (and in other open tabs).
 */

export type A11yKey = "largeFont" | "highContrast" | "dyslexicFont" | "reduceMotion";
type A11yState = Record<A11yKey, boolean>;

const STORAGE_KEY = "kk-accessibility";
const DEFAULTS: A11yState = { largeFont: false, highContrast: false, dyslexicFont: false, reduceMotion: false };
const CLASS: Record<A11yKey, string> = {
  largeFont: "kk-large-text",
  highContrast: "kk-high-contrast",
  dyslexicFont: "kk-dyslexic-font",
  reduceMotion: "kk-reduce-motion",
};

export const A11Y_OPTIONS: { key: A11yKey; label: string; desc: string; Icon: typeof Type }[] = [
  { key: "largeFont", label: "Large Text", desc: "Increase font size for easier reading", Icon: Type },
  { key: "highContrast", label: "High Contrast", desc: "Stronger text and border contrast", Icon: Contrast },
  { key: "dyslexicFont", label: "Dyslexia-Friendly Font", desc: "Switch to OpenDyslexic, a typeface designed for dyslexic readers", Icon: BookOpen },
  { key: "reduceMotion", label: "Reduce Motion", desc: "Disable animations and transitions", Icon: EyeOff },
];

function read(): A11yState {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    // Merged over the defaults: a choice saved before an option existed has no key for it.
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<A11yState>) };
  } catch { /* storage blocked or corrupt: defaults */ }
  return DEFAULTS;
}

let state: A11yState = read();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const k of Object.keys(CLASS) as A11yKey[]) root.classList.toggle(CLASS[k], state[k]);
}

function set(next: A11yState) {
  state = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
  apply();
  listeners.forEach((l) => l());
}

// Applied as soon as the header's code loads, before any menu is opened.
apply();
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = read();
    apply();
    listeners.forEach((l) => l());
  });
}

export function useAccessibility() {
  const s = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state,
    () => DEFAULTS,
  );
  return { state: s, toggle: (k: A11yKey) => set({ ...state, [k]: !state[k] }) };
}

/* The options as a list — the drop-down's body, and the phone menu's section. */
export function AccessibilityOptions({ className = "" }: { className?: string }) {
  const { state: s, toggle } = useAccessibility();
  return (
    <div className={className}>
      {A11Y_OPTIONS.map(({ key, label, desc, Icon }) => (
        <button key={key} type="button" onClick={() => toggle(key)} role="menuitemcheckbox" aria-checked={s[key]}
          className="w-full flex items-start gap-3 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors">
          <Icon className="h-4 w-4 mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="font-medium">{label}</span>
              {s[key] && <Check className="h-3.5 w-3.5 text-[#007b7d]" />}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* The header's accessibility button and its drop-down. */
export function AccessibilityMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { state: s } = useAccessibility();
  const on = Object.values(s).some(Boolean);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Accessibility options" aria-expanded={open} aria-haspopup="menu" title="Accessibility"
        className={`relative p-2 rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-white/10 ${on ? "text-[#007b7d]" : "text-gray-500 dark:text-gray-300 hover:text-[#007b7d]"}`}>
        <Accessibility className="h-5 w-5" />
        {on && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#007b7d]" aria-hidden />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 bg-white dark:bg-[#111d1d] border border-gray-200 dark:border-gray-700 shadow-lg rounded-md py-2 w-64 z-50">
          <p className="px-3 pb-1 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Accessibility</p>
          <AccessibilityOptions className="px-1" />
        </div>
      )}
    </div>
  );
}
