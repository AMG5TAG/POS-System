import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { createHash } from "crypto";
import { db, merchantAssetsTable } from "@workspace/db";
import { and, eq, desc, ilike, like, sql } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  ConfirmUploadBody,
  ConfirmUploadResponse,
  ListMerchantAssetsResponse,
  GetMerchantAssetUsageResponse,
  DeleteMerchantAssetResponse,
  ImportMerchantAssetsResponse,
  SweepMerchantAssetOrphansResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { findAssetUsage, findUsageCounts } from "../lib/assetUsage";
import { contentDispositionFor, recoverKnownFilenames } from "../lib/assetFilenames";
import { requireAuth } from "../middlewares/requireAuth";
import { requireActiveAuth } from "../middlewares/requireActiveAuth";

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/** Content-addressed objects live under assets/; legacy random-UUID ones under uploads/. */
const ASSET_PATH_MARKER = "%/assets/%";

/** Public URL the frontend uses as an <img src> for a stored object. */
function assetUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

/**
 * Express query params arrive as strings, and the generated schemas use
 * zod.coerce.boolean() — which treats the string "false" as true. Parse
 * booleans from the raw query instead.
 */
function queryFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 *
 * When the client supplies `sha256`, uploads are de-duplicated: if this
 * merchant already has an asset with that hash the response carries no
 * uploadURL and the client skips straight to using the existing objectPath.
 * That is what lets a few hundred products share one stored image.
 *
 * The hash is client-supplied and not re-verified server-side. A client that
 * lies about it can only confuse its own library — keys are merchant-scoped,
 * so a bad hash can never surface or overwrite another merchant's file.
 */
router.post("/storage/uploads/request-url", requireActiveAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES.has(parsed.data.contentType)) {
    res.status(400).json({ error: "File type not allowed. Permitted types: images (JPEG, PNG, GIF, WebP), PDF, CSV, Excel." });
    return;
  }

  try {
    const { name, size, contentType, sha256 } = parsed.data;
    const merchantId = String(req.session.merchantId);
    const metadata = { name, size, contentType, sha256 };

    if (!sha256) {
      // Legacy path — no hash supplied, so no dedup is possible.
      const uploadURL = await objectStorageService.getObjectEntityUploadURL(merchantId);
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath, deduped: false, metadata }));
      return;
    }

    const [existing] = await db
      .select()
      .from(merchantAssetsTable)
      .where(and(
        eq(merchantAssetsTable.merchantId, req.session.merchantId!),
        eq(merchantAssetsTable.sha256, sha256),
        like(merchantAssetsTable.objectPath, ASSET_PATH_MARKER),
      ))
      .limit(1);

    if (existing) {
      // Guard against a library row whose object was removed out of band —
      // better to re-upload than to hand back a path that 404s.
      if (await objectStorageService.objectExists(existing.objectPath)) {
        // A dedup hit skips confirm, so this is the only chance to record a
        // name for a row that has none — e.g. one created by the backfill.
        // An existing name is kept: one stored object, one canonical filename.
        if (!existing.filename && name) {
          await db.update(merchantAssetsTable)
            .set({ filename: name })
            .where(eq(merchantAssetsTable.id, existing.id));
        }
        res.json(RequestUploadUrlResponse.parse({
          objectPath: existing.objectPath,
          deduped: true,
          assetId: existing.id,
          metadata,
        }));
        return;
      }
      await db.delete(merchantAssetsTable).where(eq(merchantAssetsTable.id, existing.id));
    }

    const uploadURL = await objectStorageService.getAssetUploadURL(merchantId, sha256);
    const objectPath = objectStorageService.assetObjectPath(merchantId, sha256);

    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath, deduped: false, metadata }));
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/uploads/confirm
 *
 * Called by the client after a direct-to-GCS upload completes.
 * Sets an ACL policy on the uploaded object (owner = authenticated merchant,
 * visibility = private) so ACL-based access checks can enforce ownership
 * independently of the path-prefix check on GET /storage/objects/*.
 */
