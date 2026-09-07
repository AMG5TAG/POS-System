import { pool } from "@workspace/db";

/* One-time data correction for the Koastal Komputers merchant: reset ALL of
 * their parent recurring invoices back to unviewed/unpaid (status "sent",
 * clearing viewed_at/paid_at, zeroing amount_paid) so the ledger reflects
 * reality. Moved out of the API boot path into this one-off migration — it's
 * email-scoped and cutoff-guarded, so it's a no-op on every run after the first
 * (and on any deployment where that merchant doesn't exist). Idempotent. */
const RECURRING_RESET_CUTOFF = "2026-05-30T00:00:00.000Z";

async function main() {
  try {
    const { rows: merchants } = await pool.query<{ id: number }>(
      "SELECT id FROM merchants WHERE email = $1",
      ["admin@koastalkomputers.com.au"],
    );
    if (merchants.length === 0) {
      console.log("Koastal Komputers merchant not found; nothing to patch");
      return;
    }
    const res = await pool.query(
      `UPDATE invoices
         SET status = 'sent', viewed_at = NULL, paid_at = NULL, amount_paid = '0', updated_at = NOW()
       WHERE merchant_id = $1
         AND is_recurring = 'true'
         AND parent_invoice_id IS NULL
         AND updated_at <= $2
         AND (status = 'paid' OR status = 'partial' OR viewed_at IS NOT NULL OR paid_at IS NOT NULL)
       RETURNING id`,
      [merchants[0].id, RECURRING_RESET_CUTOFF],
    );
    console.log(`Reset ${res.rowCount ?? 0} recurring invoice(s) for Koastal Komputers`);
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
