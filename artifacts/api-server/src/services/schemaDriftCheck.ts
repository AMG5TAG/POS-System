import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import { getTableColumns, getTableName, is, Table, sql } from "drizzle-orm";
import type { Logger } from "pino";

/**
 * Startup guard against schema drift. The Drizzle schema is the source of truth
 * the running code queries against; if a `db:push` was forgotten after a schema
 * change, the DB ends up missing tables/columns the code selects, and every
 * affected endpoint 500s at runtime (this is what once blanked the dashboard
 * calendar). This check compares the schema to the live DB at boot and fails
 * fast with a precise "what's missing + run db:push" message instead.
 *
 * Only PRESENCE is checked (missing tables / missing columns) — the exact
 * failure mode that breaks `select()`. Extra columns/tables in the DB, and any
 * type/default differences, are ignored to avoid false positives.
 */

export interface SchemaDiff {
  missingTables: string[];
  missingColumns: string[]; // "table.column"
}

/** Pure comparison: expected (schema) vs actual (DB), both table -> column set. */
export function diffSchema(
  expected: Map<string, Set<string>>,
  actual: Map<string, Set<string>>,
): SchemaDiff {
  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  for (const [table, cols] of expected) {
    const have = actual.get(table);
    if (!have) { missingTables.push(table); continue; }
    for (const col of cols) if (!have.has(col)) missingColumns.push(`${table}.${col}`);
  }
  missingTables.sort();
  missingColumns.sort();
  return { missingTables, missingColumns };
}

/** Expected table -> DB column names, read from the Drizzle schema exports. */
export function collectExpectedSchema(): Map<string, Set<string>> {
  const expected = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    if (!is(value, Table)) continue;
    const cols = new Set(Object.values(getTableColumns(value)).map((c) => c.name));
    expected.set(getTableName(value), cols);
  }
  return expected;
}

export class SchemaDriftError extends Error {
  constructor(public diff: SchemaDiff) {
    super(
      `Database is missing ${diff.missingTables.length} table(s) and ${diff.missingColumns.length} column(s) the code expects. Run \`pnpm db:push\`.`,
    );
    this.name = "SchemaDriftError";
  }
}

/**
 * Compares the Drizzle schema against `information_schema` and throws
 * SchemaDriftError when the DB is missing anything the code needs. Infrastructure
 * failures (can't reach the DB to introspect) are logged and tolerated — they're
 * not drift, and the DB-dependent endpoints will surface their own errors.
 * Set SKIP_SCHEMA_DRIFT_CHECK=true to downgrade a real drift to a warning.
 */
export async function checkSchemaDrift(logger: Logger): Promise<void> {
  const expected = collectExpectedSchema();

  let actual: Map<string, Set<string>>;
  try {
    const rows = await db.execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    actual = new Map();
    for (const r of rows.rows) {
      let set = actual.get(r.table_name);
      if (!set) { set = new Set(); actual.set(r.table_name, set); }
      set.add(r.column_name);
    }
  } catch (err) {
    logger.error({ err }, "Schema-drift check could not introspect the database; skipping (not treated as drift)");
    return;
  }

  const diff = diffSchema(expected, actual);
  if (diff.missingTables.length === 0 && diff.missingColumns.length === 0) {
    logger.info("Schema-drift check passed — database matches the Drizzle schema");
    return;
  }

  logger.error(
    { missingTables: diff.missingTables, missingColumns: diff.missingColumns },
    "SCHEMA DRIFT — the database is missing tables/columns the code expects. Run `pnpm db:push` to apply pending migrations.",
  );

  if (process.env.SKIP_SCHEMA_DRIFT_CHECK === "true") {
    logger.warn("SKIP_SCHEMA_DRIFT_CHECK=true — starting despite schema drift (endpoints touching the missing columns will fail)");
    return;
  }

  throw new SchemaDriftError(diff);
}
