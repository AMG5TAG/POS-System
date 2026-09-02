import { pool } from "@workspace/db";

/**
 * Surcharge / cost-of-acceptance config:
 *  - Creates the per-merchant, per-payment-method `payment_method_surcharges`
 *    table (percent + fixed fee, pass-on-to-customer vs absorb, enabled).
 *  - Adds the `surcharge_amount` column to `transactions` to record the
 *    customer-facing surcharge actually collected at checkout.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain. Kept as
 * a standalone script rather than relying on `drizzle-kit push`, which would try
 * to reconcile (and drop) the report views created by setup-report-views.
 */
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_method_surcharges (
        id             serial PRIMARY KEY,
        merchant_id    integer NOT NULL REFERENCES merchants(id),
        payment_method text NOT NULL,
        percent        numeric(6,3) NOT NULL DEFAULT 0,
        fixed          numeric(10,2) NOT NULL DEFAULT 0,
        pass_on        text NOT NULL DEFAULT 'false',
        enabled        text NOT NULL DEFAULT 'false',
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS payment_method_surcharges_merchant_method_idx
        ON payment_method_surcharges (merchant_id, payment_method)
    `);
    await pool.query(
      "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS surcharge_amount numeric(10,2) NOT NULL DEFAULT 0"
    );
    await pool.query(
      "ALTER TABLE layby_payments ADD COLUMN IF NOT EXISTS surcharge_amount numeric(10,2) NOT NULL DEFAULT 0"
    );
    console.log("payment_method_surcharges table + transactions.surcharge_amount + layby_payments.surcharge_amount ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
