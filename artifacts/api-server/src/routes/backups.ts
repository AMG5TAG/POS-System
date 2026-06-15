import { Router, type IRouter } from "express";
import { db, merchantBackupsTable, merchantBackupConfigsTable } from "@workspace/db";
import type { MerchantBackup, BackupStorageDestination } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import {
  ListBackupsQueryParams,
  UpdateBackupConfigBody,
  RestoreBackupParams,
  RestoreBackupBody,
} from "@workspace/api-zod";
import { startBackup, BackupInProgressError } from "../services/backupService";
import {
  restoreFromArchive,
  InvalidBackupPasswordError,
} from "../services/restoreService";
import { hashPassword, verifyPassword } from "../lib/backup-crypto";
import { encryptToken } from "../services/tokenVault";
import {
  mergeDestination,
  publicDestination,
  type StoredDestination,
} from "../lib/backup-storage/types";
import { downloadServerCopy } from "../lib/backup-storage/server";
import { existsSync } from "fs";
import type { BackupLocation } from "@workspace/db";

const router: IRouter = Router();

function fmtBackup(b: MerchantBackup) {
  return {
    id: b.id,
    merchantId: b.merchantId,
    startedAt: b.startedAt,
    completedAt: b.completedAt ?? null,
    status: b.status,
    trigger: b.trigger,
    storageType: b.storageType ?? null,
    filePath: b.filePath ?? null,
    fileSizeBytes: b.fileSizeBytes ?? null,
    errorMessage: b.errorMessage ?? null,
    locations: b.locations ?? [],
  };
}

function fmtConfig(row: typeof merchantBackupConfigsTable.$inferSelect | undefined) {
  const destinations = ((row?.destinations ?? []) as StoredDestination[]).map(
    publicDestination,
  );
  return {
    frequency: (row?.frequency ?? "disabled") as
      | "disabled"
      | "daily"
      | "weekly"
      | "monthly",
    passwordIsSet: Boolean(row?.encryptionPasswordHash),
    lastBackupAt: row?.lastBackupAt ?? null,
    destinations,
  };
}

async function getOrInitConfig(merchantId: number) {
  const [existing] = await db
    .select()
    .from(merchantBackupConfigsTable)
    .where(eq(merchantBackupConfigsTable.merchantId, merchantId));
  return existing;
}

// GET /backups — history (paginated)
router.get("/backups", requireAuth, requireManagerOrOwner, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { limit, offset } = ListBackupsQueryParams.parse(req.query);
  const take = Math.min(limit ?? 50, 200);
  const skip = offset ?? 0;

  const rows = await db
    .select()
    .from(merchantBackupsTable)
    .where(eq(merchantBackupsTable.merchantId, merchantId))
    .orderBy(desc(merchantBackupsTable.startedAt))
    .limit(take)
    .offset(skip);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(merchantBackupsTable)
    .where(eq(merchantBackupsTable.merchantId, merchantId));

  res.json({ items: rows.map(fmtBackup), total: count });
});

// POST /backups — trigger an immediate backup
router.post("/backups", requireAuth, requireManagerOrOwner, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const config = await getOrInitConfig(merchantId);
  if (!config?.encryptionPasswordEnc) {
    res
      .status(400)
      .json({ error: "Set an encryption password before running a backup" });
    return;
  }

  try {
    // Fire-and-forget: create the pending row, return it immediately (202), and
    // let the work complete in the background. The client polls for the result.
    const pending = await startBackup(merchantId, "manual");
    res.status(202).json(fmtBackup(pending));
  } catch (err) {
    if (err instanceof BackupInProgressError) {
      res.status(409).json({ error: "A backup is already running" });
      return;
    }
    req.log.error({ merchantId, err }, "Manual backup failed to start");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Backup failed",
    });
  }
});

// GET /backups/config
router.get(
  "/backups/config",
  requireAuth,
  requireManagerOrOwner,
  async (req, res) => {
    const merchantId = req.session.merchantId!;
    const row = await getOrInitConfig(merchantId);
    res.json(fmtConfig(row));
  },
);

