import { pool } from "@workspace/db";

/**
 * Mail-In repairs: creates mail_in_requests and mail_in_settings.
 * New, empty tables — nothing existing changes.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mail_in_requests (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        reference text NOT NULL,
        token_hash text NOT NULL,
        status text NOT NULL DEFAULT 'awaiting_postage',
        customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
        first_name text NOT NULL,
        last_name text,
        email text NOT NULL,
        phone text NOT NULL,
        street text NOT NULL,
        suburb text NOT NULL,
        state text NOT NULL,
        postcode text NOT NULL,
        device_type text NOT NULL,
        brand_model text NOT NULL,
        serial_number text,
        fault text NOT NULL,
        accessories text,
        agreed_at timestamptz NOT NULL,
        tracking_carrier text,
        tracking_number text,
        tracking_added_at timestamptz,
        received_at timestamptz,
        service_job_id integer REFERENCES service_jobs(id) ON DELETE SET NULL,
        staff_notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS mail_in_requests_merchant_reference_uniq ON mail_in_requests (merchant_id, reference)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS mail_in_requests_token_hash_uniq ON mail_in_requests (token_hash)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mail_in_requests_merchant_status_idx ON mail_in_requests (merchant_id, status)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mail_in_settings (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
        enabled text NOT NULL DEFAULT 'true',
        return_text text NOT NULL DEFAULT 'Return postage is quoted with your repair. You can also collect it in store.',
        extra_notes text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    console.log("mail_in_requests and mail_in_settings ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
