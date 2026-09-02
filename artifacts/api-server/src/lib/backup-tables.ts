/**
 * backup-tables — discovers every merchant-scoped Drizzle table at runtime and
 * computes an FK-safe ordering for delete/insert during restore.
 *
 * A table is "merchant-scoped" if it is owned by a single merchant. Almost all
 * such tables expose a `merchantId` column; a few own their rows through a
 * differently-named single foreign key to `merchants` (e.g. partner_referrals
 * uses `referrerMerchantId`). Both are detected here, and the owning column key
 * is recorded as `merchantColKey` so callers filter/scope on the right column.
 *
 * The two backup bookkeeping tables are explicitly excluded so a restore never
 * wipes the backup history it is restoring from (or the stored credentials).
 */
import * as schema from "@workspace/db";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";

export interface ScopedTable {
  name: string;
  table: PgTable;
  hasId: boolean;
  /** Drizzle column property key that owns each row's merchant (e.g. "merchantId"). */
  merchantColKey: string;
  /**
   * Column property keys holding numeric foreign keys into ANOTHER scoped table
   * (or this table itself). These are the columns an id-offset transfer must
   * shift in lockstep with `id` to preserve referential integrity. FKs into
   * unscoped parents (merchants/plans/modules) are excluded — their ids are
   * stable across the transfer and must not be shifted.
   */
  fkColKeys: string[];
  /** Column property keys whose Drizzle dataType is "date" (need ISO-string → Date revival on insert). */
  dateColKeys: string[];
  /** True if the table has a foreign key referencing itself (must be inserted in one statement so intra-table RI resolves at statement end). */
  selfReferential: boolean;
}

const EXCLUDED_TABLE_NAMES = new Set([
  "merchant_backups",
  "merchant_backup_configs",
]);

/**
 * Return the Drizzle column property key that ties this table's rows to a single
 * merchant, or null if the table is not merchant-scoped. Prefers a literal
 * `merchantId` column; otherwise accepts a table whose ONLY foreign key into
 * `merchants` is a single column (the ownership column).
 */
function merchantColumnKey(table: PgTable): string | null {
  const columns = getTableColumns(table) as Record<string, { name?: string }>;
  if ("merchantId" in columns) return "merchantId";

  for (const fk of getTableConfig(table).foreignKeys) {
    try {
      const ref = fk.reference();
      if (getTableName(ref.foreignTable) !== "merchants") continue;
      if (ref.columns.length !== 1) continue; // composite FK — not a simple owner
      const localName = (ref.columns[0] as { name?: string }).name;
      const key = Object.keys(columns).find((k) => columns[k]?.name === localName);
      if (key) return key;
    } catch {
      /* ignore malformed FK metadata */
    }
  }
  return null;
}

function discoverScopedTables(): ScopedTable[] {
  // First pass: find every merchant-scoped table and its columns. We need the
  // full set of scoped table names before we can tell which FK columns point at
  // another scoped table (and therefore must be offset during a transfer).
  type Base = {
    name: string;
    table: PgTable;
    columns: Record<string, { name?: string; dataType?: string }>;
    merchantColKey: string;
  };
  const base: Base[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const table = value as PgTable;
    const name = getTableName(table);
    if (EXCLUDED_TABLE_NAMES.has(name)) continue;
    const merchantColKey = merchantColumnKey(table);
    if (!merchantColKey) continue;
    const columns = getTableColumns(table) as Base["columns"];
    base.push({ name, table, columns, merchantColKey });
  }

  // Second pass: compute the FK columns into other scoped tables, date columns,
  // and self-reference flag for each table.
  const scopedNames = new Set(base.map((b) => b.name));
  const out: ScopedTable[] = [];
  for (const b of base) {
    const fkColKeys: string[] = [];
    let selfReferential = false;
    for (const fk of getTableConfig(b.table).foreignKeys) {
      try {
        const ref = fk.reference();
        if (ref.columns.length !== 1) continue; // composite FK — leave untouched
        const parent = getTableName(ref.foreignTable);
        if (parent === b.name) selfReferential = true;
        // Only shift FKs into scoped tables (which are themselves being offset).
        // FKs into unscoped parents (merchants/plans/modules) keep stable ids.
        if (!scopedNames.has(parent)) continue;
        const localName = (ref.columns[0] as { name?: string }).name;
        const key = Object.keys(b.columns).find((k) => b.columns[k]?.name === localName);
        if (key && key !== b.merchantColKey && !fkColKeys.includes(key)) {
          fkColKeys.push(key);
        }
      } catch {
        /* ignore malformed FK metadata */
      }
    }
    const dateColKeys = Object.keys(b.columns).filter(
      (k) => b.columns[k]?.dataType === "date",
    );
    out.push({
      name: b.name,
      table: b.table,
      hasId: "id" in b.columns,
      merchantColKey: b.merchantColKey,
      fkColKeys,
      dateColKeys,
      selfReferential,
    });
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
