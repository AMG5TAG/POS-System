import { objectStorageClient, ObjectStorageService, parseObjectPath } from "./objectStorage";

const storage = new ObjectStorageService();
const TV_PREFIX = "tv/";

type PublicRoot = { bucketName: string; objectPrefix: string };

function publicRoots(): PublicRoot[] {
  return storage.getPublicObjectSearchPaths().map((path) => {
    const { bucketName, objectName } = parseObjectPath(path);
    return { bucketName, objectPrefix: objectName.replace(/\/+$/, "") };
  });
}

function objectName(root: PublicRoot, relativePath: string): string {
  return [root.objectPrefix, relativePath].filter(Boolean).join("/");
}

export function getWritableTvUpdateFile(app: string, filename: string) {
  const root = publicRoots()[0];
  if (!root) throw new Error("No public object storage path is configured.");
  return objectStorageClient
    .bucket(root.bucketName)
    .file(objectName(root, `${TV_PREFIX}${app}/${filename}`));
}

export async function findPublicTvUpdateFile(app: string, filename: string) {
  return storage.searchPublicObject(`${TV_PREFIX}${app}/${filename}`);
}

export async function listPublicTvUpdates(): Promise<Array<{
  app: string;
  versionCode: number;
  versionName: string;
  uploadedAt: string;
}>> {
  const apps = new Map<string, {
    app: string;
    versionCode: number;
    versionName: string;
    uploadedAt: string;
  }>();

  for (const root of publicRoots()) {
    const [files] = await objectStorageClient
      .bucket(root.bucketName)
      .getFiles({ prefix: objectName(root, TV_PREFIX) });

    for (const file of files) {
      const relative = file.name.slice(objectName(root, TV_PREFIX).length);
      const match = /^([a-z0-9]{1,32})\/update\.json$/.exec(relative);
      if (!match || apps.has(match[1])) continue;

      try {
        const [contents, metadata] = await Promise.all([file.download(), file.getMetadata()]);
        const manifest = JSON.parse(contents[0].toString("utf8")) as {
          versionCode?: unknown;
          versionName?: unknown;
        };
        if (
          !Number.isSafeInteger(manifest.versionCode) ||
          typeof manifest.versionName !== "string" ||
          !manifest.versionName.trim()
        ) {
          continue;
        }
        apps.set(match[1], {
          app: match[1],
          versionCode: manifest.versionCode as number,
          versionName: manifest.versionName,
          uploadedAt: String(metadata[0].updated ?? ""),
        });
      } catch {
        // A damaged manifest is not presented as a usable release.
      }
    }
  }

  return [...apps.values()].sort((a, b) => a.app.localeCompare(b.app));
}
