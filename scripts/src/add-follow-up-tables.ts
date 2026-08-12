import { pool } from "@workspace/db";

/**
 * Creates the tables behind Marketing → Follow Up: message templates, the send
 * history, and the per-merchant window/default settings. Purely additive and
 * idempotent (CREATE TABLE / INDEX IF NOT EXISTS) — safe to run repeatedly and
 * as part of the db:push chain so a fresh deploy never trips the startup
 * schema-drift guard.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS follow_up_templates (
        id          serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id),
        name        text NOT NULL,
        channel     text NOT NULL DEFAULT 'email',
        subject     text NOT NULL DEFAULT '',
        body        text NOT NULL DEFAULT '',
        sms_body    text NOT NULL DEFAULT '',
        is_default  text NOT NULL DEFAULT 'false',
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS follow_up_templates_merchant_id_idx ON follow_up_templates (merchant_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS follow_up_log (
        id          serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id),
        source_type text NOT NULL,
        source_id   integer NOT NULL,
        customer_id integer REFERENCES customers(id),
        template_id integer,
        channel     text NOT NULL,
        status      text NOT NULL DEFAULT 'sent',
        recipient   text NOT NULL DEFAULT '',
        subject     text NOT NULL DEFAULT '',
        body        text NOT NULL DEFAULT '',
        error       text,
        sent_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS follow_up_log_merchant_id_idx ON follow_up_log (merchant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS follow_up_log_merchant_source_idx ON follow_up_log (merchant_id, source_type, source_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS follow_up_settings (
        id                   serial PRIMARY KEY,
        merchant_id          integer NOT NULL REFERENCES merchants(id),
        window_value         integer NOT NULL DEFAULT 30,
        window_unit          text NOT NULL DEFAULT 'days',
        include_services     text NOT NULL DEFAULT 'true',
        include_appointments text NOT NULL DEFAULT 'true',
        hide_already_sent    text NOT NULL DEFAULT 'true',
        require_opt_in       text NOT NULL DEFAULT 'true',
        default_channel      text NOT NULL DEFAULT 'email',
        default_template_id  integer,
        review_url           text NOT NULL DEFAULT '',
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS follow_up_settings_merchant_id_unique ON follow_up_settings (merchant_id)`);

    // Dashboard toggle for the "follow-ups overdue" banner.
    await pool.query(`
      ALTER TABLE dashboard_config
        ADD COLUMN IF NOT EXISTS show_follow_up_notifications boolean NOT NULL DEFAULT true
    `);

    console.log("follow_up_templates / follow_up_log / follow_up_settings tables ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
