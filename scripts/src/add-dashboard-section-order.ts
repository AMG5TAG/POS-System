import { pool } from "@workspace/db";

async function main() {
  try {
    await pool.query("ALTER TABLE dashboard_config ADD COLUMN IF NOT EXISTS section_order JSONB");
    console.log("dashboard_config.section_order ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
