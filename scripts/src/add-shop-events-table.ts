import { pool } from "@workspace/db";

/**
 * Online shop analytics (Management › Online Store › Statistics): creates
 * shop_events. A new, empty table — nothing existing changes.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_events (
        id bigserial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        type text NOT NULL,
        path text NOT NULL DEFAULT '',
        product_id integer,
        target text,
        label text,
        visitor_id text NOT NULL,
        ip_hash text NOT NULL,
        referrer text,
        device text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS shop_events_merchant_time_idx ON shop_events (merchant_id, created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS shop_events_merchant_type_time_idx ON shop_events (merchant_id, type, created_at)`);
    console.log("shop_events ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
