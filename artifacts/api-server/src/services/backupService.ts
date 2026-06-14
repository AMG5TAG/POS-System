/**
 * backupService — orchestrates running a backup for a merchant end-to-end:
 * snapshot → encrypted archive (canonical local copy) → fan-out to configured
 * destinations → record the result in `merchant_backups`.
 *
 * The canonical local copy under ./backups/<merchantId>/ is always written
 * (regardless of configured destinations) because restore reads from it.
 */
import path from "path";
import { mkdir, stat, rm } from "fs/promises";
import { db, merchantBackupsTable, merchantBackupConfigsTable } from "@workspace/db";
import type { MerchantBackupConfig } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { collectMerchantData } from "../lib/backup-collector";
import { createArchive } from "../lib/backup-archive";
import { decryptToken } from "./tokenVault";
import { uploadToDestinations } from "../lib/backup-storage";
import type { StoredDestination } from "../lib/backup-storage/types";

const CANONICAL_ROOT = path.join(process.cwd(), "backups");

function canonicalDir(merchantId: number): string {
  return path.join(CANONICAL_ROOT, String(merchantId));
}

/**
 * Thrown when a backup is requested for a merchant that already has one in
 * flight. The in-memory `activeBackups` set guards against overlapping runs
 * (manual + scheduled, or a long backup spanning two scheduler ticks). Because
 * the server is single-threaded, the synchronous has/add pair below is atomic.
 */
export class BackupInProgressError extends Error {
  constructor() {
    super("A backup is already running for this merchant");
    this.name = "BackupInProgressError";
  }
}

const activeBackups = new Set<number>();

export function isBackupRunning(merchantId: number): boolean {
  return activeBackups.has(merchantId);
}

/**
 * The actual backup work: snapshot → encrypted archive → fan-out to
 * destinations → update the `pending` row to `completed`/`failed`. Assumes the
 * caller holds the per-merchant lock; never throws (failures are recorded on
 * the row).
 */
async function performBackup(
  merchantId: number,
  backupId: number,
  password: string,
  config: typeof merchantBackupConfigsTable.$inferSelect,
): Promise<void> {
  const fileName = `backup-${merchantId}-${backupId}-${Date.now()}.koapos.enc`;
  const dir = canonicalDir(merchantId);
  const canonicalPath = path.join(dir, fileName);

  try {
    await mkdir(dir, { recursive: true });
    const snapshot = await collectMerchantData(merchantId);
    await createArchive(snapshot, canonicalPath, password);

    const { size } = await stat(canonicalPath);

    const destinations = (config.destinations ?? []) as StoredDestination[];
    const { locations, errors } = await uploadToDestinations(
      destinations,
      canonicalPath,
      fileName,
      merchantId,
    );
    if (errors.length > 0) {
      logger.warn({ merchantId, errors }, "Some backup destinations failed");
    }

    const storageTypes = [...new Set(locations.map((l) => l.type))];
    await db
      .update(merchantBackupsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        filePath: canonicalPath,
        fileSizeBytes: size,
        locations,
        storageType: storageTypes.length > 0 ? storageTypes.join(",") : "local",
      })
      .where(eq(merchantBackupsTable.id, backupId));

    await db
      .update(merchantBackupConfigsTable)
      .set({ lastBackupAt: new Date() })
      .where(eq(merchantBackupConfigsTable.merchantId, merchantId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ merchantId, backupId, err }, "Backup failed");
    await rm(canonicalPath, { force: true }).catch(() => {});
    await db
      .update(merchantBackupsTable)
      .set({ status: "failed", completedAt: new Date(), errorMessage: message })
      .where(eq(merchantBackupsTable.id, backupId));
  }
}

/**
 * Start a backup for a merchant. Validates config, acquires the per-merchant
 * lock, inserts a `pending` row, and kicks off the work in a detached promise.
 * Returns the `pending` row immediately so callers can respond without waiting.
 * Throws BackupInProgressError if one is already running, or an Error if no
 * encryption password is configured.
 */
export async function startBackup(
  merchantId: number,
  trigger: "manual" | "scheduled",
): Promise<typeof merchantBackupsTable.$inferSelect> {
  if (activeBackups.has(merchantId)) {
    throw new BackupInProgressError();
  }
  // Reserve the lock synchronously (before any await) so concurrent callers
  // cannot both pass the check above.
  activeBackups.add(merchantId);

  try {
    const [config] = await db
      .select()
      .from(merchantBackupConfigsTable)
      .where(eq(merchantBackupConfigsTable.merchantId, merchantId));

    if (!config?.encryptionPasswordEnc) {
      throw new Error("No encryption password configured for this merchant");
    }
    const password = decryptToken(config.encryptionPasswordEnc);

    const [pending] = await db
      .insert(merchantBackupsTable)
      .values({ merchantId, status: "pending", trigger })
      .returning();

    // Run the work in the background; release the lock when it settles.
    void performBackup(merchantId, pending.id, password, config)
      .catch((err) =>
        logger.error({ merchantId, err }, "Background backup crashed"),
      )
      .finally(() => activeBackups.delete(merchantId));

    return pending;
  } catch (err) {
    // Failed before the background task took ownership of the lock.
    activeBackups.delete(merchantId);
    throw err;
  }
}

export function getCanonicalDir(merchantId: number): string {
  return canonicalDir(merchantId);
}

export type { MerchantBackupConfig };
