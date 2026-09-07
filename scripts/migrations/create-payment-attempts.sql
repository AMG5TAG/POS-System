-- payment_attempts: provider-agnostic async external payment records (Zip Pay first).
-- Additive only. Created out-of-band because the repo's report views break a raw
-- `drizzle-kit push`; the Drizzle table definition lives in
-- lib/db/src/schema/payment-attempts.ts and must stay in sync with this DDL.

CREATE TABLE IF NOT EXISTS payment_attempts (
  id              serial PRIMARY KEY,
  merchant_id     integer NOT NULL REFERENCES merchants(id),
  transaction_id  integer REFERENCES transactions(id),
  provider        text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  external_ref    text,
  order_ref       text NOT NULL,
  amount          numeric(10,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'AUD',
  qr_payload      text,
  expires_at      timestamptz,
  sale_payload    jsonb NOT NULL,
  provider_data   jsonb,
  failure_reason  text,
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_attempts_merchant_id_idx
  ON payment_attempts (merchant_id);
CREATE INDEX IF NOT EXISTS payment_attempts_merchant_id_status_idx
  ON payment_attempts (merchant_id, status);
CREATE INDEX IF NOT EXISTS payment_attempts_transaction_id_idx
  ON payment_attempts (transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_provider_external_ref_idx
  ON payment_attempts (provider, external_ref);
