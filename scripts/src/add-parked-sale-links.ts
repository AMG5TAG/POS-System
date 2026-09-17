import { pool } from "@workspace/db";

/**
 * What a parked cart was built from: the quote whose agreed prices it carries
 * and the service job it is billing. Without them a retrieved sale is repriced
 * from the catalogue (the transaction has no quote to be authorised against)
 * and leaves its job open when it is finally paid.
 *
 * Purely additive and idempotent: both columns are nullable and existing parked
 * sales — which were built from neither — read as the plain carts they are.
 * Safe as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE parked_sales ADD COLUMN IF NOT EXISTS quote_id integer");
    await pool.query("ALTER TABLE parked_sales ADD COLUMN IF NOT EXISTS service_job_id integer");
    console.log("parked_sales.quote_id / service_job_id ready");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
