/**
 * backupScheduler — runs due automated backups on an hourly tick. For each
 * merchant whose config frequency is daily/weekly/monthly, a backup is run when
 * enough time has elapsed since `lastBackupAt` (or it has never run). Merchants
 * with no encryption password are skipped (they cannot be encrypted).
 */
import type { Logger } from "pino";
import { db, merchantBackupConfigsTable, merchantBackupSchedulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
  // Merchants that can encrypt (a password is required to run any backup).
  const configs = await db
    .select()
    .from(merchantBackupConfigsTable);
  const canEncrypt = new Map(configs.map((c) => [c.merchantId, Boolean(c.encryptionPasswordEnc)]));

  // 1) Legacy single-frequency schedule (merchant_backup_configs.frequency).
  for (const config of configs) {
    if (config.frequency === "disabled") continue;
    if (!config.encryptionPasswordEnc) continue;
    if (!isDue(config.frequency, config.lastBackupAt)) continue;
    if (isBackupRunning(config.merchantId)) {
      logger.info({ merchantId: config.merchantId }, "Skipping scheduled backup — one is already running");
      continue;
    }
    try {
      logger.info({ merchantId: config.merchantId, frequency: config.frequency }, "Running scheduled backup");
      // startBackup returns once the pending row is created; the work then runs
      // in the background guarded by the per-merchant lock.
      await startBackup(config.merchantId, "scheduled");
    } catch (err) {
      if (err instanceof BackupInProgressError) continue;
      logger.error({ merchantId: config.merchantId, err }, "Scheduled backup failed");
    }
  }

  // 2) Named multi-schedules (merchant_backup_schedules). The per-merchant lock
  // serialises these with each other and with the legacy run above: at most one
  // starts per merchant per tick; the rest are picked up on later ticks.
  const schedules = await db
    .select()
    .from(merchantBackupSchedulesTable)
    .where(eq(merchantBackupSchedulesTable.enabled, true));

  for (const schedule of schedules) {
    if (!canEncrypt.get(schedule.merchantId)) continue;
    if (!isDue(schedule.frequency, schedule.lastBackupAt)) continue;
    if (isBackupRunning(schedule.merchantId)) continue;
    try {
      logger.info({ merchantId: schedule.merchantId, scheduleId: schedule.id, frequency: schedule.frequency }, "Running scheduled backup (named schedule)");
      await startBackup(schedule.merchantId, "scheduled", {
        destinationIds: schedule.destinationIds ?? [],
        scheduleId: schedule.id,
      });
    } catch (err) {
      if (err instanceof BackupInProgressError) continue;
      logger.error({ merchantId: schedule.merchantId, scheduleId: schedule.id, err }, "Named scheduled backup failed");
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
