import { pool } from "@workspace/db";

/**
 * Repurpose `product_return_auths` from a customer-refund system into a
 * supplier RMA (Return Merchandise Authorisation) system — returns the merchant
 * sends back to a SUPPLIER for warranty / replacement / repair / credit.
 *
 *  - Adds supplier_id, supplier_name, quantity, return_type, supplier_rma_number,
 *    tracking_number.
 *  - Backfills supplier_name from the legacy customer_name (best effort) so no
 *    existing row is orphaned, then enforces NOT NULL.
 *  - Rebrands existing RA-#### numbers to RMA-####.
 *  - Drops the legacy customer_id / customer_name / refund_amount columns.
 *
 * Idempotent — safe to run repeatedly and as part of the db:push chain.
 */
async function main() {
  try {
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS supplier_id integer REFERENCES suppliers(id)");
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS supplier_name text");
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1");
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS return_type text");
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS supplier_rma_number text");
    await pool.query("ALTER TABLE product_return_auths ADD COLUMN IF NOT EXISTS tracking_number text");

    // Carry the old customer name across to supplier_name where the legacy column still exists.
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'product_return_auths' AND column_name = 'customer_name') THEN
          UPDATE product_return_auths
            SET supplier_name = customer_name
            WHERE supplier_name IS NULL;
        END IF;
      END $$;
    `);

    // Ensure supplier_name is populated and NOT NULL going forward.
    await pool.query("UPDATE product_return_auths SET supplier_name = '' WHERE supplier_name IS NULL");
    await pool.query("ALTER TABLE product_return_auths ALTER COLUMN supplier_name SET DEFAULT ''");
    await pool.query("ALTER TABLE product_return_auths ALTER COLUMN supplier_name SET NOT NULL");

    // Rebrand legacy RA-#### identifiers to RMA-####.
    await pool.query("UPDATE product_return_auths SET ra_number = 'RMA-' || substring(ra_number from 4) WHERE ra_number LIKE 'RA-%'");

    // New rows default to the Draft stage of the supplier RMA workflow.
    await pool.query("ALTER TABLE product_return_auths ALTER COLUMN status SET DEFAULT 'Draft'");

    // Drop the customer-refund columns that no longer apply.
    await pool.query("ALTER TABLE product_return_auths DROP COLUMN IF EXISTS customer_id");
    await pool.query("ALTER TABLE product_return_auths DROP COLUMN IF EXISTS customer_name");
    await pool.query("ALTER TABLE product_return_auths DROP COLUMN IF EXISTS refund_amount");

    console.log("product_return_auths repurposed to supplier RMA schema");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
