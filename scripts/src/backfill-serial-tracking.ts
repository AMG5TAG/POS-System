import { pool } from "@workspace/db";

/**
 * One-time backfill for products.tracks_serial.
 *
 * Serial-number capture used to be gated on `warranty_duration > 0`. Now it is
 * driven by an explicit `tracks_serial` flag. To preserve existing behaviour,
 * every product that previously relied on a warranty to capture serials is
 * ticked on the FIRST run only — so a later manual un-tick isn't clobbered when
 * this script re-runs on subsequent deploys.
 *
 * Runs BEFORE `@workspace/db push` in the db:push chain, so on the first run the
 * column does not exist yet — that absence is our "first run" signal.
 */
async function main() {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'tracks_serial'`,
    );
    const firstRun = rows.length === 0;

    await pool.query(
      "ALTER TABLE products ADD COLUMN IF NOT EXISTS tracks_serial TEXT NOT NULL DEFAULT 'false'",
    );

    if (firstRun) {
      const res = await pool.query(
        "UPDATE products SET tracks_serial = 'true' WHERE warranty_duration > 0 AND tracks_serial = 'false'",
      );
      console.log(`tracks_serial backfilled for ${res.rowCount ?? 0} warranty product(s)`);
    } else {
      console.log("products.tracks_serial already present — skipping backfill");
    }
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
