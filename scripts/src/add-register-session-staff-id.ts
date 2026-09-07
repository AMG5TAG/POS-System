import { pool } from "@workspace/db";

/**
 * Adds the `staff_id` column to `pos_register_sessions` so each till session is
 * attributed to the staff member who opened it (rather than only a name string).
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE pos_register_sessions ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES staff(id)"
    );
    console.log("pos_register_sessions.staff_id ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
