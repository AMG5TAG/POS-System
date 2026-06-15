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
import { uploadServer } from "../lib/backup-storage/server";
import type { StoredDestination } from "../lib/backup-storage/types";
import type { BackupLocation } from "@workspace/db";

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

    // ALWAYS persist a durable copy to the platform's object storage (the
    // "server"), independent of the merchant's configured destinations. The
    // canonical copy under ./backups is on the deployment's ephemeral
    // filesystem, so this server copy is the durable source of truth used by
    // restore. A failure here fails the whole backup — by design, a backup that
    // isn't durably stored on the server is not a successful backup.
    const serverRef = await uploadServer(canonicalPath, fileName, merchantId);

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

    // Record the server copy first, then the user destinations.
    const allLocations: BackupLocation[] = [
      { type: "server", ref: serverRef },
      ...locations,
    ];
    const storageTypes = [...new Set(allLocations.map((l) => l.type))];
    await db
      .update(merchantBackupsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        filePath: canonicalPath,
        fileSizeBytes: size,
        locations: allLocations,
        storageType: storageTypes.join(","),
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

/**
 * Synchronously create one durable backup of a merchant and wait for it to
 * finish, returning where it landed. Unlike `startBackup` this skips the
 * config/encryption-password lookup and the in-memory lock, so callers can take
 * a guaranteed rollback point on demand (e.g. the transfer CLI backs up the
 * target merchant before overwriting it). The caller supplies the encryption
 * password directly.
 *
 * Flow mirrors the durable core of `performBackup`: snapshot → encrypted
 * archive (canonical local copy) → upload to the platform object store → record
 * a `merchant_backups` row. Throws (and marks the row failed) if any step fails,
 * so a transfer can abort rather than proceed without a rollback point.
 *
 * NOTE: records a `merchant_backups` row, whose `merchantId` FKs to `merchants`
 * — so the merchant must already exist. Callers restoring into a brand-new
 * merchant (insert mode) have nothing to back up and should skip this.
 */
export async function backupMerchantNow(
  merchantId: number,
  trigger: string,
  password: string,
): Promise<{ serverRef: string; canonicalPath: string; backupId: number }> {
  const [pending] = await db
    .insert(merchantBackupsTable)
    .values({ merchantId, status: "pending", trigger })
    .returning();

  const fileName = `backup-${merchantId}-${pending.id}-${Date.now()}.koapos.enc`;
  const dir = canonicalDir(merchantId);
  const canonicalPath = path.join(dir, fileName);

  try {
    await mkdir(dir, { recursive: true });
    const snapshot = await collectMerchantData(merchantId);
    await createArchive(snapshot, canonicalPath, password);
    const { size } = await stat(canonicalPath);
    const serverRef = await uploadServer(canonicalPath, fileName, merchantId);

    await db
      .update(merchantBackupsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        filePath: canonicalPath,
        fileSizeBytes: size,
        locations: [{ type: "server", ref: serverRef }],
        storageType: "server",
      })
      .where(eq(merchantBackupsTable.id, pending.id));

    return { serverRef, canonicalPath, backupId: pending.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ merchantId, backupId: pending.id, err }, "On-demand backup failed");
    await rm(canonicalPath, { force: true }).catch(() => {});
    await db
      .update(merchantBackupsTable)
      .set({ status: "failed", completedAt: new Date(), errorMessage: message })
      .where(eq(merchantBackupsTable.id, pending.id));
    throw err;
  }
}

export type { MerchantBackupConfig };
