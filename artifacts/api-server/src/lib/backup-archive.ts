/**
 * backup-archive — serialise a snapshot to JSON, pack it into a .tar.gz, then
 * encrypt the archive with a password (AES-256-GCM). The inverse (extract) is
 * used by restore. All intermediate files live in the OS temp dir and are
 * cleaned up on success and failure.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { encryptStream, decryptBuffer } from "./backup-crypto";

const execFileAsync = promisify(execFile);

const JSON_ENTRY_NAME = "backup.json";

/**
 * Build an encrypted backup archive at `destPath`.
 * Pipeline: JSON → temp file → tar.gz → AES-256-GCM encrypted file.
 */
export async function createArchive(
  dataJson: unknown,
  destPath: string,
  password: string,
): Promise<void> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "koapos-backup-"));
  const jsonPath = path.join(workDir, JSON_ENTRY_NAME);
  const tarPath = path.join(os.tmpdir(), `koapos-backup-${randomUUID()}.tar.gz`);
  try {
    await writeFile(jsonPath, JSON.stringify(dataJson), "utf8");
    // -C workDir so the archive contains just `backup.json`, no path prefix.
    await execFileAsync("tar", ["-czf", tarPath, "-C", workDir, JSON_ENTRY_NAME]);
    await encryptStream(tarPath, destPath, password);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    await rm(tarPath, { force: true }).catch(() => {});
  }
}

/**
 * Decrypt + extract an encrypted archive and return the parsed snapshot JSON.
 * Throws if the password is wrong (GCM auth-tag failure) or the file is corrupt.
 */
export async function extractArchive<T = unknown>(
  encryptedPath: string,
  password: string,
): Promise<T> {
  // Throws on wrong password / tamper.
  const tarBuf = await decryptBuffer(encryptedPath, password);

  const workDir = await mkdtemp(path.join(os.tmpdir(), "koapos-restore-"));
  const tarPath = path.join(workDir, "archive.tar.gz");
  try {
    await writeFile(tarPath, tarBuf);
    await execFileAsync("tar", ["-xzf", tarPath, "-C", workDir]);
    const jsonRaw = await readFile(path.join(workDir, JSON_ENTRY_NAME), "utf8");
    return JSON.parse(jsonRaw) as T;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
