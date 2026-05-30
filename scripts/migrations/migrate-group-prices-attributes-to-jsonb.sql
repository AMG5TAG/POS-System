-- Migration: Convert products.group_prices and product_variants.attributes from text to native jsonb
-- Safe to run multiple times (column type checks prevent double-alter errors).
--
-- Strategy:
--   - Valid JSON objects → cast to jsonb
--   - NULL              → stays NULL
--   - Non-object or malformed JSON → set to NULL (matches old try/catch fallback behaviour)
--
-- Run directly via psql:
--   psql "$DATABASE_URL" -f scripts/migrations/migrate-group-prices-attributes-to-jsonb.sql

BEGIN;

-- 1. products.group_prices ────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'group_prices') = 'text' THEN

    ALTER TABLE products
      ALTER COLUMN group_prices TYPE jsonb
      USING CASE
        WHEN group_prices IS NULL        THEN NULL
        WHEN group_prices IS JSON OBJECT THEN group_prices::jsonb
        ELSE                                  NULL
      END;

    RAISE NOTICE 'Migrated products.group_prices from text to jsonb.';
  ELSE
    RAISE NOTICE 'products.group_prices is already jsonb — skipping ALTER.';
  END IF;
END;
$$;

-- 2. product_variants.attributes ──────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'product_variants' AND column_name = 'attributes') = 'text' THEN

    ALTER TABLE product_variants
      ALTER COLUMN attributes TYPE jsonb
      USING CASE
        WHEN attributes IS NULL        THEN NULL
        WHEN attributes IS JSON OBJECT THEN attributes::jsonb
        ELSE                                NULL
      END;

    RAISE NOTICE 'Migrated product_variants.attributes from text to jsonb.';
  ELSE
    RAISE NOTICE 'product_variants.attributes is already jsonb — skipping ALTER.';
  END IF;
END;
$$;

COMMIT;

SELECT 'Migration complete' AS status;
