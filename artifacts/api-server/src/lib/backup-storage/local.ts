/** Local-filesystem backup destination. */
import path from "path";
import { mkdir, copyFile } from "fs/promises";
import type { ResolvedDestination } from "./types";

export async function uploadLocal(
  dest: ResolvedDestination,
  sourcePath: string,
  fileName: string,
): Promise<string> {
  const dir = dest.directory && dest.directory.trim().length > 0
    ? dest.directory
    : path.join(process.cwd(), "backups", "destinations", dest.id);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, fileName);
  await copyFile(sourcePath, target);
  return target;
}
