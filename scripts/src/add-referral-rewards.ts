import { pool } from "@workspace/db";

/**
 * Automatic referral rewards.
 *
 * 1. Creates referral_rewards — the record of each referral that has been
 *    rewarded, so a reward is never paid twice. New and empty: nothing
 *    existing changes.
 * 2. The FIRST time it creates the table, records every referral that has
 *    already met the programme's spend and visit thresholds as
 *    "pre_automation". Those are never paid by the system (staff may have
 *    rewarded them by hand) — they only show as earned. No loyalty balance is
 *    touched.
 * 3. Gives every customer without a referral code one ("SL-AB12", the POS's
 *    format), unique within their business. Existing codes are never changed.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = (first: string | null, last: string | null) => {
  const f = ((first ?? "").trim()[0] ?? "X").toUpperCase();
  const l = ((last ?? "").trim()[0] ?? "X").toUpperCase();
  let s = "";
  for (let i = 0; i < 4; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return `${/[A-Z]/.test(f) ? f : "X"}${/[A-Z]/.test(l) ? l : "X"}-${s}`;
};

async function main() {
  try {
    const { rows: [exists] } = await pool.query(`SELECT to_regclass('public.referral_rewards') AS t`);
    const firstRun = !exists?.t;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_rewards (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id),
        referee_customer_id integer NOT NULL REFERENCES customers(id),
        referrer_customer_id integer REFERENCES customers(id),
        referrer_value numeric(12,2) NOT NULL DEFAULT 0,
        referee_value numeric(12,2) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'paid',
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_referee_uniq ON referral_rewards (merchant_id, referee_customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS referral_rewards_referrer_idx ON referral_rewards (merchant_id, referrer_customer_id)`);
    console.log("referral_rewards ready");

    if (firstRun) {
      // Thresholds from Management › Referrals, with that page's defaults.
      const { rowCount } = await pool.query(`
        INSERT INTO referral_rewards (merchant_id, referee_customer_id, referrer_customer_id, status)
        SELECT c.merchant_id, c.id,
               COALESCE(c.referred_by_customer_id, (SELECT r.id FROM customers r
                 WHERE r.merchant_id = c.merchant_id AND upper(r.referral_code) = upper(c.referred_by) LIMIT 1)),
               'pre_automation'
          FROM customers c
          LEFT JOIN customer_settings cs ON cs.merchant_id = c.merchant_id
         WHERE (COALESCE(c.referred_by, '') <> '' OR c.referred_by_customer_id IS NOT NULL)
           AND c.total_spent >= COALESCE((NULLIF(cs.referral_settings, '')::jsonb ->> 'minSpend')::numeric, 50)
           AND c.visit_count >= COALESCE((NULLIF(cs.referral_settings, '')::jsonb ->> 'minVisits')::numeric, 2)
        ON CONFLICT DO NOTHING`);
      console.log(`referral_rewards: ${rowCount} already-qualified referral(s) recorded as pre_automation (not paid)`);
    }

    const { rows: missing } = await pool.query(
      `SELECT id, merchant_id, first_name, last_name FROM customers WHERE referral_code IS NULL OR referral_code = ''`);
    let added = 0;
    for (const c of missing) {
      for (let i = 0; i < 20; i++) {
        const next = code(c.first_name, c.last_name);
        const { rowCount } = await pool.query(
          `UPDATE customers SET referral_code = $1
            WHERE id = $2 AND (referral_code IS NULL OR referral_code = '')
              AND NOT EXISTS (SELECT 1 FROM customers WHERE merchant_id = $3 AND referral_code = $1)`,
          [next, c.id, c.merchant_id]);
        if (rowCount) { added++; break; }
      }
    }
    console.log(`referral codes: ${added} customer(s) given one`);
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
