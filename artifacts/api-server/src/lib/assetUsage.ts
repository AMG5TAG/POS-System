import { pool } from "@workspace/db";

/**
 * Reverse lookup: "which rows still point at this stored object?"
 *
 * Image references in this codebase are plain URL strings scattered across
 * ~30 text/jsonb columns (products.image_url, brands.logo_url,
 * customers.photo_url, product_return_auths.attachments, …) and are written by
 * many different routers. Rather than intercept every write path — which would
 * mean touching dozens of handlers and would still miss every row that exists
 * today — we count references by scanning those columns on demand.
 *
 * That makes deletion safe by construction: an asset is only removable when a
 * live scan finds zero references, and a column we forget about is still
 * covered because discovery is driven by information_schema rather than a
 * hand-maintained list.
 *
 * Scans run only on the media-library usage/delete paths, never on hot reads.
 */

export interface AssetUsageEntry {
  /** Table holding the reference, e.g. "products". */
  entity: string;
  /** Column holding the reference, e.g. "image_url". */
  column: string;
  /** How many rows in that column reference the asset. */
  count: number;
}

/**
 * Column-name patterns that can hold an image/file URL. Over-matching is
 * harmless (a scan of an irrelevant column simply returns 0); under-matching
 * would risk deleting an in-use object, so keep this generous.
 */
const COLUMN_NAME_PATTERNS = [
  "%image%",
  "%logo%",
  "%photo%",
  "%avatar%",
  "%icon%",
  "%banner%",
  "%picture%",
  "%thumbnail%",
  "%attachment%",
  "%file_key%",
  "%files%",
  "%signature%",
  "%_url",
  "%media%",
  "%asset%",
];

interface ScannableColumn {
  table: string;
  column: string;
}

let columnCache: { at: number; columns: ScannableColumn[] } | null = null;
const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Every column in the public schema that could contain an asset reference.
 * Cached briefly — the set only changes when the schema does.
 */
export async function discoverAssetColumns(): Promise<ScannableColumn[]> {
  if (columnCache && Date.now() - columnCache.at < COLUMN_CACHE_TTL_MS) {
    return columnCache.columns;
  }

  const patternClause = COLUMN_NAME_PATTERNS.map((_, i) => `c.column_name LIKE $${i + 1}`).join(" OR ");

  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.table_name <> 'merchant_assets'
        AND c.data_type IN ('text', 'character varying', 'jsonb', 'json')
        AND (${patternClause})
      ORDER BY c.table_name, c.column_name`,
    COLUMN_NAME_PATTERNS,
  );

  const columns = rows.map((r) => ({ table: r.table_name, column: r.column_name }));
  columnCache = { at: Date.now(), columns };
  return columns;
}

/** Reset the discovery cache (used by tests). */
export function clearAssetColumnCache(): void {
  columnCache = null;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Count the rows that reference `objectPath`, across every column that could
 * hold one.
 *
 * Matching is a substring test because the same object is persisted in two
 * shapes: the bare storage path (`/objects/merchants/4/assets/<sha>`, used in
 * product_return_auths.attachments) and the proxied URL
 * (`/api/storage/objects/...`, used by every image_url column). Both contain
 * the bare path, and the path ends in a UUID or SHA-256, so a substring match
 * cannot collide across assets.
 *
 * Deliberately not filtered by merchant: a reference from anywhere is a reason
 * not to delete. Merchant ownership is enforced separately, on the asset row.
 */
export async function findAssetUsage(objectPath: string): Promise<AssetUsageEntry[]> {
  const columns = await discoverAssetColumns();
  if (columns.length === 0) return [];

  const selects = columns.map(
    (c) =>
      `SELECT '${c.table}' AS entity, '${c.column}' AS col, count(*)::int AS n ` +
      `FROM ${quoteIdent(c.table)} WHERE ${quoteIdent(c.column)}::text LIKE $1`,
  );

  const { rows } = await pool.query<{ entity: string; col: string; n: number }>(
    `SELECT entity, col, n FROM (${selects.join(" UNION ALL ")}) u WHERE n > 0 ORDER BY n DESC`,
    [`%${objectPath}%`],
  );

  return rows.map((r) => ({ entity: r.entity, column: r.col, count: r.n }));
}

/** Total reference count for an object — 0 means it is safe to delete. */
export async function countAssetUsage(objectPath: string): Promise<number> {
  const usage = await findAssetUsage(objectPath);
  return usage.reduce((sum, u) => sum + u.count, 0);
}

/**
 * Usage counts for many objects in one pass, for one merchant.
 *
 * Backs the "used 12×" figure on every library tile. Rather than matching each
 * path against each column — which would scan every table once per asset — this
 * pulls back only the values that mention this merchant's storage prefix (a
 * single scan per column, regardless of how many assets are being counted) and
 * tallies them in memory. The candidate set is small: one short string per
 * image actually in use.
 */
export async function findUsageCounts(
  merchantId: number | string,
  objectPaths: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>(objectPaths.map((p) => [p, 0]));
  if (objectPaths.length === 0) return result;

  const columns = await discoverAssetColumns();
  if (columns.length === 0) return result;

  const selects = columns.map(
    (c) => `SELECT ${quoteIdent(c.column)}::text AS v FROM ${quoteIdent(c.table)} WHERE ${quoteIdent(c.column)}::text LIKE $1`,
  );

  const { rows } = await pool.query<{ v: string }>(
    selects.join(" UNION ALL "),
    [`%/objects/merchants/${merchantId}/%`],
  );

  for (const { v } of rows) {
    if (!v) continue;
    for (const path of objectPaths) {
      if (v.includes(path)) result.set(path, (result.get(path) ?? 0) + 1);
    }
  }
  return result;
}
