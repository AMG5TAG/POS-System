/**
 * backup-storage — dispatches an encrypted backup file to one or more
 * configured destinations and returns a location ref for each.
 */
import { uploadLocal } from "./local";
import { uploadS3 } from "./s3";
import { uploadGcs } from "./gcs";
import { uploadSftp } from "./sftp";
import { uploadOneDrive } from "./onedrive";
import { getValidOneDriveToken } from "../../services/microsoftToken";
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
