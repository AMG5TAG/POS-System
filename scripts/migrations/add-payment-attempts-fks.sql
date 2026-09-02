-- Add foreign-key constraints to payment_attempts on the LIVE database.
--
-- The table was created out-of-band (a raw drizzle-kit push is broken by the
-- report views), so the columns exist but the DB-level FKs were never applied.
-- The relationships are already declared in the Drizzle schema
-- (lib/db/src/schema/payment-attempts.ts) for ORM/type purposes; this script
-- adds the matching enforcement in Postgres.
--
-- Idempotent: each constraint is only added if it doesn't already exist, so this
-- is safe to run more than once.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_merchant_id_fkey'
  ) THEN
    ALTER TABLE payment_attempts
      ADD CONSTRAINT payment_attempts_merchant_id_fkey
      FOREIGN KEY (merchant_id) REFERENCES merchants(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_transaction_id_fkey'
  ) THEN
    ALTER TABLE payment_attempts
      ADD CONSTRAINT payment_attempts_transaction_id_fkey
      FOREIGN KEY (transaction_id) REFERENCES transactions(id);
  END IF;
END $$;
