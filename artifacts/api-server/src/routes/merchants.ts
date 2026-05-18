import { Router, type IRouter } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateMerchantBody } from "@workspace/api-zod";

const router: IRouter = Router();

const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

function formatMerchant(m: typeof merchantsTable.$inferSelect) {
  return {
    id: m.id,
    email: m.email,
    businessName: m.businessName,
    ownerName: m.ownerName ?? null,
    phone: m.phone ?? null,
    address: m.address ?? null,
    city: m.city ?? null,
    country: m.country ?? null,
    currency: m.currency,
    timezone: m.timezone ?? null,
    logoUrl: m.logoUrl ?? null,
    username: m.username ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

router.get("/merchants/me", requireAuth, async (req, res): Promise<void> => {
  const [merchant] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.session.merchantId!));

  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }

  res.json(formatMerchant(merchant));
});

router.patch("/merchants/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMerchantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, ...rest } = parsed.data as typeof parsed.data & { username?: string };

  // Validate username format if provided
  if (username !== undefined) {
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({ error: "Invalid username format. Use 3–30 lowercase letters, numbers, and hyphens (must start and end with a letter or number)." });
      return;
    }

    // Check uniqueness (excluding self)
    const [existing] = await db
      .select({ id: merchantsTable.id })
      .from(merchantsTable)
      .where(and(eq(merchantsTable.username, username), ne(merchantsTable.id, req.session.merchantId!)));

    if (existing) {
      res.status(409).json({ error: "This username is already taken. Please choose another." });
      return;
    }
  }

  const updateData = username !== undefined ? { ...rest, username } : rest;

  const [merchant] = await db
    .update(merchantsTable)
    .set(updateData)
    .where(eq(merchantsTable.id, req.session.merchantId!))
    .returning();

  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }

  res.json(formatMerchant(merchant));
});

export default router;
