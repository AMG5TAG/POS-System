import { useEffect, useRef, useState } from "react";
import {
  useUpdateServiceJob,
  getListServiceJobsQueryKey,
  type ServiceJob,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Eraser, Save, PenLine } from "lucide-react";
import { toast } from "sonner";

/** Captures an on-screen customer signature (intake terms / collection) and
    saves it to the job's `signature` field as a PNG data URL. */
export function ServiceJobSignaturePanel({ job }: { job: ServiceJob }) {
  const queryClient = useQueryClient();
  const update = useUpdateServiceJob();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirtyRef = useRef(false);
  const [capturing, setCapturing] = useState(!job.signature);
  const [hasInk, setHasInk] = useState(false);

  // Prepare the canvas (size to its container, white background, pen style).
  useEffect(() => {
    if (!capturing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 160;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasInk(false);
    dirtyRef.current = false;
  }, [capturing]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirtyRef.current = true;
    if (!hasInk) setHasInk(true);
  };
  const onUp = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    dirtyRef.current = false;
  };

  const save = () => {
    if (!dirtyRef.current) { toast.error("Please sign first"); return; }
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    update.mutate({ id: job.id, data: { signature: dataUrl } as never }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServiceJobsQueryKey() });
        setCapturing(false);
        toast.success("Signature saved");
      },
      onError: () => toast.error("Couldn't save signature"),
    });
  };

  if (!capturing && job.signature) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border bg-white p-2 inline-block">
          <img src={job.signature} alt="Customer signature" className="max-h-28" />
        </div>
        <div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCapturing(true)}>
            <PenLine className="w-3.5 h-3.5" /> Re-capture
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Customer signature — confirms intake terms (data-loss waiver, deposit) / collection.
      </p>
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border bg-white touch-none cursor-crosshair"
        style={{ height: 160 }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={clear} disabled={!hasInk}>
          <Eraser className="w-3.5 h-3.5" /> Clear
        </Button>
        <Button size="sm" className="gap-1.5" onClick={save} disabled={update.isPending || !hasInk}>
          {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save signature
        </Button>
        {job.signature && (
          <Button size="sm" variant="ghost" onClick={() => setCapturing(false)}>Cancel</Button>
        )}
      </div>
    </div>
  );
}
