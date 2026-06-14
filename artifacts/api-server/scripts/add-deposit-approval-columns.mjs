// Hotfix migration: add the estimate-approval + deposit columns introduced by the
// "estimate → approval → deposit" feature. The Drizzle schema (and running code)
// already reference these, so any full-row select on service_jobs/quotes fails
// until they exist (this is what broke the dashboard calendar). Idempotent.
import pg from "/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const stmts = [
  `ALTER TABLE service_jobs  ADD COLUMN IF NOT EXISTS estimate_approved_at  timestamptz`,
  `ALTER TABLE service_jobs  ADD COLUMN IF NOT EXISTS estimate_approved_via text`,
  `ALTER TABLE service_jobs  ADD COLUMN IF NOT EXISTS deposit_required      numeric(10,2)`,
  `ALTER TABLE service_jobs  ADD COLUMN IF NOT EXISTS deposit_paid          numeric(10,2) NOT NULL DEFAULT '0'`,
  `ALTER TABLE quotes        ADD COLUMN IF NOT EXISTS deposit_required      numeric(10,2)`,
  `ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS quote_deposit_percent numeric(5,2) NOT NULL DEFAULT '0'`,
];
try {
  for (const s of stmts) { await c.query(s); console.log("OK:", s.replace(/\s+/g, " ")); }
  // Verify all six now exist
  const r = await c.query(`
    select table_name, column_name from information_schema.columns
    where (table_name='service_jobs' and column_name in ('estimate_approved_at','estimate_approved_via','deposit_required','deposit_paid'))
       or (table_name='quotes' and column_name='deposit_required')
       or (table_name='sales_settings' and column_name='quote_deposit_percent')
    order by table_name, column_name`);
  console.log(`\nColumns present now: ${r.rows.length}/6`);
  console.table(r.rows);
} catch (e) {
  console.log("ERROR:", e.message);
}
await c.end();
