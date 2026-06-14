import { Router, type IRouter } from "express";
import { db, customerFilesCloudSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { CLOUD_FILE_STORAGE_KEYS, isCloudFileStorageKey } from "../services/cloudFileMirror";

const router: IRouter = Router();
router.use(requireAuth);

/* ── GET /integrations/customer-files-cloud ──────────────────────────────────
   Returns the merchant's "save all customer files to the cloud" preference. */
router.get("/integrations/customer-files-cloud", async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db
    .select()
    .from(customerFilesCloudSettingsTable)
    .where(eq(customerFilesCloudSettingsTable.merchantId, merchantId));
  res.json({
    enabled: row?.enabled ?? false,
    storageKey: row?.storageKey ?? "",
    folder: row?.folder ?? "",
    supportedStorageKeys: CLOUD_FILE_STORAGE_KEYS,
  });
});

/* ── PUT /integrations/customer-files-cloud ──────────────────────────────────
   Saves the preference. When enabled, a supported storage key and a non-empty
   folder are required. */
router.put("/integrations/customer-files-cloud", async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { enabled, storageKey, folder } = req.body as {
    enabled?: boolean;
    storageKey?: string;
    folder?: string;
  };

  const wantEnabled = Boolean(enabled);
  const key = (storageKey ?? "").trim();
  const folderClean = (folder ?? "").trim();

  if (wantEnabled) {
    if (!isCloudFileStorageKey(key)) {
      res.status(400).json({ error: "storageKey must be a supported cloud storage provider" });
      return;
    }
    if (!folderClean) {
      res.status(400).json({ error: "folder is required when cloud sync is enabled" });
      return;
    }
  }

  const values = { enabled: wantEnabled, storageKey: key, folder: folderClean, updatedAt: new Date() };
  const [existing] = await db
    .select({ id: customerFilesCloudSettingsTable.id })
    .from(customerFilesCloudSettingsTable)
    .where(eq(customerFilesCloudSettingsTable.merchantId, merchantId));

  if (existing) {
    await db.update(customerFilesCloudSettingsTable)
      .set(values)
      .where(eq(customerFilesCloudSettingsTable.merchantId, merchantId));
  } else {
    await db.insert(customerFilesCloudSettingsTable).values({ merchantId, ...values });
  }

  res.json({ ok: true, enabled: wantEnabled, storageKey: key, folder: folderClean });
});

export default router;
