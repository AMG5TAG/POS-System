import { pool } from "@workspace/db";

/**
 * Customer business contact details: adds customers.business_address,
 * business_phone and business_email, shown on the customer form once a
 * business name is entered and sent with the iCloud contact sync.
 *
 * Purely additive (nullable columns, no rewrite of existing rows). Idempotent —
 * safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS business_address text,
        ADD COLUMN IF NOT EXISTS business_phone text,
        ADD COLUMN IF NOT EXISTS business_email text
    `);
    console.log("customers.business_address/phone/email ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
