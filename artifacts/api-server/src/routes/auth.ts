import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db, merchantsTable, plansTable, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/auth";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Too many attempts — please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip ?? "";
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  },
});

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
    createdAt: m.createdAt.toISOString(),
  };
}

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session?.merchantId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [merchant] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.session.merchantId));

  if (!merchant) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(formatMerchant(merchant));
});

router.post("/auth/register", authLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, businessName, ownerName, phone, planId } = parsed.data;

  const [existing] = await db.select().from(merchantsTable).where(eq(merchantsTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [merchant] = await db
    .insert(merchantsTable)
    .values({ email, passwordHash, businessName, ownerName, phone })
    .returning();

  // Get the plan (use planId if provided, else default to Starter = id 1)
  const targetPlanId = planId ?? 1;
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, targetPlanId));
  if (plan) {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);
    await db.insert(subscriptionsTable).values({
      merchantId: merchant.id,
      planId: plan.id,
      status: "active",
      currentPeriodEnd: periodEnd,
    });
  }

  req.session.merchantId = merchant.id;
  res.status(201).json(formatMerchant(merchant));
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.email, email));

  if (!merchant || !(await verifyPassword(password, merchant.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.merchantId = merchant.id;
  res.json(formatMerchant(merchant));
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as Record<string, unknown>;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  const merchantId = req.session.merchantId!;
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  if (!merchant || !(await verifyPassword(currentPassword, merchant.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordHash = await hashPassword(newPassword);
  await db.update(merchantsTable).set({ passwordHash }).where(eq(merchantsTable.id, merchantId));
  res.json({ ok: true });
});


router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

export default router;
