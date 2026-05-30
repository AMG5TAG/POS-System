-- Migration: Convert products.tags_json from text to native jsonb
-- Safe to run multiple times (column type check prevents double-alter errors).
--
-- Strategy:
--   - Valid JSON arrays  → cast to jsonb
--   - NULL              → stays NULL
--   - Non-array or malformed JSON → set to NULL (matches old try/catch skip behaviour)
--
-- Run directly via psql (db:push is blocked by product_type column drift):
--   psql "$DATABASE_URL" -f scripts/migrations/migrate-tags-json-to-jsonb.sql

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'tags_json') = 'text' THEN

    ALTER TABLE products
      ALTER COLUMN tags_json TYPE jsonb
      USING CASE
        WHEN tags_json IS NULL        THEN NULL
        WHEN tags_json IS JSON ARRAY  THEN tags_json::jsonb
        ELSE                               NULL
      END;

    RAISE NOTICE 'Migrated products.tags_json from text to jsonb.';
  ELSE
    RAISE NOTICE 'products.tags_json is already jsonb — skipping ALTER.';
  END IF;
END;
$$;

-- GIN index for O(1) tag membership checks with the @> operator.
CREATE INDEX IF NOT EXISTS products_tags_gin_idx ON products USING gin(tags_json);

SELECT 'Migration complete' AS status;
