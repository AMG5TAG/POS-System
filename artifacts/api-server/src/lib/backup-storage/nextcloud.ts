/**
 * Nextcloud backup destination (via WebDAV).
 *
 * The server address and app password come from the merchant's connected
 * Nextcloud integration (resolved by the caller), not from the destination
 * record — the destination only carries the target folder, the same way the
 * OneDrive destination does.
 *
 * Unlike OneDrive there is no app-scoped root on Nextcloud, so an unset folder
 * would drop archives straight into the account's home directory. We use a
 * clearly-named default instead.
 */
import {
  downloadToBuffer,
  folderSegments,
  nextcloudRef,
  uploadFile,
  type NextcloudCredentials,
} from "../nextcloud";

/** Where backups land when the merchant leaves the folder blank. */
export const DEFAULT_BACKUP_FOLDER = "KoaPOS/Backups";

function targetSegments(folder: string | undefined): string[] {
  const segments = folderSegments(folder);
  return segments.length > 0 ? segments : folderSegments(DEFAULT_BACKUP_FOLDER);
}

export async function uploadNextcloud(
  dest: { folder?: string },
  creds: NextcloudCredentials,
  sourcePath: string,
  fileName: string,
): Promise<string> {
  const remotePath = await uploadFile(
    creds,
    targetSegments(dest.folder),
    fileName,
    sourcePath,
  );
  return nextcloudRef(creds.serverUrl, remotePath);
}

/** Fetch a previously uploaded archive back by its remote path, for restore. */
export async function downloadNextcloud(
  creds: NextcloudCredentials,
  remotePath: string,
): Promise<Buffer> {
  return downloadToBuffer(creds, remotePath);
}
