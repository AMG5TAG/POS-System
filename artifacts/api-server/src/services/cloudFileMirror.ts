import { db, customerFilesCloudSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { readVault } from "./tokenVault";
import { getNextcloudCredentials, NextcloudNotConnectedError } from "./nextcloudAuth";
import { uploadBuffer as uploadToNextcloud } from "../lib/nextcloud";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

/**
 * Cloud storage providers that can receive mirrored customer files. These are
 * the connected, vault-backed storage integrations from the Sync page.
 */
export const CLOUD_FILE_STORAGE_KEYS = ["onedrive", "google_drive", "dropbox", "nextcloud"] as const;
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

    // Nextcloud stores a credential blob rather than a bearer token, so it
    // resolves its own connection below; the rest share the vault token read.
    let accessToken = "";
    if (storageKey !== "nextcloud") {
      const vault = await readVault(merchantId, storageKey);
      if (!vault?.accessToken) {
        logger.warn({ merchantId, storageKey }, "Cloud file mirror: storage not connected");
        return { mirrored: false, reason: "not_connected" };
      }
      accessToken = vault.accessToken;
    }

    // Pull the uploaded bytes back from object storage.
    const objectFile = await new ObjectStorageService().getObjectEntityFile(input.fileKey);
    const [bytes] = await objectFile.download();

    const segments = folderSegments(cfg.folder);
    const contentType = input.contentType || "application/octet-stream";

    switch (storageKey) {
      case "onedrive":
        await uploadToOneDrive(accessToken, segments, input.filename, bytes, contentType);
        break;
      case "google_drive":
        await uploadToGoogleDrive(accessToken, segments, input.filename, bytes, contentType);
        break;
      case "dropbox":
        await uploadToDropbox(accessToken, segments, input.filename, bytes);
        break;
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

/* ── Provider uploaders ──────────────────────────────────────────────────── */

/** OneDrive: simple upload into the KoaPOS app folder (scope Files.ReadWrite.AppFolder). */
async function uploadToOneDrive(
  accessToken: string,
  segments: string[],
  filename: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const path = [...segments, filename].map(encodeURIComponent).join("/");
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${path}:/content?@microsoft.graph.conflictBehavior=rename`,
    { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType }, body: bytes },
  );
  if (!r.ok) throw new Error(`OneDrive upload failed (${r.status})`);
}

/** Dropbox: upload into the user's Dropbox at /<folder>/<filename>. */
async function uploadToDropbox(
  accessToken: string,
  segments: string[],
  filename: string,
  bytes: Buffer,
): Promise<void> {
  const dropboxPath = `/${[...segments, filename].join("/")}`;
  const r = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath, mode: "add", autorename: true, mute: true }),
    },
    body: bytes,
  });
  if (!r.ok) throw new Error(`Dropbox upload failed (${r.status})`);
}

/** Google Drive: ensure the folder chain exists, then multipart-upload into it. */
async function uploadToGoogleDrive(
  accessToken: string,
  segments: string[],
  filename: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const parentId = await ensureDriveFolder(accessToken, segments);
  const metadata: Record<string, unknown> = { name: filename };
  if (parentId) metadata.parents = [parentId];

  const boundary = "koapos-boundary-7f3a";
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  if (!r.ok) throw new Error(`Google Drive upload failed (${r.status})`);
}

/**
 * Find-or-create the nested folder chain in Google Drive (drive.file scope only
 * sees folders this app created, which is exactly what we want), returning the
 * deepest folder's id, or null when no folder was configured.
 */
async function ensureDriveFolder(accessToken: string, segments: string[]): Promise<string | null> {
  let parentId: string | null = null;
  for (const name of segments) {
    const escaped = name.replace(/'/g, "\\'");
    const q = [
      `name='${escaped}'`,
      "mimeType='application/vnd.google-apps.folder'",
      "trashed=false",
      parentId ? `'${parentId}' in parents` : "'root' in parents",
    ].join(" and ");
    const found = (await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ).then((r) => r.json()).catch(() => ({}))) as { files?: Array<{ id?: string }> };

    if (found.files?.[0]?.id) {
      parentId = found.files[0].id!;
      continue;
    }
    const meta: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
    if (parentId) meta.parents = [parentId];
    const created = (await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    }).then((r) => r.json())) as { id?: string };
    if (!created.id) throw new Error("Google Drive folder creation failed");
    parentId = created.id;
  }
  return parentId;
}
