import { pool } from "@workspace/db";

async function main() {
  try {
    await pool.query("ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS reopened_from_job_id INTEGER");
    console.log("service_jobs.reopened_from_job_id ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
