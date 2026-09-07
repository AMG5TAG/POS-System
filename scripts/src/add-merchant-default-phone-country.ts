import { pool } from "@workspace/db";

/**
 * `merchants.default_phone_country` — the country whose dialling code is
 * appended to phone numbers saved without one, so "0412 345 678" is stored as
 * "+61412345678".
 *
 * Purely additive. Existing merchants get "", which is what every merchant holds
 * until they choose a country in Settings › Regional › Phone Numbers, and which
 * resolves to Australia (+61) — see `resolvePhoneCountry` in
 * `@workspace/phone-shared`. No phone number is touched by this script; numbers
 * already in the database are only rewritten by
 * `artifacts/api-server/scripts/backfill-phone-e164.ts`, which is a separate,
 * deliberate step.
 *
 * The API server reads this column on every write that carries a phone number,
 * so it has to exist before the new code boots — which is why this is in the
 * db:push chain rather than left to a drizzle diff. Idempotent.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS default_phone_country text NOT NULL DEFAULT ''",
    );
    console.log("merchants.default_phone_country ready (defaults to Australia)");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
