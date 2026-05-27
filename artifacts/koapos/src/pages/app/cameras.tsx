import { useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Camera, Maximize2, ZoomIn, Grid2x2, Grid3x3, LayoutGrid,
  VideoOff, Loader2, RefreshCw, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useListCameras,
  useCreateCameraSnapshot,
  type Camera as CameraType,
} from "@workspace/api-client-react";

/* ─── Stream helpers ──────────────────────────────────────────────────────── */

function isMjpegUrl(url: string) {
  const u = url.toLowerCase();
  return u.startsWith("http://") || u.startsWith("https://");
}

function CameraStream({
  camera,
  imgRef,
  className,
}: {
  camera: CameraType;
  imgRef?: React.RefObject<HTMLImageElement | null>;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!isMjpegUrl(camera.streamUrl)) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3 bg-zinc-900 text-zinc-400", className)}>
        <VideoOff className="w-10 h-10 opacity-40" />
        <div className="text-center px-4">
          <p className="text-xs font-medium text-zinc-300 mb-1">RTSP Stream</p>
          <p className="text-[10px] text-zinc-500 break-all">{camera.streamUrl}</p>
        </div>
        <p className="text-[10px] text-zinc-600">Browser-based RTSP playback requires a server-side proxy</p>
      </div>
    );
  }

  if (errored) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 bg-zinc-900 text-zinc-400", className)}>
        <VideoOff className="w-8 h-8 opacity-40" />
        <p className="text-xs">Stream unavailable</p>
      </div>
    );
  }

  return (
    <div className={cn("relative bg-black", className)}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}
      <img
        ref={imgRef}
        src={camera.streamUrl}
        alt={camera.name}
        className="w-full h-full object-cover"
        onLoad={() => setLoading(false)}
        onError={() => { setErrored(true); setLoading(false); }}
        crossOrigin="anonymous"
      />
    </div>
  );
}

/* ─── Snapshot capture ────────────────────────────────────────────────────── */

function captureSnapshot(imgEl: HTMLImageElement | null, cameraName: string): string {
  if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = "#71717a";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(cameraName, 320, 165);
    ctx.font = "13px sans-serif";
    ctx.fillText("No live stream", 320, 195);
    return canvas.toDataURL("image/jpeg", 0.7);
  }
  const canvas = document.createElement("canvas");
  canvas.width = imgEl.naturalWidth || imgEl.width;
  canvas.height = imgEl.naturalHeight || imgEl.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(imgEl, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.7);
}

/* ─── Grid size selector ──────────────────────────────────────────────────── */

type GridCols = 2 | 3 | 4;

const GRID_ICONS: Record<GridCols, React.ComponentType<{ className?: string }>> = {
  2: Grid2x2,
  3: Grid3x3,
  4: LayoutGrid,
};

