import { pool } from "@workspace/db";

async function main() {
  await pool.query(`
    CREATE OR REPLACE FUNCTION prevent_merchant_delete()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION
        'Merchant accounts cannot be hard-deleted (id=%). Set status = ''suspended'' to disable access.',
        OLD.id;
    END;
    $$;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS no_delete_merchants ON merchants;
    CREATE TRIGGER no_delete_merchants
      BEFORE DELETE ON merchants
      FOR EACH ROW EXECUTE FUNCTION prevent_merchant_delete();
  `);

  console.log("Merchant delete protection trigger installed");
  await pool.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
