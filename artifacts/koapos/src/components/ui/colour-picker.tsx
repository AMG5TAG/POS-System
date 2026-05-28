import { useState, useRef, useContext, createContext } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useBrandColors } from "@/lib/brand-color-context";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Standard fallback palette shown when no brand colors are configured. */
const APP_PALETTE: string[] = [
  "#ffffff", "#f3f4f6", "#e5e7eb", "#9ca3af",
  "#6b7280", "#374151", "#111827", "#000000",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#06b6d4", "#6366f1", "#f59e0b", "#10b981",
];

interface ColourPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Override the preset swatch list entirely (brand colors are still prepended). */
  presets?: string[];
}

export function ColourPicker({ value, onChange, className, presets }: ColourPickerProps) {
  const [mode, setMode] = useState<"hex" | "rgb">("hex");
  const [hexDraft, setHexDraft] = useState(() => value.toUpperCase());
  const nativeRef = useRef<HTMLInputElement>(null);
  const rgb = hexToRgb(value);

  const { brandColors } = useBrandColors();

  const palette = presets ?? APP_PALETTE;

  /* Deduplicate: brand colors first, then fill from palette (skip already-shown). */
  const brandSet = new Set(brandColors.map((c) => c.toLowerCase()));
  const filteredPalette = palette.filter((c) => !brandSet.has(c.toLowerCase()));
  const swatches = [...brandColors, ...filteredPalette];

  const handleHexChange = (raw: string) => {
    const upper = raw.toUpperCase();
    setHexDraft(upper);
    const normalised = upper.startsWith("#") ? upper : `#${upper}`;
    if (/^#[0-9A-F]{6}$/.test(normalised)) {
      onChange(normalised.toLowerCase());
    }
  };

  const handleHexBlur = () => {
    setHexDraft(value.toUpperCase());
  };

  const handleRgbChange = (channel: "r" | "g" | "b", raw: string) => {
    const num = parseInt(raw, 10);
    const clamped = isNaN(num) ? 0 : Math.min(255, Math.max(0, num));
    const next = { ...rgb, [channel]: clamped };
    const hex = rgbToHex(next.r, next.g, next.b);
    onChange(hex);
    setHexDraft(hex.toUpperCase());
  };

  const pickSwatch = (color: string) => {
    onChange(color);
    setHexDraft(color.toUpperCase());
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Swatch palette */}
      <div className="flex flex-wrap gap-1">
        {brandColors.length > 0 && (
          <>
            {brandColors.map((c, i) => (
              <button
                key={`brand-${i}`}
                type="button"
                title={`Brand: ${c}`}
                onClick={() => pickSwatch(c)}
                className={cn(
                  "w-6 h-6 rounded border-2 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-ring",
                  c.toLowerCase() === value.toLowerCase()
                    ? "border-foreground scale-110 shadow-sm"
                    : "border-transparent hover:border-foreground/40 hover:scale-105",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            {filteredPalette.length > 0 && (
              <span className="w-px bg-border self-stretch mx-0.5" />
            )}
          </>
        )}
        {filteredPalette.map((c, i) => (
          <button
            key={`palette-${i}`}
            type="button"
            title={c}
            onClick={() => pickSwatch(c)}
            className={cn(
              "w-6 h-6 rounded border-2 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-ring",
              c.toLowerCase() === value.toLowerCase()
                ? "border-foreground scale-110 shadow-sm"
                : "border-transparent hover:border-foreground/40 hover:scale-105",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Colour input row */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => nativeRef.current?.click()}
          className="w-9 h-9 rounded border border-border shrink-0 mt-0.5 focus:outline-none focus:ring-2 focus:ring-ring overflow-hidden"
          style={{ backgroundColor: value }}
          title="Click to use system colour picker"
        >
          <input
            ref={nativeRef}
            type="color"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setHexDraft(e.target.value.toUpperCase());
            }}
            className="absolute opacity-0 w-0 h-0"
            tabIndex={-1}
          />
        </button>

        <div className="flex-1 space-y-1">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode("hex")}
              className={cn(
                "text-[11px] px-1.5 py-0.5 rounded border transition-colors leading-none",
                mode === "hex"
                  ? "bg-foreground text-background border-foreground font-semibold"
                  : "text-muted-foreground border-border hover:border-foreground/40",
              )}
            >
              HEX
            </button>
            <button
              type="button"
              onClick={() => setMode("rgb")}
              className={cn(
                "text-[11px] px-1.5 py-0.5 rounded border transition-colors leading-none",
                mode === "rgb"
                  ? "bg-foreground text-background border-foreground font-semibold"
                  : "text-muted-foreground border-border hover:border-foreground/40",
              )}
            >
              RGB
            </button>
          </div>

          {mode === "hex" ? (
            <Input
              value={hexDraft}
              onChange={(e) => handleHexChange(e.target.value)}
              onBlur={handleHexBlur}
              placeholder="#000000"
              className="font-mono text-sm h-8 w-full"
              maxLength={7}
            />
          ) : (
            <div className="flex gap-1">
              {(["r", "g", "b"] as const).map((ch) => (
                <div key={ch} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] uppercase text-muted-foreground font-semibold">{ch}</span>
                  <Input
                    type="number"
                    min={0}
                    max={255}
                    value={rgb[ch]}
                    onChange={(e) => handleRgbChange(ch, e.target.value)}
                    className="text-sm h-8 w-14 font-mono"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
