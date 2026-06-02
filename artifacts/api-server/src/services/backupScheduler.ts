/**
 * backupScheduler — runs due automated backups on an hourly tick. For each
 * merchant whose config frequency is daily/weekly/monthly, a backup is run when
 * enough time has elapsed since `lastBackupAt` (or it has never run). Merchants
 * with no encryption password are skipped (they cannot be encrypted).
 */
import type { Logger } from "pino";
import { db, merchantBackupConfigsTable } from "@workspace/db";
import { ne } from "drizzle-orm";
import {
  startBackup,
  isBackupRunning,
  BackupInProgressError,
} from "./backupService";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const INTERVAL_MS: Record<string, number> = {
  daily: DAY,
  weekly: 7 * DAY,
  monthly: 30 * DAY,
};

function isDue(frequency: string, lastBackupAt: Date | null): boolean {
  const interval = INTERVAL_MS[frequency];
  if (!interval) return false;
  if (!lastBackupAt) return true;
  return Date.now() - lastBackupAt.getTime() >= interval;
}

async function runDueBackups(logger: Logger): Promise<void> {
  const configs = await db
    .select()
    .from(merchantBackupConfigsTable)
    .where(ne(merchantBackupConfigsTable.frequency, "disabled"));

  for (const config of configs) {
    if (!config.encryptionPasswordEnc) continue;
    if (!isDue(config.frequency, config.lastBackupAt)) continue;
    // Skip if a backup for this merchant is still in flight (e.g. a long run
    // spanning two ticks, or a manual backup the merchant just triggered).
    if (isBackupRunning(config.merchantId)) {
      logger.info(
        { merchantId: config.merchantId },
        "Skipping scheduled backup — one is already running",
      );
      continue;
    }
    try {
      logger.info(
        { merchantId: config.merchantId, frequency: config.frequency },
        "Running scheduled backup",
      );
      // startBackup returns once the pending row is created; the work then runs
      // in the background guarded by the per-merchant lock.
      await startBackup(config.merchantId, "scheduled");
    } catch (err) {
      if (err instanceof BackupInProgressError) continue;
      logger.error(
        { merchantId: config.merchantId, err },
        "Scheduled backup failed",
      );
    }
  }
}

export function scheduleBackups(logger: Logger): void {
  runDueBackups(logger).catch((err) =>
    logger.error({ err }, "Backup scheduler startup run error"),
  );
  setInterval(
    () =>
      runDueBackups(logger).catch((err) =>
        logger.error({ err }, "Backup scheduler run error"),
      ),
    HOUR,
  );
  logger.info("Backup scheduler started (hourly due-check)");
}
