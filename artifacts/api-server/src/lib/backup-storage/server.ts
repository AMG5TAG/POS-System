/**
 * server backup storage — the always-on durable copy in the platform's object
 * storage (Replit object store). Unlike the user-configurable destinations
 * (local/s3/gcs/sftp/onedrive), EVERY backup is uploaded here regardless of the
 * merchant's chosen destinations, because the canonical copy under ./backups is
 * on the deployment's ephemeral filesystem and is lost across redeploys/restarts.
 * This server copy is therefore the durable source of truth used by restore.
 */
import os from "os";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { objectStorageClient, ObjectStorageService } from "../objectStorage";

/** Split a full `/<bucket>/<object...>` path into bucket + object name. */
function parseObjectPath(p: string): { bucketName: string; objectName: string } {
  if (!p.startsWith("/")) p = `/${p}`;
  const parts = p.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid object path: must contain a bucket name");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

/** Canonical object-storage path for a merchant's backup archive. */
export function serverObjectPath(merchantId: number, fileName: string): string {
  const dir = new ObjectStorageService().getPrivateObjectDir().replace(/\/+$/, "");
  return `${dir}/backups/${merchantId}/${fileName}`;
}

/**
 * Upload an already-encrypted archive to the platform object storage.
 * Returns the full object-storage path (usable later by downloadServerCopy).
 */
export async function uploadServer(
  sourcePath: string,
  fileName: string,
  merchantId: number,
): Promise<string> {
  const fullPath = serverObjectPath(merchantId, fileName);
  const { bucketName, objectName } = parseObjectPath(fullPath);
  await objectStorageClient.bucket(bucketName).upload(sourcePath, {
    destination: objectName,
    contentType: "application/octet-stream",
  });
  return fullPath;
}

/**
 * Download a server-stored archive (referenced by the path returned from
 * uploadServer) to a fresh temp file. Returns the local path plus a cleanup
 * callback the caller must invoke once done.
 */
export async function downloadServerCopy(
  ref: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const { bucketName, objectName } = parseObjectPath(ref);
  const dir = await mkdtemp(path.join(os.tmpdir(), "bk-restore-"));
  const dest = path.join(dir, path.basename(objectName));
  await objectStorageClient.bucket(bucketName).file(objectName).download({ destination: dest });
  return {
    path: dest,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
