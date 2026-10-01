import { Router, type IRouter } from "express";
import { objectStorageClient } from "../lib/objectStorage";

/**
 * GET /share-image.png — the picture link previews show for koastal.com.au
 * (the website and the shop): every page's og:image / twitter:image names it,
 * and a shared product shows it second, after the product's own photo.
 *
 * It is `Share.png` at the root of the object-storage bucket, read on each
 * request rather than copied into a build, so replacing the file in storage
 * changes every preview — after the hour browsers, CDNs and the social
 * networks' own caches may hold it. SHARE_IMAGE_OBJECT names a different object.
 * Public on purpose: crawlers fetch it with no session.
 */
const router: IRouter = Router();

router.get("/share-image.png", async (req, res): Promise<void> => {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  const name = process.env.SHARE_IMAGE_OBJECT?.trim() || "Share.png";
  if (!bucketId) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const file = objectStorageClient.bucket(bucketId).file(name);
    const [exists] = await file.exists();
    if (!exists) { res.status(404).json({ error: "Not found" }); return; }
    const [meta] = await file.getMetadata();
    res.setHeader("Content-Type", (meta.contentType as string) || "image/png");
    if (meta.size) res.setHeader("Content-Length", String(meta.size));
    if (meta.etag) res.setHeader("ETag", String(meta.etag));
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (req.method === "HEAD") { res.end(); return; }
    file.createReadStream().on("error", () => res.destroy()).pipe(res);
  } catch (err) {
    req.log.error({ err }, "share image");
    if (!res.headersSent) res.status(500).json({ error: "Failed to load share image" });
  }
});

export default router;
