import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createHmac } from "crypto";

const router: IRouter = Router();

function verifyToken(token: string): { merchantId: number; customerId: number } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [merchantIdStr, customerIdStr, sig] = parts;
    const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.SESSION_SECRET ?? "koapos-unsub-secret";
    const payload = `${merchantIdStr}:${customerIdStr}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
    if (sig !== expected) return null;
    return { merchantId: parseInt(merchantIdStr, 10), customerId: parseInt(customerIdStr, 10) };
  } catch {
    return null;
  }
}

/** Public route — no auth required. Processes unsubscribe requests from email links. */
router.get("/unsubscribe", async (req, res): Promise<void> => {
  const token = String(req.query.t ?? "");
  const parsed = verifyToken(token);

  if (!parsed) {
    res.status(400).send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head>
      <body style="font-family:sans-serif;padding:40px;max-width:480px;margin:auto;text-align:center;">
        <h2>Invalid or expired link</h2>
        <p>This unsubscribe link is not valid. Please contact the business directly to opt out.</p>
      </body></html>
    `);
    return;
  }

  const { merchantId, customerId } = parsed;

  const [customer] = await db
    .select({ id: customersTable.id, firstName: customersTable.firstName })
    .from(customersTable)
    .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId)))
    .limit(1);

  if (!customer) {
    res.status(404).send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head>
      <body style="font-family:sans-serif;padding:40px;max-width:480px;margin:auto;text-align:center;">
        <h2>Customer not found</h2>
        <p>We could not find your record. You may have already been removed.</p>
      </body></html>
    `);
    return;
  }

  await db
    .update(customersTable)
    .set({ agreedToMarketing: "false" })
    .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId)));

  res.send(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
    <body style="font-family:sans-serif;padding:40px;max-width:480px;margin:auto;text-align:center;">
      <h2 style="color:#16a34a;">You have been unsubscribed</h2>
      <p>Hi${customer.firstName ? ` ${customer.firstName}` : ""}, you have been successfully removed from our marketing list.</p>
      <p style="color:#6b7280;font-size:13px;">You will no longer receive promotional emails. Transactional emails (invoices, service job updates) may still be sent.</p>
    </body></html>
  `);
});

export default router;
