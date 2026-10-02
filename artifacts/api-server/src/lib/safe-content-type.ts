/* What a stored file may be served as from one of our own origins.
 *
 * A file's Content-Type is whatever the uploader's PUT said — the presigned
 * upload URL does not pin it, and older uploads predate the allowlist — and
 * the API answers on pos.koastal.com.au and koastal.com.au. A file stored as
 * text/html or image/svg+xml and opened from there is a page running with the
 * viewer's session. So only types a browser displays without running anything
 * keep their type; everything else is served as an opaque download. */

const INLINE_SAFE = /^(?:image\/(?:jpeg|png|gif|webp|avif|bmp|heic|heif)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf|text\/(?:plain|csv))$/i;

export function servedContentType(stored: string | null | undefined): { contentType: string; inline: boolean } {
  const type = String(stored ?? "").split(";")[0]!.trim().toLowerCase();
  if (INLINE_SAFE.test(type)) return { contentType: String(stored), inline: true };
  return { contentType: "application/octet-stream", inline: false };
}
