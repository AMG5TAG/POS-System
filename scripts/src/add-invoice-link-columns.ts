import { pool } from "@workspace/db";

async function main() {
  try {
    await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_job_id INTEGER REFERENCES service_jobs(id)");
    await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS appointment_id INTEGER REFERENCES appointments(id)");
    console.log("invoice link columns added successfully");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
