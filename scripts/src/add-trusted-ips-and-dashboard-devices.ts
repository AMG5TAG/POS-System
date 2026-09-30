import { pool } from "@workspace/db";

/**
 * Trusted sign-in IPs and Dashboard screen approval:
 *  - creates trusted_ips (IPs never flagged as a new sign-in location);
 *  - creates dashboard_app_devices (screens waiting for / granted approval);
 *  - adds dashboard_app_settings.require_approval (default on).
 * New tables and a new column only — nothing existing is changed or removed.
 * With approval on, a screen already showing the Dashboard will show a pairing
 * code until someone approves it once from the POS.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trusted_ips (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        ip_address text NOT NULL,
        label text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS trusted_ips_merchant_ip_uniq
      ON trusted_ips (merchant_id, ip_address)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dashboard_app_devices (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        secret_hash text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        pair_code text NOT NULL,
        ip_address text,
        user_agent text,
        decided_by text,
        decided_at timestamptz,
        requested_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS dashboard_app_devices_merchant_secret_uniq
      ON dashboard_app_devices (merchant_id, secret_hash)`);

    await pool.query(`ALTER TABLE dashboard_app_settings
      ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT true`);
    console.log("trusted_ips, dashboard_app_devices and dashboard_app_settings.require_approval ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
