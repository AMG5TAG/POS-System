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

/**
 * Columns used to label a referencing row in the UI, best first. "Attached to
 * Coca-Cola 600ml" is far more useful than "attached to products row 412".
 */
const LABEL_COLUMN_PRIORITY = [
  "name",
  "business_name",
  "supplier_name",
  "title",
  "filename",
  "ra_number",
  "order_number",
  "invoice_number",
  "email",
  "slug",
];

interface ScannableColumn {
  table: string;
  column: string;
  /** text | character varying | jsonb | json — decides the cast when rewriting. */
  dataType: string;
  /** Primary key column, when the table has a plain `id`. */
  idColumn: string | null;
  /** Human-readable column for this row, if the table has one. */
  labelColumn: string | null;
}

let columnCache: { at: number; columns: ScannableColumn[] } | null = null;
const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Every column in the public schema that could contain an asset reference,
 * along with how to identify and label the rows holding one.
 * Cached briefly — the set only changes when the schema does.
 */
export async function discoverAssetColumns(): Promise<ScannableColumn[]> {
  if (columnCache && Date.now() - columnCache.at < COLUMN_CACHE_TTL_MS) {
    return columnCache.columns;
  }

  const patternClause = COLUMN_NAME_PATTERNS.map((_, i) => `c.column_name LIKE $${i + 1}`).join(" OR ");

  const { rows } = await pool.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT c.table_name, c.column_name, c.data_type
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

  // Second pass: what each of those tables can be identified and labelled by.
  const tables = Array.from(new Set(rows.map((r) => r.table_name)));
  const byTable = new Map<string, Set<string>>();
  if (tables.length > 0) {
    const { rows: allCols } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [tables],
    );
    for (const c of allCols) {
      if (!byTable.has(c.table_name)) byTable.set(c.table_name, new Set());
      byTable.get(c.table_name)!.add(c.column_name);
    }
  }

  const columns = rows.map((r) => {
    const cols = byTable.get(r.table_name) ?? new Set<string>();
    return {
      table: r.table_name,
      column: r.column_name,
      dataType: r.data_type,
      idColumn: cols.has("id") ? "id" : null,
      labelColumn: LABEL_COLUMN_PRIORITY.find((c) => cols.has(c) && c !== r.column_name) ?? null,
    };
  });

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

/** One row that points at a stored object. */
export interface AssetReference {
  /** Table holding the reference, e.g. "products". */
  entity: string;
  column: string;
  /** Row id, when the table has one. */
  id: string | null;
  /** Human-readable row label, e.g. the product name. */
  label: string | null;
}

/**
 * Every reference held by a merchant, grouped by the object path it points at.
 *
 * Backs the Uploads page, which shows what each file is attached to. Like
 * findUsageCounts this scans each column once for the merchant's storage
 * prefix and matches in memory, so the cost does not grow with the number of
 * assets being reported on.
 */
export async function findReferencesByPath(
  merchantId: number | string,
): Promise<Map<string, AssetReference[]>> {
  const byPath = new Map<string, AssetReference[]>();

  const columns = await discoverAssetColumns();
  if (columns.length === 0) return byPath;

  const selects = columns.map((c) => {
    const id = c.idColumn ? `${quoteIdent(c.idColumn)}::text` : "NULL::text";
    const label = c.labelColumn ? `${quoteIdent(c.labelColumn)}::text` : "NULL::text";
    return (
      `SELECT '${c.table}' AS entity, '${c.column}' AS col, ${id} AS id, ${label} AS label, ` +
      `${quoteIdent(c.column)}::text AS value ` +
      `FROM ${quoteIdent(c.table)} WHERE ${quoteIdent(c.column)}::text LIKE $1`
    );
  });

  const { rows } = await pool.query<{
    entity: string; col: string; id: string | null; label: string | null; value: string;
  }>(selects.join(" UNION ALL "), [`%/objects/merchants/${merchantId}/%`]);

  // A value can mention more than one object (a jsonb attachments array), so
  // pull every path out of it rather than assuming one reference per row.
  const pathPattern = new RegExp(`/objects/merchants/${merchantId}/[A-Za-z0-9._/-]+`, "g");
  for (const row of rows) {
    if (!row.value) continue;
    for (const path of new Set(row.value.match(pathPattern) ?? [])) {
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path)!.push({
        entity: row.entity,
        column: row.col,
        id: row.id,
        label: row.label,
      });
    }
  }

  return byPath;
}

/**
 * Point every reference to `oldPath` at `newPath` instead.
 *
 * Runs as one transaction across all columns: a half-applied replace would
 * leave some products showing the old image and some the new, which is worse
 * than not replacing at all.
 *
 * Substring replacement covers both stored shapes — the bare `/objects/...`
 * path and the proxied `/api/storage/objects/...` URL — in one pass.
 */
export async function rewriteAssetReferences(
  oldPath: string,
  newPath: string,
): Promise<number> {
  const columns = await discoverAssetColumns();
  if (columns.length === 0) return 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let updated = 0;
    for (const c of columns) {
      const col = quoteIdent(c.column);
      // jsonb/json must be cast back after the text-level replacement.
      const cast = c.dataType === "jsonb" ? "::jsonb" : c.dataType === "json" ? "::json" : "";
      const res = await client.query(
        `UPDATE ${quoteIdent(c.table)} SET ${col} = replace(${col}::text, $1, $2)${cast} ` +
        `WHERE ${col}::text LIKE $3`,
        [oldPath, newPath, `%${oldPath}%`],
      );
      updated += res.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
