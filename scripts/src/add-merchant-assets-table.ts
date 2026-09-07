import { pool } from "@workspace/db";

/**
 * Media library / upload de-duplication: creates merchant_assets, one row per
 * distinct file a merchant has uploaded.
 *
 * Additive only — creates a new table and its indexes. No existing table,
 * column or row is read, altered or dropped, so existing image_url values keep
 * resolving exactly as before.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_assets (
        id           serial PRIMARY KEY,
        merchant_id  integer NOT NULL REFERENCES merchants(id),
        sha256       text,
        object_path  text NOT NULL,
        content_type text NOT NULL DEFAULT 'application/octet-stream',
        size_bytes   integer NOT NULL DEFAULT 0,
        filename     text,
        width        integer,
        height       integer,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Dedup key — partial, so legacy uploads/<uuid> rows imported by the
    // backfill may share a hash while content-addressed assets/<sha256>
    // objects stay strictly one-per-hash.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS merchant_assets_merchant_sha_idx
        ON merchant_assets (merchant_id, sha256)
        WHERE object_path LIKE '%/assets/%'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS merchant_assets_object_path_idx
        ON merchant_assets (object_path)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS merchant_assets_merchant_id_idx
        ON merchant_assets (merchant_id)
    `);

    console.log("merchant_assets ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
