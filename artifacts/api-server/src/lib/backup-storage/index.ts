/**
 * backup-storage — dispatches an encrypted backup file to one or more
 * configured destinations and returns a location ref for each.
 */
import { uploadLocal } from "./local";
import { uploadS3 } from "./s3";
import { uploadGcs } from "./gcs";
import { uploadSftp } from "./sftp";
import { uploadOneDrive } from "./onedrive";
import { downloadNextcloud, uploadNextcloud } from "./nextcloud";
import { downloadServerCopy } from "./server";
import { getValidOneDriveToken } from "../../services/microsoftToken";
import { getNextcloudCredentials } from "../../services/nextcloudAuth";
import { parseNextcloudRef } from "../nextcloud";
import os from "os";
import path from "path";
import { mkdtemp, rm, writeFile } from "fs/promises";
import {
  resolveDestination,
  type StoredDestination,
  type StorageType,
} from "./types";

export interface UploadLocation {
  type: StorageType;
  ref: string;
}

export interface UploadOutcome {
  locations: UploadLocation[];
  errors: { type: string; message: string }[];
}

/**
 * Upload `sourcePath` (an already-encrypted archive) to each configured
 * destination. Returns the successful locations and any per-destination errors;
 * one failing destination does not abort the others.
 */
export async function uploadToDestinations(
  destinations: StoredDestination[],
  sourcePath: string,
  fileName: string,
  merchantId: number,
): Promise<UploadOutcome> {
  const locations: UploadLocation[] = [];
  const errors: { type: string; message: string }[] = [];

  for (const stored of destinations) {
    const dest = resolveDestination(stored);
    try {
      let ref: string;
      switch (dest.type) {
        case "local":
          ref = await uploadLocal(dest, sourcePath, fileName);
          break;
        case "s3":
          ref = await uploadS3(dest, sourcePath, fileName);
          break;
        case "gcs":
          ref = await uploadGcs(dest, sourcePath, fileName);
          break;
        case "sftp":
          ref = await uploadSftp(dest, sourcePath, fileName);
          break;
        case "onedrive": {
          // Reuse the merchant's connected OneDrive integration (refreshed).
          const token = await getValidOneDriveToken(merchantId);
          ref = await uploadOneDrive(dest, token, sourcePath, fileName);
          break;
        }
        case "nextcloud": {
          // Reuse the merchant's connected Nextcloud integration. App passwords
          // do not expire, so there is nothing to refresh.
          const creds = await getNextcloudCredentials(merchantId);
          ref = await uploadNextcloud(dest, creds, sourcePath, fileName);
          break;
        }
        default:
          throw new Error(`Unknown destination type: ${String(dest.type)}`);
      }
      locations.push({ type: dest.type, ref });
    } catch (err) {
      errors.push({
        type: dest.type,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { locations, errors };
}

/** A temp copy of a retrieved archive; the caller must run `cleanup`. */
export interface RetrievedArchive {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Fetch a backup archive back from wherever it was stored, for restore or
 * download, when the canonical copy on the local filesystem is gone.
 *
 * Tries the always-present platform "server" copy first; a Nextcloud location is
 * the fallback for the case that copy is missing or its bucket is unreachable.
 * Returns null when no location could supply the archive.
 */
export async function retrieveArchive(
  locations: { type: string; ref: string }[],
  merchantId: number,
): Promise<RetrievedArchive | null> {
  const serverLoc = locations.find((l) => l.type === "server");
  if (serverLoc) {
    try {
      return await downloadServerCopy(serverLoc.ref);
    } catch {
      // Fall through to the merchant-controlled copies below.
    }
  }

  const nextcloudLoc = locations.find((l) => l.type === "nextcloud");
  if (nextcloudLoc) {
    const remotePath = parseNextcloudRef(nextcloudLoc.ref);
    if (remotePath) {
      try {
        const creds = await getNextcloudCredentials(merchantId);
        const bytes = await downloadNextcloud(creds, remotePath);
        const dir = await mkdtemp(path.join(os.tmpdir(), "bk-restore-"));
        const dest = path.join(dir, path.basename(remotePath));
        await writeFile(dest, bytes);
        return {
          path: dest,
          cleanup: async () => {
            await rm(dir, { recursive: true, force: true }).catch(() => {});
          },
        };
      } catch {
        // Nothing left to try.
      }
    }
  }

  return null;
}