// PUT /backups/config
router.put(
  "/backups/config",
  requireAuth,
  requireManagerOrOwner,
  async (req, res) => {
    const merchantId = req.session.merchantId!;
    const body = UpdateBackupConfigBody.parse(req.body);
    const existing = await getOrInitConfig(merchantId);

    const existingDests = (existing?.destinations ?? []) as StoredDestination[];

    const data: Partial<typeof merchantBackupConfigsTable.$inferInsert> = {};

    if (body.frequency !== undefined) data.frequency = body.frequency;

    if (body.password !== undefined && body.password.length > 0) {
      data.encryptionPasswordHash = await hashPassword(body.password);
      data.encryptionPasswordEnc = encryptToken(body.password);
    }

    if (body.destinations !== undefined) {
      const byId = new Map(existingDests.map((d) => [d.id, d]));
      const merged: BackupStorageDestination[] = body.destinations.map((d) =>
        mergeDestination(
          d as Record<string, unknown>,
          d.id ? byId.get(d.id) : undefined,
        ),
      );
      data.destinations = merged;
    }

    if (existing) {
      await db
        .update(merchantBackupConfigsTable)
        .set(data)
        .where(eq(merchantBackupConfigsTable.merchantId, merchantId));
    } else {
      await db
        .insert(merchantBackupConfigsTable)
        .values({ merchantId, ...data });
    }

    const row = await getOrInitConfig(merchantId);
    res.json(fmtConfig(row));
  },
);

// POST /backups/:id/restore
router.post(
  "/backups/:id/restore",
  requireAuth,
  requireManagerOrOwner,
  async (req, res) => {
    const merchantId = req.session.merchantId!;
    const { id } = RestoreBackupParams.parse(req.params);
    const { password } = RestoreBackupBody.parse(req.body);

    const [backup] = await db
      .select()
      .from(merchantBackupsTable)
      .where(
        and(
          eq(merchantBackupsTable.id, id),
          eq(merchantBackupsTable.merchantId, merchantId),
        ),
      );

    if (!backup) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }
    if (backup.status !== "completed" || !backup.filePath) {
      res.status(400).json({ error: "Backup is not restorable" });
      return;
    }

    // Verify password against the stored bcrypt hash first (fast fail).
    const config = await getOrInitConfig(merchantId);
    if (!config?.encryptionPasswordHash) {
      res.status(400).json({ error: "No encryption password configured" });
      return;
    }
    const ok = await verifyPassword(password, config.encryptionPasswordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    // Prefer the local canonical copy; if it's gone (the deployment filesystem
    // is ephemeral), fall back to the durable server copy in object storage.
    let archivePath = backup.filePath;
    let cleanup: (() => Promise<void>) | null = null;
    if (!existsSync(archivePath)) {
      const serverLoc = ((backup.locations ?? []) as BackupLocation[]).find(
        (l) => l.type === "server",
      );
      if (!serverLoc) {
        res.status(410).json({
          error: "Backup file is no longer available on this server",
        });
        return;
      }
      try {
        const dl = await downloadServerCopy(serverLoc.ref);
        archivePath = dl.path;
        cleanup = dl.cleanup;
      } catch (err) {
        req.log.error({ merchantId, backupId: id, err }, "Server backup fetch failed");
        res.status(500).json({ error: "Could not retrieve the backup from the server" });
        return;
      }
    }

    try {
      await restoreFromArchive(merchantId, archivePath, password);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof InvalidBackupPasswordError) {
        res.status(401).json({ error: "Invalid password" });
        return;
      }
      req.log.error({ merchantId, backupId: id, err }, "Restore failed");
      res.status(500).json({
        error: err instanceof Error ? err.message : "Restore failed",
      });
    } finally {
      if (cleanup) await cleanup();
    }
  },
);

export default router;
