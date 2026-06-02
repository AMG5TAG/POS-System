import { pool } from "@workspace/db";

async function main() {
  try {
    await pool.query("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS portal_domain TEXT");
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'merchants_portal_domain_unique'
            AND conrelid = 'merchants'::regclass
        ) THEN
          ALTER TABLE merchants ADD CONSTRAINT merchants_portal_domain_unique UNIQUE (portal_domain);
        END IF;
      END $$
    `);
    console.log("portal_domain column added successfully");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
