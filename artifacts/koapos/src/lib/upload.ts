/**
 * Shared client upload flow, with de-duplication.
 *
 * The file is hashed in the browser before anything is sent. The server checks
 * that hash against this merchant's media library: on a hit it returns the
 * existing storage path and no upload URL, so re-using the same image across
 * hundreds of products transfers zero bytes and stores one copy.
 *
 * All callers should go through this rather than hand-rolling the
 * request-url → PUT → confirm sequence, otherwise their uploads skip dedup.
 */

export interface UploadResult {
  /** Value to persist on the entity (e.g. products.imageUrl). */
  url: string;
  /** Normalized storage path, e.g. /objects/merchants/4/assets/<sha256>. */
  objectPath: string;
  /** True when the bytes were already stored and nothing was transferred. */
  deduped: boolean;
  assetId?: number;
}

interface RequestUrlResponse {
  uploadURL?: string;
  objectPath: string;
  deduped: boolean;
  assetId?: number;
}

/** Lowercase hex SHA-256 of a file's contents. */
export async function hashFile(file: File): Promise<string | undefined> {
  // crypto.subtle is unavailable on insecure origins; dedup is an optimisation,
  // so fall back to a plain upload rather than failing.
  if (!globalThis.crypto?.subtle) return undefined;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

/** Natural pixel dimensions of an image file, best-effort. */
async function readImageSize(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("image/")) return {};
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({});
    };
    img.src = objectUrl;
  });
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const sha256 = await hashFile(file);

  const urlRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type, sha256 }),
    credentials: "include",
  });
  if (!urlRes.ok) throw new Error("Could not get upload URL");
  const { uploadURL, objectPath, deduped, assetId } = await urlRes.json() as RequestUrlResponse;

  // Already stored — the bytes never leave the browser.
  if (deduped || !uploadURL) {
    return { url: `/api/storage${objectPath}`, objectPath, deduped: true, assetId };
  }

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) throw new Error("Upload to storage failed");

  const { width, height } = await readImageSize(file);

  const confirmRes = await fetch("/api/storage/uploads/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectPath,
      sha256,
      name: file.name,
      size: file.size,
      contentType: file.type,
      width,
      height,
    }),
    credentials: "include",
  });
  if (!confirmRes.ok) throw new Error("Failed to confirm upload");
  const confirmed = await confirmRes.json() as { objectPath: string; assetId?: number };

  return {
    url: `/api/storage${confirmed.objectPath}`,
    objectPath: confirmed.objectPath,
    deduped: false,
    assetId: confirmed.assetId,
  };
}
