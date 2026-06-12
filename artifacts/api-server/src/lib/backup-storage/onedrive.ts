/**
 * Microsoft OneDrive backup destination (via the Microsoft Graph API).
 *
 * The access token comes from the merchant's connected OneDrive integration
 * (resolved/refreshed by the caller), which is granted the
 * `Files.ReadWrite.AppFolder` scope — so uploads target the app's special
 * folder (`approot`) rather than the drive root.
 */
import { readFile } from "fs/promises";
import type { ResolvedDestination } from "./types";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

/** Normalise a user-supplied sub-folder into a clean path segment ("" = app root). */
function normaliseFolder(folder: string | undefined): string {
  return (folder ?? "").trim().replace(/^\/+|\/+$/g, "");
}

export async function uploadOneDrive(
  dest: ResolvedDestination,
  accessToken: string,
  sourcePath: string,
  fileName: string,
): Promise<string> {
  if (!accessToken) {
    throw new Error("OneDrive destination has no access token");
  }

  const folder = normaliseFolder(dest.folder);
  const itemPath = folder ? `${folder}/${fileName}` : fileName;
  // Simple upload — backup archives are well under the 250 MB single-PUT limit.
  const url = `${GRAPH_ROOT}/me/drive/special/approot:/${encodeURI(itemPath)}:/content`;

  const body = await readFile(sourcePath);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `OneDrive upload failed (${res.status} ${res.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }

  const item = (await res.json().catch(() => ({}))) as {
    webUrl?: string;
    id?: string;
  };
  return item.webUrl ?? `onedrive:approot/${itemPath}`;
}
