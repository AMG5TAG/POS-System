/**
 * backup-collector — builds a consistent JSON snapshot of one merchant's data
 * across every merchant-scoped table, inside a single read transaction.
 */
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getInsertOrderedTables } from "./backup-tables";

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupSnapshot {
  schemaVersion: number;
  exportedAt: string;
  merchantId: number;
  tables: Record<string, unknown[]>;
}

export async function collectMerchantData(merchantId: number): Promise<BackupSnapshot> {
  const tables = getInsertOrderedTables();

  const result = await db.transaction(async (tx) => {
    const out: Record<string, unknown[]> = {};
    for (const { name, table } of tables) {
      // `merchantId` exists on every table in this set (that is the filter).
      const col = (table as unknown as Record<string, unknown>)[
        "merchantId"
      ] as Parameters<typeof eq>[0];
      const rows = await tx.select().from(table).where(eq(col, merchantId));
      out[name] = rows;
    }
    return out;
  });

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    merchantId,
    tables: result,
  };
}
