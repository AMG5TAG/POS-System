import { db, customerFilesCloudSettingsTable } from "@workspace/db";
import { isReadableObjectKey } from "../lib/object-keys";
import { eq } from "drizzle-orm";
import { getNextcloudCredentials, NextcloudNotConnectedError } from "./nextcloudAuth";
import { uploadBuffer as uploadToNextcloud } from "../lib/nextcloud";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

/**
 * Cloud storage providers that can receive mirrored customer files. Nextcloud is
 * the only one: OneDrive, Google Drive and Dropbox were removed.
 */
export const CLOUD_FILE_STORAGE_KEYS = ["nextcloud"] as const;
export type CloudFileStorageKey = (typeof CLOUD_FILE_STORAGE_KEYS)[number];

export function isCloudFileStorageKey(key: string): key is CloudFileStorageKey {
  return (CLOUD_FILE_STORAGE_KEYS as readonly string[]).includes(key);
}

export interface CustomerFilesCloudConfig {
  enabled: boolean;
  storageKey: string;
  folder: string;
}

/** Read the merchant's customer-files cloud mirror settings (defaults when unset). */
export async function getCustomerFilesCloudConfig(merchantId: number): Promise<CustomerFilesCloudConfig> {
  const [row] = await db
    .select()
    .from(customerFilesCloudSettingsTable)
    .where(eq(customerFilesCloudSettingsTable.merchantId, merchantId));
  return {
    enabled: row?.enabled ?? false,
    storageKey: row?.storageKey ?? "",
    folder: row?.folder ?? "",
  };
}

/** Normalise a user-entered folder into clean, slash-separated segments. */
function folderSegments(folder: string): string[] {
  return folder
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface MirrorInput {
  fileKey: string;     // object-storage path, e.g. "/objects/uploads/abc"
  filename: string;
  contentType: string;
}

export type MirrorResult =
  | { mirrored: true; provider: CloudFileStorageKey; folder: string }
  | { mirrored: false; reason: string };

/**
 * Best-effort: copy a just-uploaded customer file to the merchant's chosen cloud
 * storage folder. Never throws — failures are logged and reported via the return
 * value so the core upload is unaffected.
 */
export async function mirrorCustomerFileToCloud(
  merchantId: number,
  input: MirrorInput,
): Promise<MirrorResult> {
  try {
    const cfg = await getCustomerFilesCloudConfig(merchantId);
    if (!cfg.enabled) return { mirrored: false, reason: "disabled" };
    const storageKey = cfg.storageKey;
    if (!isCloudFileStorageKey(storageKey)) {
      return { mirrored: false, reason: "no_storage_selected" };
    }

    if (!isReadableObjectKey(input.fileKey, merchantId)) {
      return { mirrored: false, reason: "foreign_object" };
    }
    // Pull the uploaded bytes back from object storage.
    const objectFile = await new ObjectStorageService().getObjectEntityFile(input.fileKey);
    const [bytes] = await objectFile.download();

    const segments = folderSegments(cfg.folder);
    const contentType = input.contentType || "application/octet-stream";

    switch (storageKey) {
      case "nextcloud": {
        const creds = await getNextcloudCredentials(merchantId);
        await uploadToNextcloud(creds, segments, input.filename, bytes, contentType);
        break;
      }
      default: {
        // Exhaustiveness guard: adding a key to CLOUD_FILE_STORAGE_KEYS without
        // an uploader is a compile error rather than a silent misroute.
        const unreachable: never = storageKey;
        throw new Error(`No uploader for storage key: ${String(unreachable)}`);
      }
    }

    logger.info({ merchantId, provider: storageKey, filename: input.filename }, "Cloud file mirror: uploaded");
    return { mirrored: true, provider: storageKey, folder: segments.join("/") };
  } catch (err) {
    if (err instanceof NextcloudNotConnectedError) {
      logger.warn({ merchantId }, "Cloud file mirror: Nextcloud not connected");
      return { mirrored: false, reason: "not_connected" };
    }
    logger.warn({ merchantId, err }, "Cloud file mirror failed");
    return { mirrored: false, reason: "upload_failed" };
  }
}
