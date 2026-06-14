/**
 * restoreService — restores a merchant's data from a previously created
 * encrypted backup archive. The whole operation runs in a single write
 * transaction: every merchant-scoped table is wiped (child-first) and then
 * repopulated from the snapshot (parent-first). If anything fails the
 * transaction rolls back, leaving the live data untouched.
 */
import { db } from "@workspace/db";
import { eq, sql, getTableName, getTableColumns } from "drizzle-orm";
import { extractArchive } from "../lib/backup-archive";
import { getDeleteOrderedTables, getInsertOrderedTables } from "../lib/backup-tables";
import type { BackupSnapshot } from "../lib/backup-collector";

export class InvalidBackupPasswordError extends Error {
  constructor() {
    super("Invalid password");
    this.name = "InvalidBackupPasswordError";
  }
}

/**
 * Restore `encryptedPath` into `merchantId` using `password`. Throws
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

  const deleteOrder = getDeleteOrderedTables();
  const insertOrder = getInsertOrderedTables();

  await db.transaction(async (tx) => {
    // Wipe current merchant data, children first. Only wipe tables the snapshot
    // actually captured: a backup taken before a table joined the scoped set
    // (e.g. partner_referrals, added in schema v2) has no key for it, and wiping
    // it would silently destroy data the backup can't restore.
    for (const { name, table, merchantColKey } of deleteOrder) {
      if (snapshot.tables[name] === undefined) continue;
      const col = (table as unknown as Record<string, unknown>)[
        merchantColKey
      ] as Parameters<typeof eq>[0];
      await tx.delete(table).where(eq(col, merchantId));
    }

    // Repopulate, parents first.
    for (const { name, table, merchantColKey } of insertOrder) {
      const rows = snapshot.tables[name];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      // Identify date-typed columns so JSON ISO strings can be revived into
      // Date objects (Drizzle timestamp columns call .toISOString() on insert).
      const cols = getTableColumns(table) as Record<string, { dataType?: string }>;
      const dateKeys = Object.keys(cols).filter(
        (k) => cols[k]?.dataType === "date",
      );
      // Force the owning merchant column to the target merchant to prevent
      // cross-tenant writes (the column name varies, e.g. referrerMerchantId).
      const scoped = rows.map((r) => {
        const row: Record<string, unknown> = {
          ...(r as Record<string, unknown>),
          [merchantColKey]: merchantId,
        };
        for (const k of dateKeys) {
          const v = row[k];
          if (typeof v === "string" || typeof v === "number") {
            row[k] = new Date(v);
          }
        }
        return row;
      });
      // Insert in chunks to stay under parameter limits.
      const CHUNK = 500;
      for (let i = 0; i < scoped.length; i += CHUNK) {
        await tx.insert(table).values(scoped.slice(i, i + CHUNK));
      }
    }
  });

  // Fix sequences outside the data transaction (best-effort) for tables with an
  // integer `id` primary key, so newly inserted rows get fresh ids.
  for (const { table, hasId } of insertOrder) {
    if (!hasId) continue;
    const pgName = getTableName(table);
    if (!pgName) continue;
    try {
      await db.execute(
        sql.raw(
          `SELECT setval(pg_get_serial_sequence('"${pgName}"', 'id'), ` +
            `COALESCE((SELECT MAX(id) FROM "${pgName}"), 1), true)`,
        ),
      );
    } catch {
      // Not all tables have a serial id sequence; ignore.
    }
  }
}
