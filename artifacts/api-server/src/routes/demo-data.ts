import { Router, type IRouter } from "express";
import { db, merchantsTable, productsTable, customersTable, transactionsTable, staffTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";

const router: IRouter = Router();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

router.delete("/demo-data", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const [merchant] = await db
    .select({ createdAt: merchantsTable.createdAt, isDemoAccount: merchantsTable.isDemoAccount })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));

  if (!merchant) { res.status(404).json({ error: "Not found" }); return; }

  const ageMs = Date.now() - merchant.createdAt.getTime();
  const eligible = merchant.isDemoAccount === "true" || ageMs < THIRTY_DAYS_MS;

  if (!eligible) {
    res.status(403).json({ error: "Demo data clear is only available within 30 days of account creation." });
    return;
  }

  // Delete all transactional data in FK-safe order
  const [txCount, prodCount, custCount, staffCount] = await db.transaction(async (tx) => {
    // Gift card ledger → gift cards
    await tx.execute(sql`DELETE FROM gift_card_ledger WHERE merchant_id = ${merchantId}`);
    await tx.execute(sql`DELETE FROM gift_cards WHERE merchant_id = ${merchantId}`);
    // Transaction-dependent tables
    await tx.execute(sql`DELETE FROM void_audit WHERE merchant_id = ${merchantId}`);
    const [{ count: tc }] = await tx.execute(sql`DELETE FROM transactions WHERE merchant_id = ${merchantId} RETURNING count(*)`) as unknown as [{ count: string }];
    // Product-dependent tables
    await tx.execute(sql`DELETE FROM product_variants WHERE merchant_id = ${merchantId}`);
    await tx.execute(sql`DELETE FROM digital_codes WHERE merchant_id = ${merchantId}`);
    await tx.execute(sql`DELETE FROM product_price_history WHERE merchant_id = ${merchantId}`);
    await tx.execute(sql`DELETE FROM inventory_wastage WHERE merchant_id = ${merchantId}`);
    const [{ count: pc }] = await tx.execute(sql`DELETE FROM products WHERE merchant_id = ${merchantId} RETURNING count(*)`) as unknown as [{ count: string }];
    // Customer-dependent tables
    await tx.execute(sql`DELETE FROM customer_notes WHERE merchant_id = ${merchantId}`);
    await tx.execute(sql`DELETE FROM customer_files WHERE merchant_id = ${merchantId}`);
    const [{ count: cc }] = await tx.execute(sql`DELETE FROM customers WHERE merchant_id = ${merchantId} RETURNING count(*)`) as unknown as [{ count: string }];
    // Staff (keep owner)
    const [{ count: sc }] = await tx.execute(sql`DELETE FROM staff WHERE merchant_id = ${merchantId} AND role != 'owner' RETURNING count(*)`) as unknown as [{ count: string }];

    return [Number(tc ?? 0), Number(pc ?? 0), Number(cc ?? 0), Number(sc ?? 0)];
  });

  res.json({
    ok: true,
    deleted: {
      transactions: txCount,
      products: prodCount,
      customers: custCount,
      staff: staffCount,
    },
  });
});

export default router;
