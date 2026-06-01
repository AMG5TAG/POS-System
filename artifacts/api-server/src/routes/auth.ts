import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db, merchantsTable, plansTable, subscriptionsTable, productTypesTable, authEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/auth";
import { RegisterBody, LoginBody, ChangePasswordBody, ChangeEmailBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { checkAccountLock, recordFailedAttempt, clearFailedAttempts } from "../lib/accountLimiter";


const DEFAULT_PRODUCT_TYPES: Array<{ name: string; slug: string; sortOrder: number }> = [
  { name: "Standard", slug: "standard", sortOrder: 0 },
  { name: "3D Print",  slug: "3d_print", sortOrder: 1 },
  { name: "Bundle",    slug: "bundle",   sortOrder: 2 },
];

async function seedProductTypes(merchantId: number): Promise<void> {
  await db.insert(productTypesTable).values(
    DEFAULT_PRODUCT_TYPES.map((t) => ({
      merchantId,
      name: t.name,
      slug: t.slug,
      sortOrder: t.sortOrder,
    }))
  );
}

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

function formatMerchant(m: typeof merchantsTable.$inferSelect, staffRole: "owner" | "manager" | "cashier" = "owner") {
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
    staffRole,
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

  res.json(formatMerchant(merchant, req.session.staffRole ?? "owner"));
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

  await seedProductTypes(merchant.id);

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.merchantId = merchant.id;
  req.session.staffRole = "owner";
  res.status(201).json(formatMerchant(merchant, "owner"));
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const ip = req.ip ?? undefined;
  const ua = req.headers["user-agent"] ?? undefined;

  const lockStatus = await checkAccountLock(email);
  if (lockStatus.locked && lockStatus.retryAfter) {
    const retryAfterSecs = Math.ceil((lockStatus.retryAfter.getTime() - Date.now()) / 1000);
    res.setHeader("Retry-After", String(retryAfterSecs));
    // Look up the merchant to attach merchantId to the lockout event if possible
    const [lockedMerchant] = await db.select({ id: merchantsTable.id }).from(merchantsTable).where(eq(merchantsTable.email, email));
    await db.insert(authEventsTable).values({ merchantId: lockedMerchant?.id ?? null, ipAddress: ip, userAgent: ua, outcome: "locked" });
    res.status(429).json({
      error: `Account temporarily locked due to too many failed login attempts. Please try again in ${Math.ceil(retryAfterSecs / 60)} minute(s).`,
    });
    return;
  }

  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.email, email));

  if (!merchant) {
    await recordFailedAttempt(email);
    await db.insert(authEventsTable).values({ merchantId: null, ipAddress: ip, userAgent: ua, outcome: "not_found" });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!(await verifyPassword(password, merchant.passwordHash))) {
    await recordFailedAttempt(email);
    await db.insert(authEventsTable).values({ merchantId: merchant.id, ipAddress: ip, userAgent: ua, outcome: "bad_password" });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  await clearFailedAttempts(email);
  await db.insert(authEventsTable).values({ merchantId: merchant.id, ipAddress: ip, userAgent: ua, outcome: "success" });

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.merchantId = merchant.id;
  req.session.staffRole = "owner";
  res.json(formatMerchant(merchant, "owner"));
});

router.get("/auth/events", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const events = await db
    .select()
    .from(authEventsTable)
    .where(eq(authEventsTable.merchantId, merchantId))
    .orderBy(desc(authEventsTable.createdAt))
    .limit(50);

  res.json(
    events.map((e) => ({
      id: e.id,
      merchantId: e.merchantId,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      outcome: e.outcome,
      createdAt: e.createdAt.toISOString(),
    }))
  );
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;
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


router.post("/auth/change-email", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangeEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { currentPassword, newEmail: rawEmail } = parsed.data;
  const trimmedEmail = rawEmail.trim().toLowerCase();
  const merchantId = req.session.merchantId!;
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  if (!merchant || !(await verifyPassword(currentPassword, merchant.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  // Check email not already in use
  const [existing] = await db.select().from(merchantsTable).where(eq(merchantsTable.email, trimmedEmail));
  if (existing && existing.id !== merchantId) {
    res.status(409).json({ error: "That email address is already in use" });
    return;
  }
  await db.update(merchantsTable).set({ email: trimmedEmail }).where(eq(merchantsTable.id, merchantId));
  res.json({ ok: true });
});

router.get("/auth/account-lock", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [merchant] = await db.select({ email: merchantsTable.email }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  if (!merchant) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const status = await checkAccountLock(merchant.email);
  res.json({
    locked: status.locked,
    retryAfter: status.retryAfter ? status.retryAfter.toISOString() : null,
  });
});

router.delete("/auth/account-lock", requireAuth, async (req, res): Promise<void> => {
  if (req.session.staffRole !== "owner") {
    res.status(403).json({ error: "Forbidden: only the account owner can unlock the account" });
    return;
  }
  const { currentPassword } = req.body as { currentPassword?: unknown };
  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    res.status(400).json({ error: "currentPassword is required" });
    return;
  }
  const merchantId = req.session.merchantId!;
  const [merchant] = await db
    .select({ email: merchantsTable.email, passwordHash: merchantsTable.passwordHash })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  if (!merchant) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await verifyPassword(currentPassword, merchant.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  await clearFailedAttempts(merchant.email);
  res.json({ ok: true });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

export default router;
