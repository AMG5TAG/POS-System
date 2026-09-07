import { pool } from "@workspace/db";

/**
 * `merchants.phone_display` — whether phone numbers are shown with their country
 * code ("international", +61412345678) or without it ("national", 0412345678).
 *
 * Display only. Numbers are always *stored* in E.164 whatever this says, so the
 * column changes nothing about existing data and switching it back and forth is
 * free. Defaults to "international", which is what the app did before the
 * setting existed.
 *
 * The API server reads this column when it formats a merchant, so it has to
 * exist before the new code boots. Purely additive and idempotent.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS phone_display text NOT NULL DEFAULT 'international'",
    );
    console.log("merchants.phone_display ready (defaults to showing the country code)");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
