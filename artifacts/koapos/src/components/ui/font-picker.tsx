import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, Upload, X, Check, Type } from "lucide-react";

/* ── Font catalogue ────────────────────────────────────────────────────── */

const SYSTEM_FONTS = [
  "Arial", "Arial Black", "Comic Sans MS", "Courier New",
  "Georgia", "Impact", "Times New Roman", "Trebuchet MS", "Verdana",
];

const GOOGLE_FONTS = [
  "Barlow", "Bebas Neue", "Cabin", "Comfortaa", "Dancing Script",
  "DM Sans", "DM Serif Display", "Exo 2", "Fira Sans",
  "Inter", "Josefin Sans", "Karla", "Lato", "Merriweather",
  "Montserrat", "Mulish", "Noto Sans", "Nunito", "Open Sans",
  "Oswald", "Outfit", "Pacifico", "Playfair Display", "Poppins",
  "PT Sans", "Quicksand", "Raleway", "Roboto", "Roboto Mono",
  "Rubik", "Source Sans 3", "Titillium Web", "Ubuntu",
  "Work Sans",
];

/* ── Custom font storage ───────────────────────────────────────────────── */

const CUSTOM_FONTS_KEY = "koapos_custom_fonts";

interface CustomFont { name: string; dataUrl: string }

function loadCustomFonts(): CustomFont[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_FONTS_KEY) ?? "[]"); } catch { return []; }
}

function saveCustomFonts(fonts: CustomFont[]) {
  try { localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(fonts)); } catch { /* ignore */ }
}

/* ── Google Fonts loader ───────────────────────────────────────────────── */

const loadedGoogleFonts = new Set<string>();
const GOOGLE_FONTS_LINK_ID = "koapos-google-fonts-preview";

function loadGoogleFontPreviews() {
  if (document.getElementById(GOOGLE_FONTS_LINK_ID)) return;
  const families = GOOGLE_FONTS.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;700`).join("&");
  const link = document.createElement("link");
  link.id = GOOGLE_FONTS_LINK_ID;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

function loadGoogleFont(name: string) {
  if (loadedGoogleFonts.has(name)) return;
  loadedGoogleFonts.add(name);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

async function loadCustomFontFace(font: CustomFont) {
  try {
    const face = new FontFace(font.name, `url(${font.dataUrl})`);
    await face.load();
    document.fonts.add(face);
  } catch { /* ignore load failures */ }
}

/* ── Component ─────────────────────────────────────────────────────────── */

interface FontPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FontPicker({ value, onChange, className }: FontPickerProps) {
  const [open, setOpen]               = useState(false);
  const [search, setSearch]           = useState("");
  const [customFonts, setCustomFonts] = useState<CustomFont[]>(loadCustomFonts);
  const containerRef  = useRef<HTMLDivElement>(null);
  const searchRef     = useRef<HTMLInputElement>(null);
  const uploadRef     = useRef<HTMLInputElement>(null);

  /* Load Google Font previews when dropdown opens */
  useEffect(() => {
    if (open) {
      loadGoogleFontPreviews();
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  /* Load all stored custom fonts into the browser font registry */
  useEffect(() => {
    customFonts.forEach(loadCustomFontFace);
  }, [customFonts]);

  /* Load the selected font if it's a Google Font (for the trigger preview) */
  useEffect(() => {
    if (GOOGLE_FONTS.includes(value)) loadGoogleFont(value);
  }, [value]);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* ── Upload handler ── */
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["ttf", "otf", "woff", "woff2"].includes(ext)) {
      alert("Please upload a .ttf, .otf, .woff, or .woff2 font file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const fontName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const entry: CustomFont = { name: fontName, dataUrl };
      await loadCustomFontFace(entry);
      const next = [entry, ...customFonts.filter((f) => f.name !== fontName)];
      setCustomFonts(next);
      saveCustomFonts(next);
      onChange(fontName);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [customFonts, onChange]);

  const removeCustomFont = (name: string) => {
    const next = customFonts.filter((f) => f.name !== name);
    setCustomFonts(next);
    saveCustomFonts(next);
    if (value === name) onChange("");
  };

  /* ── Filter logic ── */
  const q = search.toLowerCase();
  const allFontNames = [
    ...customFonts.map((f) => f.name),
    ...GOOGLE_FONTS,
    ...SYSTEM_FONTS,
  ];

  const filteredCustom = customFonts.filter((f) => f.name.toLowerCase().includes(q));
  const filteredGoogle = GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(q));
  const filteredSystem = SYSTEM_FONTS.filter((f) => f.toLowerCase().includes(q));

  const totalResults = filteredCustom.length + filteredGoogle.length + filteredSystem.length;

  const displayFont = value && allFontNames.includes(value) ? value : "inherit";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
          "hover:border-ring/50 focus:outline-none focus:ring-2 focus:ring-ring",
          open && "ring-2 ring-ring border-ring"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Type className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span
            className="truncate"
            style={{ fontFamily: displayFont !== "inherit" ? `"${displayFont}", sans-serif` : "inherit" }}
          >
            {value || <span className="text-muted-foreground">Select a font…</span>}
          </span>
        </div>
        <ChevronDown className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] rounded-xl border bg-popover shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search fonts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Font list */}
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            {totalResults === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No fonts match "{search}"</div>
            )}

            {/* Custom fonts */}
            {filteredCustom.length > 0 && (
              <div>
                <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Uploaded Fonts
                </div>
                {filteredCustom.map((font) => (
                  <div
                    key={font.name}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-muted/60 transition-colors",
                      value === font.name && "bg-secondary/60"
                    )}
                    onClick={() => { onChange(font.name); setOpen(false); }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {value === font.name && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
                      {value !== font.name && <span className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate" style={{ fontFamily: `"${font.name}", sans-serif` }}>
                        {font.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCustomFont(font.name); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-0.5 rounded shrink-0 ml-2"
                      title="Remove uploaded font"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Google fonts */}
            {filteredGoogle.length > 0 && (
              <div>
                <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Google Fonts
                </div>
                {filteredGoogle.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer hover:bg-muted/60 transition-colors",
                      value === name && "bg-secondary/60"
                    )}
                    onClick={() => { onChange(name); setOpen(false); }}
                  >
                    {value === name ? <Check className="w-3.5 h-3.5 shrink-0 text-primary" /> : <span className="w-3.5 h-3.5 shrink-0" />}
                    <span style={{ fontFamily: `"${name}", sans-serif` }}>{name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* System fonts */}
            {filteredSystem.length > 0 && (
              <div>
                <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  System Fonts
                </div>
                {filteredSystem.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer hover:bg-muted/60 transition-colors",
                      value === name && "bg-secondary/60"
                    )}
                    onClick={() => { onChange(name); setOpen(false); }}
                  >
                    {value === name ? <Check className="w-3.5 h-3.5 shrink-0 text-primary" /> : <span className="w-3.5 h-3.5 shrink-0" />}
                    <span style={{ fontFamily: `"${name}", sans-serif` }}>{name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Upload footer */}
          <div className="border-t p-2">
            <input
              ref={uploadRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => uploadRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload font file (.ttf, .otf, .woff, .woff2)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
