/**
 * restoreService — restores a merchant's data from a snapshot. The whole
 * operation runs in a single write transaction: every merchant-scoped table is
 * wiped (child-first) and then repopulated from the snapshot (parent-first). If
 * anything fails the transaction rolls back, leaving live data untouched.
 *
 * The engine (`restoreSnapshot`) backs three callers:
 *   - the live `POST /backups/:id/restore` route, via the `restoreFromArchive`
 *     wrapper (same-merchant, no id offset);
 *   - the `transfer-merchant` CLI, which may move data across environments where
 *     numeric ids collide with live rows (id-offset mode) and which owns its own
 *     transaction so it can wrap the merchants-row change + restore together.
 */
import { db } from "@workspace/db";
import { eq, sql, count, getTableName } from "drizzle-orm";
import { extractArchive } from "../lib/backup-archive";
import {
  getDeleteOrderedTables,
  getInsertOrderedTables,
  type ScopedTable,
} from "../lib/backup-tables";
import type { BackupSnapshot } from "../lib/backup-collector";

export class InvalidBackupPasswordError extends Error {
  constructor() {
    super("Invalid password");
    this.name = "InvalidBackupPasswordError";
  }
}

/** Internal sentinel thrown to roll back a transaction the engine owns in dry-run mode. */
class DryRunRollback extends Error {
  constructor() {
    super("DRY_RUN_ROLLBACK");
    this.name = "DryRunRollback";
  }
}

/** The transaction handle passed to a `db.transaction` callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface RestoreReport {
  /** Whether this was a dry run (rolled back without committing). */
  dryRun: boolean;
  /** Whether the changes were committed (false for dry-run or when the caller owns the tx). */
  committed: boolean;
  deletedByTable: Record<string, number>;
  insertedByTable: Record<string, number>;
  /** Verification mismatches (post-insert counts vs snapshot lengths). Empty on success. */
  mismatches: string[];
  totalDeleted: number;
  totalInserted: number;
  /** Snapshot tables that are no longer in the current scoped set (skipped, not restored). */
  skippedTables: string[];
}

export interface RestoreSnapshotOptions {
  targetMerchantId: number;
  snapshot: BackupSnapshot;
  /** Shift numeric `id`/scoped-FK columns by this amount (cross-env collision avoidance). 0 = no shift. */
  idOffset?: number;
  /** Roll back instead of committing. Default true. Ignored when `tx` is supplied (caller controls commit). */
  dryRun?: boolean;
  /** Verify post-insert row counts match the snapshot inside the tx. Default true. */
  verifyCounts?: boolean;
  /** Allow restoring a snapshot whose merchantId differs from the target (cross-merchant transfer). Default false. */
  allowMerchantRemap?: boolean;
  /** Run inside a caller-owned transaction (e.g. to also mutate the merchants row atomically). When set, `dryRun` is ignored and the caller decides commit/rollback. */
  tx?: Tx;
}

function colOf(table: ScopedTable["table"], key: string): Parameters<typeof eq>[0] {
  return (table as unknown as Record<string, unknown>)[key] as Parameters<typeof eq>[0];
}

/**
 * Map one snapshot row onto the target merchant. With `idOffset === 0` this is
 * the historical behavior (force the merchant column, revive date strings). With
 * a non-zero offset it additionally shifts the numeric `id` and every numeric
 * scoped-FK column so the snapshot's internal references stay consistent without
 * colliding with live rows. UUID/string keys are globally unique and left as-is.
 */
export function transformSnapshotRow(
  t: ScopedTable,
  row: Record<string, unknown>,
  targetMerchantId: number,
  idOffset = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  if (idOffset !== 0) {
    if (t.hasId && typeof out.id === "number") out.id = out.id + idOffset;
    for (const k of t.fkColKeys) {
      if (typeof out[k] === "number") out[k] = (out[k] as number) + idOffset;
    }
  }
  // Force the owning merchant column to the target to prevent cross-tenant
  // writes (the column name varies, e.g. referrerMerchantId).
  out[t.merchantColKey] = targetMerchantId;
  for (const k of t.dateColKeys) {
    const v = out[k];
    if (typeof v === "string" || typeof v === "number") out[k] = new Date(v);
  }
  return out;
}

/**
 * Wipe + repopulate a merchant's scoped data from `snapshot`, in one transaction.
 * Returns a RestoreReport. Throws on verification failure (transaction rolls back).
 */
