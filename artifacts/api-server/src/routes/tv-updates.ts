import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { publicOrigin } from "../lib/publicUrl";
import {
  findPublicTvUpdateFile,
  getWritableTvUpdateFile,
  listPublicTvUpdates,
} from "../lib/tvUpdatesStorage";

const MAX_APK_BYTES = 100 * 1024 * 1024;
const APK_CONTENT_TYPE = "application/vnd.android.package-archive";
const APP_NAME = /^[a-z0-9]{1,32}$/;
const APK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.apk$/;

const updateManifestSchema = z.object({
  versionCode: z.number().int().positive().safe(),
  versionName: z.string().trim().min(1).max(80),
  apk: z.string().regex(APK_NAME),
}).strict();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_APK_BYTES,
    files: 2,
    fields: 1,
    fieldSize: 128,
  },
});

const router: IRouter = Router();
const publicRouter: IRouter = Router();

function isPlatformOwner(req: Request): boolean {
  // requireAuth already rejects every merchant except this install's Koastal
  // account. Staff-email sessions and till sessions are explicitly excluded.
  return req.session.staffRole === "owner"
    && req.session.authKind !== "staff-email"
    && !req.session.staffId;
}

function requirePlatformOwner(req: Request, res: Response, next: NextFunction): void {
  if (!isPlatformOwner(req)) {
    res.status(403).json({ error: "Platform owner access required" });
    return;
  }
  next();
}

async function parseCurrentManifest(app: string): Promise<z.infer<typeof updateManifestSchema> | null> {
  const file = await findPublicTvUpdateFile(app, "update.json");
  if (!file) return null;
  const [contents] = await file.download();
  return updateManifestSchema.parse(JSON.parse(contents.toString("utf8")));
}

function uploadFiles(req: Request, res: Response, next: NextFunction): void {
  upload.fields([
    { name: "apk", maxCount: 1 },
    { name: "updateJson", maxCount: 1 },
  ])(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).json({
        error: error.code === "LIMIT_FILE_SIZE"
          ? "APK must be 100 MB or smaller"
          : "Upload must include one APK and one update.json file",
      });
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
}

function uploadedFile(req: Request, field: "apk" | "updateJson"): Express.Multer.File | null {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0] ?? null;
}

router.get("/tv-updates/admin/apps", requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    res.json({ apps: await listPublicTvUpdates() });
  } catch (error) {
    req.log.error({ err: error }, "Failed to list TV app updates");
    res.status(500).json({ error: "Failed to list TV app updates" });
  }
});

