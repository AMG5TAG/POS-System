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

  const handleFile = (files: FileList | null) => { if (files?.[0]) upload(files[0]); };

  const handleUrlConfirm = () => {
    const trimmed = urlInput.trim();
    if (trimmed) { onChange(trimmed); setUrlMode(false); setUrlInput(""); }
  };

  const aspectClass = aspectRatio === "square" ? "aspect-square" : aspectRatio === "video" ? "aspect-video" : "min-h-[100px]";

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <p className="text-sm font-medium">{label}</p>}

      {!urlMode && (
        <div
          className={cn(
            "relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-colors",
            aspectClass,
            dragOver ? "border-primary bg-primary/5" : value ? "border-border" : "bg-muted/20 hover:bg-muted/30",
            uploading ? "opacity-60 pointer-events-none" : "cursor-pointer",
          )}
          onClick={() => !value && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files); }}
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          ) : value ? (
            <>
              <img
                src={value} alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                className="absolute top-1.5 right-1.5 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="absolute bottom-1.5 right-1.5 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 text-xs flex items-center gap-1 hover:bg-muted transition-colors border"
              >
                <Upload className="w-3 h-3" /> Replace
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 p-4 pointer-events-none">
              <ImageIcon className="w-7 h-7 text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-xs font-medium text-muted-foreground">Upload image</p>
                <p className="text-[11px] text-muted-foreground/70">Drag & drop or click</p>
              </div>
            </div>
          )}
        </div>
      )}

      {urlMode && (
        <div className="space-y-1.5">
          {value && (
            <img src={value} alt="" className="w-full rounded-lg border object-cover max-h-32"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          )}
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/image.jpg"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlConfirm()}
              autoFocus
              className="text-sm"
            />
            <Button type="button" size="sm" onClick={handleUrlConfirm}>Apply</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        {!urlMode ? (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Upload className="w-3 h-3" />
              {value ? "Replace" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => { setUrlMode(true); setUrlInput(value); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <LinkIcon className="w-3 h-3" /> Use URL
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setUrlMode(false)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Upload className="w-3 h-3" /> Upload instead
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors ml-auto"
          >
            <X className="w-3 h-3" /> Remove
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files)} />
    </div>
  );
}