export async function restoreSnapshot(opts: RestoreSnapshotOptions): Promise<RestoreReport> {
  const {
    targetMerchantId,
    snapshot,
    idOffset = 0,
    dryRun = true,
    verifyCounts = true,
    allowMerchantRemap = false,
  } = opts;

  if (!allowMerchantRemap && snapshot.merchantId !== targetMerchantId) {
    throw new Error(
      `Snapshot belongs to merchant ${snapshot.merchantId}, not target ${targetMerchantId}. ` +
        "Pass allowMerchantRemap to transfer across merchants.",
    );
  }

  const deleteOrder = getDeleteOrderedTables();
  const insertOrder = getInsertOrderedTables();
  const scopedNames = new Set(insertOrder.map((t) => t.name));

  const report: RestoreReport = {
    dryRun,
    committed: false,
    deletedByTable: {},
    insertedByTable: {},
    mismatches: [],
    totalDeleted: 0,
    totalInserted: 0,
    skippedTables: [],
  };

  const run = async (tx: Tx): Promise<void> => {
    // 1. Wipe current merchant data, children first. Only wipe tables the
    // snapshot actually captured: a backup taken before a table joined the
    // scoped set has no key for it, and wiping it would destroy data the backup
    // can't restore.
    for (const { name, table, merchantColKey } of deleteOrder) {
      if (snapshot.tables[name] === undefined) continue;
      const res = await tx
        .delete(table)
        .where(eq(colOf(table, merchantColKey), targetMerchantId));
      const n = (res as { rowCount?: number | null }).rowCount ?? 0;
      if (n) {
        report.deletedByTable[name] = n;
        report.totalDeleted += n;
      }
    }

    // 2. Repopulate, parents first.
    for (const t of insertOrder) {
      const rows = snapshot.tables[t.name];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const values = rows.map((r) =>
        transformSnapshotRow(t, r as Record<string, unknown>, targetMerchantId, idOffset),
      );
      // Self-referencing tables must go in one statement so intra-table FKs
      // resolve at statement end (Neon can't disable FK enforcement). Others are
      // chunked to stay under the bound-parameter limit.
      const chunk = t.selfReferential ? values.length : 500;
      for (let i = 0; i < values.length; i += chunk) {
        await tx.insert(t.table).values(values.slice(i, i + chunk));
      }
      report.insertedByTable[t.name] = rows.length;
      report.totalInserted += rows.length;
    }

    // Note snapshot tables that are no longer in scope (skipped, not restored).
    for (const name of Object.keys(snapshot.tables)) {
      const rows = snapshot.tables[name];
      if (!scopedNames.has(name) && Array.isArray(rows) && rows.length > 0) {
        report.skippedTables.push(name);
      }
    }

    // 3. Verify post-insert counts match the snapshot, inside the tx.
    if (verifyCounts) {
      for (const [name, expected] of Object.entries(report.insertedByTable)) {
        const t = insertOrder.find((x) => x.name === name)!;
        const [{ n }] = await tx
          .select({ n: count() })
          .from(t.table)
          .where(eq(colOf(t.table, t.merchantColKey), targetMerchantId));
        if (Number(n) !== expected) {
          report.mismatches.push(`${name}: expected ${expected}, got ${n}`);
        }
      }
      if (report.mismatches.length > 0) {
        throw new Error("Restore verification failed:\n" + report.mismatches.join("\n"));
      }
    }

    // 4. Fix sequences for integer-id tables so future inserts get fresh ids.
    // Null-safe (the WHERE filters out tables with no serial sequence) so a
    // missing sequence can't poison the transaction. Runs inside the tx so a
    // dry-run rollback also reverts the sequence change.
    for (const { table, hasId } of insertOrder) {
      if (!hasId) continue;
      const pgName = getTableName(table);
      if (!pgName) continue;
      await tx.execute(
        sql.raw(
          `SELECT setval(s.seq, COALESCE((SELECT MAX(id) FROM "${pgName}"), 1), true) ` +
            `FROM (SELECT pg_get_serial_sequence('"${pgName}"', 'id') AS seq) s ` +
            `WHERE s.seq IS NOT NULL`,
        ),
      );
    }
  };

  // When the caller supplies a transaction, they own commit/rollback (used by
  // the CLI to wrap the merchants-row change together with the restore).
  if (opts.tx) {
    await run(opts.tx);
    return report;
  }

  // Otherwise own the transaction; in dry-run mode throw to roll back.
  try {
    await db.transaction(async (tx) => {
      await run(tx);
      if (dryRun) throw new DryRunRollback();
      report.committed = true;
    });
  } catch (err) {
    if (err instanceof DryRunRollback) return report;
    throw err;
  }
  return report;
}

/**
 * Restore `encryptedPath` into `merchantId` using `password`. Same-merchant,
 * no id offset — the path used by the live restore endpoint. Throws
 * InvalidBackupPasswordError if the password is wrong / file is corrupt.
 */
export async function restoreFromArchive(
  merchantId: number,
  encryptedPath: string,
  password: string,
): Promise<void> {
  let snapshot: BackupSnapshot;
  try {
    snapshot = await extractArchive<BackupSnapshot>(encryptedPath, password);
  } catch {
    // GCM auth-tag failure or corrupt archive — treat as a bad password.
    throw new InvalidBackupPasswordError();
  }

  if (snapshot.merchantId !== merchantId) {
    throw new Error("Backup does not belong to this merchant");
  }

  // Preserve the endpoint's historical behavior: commit, no count verification.
  await restoreSnapshot({
    targetMerchantId: merchantId,
    snapshot,
    dryRun: false,
    verifyCounts: false,
  });
}
