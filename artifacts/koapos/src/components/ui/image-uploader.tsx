import { useState, useRef } from "react";
import { Upload, X, Link as LinkIcon, Loader2, ImageIcon } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  className?: string;
  aspectRatio?: "square" | "video" | "free";
  label?: string;
}

export function ImageUploader({ value, onChange, className, aspectRatio = "square", label }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        credentials: "include",
      });
      if (!urlRes.ok) throw new Error("Could not get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Upload to storage failed");
      onChange(`/api/storage${objectPath}`);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (files: FileList | null) => { if (files?.[0]) void upload(files[0]); };

  const handleUrlConfirm = () => {
    const trimmed = urlInput.trim();
    if (trimmed) { onChange(trimmed); setUrlMode(false); setUrlInput(""); }
  };

  const aspectClass =
    aspectRatio === "square" ? "aspect-square" :
    aspectRatio === "video"  ? "aspect-video"  :
    "min-h-[100px]";

  return (
    <div className={cn("relative group", aspectClass, className)}>
      {label && (
        <p className="absolute -top-5 left-0 text-xs font-medium text-muted-foreground">{label}</p>
      )}

      <div
        className={cn(
          "w-full h-full rounded-xl border-2 overflow-hidden transition-colors relative",
          dragOver
            ? "border-primary bg-primary/5"
            : value
            ? "border-border"
            : "border-dashed bg-muted/20 hover:bg-muted/30 cursor-pointer",
          uploading && "opacity-60 pointer-events-none",
        )}
        onClick={() => !value && !urlMode && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files); }}
      >
        {/* ── Loading ── */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-20">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}

        {/* ── URL input mode ── */}
        {urlMode && (
          <div
            className="absolute inset-0 z-20 flex flex-col gap-2 p-2.5 bg-background/97 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Image URL</p>
            <Input
              placeholder="https://example.com/img.jpg"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUrlConfirm();
                if (e.key === "Escape") setUrlMode(false);
              }}
              autoFocus
              className="text-xs h-7 px-2"
            />
            <div className="flex gap-1.5 mt-auto">
              <Button
                type="button" size="sm"
                className="h-6 text-[11px] px-2 flex-1"
                onClick={handleUrlConfirm}
              >
                Apply
              </Button>
              <Button
                type="button" size="sm" variant="ghost"
                className="h-6 text-[11px] px-2"
                onClick={() => { setUrlMode(false); setUrlInput(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ── Filled: image + hover controls ── */}
        {!urlMode && value && (
          <>
            <img
              src={value} alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            {/* Scrim on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors pointer-events-none" />
            {/* Remove — top right */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="absolute top-1.5 right-1.5 z-10 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-white transition-colors shadow-sm"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {/* Replace + URL — bottom bar, visible on hover */}
            <div className="absolute bottom-0 left-0 right-0 z-10 flex gap-1 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="flex-1 bg-background/90 backdrop-blur-sm rounded px-1.5 py-1 text-[10px] font-medium flex items-center justify-center gap-1 hover:bg-background border transition-colors"
              >
                <Upload className="w-2.5 h-2.5" /> Replace
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setUrlMode(true); setUrlInput(value); }}
                className="flex-1 bg-background/90 backdrop-blur-sm rounded px-1.5 py-1 text-[10px] font-medium flex items-center justify-center gap-1 hover:bg-background border transition-colors"
              >
                <LinkIcon className="w-2.5 h-2.5" /> URL
              </button>
            </div>
          </>
        )}

        {/* ── Empty: upload dropzone ── */}
        {!urlMode && !value && !uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 pointer-events-none">
            <ImageIcon className="w-6 h-6 text-muted-foreground/35" />
            <p className="text-[11px] text-muted-foreground/60 font-medium text-center leading-tight">
              Drop or click
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setUrlMode(true); }}
              className="pointer-events-auto text-[10px] text-primary/70 hover:text-primary flex items-center gap-0.5 transition-colors"
            >
              <LinkIcon className="w-2.5 h-2.5" /> Use URL
            </button>
          </div>
        )}
      </div>

      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFile(e.target.files)}
      />
    </div>
  );
}
