import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw, Save, X } from "lucide-react";

export interface SignaturePadHandle {
  clear: () => void;
  toDataURL: () => string | null;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  onSave?: (dataUrl: string) => void | Promise<void>;
  onClear?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
  className?: string;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  label?: string;
}

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  (
    {
      onSave,
      onClear,
      onCancel,
      showCancel = false,
      className,
      height = 180,
      strokeColor = "#1a1a1a",
      strokeWidth = 2.5,
      label = "Sign here using your finger or stylus",
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);
    const hasStrokes = useRef(false);

    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [empty, setEmpty] = useState(true);

    /* ── Expose imperative handle ── */
    useImperativeHandle(ref, () => ({
      clear: () => clearCanvas(),
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? null,
      isEmpty: () => empty,
    }));

    /* ── Initialise ctx style after mount ── */
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }, [strokeColor, strokeWidth]);

    /* ── Resize canvas to match display size ── */
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const imgData = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (imgData) ctx.putImageData(imgData, 0, 0);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      return () => ro.disconnect();
    }, [strokeColor, strokeWidth]);

    /* ── Coordinate helper ── */
    function getPos(
      e: MouseEvent | TouchEvent,
      canvas: HTMLCanvasElement
    ): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      if ("touches" in e && e.touches.length > 0) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      const me = e as MouseEvent;
      return { x: me.clientX - rect.left, y: me.clientY - rect.top };
    }

    /* ── Drawing handlers ── */
    const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      isDrawing.current = true;
      lastPos.current = getPos(e, canvas);
      setSaved(false);
    }, []);

    const draw = useCallback((e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e, canvas);
      ctx.beginPath();
      if (lastPos.current) ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
      hasStrokes.current = true;
      setEmpty(false);
    }, []);

    const endDraw = useCallback(() => {
      isDrawing.current = false;
      lastPos.current = null;
    }, []);

    /* ── Attach events ── */
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.addEventListener("mousedown", startDraw);
      canvas.addEventListener("mousemove", draw);
      canvas.addEventListener("mouseup", endDraw);
      canvas.addEventListener("mouseleave", endDraw);
      canvas.addEventListener("touchstart", startDraw, { passive: false });
      canvas.addEventListener("touchmove", draw, { passive: false });
      canvas.addEventListener("touchend", endDraw);
      return () => {
        canvas.removeEventListener("mousedown", startDraw);
        canvas.removeEventListener("mousemove", draw);
        canvas.removeEventListener("mouseup", endDraw);
        canvas.removeEventListener("mouseleave", endDraw);
        canvas.removeEventListener("touchstart", startDraw);
        canvas.removeEventListener("touchmove", draw);
        canvas.removeEventListener("touchend", endDraw);
      };
    }, [startDraw, draw, endDraw]);

    /* ── Actions ── */
    function clearCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasStrokes.current = false;
      setEmpty(true);
      setSaved(false);
      onClear?.();
    }

    async function handleSave() {
      const canvas = canvasRef.current;
      if (!canvas || empty) return;
      const dataUrl = canvas.toDataURL("image/png");
      setSaving(true);
      try {
        await onSave?.(dataUrl);
        setSaved(true);
      } finally {
        setSaving(false);
      }
    }

    return (
      <div className={cn("space-y-2", className)}>
        {/* Canvas wrapper */}
        <div
          className={cn(
            "relative rounded-xl border-2 overflow-hidden bg-white transition-colors",
            saved
              ? "border-green-400"
              : "border-input hover:border-muted-foreground/40"
          )}
          style={{ height }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair block"
            style={{ touchAction: "none" }}
          />

          {/* Placeholder label — fades when signed */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none gap-2 transition-opacity duration-200",
              empty ? "opacity-100" : "opacity-0"
            )}
          >
            <svg
              className="w-6 h-6 text-muted-foreground/30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
            <p className="text-xs text-muted-foreground/50 text-center px-4">{label}</p>
          </div>

          {/* Success overlay */}
          {saved && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-3 h-3 text-green-600" />
              <span className="text-[10px] font-medium text-green-700">Saved</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={clearCanvas}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </Button>

          <Button
            type="button"
            size="sm"
            variant={saved ? "secondary" : "default"}
            className="flex-1 gap-1.5"
            onClick={handleSave}
            disabled={empty || saving}
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                Signature Saved
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save Signature"}
              </>
            )}
          </Button>

          {showCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }
);

SignaturePad.displayName = "SignaturePad";

export { SignaturePad };
