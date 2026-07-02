import { pool } from "@workspace/db";
import crypto from "node:crypto";

/* Adds dashboard_app_settings.public_token (the unguessable address for the
 * public dashboard link, replacing the guessable username URL) and backfills a
 * token for every existing row so already-shared dashboards keep working under
 * the new /d/:token URL. Idempotent: safe to re-run on every db:push. */
async function main() {
  try {
    await pool.query("ALTER TABLE dashboard_app_settings ADD COLUMN IF NOT EXISTS public_token TEXT");
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS dashboard_app_settings_public_token_unique ON dashboard_app_settings(public_token)",
    );
    const { rows } = await pool.query<{ id: number }>(
      "SELECT id FROM dashboard_app_settings WHERE public_token IS NULL",
    );
    for (const row of rows) {
      await pool.query("UPDATE dashboard_app_settings SET public_token = $1 WHERE id = $2", [
        crypto.randomBytes(24).toString("hex"),
        row.id,
      ]);
    }
    console.log(`dashboard_app_settings.public_token ready (backfilled ${rows.length} row(s))`);
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
