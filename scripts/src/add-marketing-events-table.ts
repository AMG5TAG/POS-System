import { pool } from "@workspace/db";

/**
 * Creates the `marketing_events` table — the append-only log of public marketing
 * engagements (shortlink clicks, landing-page views, QR scans) behind the
 * Marketing → Analytics screen. Idempotent — safe to run repeatedly and as part
 * of the db:push chain so the startup schema-drift guard never trips on a fresh
 * deploy.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_events (
        id           serial PRIMARY KEY,
        merchant_id  integer NOT NULL REFERENCES merchants(id),
        kind         text NOT NULL,
        target_id    integer,
        target_slug  text NOT NULL DEFAULT '',
        device_type  text NOT NULL DEFAULT 'unknown',
        os           text NOT NULL DEFAULT '',
        browser      text NOT NULL DEFAULT '',
        country      text NOT NULL DEFAULT '',
        region       text NOT NULL DEFAULT '',
        city         text NOT NULL DEFAULT '',
        referrer     text NOT NULL DEFAULT '',
        language     text NOT NULL DEFAULT '',
        ip_hash      text NOT NULL DEFAULT '',
        occurred_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS marketing_events_merchant_kind_time_idx ON marketing_events (merchant_id, kind, occurred_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS marketing_events_merchant_target_idx ON marketing_events (merchant_id, kind, target_id)`);
    console.log("marketing_events table ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
