/** Google Cloud Storage backup destination. */
import { Storage } from "@google-cloud/storage";
import type { ResolvedDestination } from "./types";

export async function uploadGcs(
  dest: ResolvedDestination,
  sourcePath: string,
  fileName: string,
): Promise<string> {
  if (!dest.gcsBucket) throw new Error("GCS destination is missing a bucket name");
  if (!dest.serviceAccountJson) {
    throw new Error("GCS destination is missing service account credentials");
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(dest.serviceAccountJson) as Record<string, unknown>;
  } catch {
    throw new Error("GCS service account JSON is not valid JSON");
  }

  const storage = new Storage({
    projectId: dest.projectId || (credentials.project_id as string | undefined),
    credentials,
  });

  const key = `koapos-backups/${fileName}`;
  await storage.bucket(dest.gcsBucket).upload(sourcePath, {
    destination: key,
    contentType: "application/octet-stream",
  });
  return `gcs://${dest.gcsBucket}/${key}`;
}
