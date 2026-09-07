import { pool } from "@workspace/db";

/**
 * Drop `regional_ext_settings.receipt_paper_size`.
 *
 * It held a merchant's 58mm/80mm/A4 choice from the Sales Templates "Receipt &
 * Print Settings" tile. No print path ever read it — paper comes from the
 * printer profile a purpose is routed to (`paperFor`/`thermalWidth` in
 * `lib/print-router.ts`) — so the tile silently did nothing, and it has been
 * replaced by a signpost to Printers & Routing, which owns paper.
 *
 * DESTRUCTIVE: the stored choice is gone for good. That is the intent — it is a
 * preference the app never honoured, and leaving a dead column invites someone
 * to wire a new UI to it.
 *
 * ORDER MATTERS. Code that still lists the column in its Drizzle schema will
 * `SELECT receipt_paper_size` and fail once it's gone, so **deploy first, then
 * run this**. Running it against a database whose app is still on an older build
 * breaks GET/PUT /regional-ext-settings until the deploy lands.
 *
 * Idempotent.
 */
async function main() {
  try {
    await pool.query(
      "ALTER TABLE regional_ext_settings DROP COLUMN IF EXISTS receipt_paper_size",
    );
    console.log("regional_ext_settings.receipt_paper_size dropped (paper is the printer profile's)");
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
