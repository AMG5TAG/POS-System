/**
 * backup-tables — discovers every merchant-scoped Drizzle table at runtime and
 * computes an FK-safe ordering for delete/insert during restore.
 *
 * A table is "merchant-scoped" if it has a `merchantId` column. The two backup
 * bookkeeping tables are explicitly excluded so a restore never wipes the backup
 * history it is restoring from (or the stored credentials/password config).
 */
import * as schema from "@workspace/db";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";

export interface ScopedTable {
  name: string;
  table: PgTable;
  hasId: boolean;
}

const EXCLUDED_TABLE_NAMES = new Set([
  "merchant_backups",
  "merchant_backup_configs",
]);

function discoverScopedTables(): ScopedTable[] {
  const out: ScopedTable[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const table = value as PgTable;
    const name = getTableName(table);
    if (EXCLUDED_TABLE_NAMES.has(name)) continue;
    const columns = getTableColumns(table);
    if (!("merchantId" in columns)) continue;
    out.push({ name, table, hasId: "id" in columns });
  }
  return out;
}

/**
 * Topologically order tables so that a table appears AFTER every other
 * in-scope table it references (i.e. parents first). This is the safe order to
 * INSERT rows. Reverse it to DELETE rows. Self-references and reference cycles
 * are ignored (best effort); remaining tables are appended in discovery order.
 */
function orderByDependencies(tables: ScopedTable[]): ScopedTable[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  // deps[name] = set of in-scope parent table names this table references.
  const deps = new Map<string, Set<string>>();
  for (const t of tables) deps.set(t.name, new Set());

  for (const t of tables) {
    const cfg = getTableConfig(t.table);
    for (const fk of cfg.foreignKeys) {
      let parentName: string | null = null;
      try {
        const ref = fk.reference();
        parentName = getTableName(ref.foreignTable);
      } catch {
        parentName = null;
      }
      if (!parentName) continue;
      if (parentName === t.name) continue; // self-reference
      if (!byName.has(parentName)) continue; // out of scope (e.g. merchants)
      deps.get(t.name)!.add(parentName);
    }
  }

  const ordered: ScopedTable[] = [];
  const placed = new Set<string>();

  // Kahn-style: repeatedly place tables whose deps are all already placed.
  let progress = true;
  while (placed.size < tables.length && progress) {
    progress = false;
    for (const t of tables) {
      if (placed.has(t.name)) continue;
      const unmet = [...deps.get(t.name)!].some((d) => !placed.has(d));
      if (unmet) continue;
      ordered.push(t);
      placed.add(t.name);
      progress = true;
    }
  }
  // Append any leftovers (cycles) in discovery order.
  for (const t of tables) {
    if (!placed.has(t.name)) ordered.push(t);
  }
  return ordered;
}

let cached: ScopedTable[] | null = null;

/** Tables in parent-first order (safe for INSERT). Cached after first call. */
export function getInsertOrderedTables(): ScopedTable[] {
  if (!cached) cached = orderByDependencies(discoverScopedTables());
  return cached;
}

/** Tables in child-first order (safe for DELETE). */
export function getDeleteOrderedTables(): ScopedTable[] {
  return [...getInsertOrderedTables()].reverse();
}
