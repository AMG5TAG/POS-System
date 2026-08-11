import { useEffect, useState, useCallback } from "react";
import { Search, Trash2, Loader2, ImageIcon, HardDrive } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * The merchant's reusable media. Picking from here instead of re-uploading is
 * what keeps one stored copy behind many products.
 *
 * Everything listed belongs to the signed-in merchant — the API filters by
 * session merchant and the storage paths are merchant-prefixed.
 */

export interface MediaAsset {
  id: number;
  objectPath: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  filename: string | null;
  width: number | null;
  height: number | null;
  usageCount?: number;
  createdAt: string;
}

interface MediaLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaLibraryDialog({ open, onOpenChange, onSelect }: MediaLibraryDialogProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200", withUsage: "true" });
      if (term.trim()) params.set("search", term.trim());
      const res = await fetch(`/api/storage/assets?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load media library");
      const data = await res.json() as { assets: MediaAsset[]; total: number; totalBytes?: number };
      setAssets(data.assets);
      setTotal(data.total);
      setTotalBytes(data.totalBytes ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load media library");
    } finally {
      setLoading(false);
    }
  }, []);

  // Loads on open and on each search change, debounced so typing does not fire
  // a request per keystroke.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(search), 200);
    return () => clearTimeout(t);
  }, [search, open, load]);

  const handleDelete = async (asset: MediaAsset) => {
    setDeletingId(asset.id);
    try {
      const res = await fetch(`/api/storage/assets/${asset.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 409) {
        const body = await res.json() as { error?: string; usage?: Array<{ entity: string; count: number }> };
        const where = (body.usage ?? []).map((u) => `${u.count} × ${u.entity}`).join(", ");
        toast.error(body.error ?? "Image is still in use", { description: where || undefined });
        return;
      }
      if (!res.ok) throw new Error("Could not delete image");
      const body = await res.json() as { reclaimedBytes?: number };
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      setTotal((n) => Math.max(0, n - 1));
      toast.success(`Image deleted — ${formatBytes(body.reclaimedBytes ?? 0)} reclaimed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete image");
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/storage/assets/import", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Could not import existing uploads");
      const body = await res.json() as { imported: number; skipped: number };
      toast.success(
        body.imported > 0
          ? `Added ${body.imported} existing upload${body.imported === 1 ? "" : "s"} to your library`
          : "Your library is already up to date",
      );
      await load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import existing uploads");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>
            Pick an image you have already uploaded. Reusing one stores a single copy no
            matter how many products use it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by filename…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button type="button" variant="outline" onClick={handleImport} disabled={importing}>
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            <span className="ml-1.5">Import existing</span>
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} image{total === 1 ? "" : "s"}</span>
          <span>{formatBytes(totalBytes)} stored</span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
          {loading && assets.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && assets.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search ? "No images match that search." : "No images yet — upload one to start your library."}
              </p>
              {!search && (
                <p className="text-xs text-muted-foreground/70 max-w-sm">
                  Uploaded before? Use “Import existing” to pull your previous uploads in.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {assets.map((asset) => (
              <div key={asset.id} className="group relative">
                <button
                  type="button"
                  onClick={() => { onSelect(asset.url); onOpenChange(false); }}
                  className={cn(
                    "w-full aspect-square rounded-lg border overflow-hidden bg-muted/20",
                    "hover:border-primary hover:ring-2 hover:ring-primary/30 transition-all",
                  )}
                >
                  <img
                    src={asset.url}
                    alt={asset.filename ?? ""}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => void handleDelete(asset)}
                  disabled={deletingId === asset.id}
                  title={
                    asset.usageCount
                      ? `Used in ${asset.usageCount} place${asset.usageCount === 1 ? "" : "s"} — remove those first`
                      : "Delete and reclaim storage"
                  }
                  className="absolute top-1 right-1 z-10 bg-background/85 rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-white transition-all shadow-sm"
                >
                  {deletingId === asset.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>

                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] truncate text-muted-foreground" title={asset.filename ?? ""}>
                    {asset.filename ?? "Untitled"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {formatBytes(asset.sizeBytes)}
                    {asset.usageCount !== undefined && (
                      <> · used {asset.usageCount}×</>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
