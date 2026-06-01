import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  ConfirmUploadBody,
  ConfirmUploadResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
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

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
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
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL(String(req.session.merchantId));
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
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

  const { objectPath } = parsed.data;
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

    res.json(ConfirmUploadResponse.parse({ objectPath: normalizedPath }));
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

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

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

export default router;
