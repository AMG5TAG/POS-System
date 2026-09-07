import { pool } from "@workspace/db";

/**
 * Customer profile picture: adds customers.photo_url, a storage URL that the
 * contact sync pushes to Google/Outlook contact photos.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS photo_url text");
    console.log("customers.photo_url ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
