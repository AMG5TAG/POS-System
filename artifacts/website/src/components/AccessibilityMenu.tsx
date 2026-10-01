import { useState, useEffect, useRef } from "react";
import { Accessibility, Check, Type, Contrast, EyeOff } from "lucide-react";

const STORAGE_KEY = "kk-accessibility";

interface AccessibilityState {
  largeFont: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
}

function getInitialState(): AccessibilityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { largeFont: false, highContrast: false, reduceMotion: false };
}

export default function AccessibilityMenu() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AccessibilityState>(getInitialState);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
    const root = document.documentElement;
    root.classList.toggle("text-lg", state.largeFont);
    root.classList.toggle("high-contrast", state.highContrast);
    root.classList.toggle("reduce-motion", state.reduceMotion);
  }, [state]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = (key: keyof AccessibilityState) =>
    setState((s) => ({ ...s, [key]: !s[key] }));

  const items: {
    key: keyof AccessibilityState;
    label: string;
    Icon: typeof Type;
    desc: string;
  }[] = [
    {
      key: "largeFont",
      label: "Large Text",
      Icon: Type,
      desc: "Increase font size for easier reading",
    },
    {
      key: "highContrast",
      label: "High Contrast",
      Icon: Contrast,
      desc: "Stronger text and border contrast",
    },
    {
      key: "reduceMotion",
      label: "Reduce Motion",
      Icon: EyeOff,
      desc: "Disable animations and transitions",
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Accessibility options"
        className="p-2 text-gray-500 hover:text-[#007b7d] rounded-md transition-colors"
        title="Accessibility"
      >
        <Accessibility className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#111d1d] border border-gray-200 dark:border-gray-700 shadow-lg rounded-md py-2 min-w-[220px] z-50">
          <p className="px-3 pb-1 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Accessibility
          </p>
          {items.map(({ key, label, Icon, desc }) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="w-full flex items-start gap-3 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="mt-0.5">
                <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{label}</span>
                  {state[key] && (
                    <Check className="h-3.5 w-3.5 text-[#007b7d]" />
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                  {desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
