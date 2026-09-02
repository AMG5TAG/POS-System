import { pool } from "@workspace/db";

async function main() {
  try {
    await pool.query("ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_hash TEXT");
    console.log("staff.password_hash ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
