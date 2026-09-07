import { pool } from "@workspace/db";

async function main() {
  try {
    await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_schedule json");
    console.log("invoice payment_schedule column added successfully");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