router.post("/storage/uploads/confirm", requireActiveAuth, async (req: Request, res: Response) => {
  const parsed = ConfirmUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid objectPath" });
    return;
  }

  const { objectPath, sha256, name, size, contentType, width, height } = parsed.data;
  const merchantId = String(req.session.merchantId);

  const expectedPrefix = `/objects/merchants/${merchantId}/`;
  if (!objectPath.startsWith(expectedPrefix)) {
    res.status(403).json({ error: "Forbidden: objectPath does not belong to your account" });
    return;
  }

  try {
    const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: merchantId,
      visibility: "private",
    });

    // Register the upload in the merchant's media library so it can be picked
    // again instead of re-uploaded. Concurrent confirms of the same file race
    // on the unique indexes; onConflictDoNothing plus a read-back makes either
    // order converge on the one row.
    let assetId: number | undefined;
    if (sha256) {
      await db.insert(merchantAssetsTable).values({
        merchantId: req.session.merchantId!,
        sha256,
        objectPath: normalizedPath,
        contentType: contentType ?? "application/octet-stream",
        sizeBytes: size ?? 0,
        filename: name ?? null,
        width: width ?? null,
        height: height ?? null,
      }).onConflictDoNothing();

      const [asset] = await db
        .select({ id: merchantAssetsTable.id, filename: merchantAssetsTable.filename })
        .from(merchantAssetsTable)
        .where(and(
          eq(merchantAssetsTable.merchantId, req.session.merchantId!),
          eq(merchantAssetsTable.objectPath, normalizedPath),
        ))
        .limit(1);
      assetId = asset?.id;

      // The insert above no-ops when the row already exists, so fill in a name
      // it is missing (a row the backfill created without one).
      if (asset && !asset.filename && name) {
        await db.update(merchantAssetsTable)
          .set({ filename: name })
          .where(eq(merchantAssetsTable.id, asset.id));
      }
    }

    res.json(ConfirmUploadResponse.parse({ objectPath: normalizedPath, assetId }));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error setting ACL policy on uploaded object");
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * Access is gated by two independent checks:
 *   1. Path-prefix check — the object path must start with merchants/<merchantId>/
 *      so a merchant can never even attempt to address another merchant's files.
 *   2. ACL policy check — once the file is located, canAccessObjectEntity verifies
 *      that the ACL policy owner matches the authenticated merchant. Files that
 *      were uploaded but never confirmed (no ACL tag yet) are denied here.
 */
