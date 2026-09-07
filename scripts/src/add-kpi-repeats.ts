import { pool } from "@workspace/db";

/**
 * Adds `kpi_targets.repeats` — opt-in flag marking a fixed budget window
 * (start_date/end_date) as recurring, so the KPI reset scheduler archives the
 * finished window and rolls the dates forward one period instead of leaving the
 * target stuck on a window that has already ended.
 *
 * Defaults to 'false' so every existing dated target keeps its current
 * behaviour and no stored start_date/end_date is rewritten until a merchant
 * explicitly opts that target in.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE kpi_targets ADD COLUMN IF NOT EXISTS repeats text NOT NULL DEFAULT 'false'",
    );
    console.log("kpi_targets.repeats ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
