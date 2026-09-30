import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Film, ImagePlus, Link2, Loader2, Play, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/ui/image-uploader";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

export type ProductMediaItem = { type: "image" | "video"; url: string };

/* Products › Media: the gallery shown after the primary image on the online
   shop's product page — extra images and videos, in order. A video is an
   uploaded file (MP4/WebM/MOV) or a YouTube / Vimeo link. */

const MAX_ITEMS = 24;
const MAX_VIDEO_MB = 200; // the upload is hashed in memory first; keep tills comfortable

function youtubeThumb(url: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}
const isLink = (url: string) => /youtube\.com|youtu\.be|vimeo\.com/i.test(url);

export function ProductMediaEditor({ value, onChange }: { value: ProductMediaItem[]; onChange: (v: ProductMediaItem[]) => void }) {
  const [adding, setAdding] = useState("");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const full = value.length >= MAX_ITEMS;

  const add = (item: ProductMediaItem) => {
    if (value.some((m) => m.url === item.url)) { toast.info("That's already in the gallery"); return; }
    onChange([...value, item]);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  const uploadVideo = async (file: File | undefined) => {
    if (!file) return;
    if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) { toast.error("Use an MP4, WebM or MOV video"); return; }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) { toast.error(`Videos can be up to ${MAX_VIDEO_MB} MB — trim it, or upload to YouTube and add the link`); return; }
    setUploading(file.name);
    try {
      const { url } = await uploadFile(file);
      add({ type: "video", url });
      toast.success("Video uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
      if (videoInput.current) videoInput.current.value = "";
    }
  };

  const addLink = () => {
    const url = link.trim();
    if (!/^https:\/\//i.test(url)) { toast.error("Paste the full https:// link"); return; }
    add({ type: "video", url });
    setLink("");
  };

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {value.map((m, i) => (
            <div key={m.url} className="group relative aspect-square rounded-lg border bg-muted/30 overflow-hidden">
              {m.type === "image" ? (
                <img src={m.url} alt="" className="w-full h-full object-contain" />
              ) : isLink(m.url) ? (
                youtubeThumb(m.url)
                  ? <img src={youtubeThumb(m.url)!} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground text-xs"><Film className="w-6 h-6" />Vimeo</div>
              ) : (
                <video src={`${m.url}#t=0.5`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
              )}
              {m.type === "video" && (
                <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center"><Play className="w-4 h-4 fill-white" /></span>
                </span>
              )}
              <span className="absolute top-1 left-1 rounded bg-black/55 text-white text-[10px] px-1.5 py-0.5">{i + 2}</span>
              <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier" className="w-7 h-7 rounded bg-white/90 flex items-center justify-center disabled:opacity-40"><ArrowLeft className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move later" className="w-7 h-7 rounded bg-white/90 flex items-center justify-center disabled:opacity-40"><ArrowRight className="w-3.5 h-3.5" /></button>
                </div>
                <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label="Remove" className="w-7 h-7 rounded bg-white/90 text-destructive flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {full ? (
        <p className="text-xs text-muted-foreground">The gallery is full ({MAX_ITEMS} items). Remove one to add another.</p>
      ) : (
        <div className="grid sm:grid-cols-[160px_1fr] gap-4 items-start">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><ImagePlus className="w-3.5 h-3.5" /> Add image</p>
            {/* An empty uploader: each upload is appended, then it clears for the next. */}
            <ImageUploader value={adding} onChange={(url) => { if (url) add({ type: "image", url }); setAdding(""); }} aspectRatio="square" />
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Film className="w-3.5 h-3.5" /> Add video</p>
              <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => void uploadVideo(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" disabled={!!uploading} onClick={() => videoInput.current?.click()} className="gap-2">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {uploading}…</> : <><Upload className="w-4 h-4" /> Upload video</>}
              </Button>
              <p className="text-xs text-muted-foreground">MP4, WebM or MOV, up to {MAX_VIDEO_MB} MB.</p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
                  placeholder="or paste a YouTube / Vimeo link" className={cn("pl-8")} />
              </div>
              <Button type="button" variant="secondary" onClick={addLink} disabled={!link.trim()}>Add</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