router.post(
  "/tv-updates/admin/publish",
  requireAuth,
  requirePlatformOwner,
  uploadFiles,
  async (req: Request, res: Response): Promise<void> => {
    const app = typeof req.body?.app === "string" ? req.body.app : "";
    if (!APP_NAME.test(app)) {
      res.status(400).json({ error: "App name must contain only lowercase letters and digits" });
      return;
    }

    const apk = uploadedFile(req, "apk");
    const updateJson = uploadedFile(req, "updateJson");
    if (!apk || !updateJson) {
      res.status(400).json({ error: "Upload both the APK and update.json files" });
      return;
    }
    if (!APK_NAME.test(apk.originalname)) {
      res.status(400).json({ error: "APK filename contains unsupported characters" });
      return;
    }
    if (updateJson.originalname !== "update.json") {
      res.status(400).json({ error: "The manifest file must be named update.json" });
      return;
    }
    if (apk.size < 1 || apk.size > MAX_APK_BYTES) {
      res.status(413).json({ error: "APK must be between 1 byte and 100 MB" });
      return;
    }

    let manifest: z.infer<typeof updateManifestSchema>;
    try {
      manifest = updateManifestSchema.parse(JSON.parse(updateJson.buffer.toString("utf8")));
    } catch {
      res.status(400).json({ error: "update.json is invalid or missing required fields" });
      return;
    }
    if (manifest.apk !== apk.originalname) {
      res.status(400).json({ error: "The APK filename must match the apk value in update.json" });
      return;
    }

    try {
      const current = await parseCurrentManifest(app);
      if (current && manifest.versionCode <= current.versionCode) {
        res.status(409).json({
          error: `versionCode must be higher than the current version (${current.versionCode})`,
        });
        return;
      }

      const apkObject = getWritableTvUpdateFile(app, apk.originalname);
      const [apkAlreadyExists] = await apkObject.exists();
      if (apkAlreadyExists) {
        res.status(409).json({ error: "That APK filename is already stored; use a new versioned filename" });
        return;
      }

      // Publish binary first; the manifest is written only after the APK is
      // fully stored and verified, so TVs cannot observe a broken update.
      await apkObject.save(apk.buffer, {
        resumable: false,
        metadata: {
          contentType: APK_CONTENT_TYPE,
          cacheControl: "public, max-age=31536000, immutable",
        },
      });

      const [storedMetadata] = await apkObject.getMetadata();
      if (Number(storedMetadata.size) !== apk.size || Number(storedMetadata.size) > MAX_APK_BYTES) {
        await apkObject.delete({ ignoreNotFound: true });
        res.status(400).json({ error: "Stored APK size did not match the uploaded file" });
        return;
      }

      const manifestObject = getWritableTvUpdateFile(app, "update.json");
      await manifestObject.save(updateJson.buffer, {
        resumable: false,
        metadata: {
          contentType: "application/json; charset=utf-8",
          cacheControl: "no-cache",
        },
      });

      const publicUrl = `${publicOrigin()}/tv/${app}/update.json`;
      res.status(201).json({
        message: `Published ${app} ${manifest.versionName}`,
        publicUrl,
      });
    } catch (error) {
      req.log.error({ err: error, app }, "Failed to publish TV app update");
      res.status(500).json({ error: "Failed to publish TV app update" });
    }
  },
);

async function servePublicFile(
  req: Request,
  res: Response,
  app: string,
  filename: string,
): Promise<void> {
  if (!APP_NAME.test(app) || (filename !== "update.json" && !APK_NAME.test(filename))) {
    res.status(404).end();
    return;
  }

  const file = await findPublicTvUpdateFile(app, filename);
  if (!file) {
    res.status(404).end();
    return;
  }

  const [metadata] = await file.getMetadata();
  res.status(200);
  res.setHeader(
    "Content-Type",
    filename === "update.json" ? "application/json; charset=utf-8" : APK_CONTENT_TYPE,
  );
  res.setHeader(
    "Cache-Control",
    filename === "update.json" ? "no-cache" : "public, max-age=31536000, immutable",
  );
  if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
  if (filename !== "update.json") {
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = file.createReadStream();
  stream.on("error", (error) => {
    req.log.error({ err: error, app, filename }, "Failed to stream TV app update file");
    if (!res.headersSent) res.status(404).end();
    else res.destroy(error);
  });
  stream.pipe(res);
}

function publicFileHandler(req: Request, res: Response): void {
  const app = String(req.params.app);
  const filename = req.path.endsWith("/update.json") ? "update.json" : String(req.params.filename);
  void servePublicFile(req, res, app, filename).catch((error: unknown) => {
    req.log.error({ err: error, app, filename }, "Failed to serve TV app update file");
    if (!res.headersSent) res.status(500).end();
    else res.destroy(error instanceof Error ? error : undefined);
  });
}

publicRouter.get("/tv-updates/public/:app/update.json", publicFileHandler);
publicRouter.get("/tv-updates/public/:app/:filename", publicFileHandler);
publicRouter.head("/tv-updates/public/:app/update.json", publicFileHandler);
publicRouter.head("/tv-updates/public/:app/:filename", publicFileHandler);

export { publicRouter as tvUpdatesPublicRouter };
export default router;
