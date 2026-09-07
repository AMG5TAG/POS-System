import { pool } from "@workspace/db";

/**
 * Rollback for `drop-receipt-paper-size.ts`, for the one window where dropping
 * it hurts: the column is gone but the build still running in production lists
 * it in its Drizzle schema, so `GET`/`PUT /regional-ext-settings` fail until the
 * new code is deployed.
 *
 * Re-adding it restores those endpoints fully. Nothing is lost by the round
 * trip: the stored 58mm/80mm/A4 values were never read by any print path — that
 * is why the column was dropped — so a merchant cannot tell the difference
 * between their old value and the default this puts back.
 *
 * This is a stopgap, not a decision to keep the column. Deploy, then run
 * `drop-receipt-paper-size` again and delete this file.
 *
 * Idempotent.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE regional_ext_settings ADD COLUMN IF NOT EXISTS receipt_paper_size text NOT NULL DEFAULT '80mm'",
    );
    console.log("regional_ext_settings.receipt_paper_size restored — deploy, then drop it again");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
