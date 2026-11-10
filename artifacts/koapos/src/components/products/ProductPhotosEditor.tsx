import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Images, Loader2, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MediaLibraryDialog } from "@/components/ui/media-library-dialog";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

/* Products › Media: every photo of a product in one list. The FIRST photo is
   the default — it is `products.imageUrl`, shown on the product grid, receipts,
   promo cards and first on the shop — and the rest are the image items of
   `products.media`, in order. Choosing several files at once uploads them in
   the order picked, so on a new product the first file picked is the default.
   The caller maps the list back onto imageUrl + media. */

const MAX_PHOTOS = 25;

export function ProductPhotosEditor({ photos, onChange }: { photos: string[]; onChange: (photos: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Uploads finish one at a time while the parent re-renders; append to the
  // latest list, not the one captured when the upload began.
  const latest = useRef(photos);
  latest.current = photos;

  const room = MAX_PHOTOS - photos.length;

  const addUrls = (urls: string[]) => {
    const seen = new Set(latest.current);
    const fresh = urls.filter((u) => u && !seen.has(u) && (seen.add(u), true));
    if (fresh.length) onChange([...latest.current, ...fresh].slice(0, MAX_PHOTOS));
    return fresh.length;
  };

  const uploadMany = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) { if (list?.length) toast.error("Choose image files (JPG, PNG, WebP)"); return; }
    const take = files.slice(0, Math.max(0, room));
    if (take.length < files.length) toast.warning(`Only ${take.length} more photo${take.length === 1 ? "" : "s"} fit — a product can have ${MAX_PHOTOS}.`);
    if (!take.length) return;

    setProgress({ done: 0, total: take.length });
    let added = 0;
    let failed = 0;
    // Sequential, so the photos land in the order they were picked.
    for (const file of take) {
      try {
        const { url } = await uploadFile(file);
        added += addUrls([url]);
      } catch {
        failed += 1;
      }
      setProgress((p) => p && { ...p, done: p.done + 1 });
    }
    setProgress(null);
    if (input.current) input.current.value = "";
    if (failed) toast.error(`${failed} photo${failed === 1 ? "" : "s"} failed to upload`);
    else if (added) toast.success(`${added} photo${added === 1 ? "" : "s"} added`);
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const makeDefault = (i: number) => onChange([photos[i]!, ...photos.filter((_, k) => k !== i)]);
  const remove = (i: number) => onChange(photos.filter((_, k) => k !== i));

  return (
    <div className="space-y-3">
      <div
        className={cn("grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 rounded-xl", dragOver && "ring-2 ring-primary ring-offset-2")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void uploadMany(e.dataTransfer.files); }}
      >
        {photos.map((url, i) => (
          <div key={url} className={cn("group relative aspect-square rounded-lg border-2 bg-muted/30 overflow-hidden", i === 0 ? "border-primary" : "border-border")}>
            <img src={url} alt="" className="w-full h-full object-contain" />
            {i === 0
              ? <span className="absolute top-1 left-1 rounded bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 flex items-center gap-1"><Star className="w-3 h-3 fill-current" />Default</span>
              : <span className="absolute top-1 left-1 rounded bg-black/55 text-white text-[10px] px-1.5 py-0.5">{i + 1}</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
              <div className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier" className="w-7 h-7 rounded bg-white/90 flex items-center justify-center disabled:opacity-40"><ArrowLeft className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label="Move later" className="w-7 h-7 rounded bg-white/90 flex items-center justify-center disabled:opacity-40"><ArrowRight className="w-3.5 h-3.5" /></button>
                {i > 0 && (
                  <button type="button" onClick={() => makeDefault(i)} aria-label="Make default" title="Make default" className="w-7 h-7 rounded bg-white/90 flex items-center justify-center"><Star className="w-3.5 h-3.5" /></button>
                )}
              </div>
              <button type="button" onClick={() => remove(i)} aria-label="Remove" className="w-7 h-7 rounded bg-white/90 text-destructive flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}

        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!!progress}
            className="aspect-square rounded-lg border-2 border-dashed bg-muted/20 hover:bg-muted/40 flex flex-col items-center justify-center gap-1.5 text-muted-foreground text-xs transition disabled:opacity-60"
          >
            {progress
              ? <><Loader2 className="w-5 h-5 animate-spin" />Uploading {progress.done + 1} of {progress.total}…</>
              : <><ImagePlus className="w-6 h-6" />{photos.length ? "Add photos" : "Upload photos"}<span className="text-[10px]">or drop them here</span></>}
          </button>
        )}
      </div>

      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void uploadMany(e.target.files)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!progress || room <= 0} onClick={() => input.current?.click()}>
          <Upload className="w-4 h-4" /> Choose photos
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!progress || room <= 0} onClick={() => setLibraryOpen(true)}>
          <Images className="w-4 h-4" /> From library
        </Button>
        <p className="text-xs text-muted-foreground">
          Select several at once. The first is the default — tap <Star className="inline w-3 h-3 -mt-0.5" /> on another to make it the default.
        </p>
      </div>
      <MediaLibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} onSelect={(url) => { addUrls([url]); setLibraryOpen(false); }} />
    </div>
  );
}