const GRID_CLASSES: Record<GridCols, string> = {
  2: "grid-cols-1 lg:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

const CARD_HEIGHT: Record<GridCols, string> = {
  2: "h-72 lg:h-96",
  3: "h-60 lg:h-72",
  4: "h-48 lg:h-60",
};

/* ─── Single camera card ──────────────────────────────────────────────────── */

function CameraCard({
  camera,
  cardHeight,
  onFullscreen,
  onSnapshot,
  snapshotting,
}: {
  camera: CameraType;
  cardHeight: string;
  onFullscreen: (camera: CameraType) => void;
  onSnapshot: (camera: CameraType, imgRef: React.RefObject<HTMLImageElement | null>) => void;
  snapshotting: boolean;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);

  return (
    <div className="group relative rounded-xl overflow-hidden border border-border bg-zinc-950 shadow-sm">
      <CameraStream camera={camera} imgRef={imgRef} className={cn("w-full", cardHeight)} />

      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 py-2 flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold truncate">{camera.name}</p>
          {camera.status === "inactive" && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 mt-0.5">Inactive</Badge>
          )}
        </div>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mb-0.5" />
      </div>

      {/* Hover quick actions */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
        <button
          onClick={() => onFullscreen(camera)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-black text-xs font-semibold hover:bg-white transition-colors shadow-lg"
          title="Full Screen"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Full Screen
        </button>
        <button
          onClick={() => onSnapshot(camera, imgRef)}
          disabled={snapshotting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-black text-xs font-semibold hover:bg-white transition-colors shadow-lg disabled:opacity-60"
          title="Snapshot"
        >
          {snapshotting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ZoomIn className="w-3.5 h-3.5" />}
          Snapshot
        </button>
      </div>
    </div>
  );
}

/* ─── Full-screen modal ───────────────────────────────────────────────────── */

function FullscreenModal({ camera, onClose }: { camera: CameraType | null; onClose: () => void }) {
  if (!camera) return null;
  return (
    <Dialog open={!!camera} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-full p-0 bg-black border-zinc-800 overflow-hidden [&>button]:hidden">
        <div className="relative">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-zinc-400" />
              <span className="text-white text-sm font-semibold">{camera.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <CameraStream camera={camera} className="w-full h-[80vh]" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */

export default function CamerasPage() {
  const [gridCols, setGridCols] = useState<GridCols>(3);
  const [fullscreenCamera, setFullscreenCamera] = useState<CameraType | null>(null);
  const [snapshottingId, setSnapshottingId] = useState<number | null>(null);

  const { data: cameras = [], isLoading, refetch } = useListCameras();
  const createSnapshot = useCreateCameraSnapshot();

  const activeCameras = cameras.filter((c) => c.status === "active");

  const handleSnapshot = useCallback(async (
    camera: CameraType,
    imgRef: React.RefObject<HTMLImageElement | null>,
  ) => {
    setSnapshottingId(camera.id);
    try {
      const imageData = captureSnapshot(imgRef.current, camera.name);
      await createSnapshot.mutateAsync({
        data: { cameraId: camera.id, imageData, source: "manual" },
      });
      toast.success(`Snapshot saved for ${camera.name}`);
    } catch {
      toast.error("Failed to save snapshot");
    } finally {
      setSnapshottingId(null);
    }
  }, [createSnapshot]);

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Camera className="w-6 h-6 text-primary" />
              Cameras
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live IP camera streams — {activeCameras.length} active
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Grid selector */}
            <div className="flex items-center border rounded-lg overflow-hidden">
              {([2, 3, 4] as GridCols[]).map((cols) => {
                const Icon = GRID_ICONS[cols];
                return (
                  <button
                    key={cols}
                    onClick={() => setGridCols(cols)}
                    className={cn(
                      "px-2.5 py-2 transition-colors",
                      gridCols === cols
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                    title={`${cols}×${cols} grid`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty */}
        {!isLoading && cameras.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Camera className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold">No cameras configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add cameras in <strong>Management → Cameras</strong> to see them here.
              </p>
            </div>
          </div>
        )}

        {/* Camera grid */}
        {!isLoading && cameras.length > 0 && (
          <>
            {cameras.filter((c) => c.status === "inactive").length > 0 && (
              <p className="text-xs text-muted-foreground">
                {cameras.filter((c) => c.status === "inactive").length} inactive camera(s) hidden from grid.{" "}
                <a href="/management/cameras" className="underline">Manage in settings</a>
              </p>
            )}
            <div className={cn("grid gap-4", GRID_CLASSES[gridCols])}>
              {activeCameras.map((camera) => (
                <CameraCard
                  key={camera.id}
                  camera={camera}
                  cardHeight={CARD_HEIGHT[gridCols]}
                  onFullscreen={setFullscreenCamera}
                  onSnapshot={handleSnapshot}
                  snapshotting={snapshottingId === camera.id}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <FullscreenModal camera={fullscreenCamera} onClose={() => setFullscreenCamera(null)} />
    </AppLayout>
  );
}
