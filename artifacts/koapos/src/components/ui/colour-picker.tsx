import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

interface ColourPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ColourPicker({ value, onChange, className }: ColourPickerProps) {
  const [mode, setMode] = useState<"hex" | "rgb">("hex");
  const [hexDraft, setHexDraft] = useState(() => value.toUpperCase());
  const nativeRef = useRef<HTMLInputElement>(null);
  const rgb = hexToRgb(value);

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

  return (
    <div className={cn("flex items-start gap-2", className)}>
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
                : "text-muted-foreground border-border hover:border-foreground/40"
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
                : "text-muted-foreground border-border hover:border-foreground/40"
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
  );
}
