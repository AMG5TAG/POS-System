import { useState, useRef, useEffect, useCallback } from "react";
import { useGetCameraSettings, useListCameras } from "@workspace/api-client-react";
import { Camera, X, Minus, Maximize2, VideoOff, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

function isMjpeg(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function CameraPosPiP() {
  const { data: settings } = useGetCameraSettings();
  const { data: cameras = [] } = useListCameras();

  const pipEnabled  = settings?.pipEnabled === "true";
  const pipCameraId = settings?.pipCameraId ?? null;
  const camera = pipEnabled && pipCameraId
    ? cameras.find((c) => c.id === pipCameraId && c.status === "active")
    : null;

  // Position & size
  const [pos,  setPos]  = useState({ x: 16, y: 80 });
  const [size, setSize] = useState({ w: 320, h: 200 });
  const [minimised, setMinimised] = useState(false);
  const [closed, setClosed] = useState(false);

  // Reset closed when camera changes
  useEffect(() => { setClosed(false); }, [pipCameraId]);

  // Drag
  const dragRef  = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const boxRef   = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, dragRef.current.origX + dx),
        y: Math.max(0, dragRef.current.origY + dy),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pos]);

  // Resize
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      setSize({
        w: Math.max(220, resizeRef.current.origW + dx),
        h: Math.max(140, resizeRef.current.origH + dy),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [size]);

  if (!camera || !pipEnabled || closed) return null;

  return (
    <div
      ref={boxRef}
      className="fixed z-[9999] rounded-xl shadow-2xl border border-zinc-700 overflow-hidden bg-zinc-950 flex flex-col select-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: minimised ? "auto" : size.h,
      }}
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-900 border-b border-zinc-800 cursor-grab active:cursor-grabbing"
      >
        <GripHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <Camera className="w-3 h-3 text-zinc-400 shrink-0" />
        <span className="text-zinc-200 text-xs font-medium flex-1 truncate">{camera.name}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMinimised((m) => !m)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          title={minimised ? "Restore" : "Minimise"}
        >
          {minimised ? <Maximize2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setClosed(true)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-600 text-zinc-400 hover:text-white transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Stream area */}
      {!minimised && (
        <div className="relative flex-1 bg-black overflow-hidden">
          {isMjpeg(camera.streamUrl) ? (
            <img
              src={camera.streamUrl}
              alt={camera.name}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500">
              <VideoOff className="w-7 h-7 opacity-40" />
              <p className="text-[10px] text-zinc-600 text-center px-3 break-all">{camera.streamUrl}</p>
            </div>
          )}

          {/* Resize handle */}
          <div
            onMouseDown={onResizeStart}
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end pb-1 pr-1"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-zinc-600">
              <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