router.get("/storage/objects/*path", requireActiveAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

    const merchantId = String(req.session.merchantId);
    const allowedPrefix = `merchants/${merchantId}/`;
    if (!wildcardPath.startsWith(allowedPrefix)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const canAccess = await objectStorageService.canAccessObjectEntity({
      userId: merchantId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Content-addressed objects can never change under a given key, so they
    // are safe to cache hard. This matters now that one image is shared by
    // many products: the browser fetches it once per session, not per tile.
    const isContentAddressed = wildcardPath.includes("/assets/");
    const response = await objectStorageService.downloadObject(
      objectFile,
      isContentAddressed ? 31_536_000 : 3600,
      isContentAddressed,
    );

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    // The storage key is a content hash with no name or extension, so re-attach
    // the name the file was uploaded under — otherwise saving it yields a bare
    // hex string. Indexed single-row lookup on an already multi-round-trip path.
    const [named] = await db
      .select({ filename: merchantAssetsTable.filename })
      .from(merchantAssetsTable)
      .where(and(
        eq(merchantAssetsTable.merchantId, req.session.merchantId!),
        eq(merchantAssetsTable.objectPath, objectPath),
      ))
      .limit(1);
    if (named?.filename) {
      res.setHeader("Content-Disposition", contentDispositionFor(named.filename));
    }

    const etag = response.headers.get("etag");
    if (etag && req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

// ── Media library ───────────────────────────────────────────────────────────

/**
 * GET /storage/assets
 *
 * The merchant's reusable media. Every row is filtered by the session's
 * merchantId, and each objectPath is itself merchant-prefixed, so a merchant
 * can only ever list and serve its own uploads.
 */
router.get("/storage/assets", requireActiveAuth, async (req: Request, res: Response) => {
  try {
    const merchantId = req.session.merchantId!;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const withUsage = queryFlag(req.query.withUsage);

    const conditions = [eq(merchantAssetsTable.merchantId, merchantId)];
    if (search) conditions.push(ilike(merchantAssetsTable.filename, `%${search}%`));
    const where = and(...conditions);

    const rows = await db
      .select()
      .from(merchantAssetsTable)
      .where(where)
      .orderBy(desc(merchantAssetsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        totalBytes: sql<number>`coalesce(sum(${merchantAssetsTable.sizeBytes}), 0)::int`,
      })
      .from(merchantAssetsTable)
      .where(where);

    const usageCounts = withUsage
      ? await findUsageCounts(merchantId, rows.map((r) => r.objectPath))
      : null;

    res.json(ListMerchantAssetsResponse.parse({
      assets: rows.map((r) => ({
        id: r.id,
        objectPath: r.objectPath,
        url: assetUrl(r.objectPath),
        sha256: r.sha256,
        contentType: r.contentType,
        sizeBytes: r.sizeBytes,
        filename: r.filename,
        width: r.width,
        height: r.height,
        ...(usageCounts ? { usageCount: usageCounts.get(r.objectPath) ?? 0 } : {}),
        createdAt: r.createdAt,
      })),
      total: totals?.total ?? 0,
      totalBytes: totals?.totalBytes ?? 0,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Error listing merchant assets");
    res.status(500).json({ error: "Failed to list assets" });
  }
});

/**
 * GET /storage/assets/:id/usage
 *
 * Where an asset is still referenced. Backs the "used by 12 products" hint and
 * the delete confirmation.
 */
router.get("/storage/assets/:id/usage", requireActiveAuth, async (req: Request, res: Response) => {
  try {
    const merchantId = req.session.merchantId!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const [asset] = await db
      .select()
      .from(merchantAssetsTable)
      .where(and(eq(merchantAssetsTable.id, id), eq(merchantAssetsTable.merchantId, merchantId)))
      .limit(1);

    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const usage = await findAssetUsage(asset.objectPath);
    res.json(GetMerchantAssetUsageResponse.parse({
      total: usage.reduce((sum, u) => sum + u.count, 0),
      usage,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Error computing asset usage");
    res.status(500).json({ error: "Failed to compute asset usage" });
  }
});

/**
 * DELETE /storage/assets/:id
 *
 * Reclaims storage. Refuses with 409 while anything still points at the
 * object, so removing a library entry can never blank out a product image —
 * the caller gets the reference report back and can go clear those first.
 */
router.delete("/storage/assets/:id", requireActiveAuth, async (req: Request, res: Response) => {
  try {
    const merchantId = req.session.merchantId!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const [asset] = await db
      .select()
      .from(merchantAssetsTable)
      .where(and(eq(merchantAssetsTable.id, id), eq(merchantAssetsTable.merchantId, merchantId)))
      .limit(1);

    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const usage = await findAssetUsage(asset.objectPath);
    const total = usage.reduce((sum, u) => sum + u.count, 0);
    if (total > 0) {
      res.status(409).json(GetMerchantAssetUsageResponse.parse({
        total,
        usage,
        error: `Still used in ${total} place${total === 1 ? "" : "s"}. Remove those references first.`,
      }));
      return;
    }

    try {
      await objectStorageService.deleteObjectEntity(asset.objectPath);
    } catch (error) {
      // An object that has already vanished should not block cleaning up the
      // row that points at it.
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
    await db.delete(merchantAssetsTable).where(eq(merchantAssetsTable.id, asset.id));

    res.json(DeleteMerchantAssetResponse.parse({ deleted: true, reclaimedBytes: asset.sizeBytes }));
  } catch (error) {
    req.log.error({ err: error }, "Error deleting merchant asset");
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

/** Objects large enough that hashing them during the backfill is not worth it. */
const IMPORT_HASH_SIZE_LIMIT = 32 * 1024 * 1024;

/**
 * POST /storage/assets/import
 *
 * Backfills the library from what is already in storage, so merchants who
 * uploaded before this feature existed can reuse those files. Purely additive:
 * it reads objects and inserts rows, and never moves or deletes anything.
 */
router.post("/storage/assets/import", requireActiveAuth, async (req: Request, res: Response) => {
  try {
    const merchantId = req.session.merchantId!;
    const objects = await objectStorageService.listMerchantObjects(String(merchantId));

    const known = new Set(
      (await db
        .select({ objectPath: merchantAssetsTable.objectPath })
        .from(merchantAssetsTable)
        .where(eq(merchantAssetsTable.merchantId, merchantId))
      ).map((r) => r.objectPath),
    );

    // Pre-library uploads recorded no filename centrally, but customer files
    // and return-auth attachments kept one next to the object key.
    const knownNames = await recoverKnownFilenames(merchantId);

    let imported = 0;
    let skipped = 0;

    for (const obj of objects) {
      if (known.has(obj.objectPath)) {
        skipped++;
        continue;
      }

      let sha256: string | null = null;
      if (obj.size > 0 && obj.size <= IMPORT_HASH_SIZE_LIMIT) {
        try {
          const file = await objectStorageService.getObjectEntityFile(obj.objectPath);
          const bytes = await objectStorageService.readObjectBytes(file);
          sha256 = createHash("sha256").update(bytes).digest("hex");
        } catch (error) {
          req.log.warn({ err: error, objectPath: obj.objectPath }, "Could not hash object during import");
        }
      }

      await db.insert(merchantAssetsTable).values({
        merchantId,
        sha256,
        objectPath: obj.objectPath,
        contentType: obj.contentType,
        sizeBytes: obj.size,
        // Null rather than the object key's trailing UUID — an unrecoverable
        // name should read as "unknown", not as a meaningless filename.
        filename: knownNames.get(obj.objectPath) ?? null,
      }).onConflictDoNothing();

      imported++;
    }

    res.json(ImportMerchantAssetsResponse.parse({ imported, skipped, scanned: objects.length }));
  } catch (error) {
    req.log.error({ err: error }, "Error importing merchant assets");
    res.status(500).json({ error: "Failed to import assets" });
  }
});

/**
 * POST /storage/assets/orphans
 *
 * Finds stored objects that are neither in the library nor referenced by any
 * row — the residue of the old "remove image" behaviour, which cleared the
 * form field and left the object behind forever.
 *
 * Dry run unless apply=true. Registered library assets are never swept, even
 * when unused: keeping an unused image around for reuse is the whole point of
 * the library, so those are only removed through an explicit DELETE.
 */
router.post("/storage/assets/orphans", requireActiveAuth, async (req: Request, res: Response) => {
  try {
    const merchantId = req.session.merchantId!;
    const apply = queryFlag(req.query.apply);

    const objects = await objectStorageService.listMerchantObjects(String(merchantId));
    const known = new Set(
      (await db
        .select({ objectPath: merchantAssetsTable.objectPath })
        .from(merchantAssetsTable)
        .where(eq(merchantAssetsTable.merchantId, merchantId))
      ).map((r) => r.objectPath),
    );

    const unregistered = objects.filter((o) => !known.has(o.objectPath));
    const usage = await findUsageCounts(merchantId, unregistered.map((o) => o.objectPath));
    const orphans = unregistered.filter((o) => (usage.get(o.objectPath) ?? 0) === 0);

    let deletedCount = 0;
    if (apply) {
      for (const orphan of orphans) {
        try {
          await objectStorageService.deleteObjectEntity(orphan.objectPath);
          deletedCount++;
        } catch (error) {
          req.log.warn({ err: error, objectPath: orphan.objectPath }, "Could not delete orphan object");
        }
      }
    }

    res.json(SweepMerchantAssetOrphansResponse.parse({
      dryRun: !apply,
      orphans: orphans.map((o) => ({ objectPath: o.objectPath, sizeBytes: o.size })),
      reclaimableBytes: orphans.reduce((sum, o) => sum + o.size, 0),
      deletedCount,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Error sweeping orphan objects");
    res.status(500).json({ error: "Failed to sweep orphan objects" });
  }
});

export default router;
