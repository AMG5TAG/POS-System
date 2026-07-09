/* Shared client-side image downscaler for uploaded logos / branding images.

   Logos are stored inline as base64 `data:` URIs in text columns (business_profile
   .logo, online-store logo/favicon, …) and shipped whole in JSON PUTs, bounded only
   by the API's 10 MB body limit. A phone photo or a 4000×4000 export therefore bloats
   the DB, slows every page that renders it, and can 413 the save. This resizes such
   uploads down to a sane longest-edge before they are ever stored — preserving aspect
   ratio, never upscaling, and keeping transparency (PNG out) unless the source is a
   JPEG. SVGs are vector and already tiny/scalable, so they pass through untouched. */

export interface ResizeImageOptions {
  /** Longest-edge cap in px. The image is scaled down so max(w, h) <= this. Default 512. */
  maxDim?: number;
  /** Encoder quality for lossy output (JPEG/WebP), 0–1. Default 0.9. */
  quality?: number;
  /** Force the output MIME type. Defaults to keeping JPEG for JPEG sources, else PNG. */
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
}

export interface ResizeImageResult {
  /** The (possibly downscaled) image as a `data:` URI, ready to store. */
  dataUrl: string;
  /** Whether the image was actually re-encoded at a smaller size. */
  resized: boolean;
  /** Output pixel dimensions (equal to the source dims when `resized` is false). */
  width: number;
  height: number;
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

/* Downscale an uploaded image File to a `data:` URI whose longest edge is <= maxDim,
   preserving aspect ratio and never upscaling. SVGs and images already within the cap
   are returned unchanged (resized: false). If the browser can't decode the file it
   falls back to the raw bytes so the upload still succeeds. */
export async function resizeImageFile(file: File, opts: ResizeImageOptions = {}): Promise<ResizeImageResult> {
  const { maxDim = 512, quality = 0.9 } = opts;

  // Vector — rasterising would only lose scalability and add weight. Keep as-is.
  if (file.type === "image/svg+xml") {
    return { dataUrl: await readFileAsDataUrl(file), resized: false, width: 0, height: 0 };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Undecodable (corrupt, or a format createImageBitmap rejects) — store raw.
    return { dataUrl: await readFileAsDataUrl(file), resized: false, width: 0, height: 0 };
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(width, height));

  // Already small enough — don't re-encode (would waste bytes and could add loss).
  if (scale >= 1) {
    bitmap.close();
    return { dataUrl: await readFileAsDataUrl(file), resized: false, width, height };
  }

  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { dataUrl: await readFileAsDataUrl(file), resized: false, width, height };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Keep JPEG for JPEG sources (photos); otherwise PNG to preserve any transparency.
  const outType = opts.mimeType ?? (file.type === "image/jpeg" ? "image/jpeg" : "image/png");
  return { dataUrl: canvas.toDataURL(outType, quality), resized: true, width: w, height: h };
}
