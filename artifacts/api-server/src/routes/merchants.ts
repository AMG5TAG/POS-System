import { Router, type IRouter } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateMerchantBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/merchants/me", requireAuth, async (req, res): Promise<void> => {
  const [merchant] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.session.merchantId!));

  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }

  res.json({
    id: merchant.id,
    email: merchant.email,
    businessName: merchant.businessName,
    ownerName: merchant.ownerName ?? null,
    phone: merchant.phone ?? null,
    address: merchant.address ?? null,
    city: merchant.city ?? null,
    country: merchant.country ?? null,
    currency: merchant.currency,
    timezone: merchant.timezone ?? null,
    logoUrl: merchant.logoUrl ?? null,
    createdAt: merchant.createdAt.toISOString(),
  });
});

router.patch("/merchants/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMerchantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [merchant] = await db
    .update(merchantsTable)
    .set(parsed.data)
    .where(eq(merchantsTable.id, req.session.merchantId!))
    .returning();

  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }

  res.json({
    id: merchant.id,
    email: merchant.email,
    businessName: merchant.businessName,
    ownerName: merchant.ownerName ?? null,
    phone: merchant.phone ?? null,
    address: merchant.address ?? null,
    city: merchant.city ?? null,
    country: merchant.country ?? null,
    currency: merchant.currency,
    timezone: merchant.timezone ?? null,
    logoUrl: merchant.logoUrl ?? null,
    createdAt: merchant.createdAt.toISOString(),
  });
});

export default router;
