/**
 * Ensures every merchant has at least one POS register ("Main Register").
 * Idempotent — skips merchants that already have a register.
 *
 * Run via: pnpm --filter @workspace/scripts run seed-default-register
 *          (also called automatically by pnpm run db:push)
 */
import { db, merchantsTable, posRegistersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const merchants = await db.select({ id: merchantsTable.id }).from(merchantsTable);

  let created = 0;
  for (const merchant of merchants) {
    const [existing] = await db
      .select({ id: posRegistersTable.id })
      .from(posRegistersTable)
      .where(eq(posRegistersTable.merchantId, merchant.id))
      .limit(1);

    if (existing) {
      console.log(`Merchant ${merchant.id}: already has a register, skipping`);
      continue;
    }

    await db.insert(posRegistersTable).values({
      merchantId: merchant.id,
      registerId: "MAIN",
      name: "Main Register",
      type: "Cash",
    });

    console.log(`Merchant ${merchant.id}: created default "Main Register"`);
    created++;
  }

  console.log(`Done — created ${created} default register(s) across ${merchants.length} merchant(s)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
