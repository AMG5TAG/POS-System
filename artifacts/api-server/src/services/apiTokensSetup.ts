import { pool } from "@workspace/db";
import type { Logger } from "pino";

/**
 * Idempotently creates the api_tokens table (purely additive - no existing data is touched).
 * `pnpm run db:push` creates the same table from the Drizzle schema; this runs before the schema-drift
 * check on boot so a deploy that hasn't run db:push yet still starts.
 */
export async function ensureApiTokensTable(logger: Logger): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id            serial PRIMARY KEY,
        merchant_id   integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        name          text NOT NULL,
        token_hash    text NOT NULL,
        token_prefix  text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        last_used_at  timestamptz,
        revoked_at    timestamptz
      );
      CREATE INDEX IF NOT EXISTS api_tokens_merchant_id_idx ON api_tokens (merchant_id);
      CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_token_hash_idx ON api_tokens (token_hash);
    `);
  } catch (err) {
    logger.warn({ err }, "Could not ensure api_tokens table (run `pnpm run db:push`)");
  } finally {
    client.release();
  }
}
