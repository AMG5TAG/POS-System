import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes, createHash } from "crypto";
import { db, merchantsTable, plansTable, subscriptionsTable, productTypesTable, authEventsTable, passwordResetTokensTable } from "@workspace/db";
import { eq, desc, and, gt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/auth";
import { RegisterBody, LoginBody, ChangePasswordBody, ChangeEmailBody, UpdateAuthEventBody, ForgotPasswordBody, ResetPasswordBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { checkAccountLock, recordFailedAttempt, clearFailedAttempts, checkAndApplyAnomalyHold } from "../lib/accountLimiter";
import { sendEmail } from "../services/email";


function parseUserAgent(ua: string): string {
  if (/Chrome\//.test(ua) && !/Chromium|Edg\/|OPR\//.test(ua)) return "Chrome";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
  if (/OPR\//.test(ua)) return "Opera";
  return "Browser";
}

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
    const [lockedMerchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.email, email));
    await db.insert(authEventsTable).values({ merchantId: lockedMerchant?.id ?? null, ipAddress: ip, userAgent: ua, outcome: "locked" });
    // Fire-and-forget failed-login notification for "tried while locked" events
    if (lockedMerchant?.loginNotifyEmailFailed === "true") {
      const failTime = new Date().toLocaleString("en-AU", {
        timeZone: lockedMerchant.timezone ?? "Australia/Sydney",
        dateStyle: "full",
        timeStyle: "short",
      });
      const browserLabel = ua ? parseUserAgent(ua) : "Unknown browser";
      const ipLabel = ip ?? "Unknown";
      void sendEmail(lockedMerchant.id, {
        to: lockedMerchant.email,
        subject: "Sign-in attempt on your locked KoaPOS account",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
            <h2 style="margin-top:0;color:#dc2626">Sign-in attempt while account is locked</h2>
            <p>Someone tried to sign in to your KoaPOS account while it is temporarily locked.</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0">
              <tr>
                <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;width:40%">Time</td>
                <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${failTime}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f4f4f5;font-weight:600">IP address</td>
                <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${ipLabel}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f4f4f5;font-weight:600">Browser</td>
                <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${browserLabel}</td>
              </tr>
            </table>
            <p style="color:#666;font-size:14px">
              If this was you, you can safely ignore this email. If this wasn't you, we recommend changing your password once you regain access and reviewing your recent sign-in activity in <strong>Account → Recent Sign-ins</strong>.
            </p>
            <p style="color:#666;font-size:14px">
              To stop receiving these emails, turn off <strong>Failed login attempt notifications</strong> in your Account settings.
            </p>
          </div>
        `,
        text: `Sign-in attempt on locked KoaPOS account\n\nTime: ${failTime}\nIP: ${ipLabel}\nBrowser: ${browserLabel}\n\nIf this wasn't you, change your password once you regain access.`,
      });
    }
    const errorMsg = lockStatus.isAnomalyHold
      ? `Account temporarily locked due to suspicious sign-in activity from multiple locations. An email has been sent with instructions. If you have an active session, clear the hold in Account → Account Lock.`
      : `Account temporarily locked due to too many failed login attempts. Please try again in ${Math.ceil(retryAfterSecs / 60)} minute(s).`;
    res.status(429).json({ error: errorMsg, isAnomalyHold: lockStatus.isAnomalyHold ?? false, retryAfter: lockStatus.retryAfter.toISOString() });
    return;
  }

  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.email, email));

  if (!merchant) {
    const { attemptsRemaining } = await recordFailedAttempt(email);
    await db.insert(authEventsTable).values({ merchantId: null, ipAddress: ip, userAgent: ua, outcome: "not_found" });
    res.status(401).json({ error: "Invalid email or password", attemptsRemaining });
    return;
  }

  if (!(await verifyPassword(password, merchant.passwordHash))) {
    const { attemptsRemaining } = await recordFailedAttempt(email);
    await db.insert(authEventsTable).values({ merchantId: merchant.id, ipAddress: ip, userAgent: ua, outcome: "bad_password" });
    // Fire-and-forget failed-login notification email if opted in
    if (merchant.loginNotifyEmailFailed === "true") {
      const failTime = new Date().toLocaleString("en-AU", {
        timeZone: merchant.timezone ?? "Australia/Sydney",
        dateStyle: "full",
        timeStyle: "short",
      });
      const browserLabel = ua ? parseUserAgent(ua) : "Unknown browser";
      const ipLabel = ip ?? "Unknown";
      void sendEmail(merchant.id, {
        to: merchant.email,
        subject: "Failed sign-in attempt on your KoaPOS account",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
            <h2 style="margin-top:0;color:#dc2626">Failed sign-in attempt detected</h2>
            <p>Someone tried to sign in to your KoaPOS account with an incorrect password.</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0">
              <tr>
                <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;width:40%">Time</td>
                <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${failTime}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f4f4f5;font-weight:600">IP address</td>
                <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${ipLabel}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f4f4f5;font-weight:600">Browser</td>
                <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${browserLabel}</td>
              </tr>
            </table>
            <p style="color:#666;font-size:14px">
              If this was you, you can safely ignore this email. If this wasn't you, we recommend changing your password immediately and reviewing your recent sign-in activity in <strong>Account → Recent Sign-ins</strong>.
            </p>
            <p style="color:#666;font-size:14px">
              To stop receiving these emails, turn off <strong>Failed login attempt notifications</strong> in your Account settings.
            </p>
          </div>
        `,
        text: `Failed sign-in attempt on KoaPOS\n\nTime: ${failTime}\nIP: ${ipLabel}\nBrowser: ${browserLabel}\n\nIf this wasn't you, change your password immediately.`,
      });
    }
    // Check for multi-IP anomaly — fire-and-forget hold + email if threshold exceeded
    void (async () => {
      try {
        const holdTriggered = await checkAndApplyAnomalyHold(email, merchant.id);
        if (holdTriggered) {
          await db.insert(authEventsTable).values({ merchantId: merchant.id, ipAddress: ip, userAgent: ua, outcome: "account_hold" });
          const holdHours = parseInt(process.env.LOGIN_ANOMALY_HOLD_HOURS ?? "24", 10);
          void sendEmail(merchant.id, {
            to: merchant.email,
            subject: "Your KoaPOS account has been locked due to suspicious activity",
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
                <h2 style="margin-top:0;color:#dc2626">Unusual sign-in activity detected</h2>
                <p>We detected multiple failed login attempts to your KoaPOS account from different locations and have temporarily locked your account as a precaution.</p>
                <table style="border-collapse:collapse;width:100%;margin:16px 0">
                  <tr>
                    <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;width:40%">IP address</td>
                    <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${ip ?? "Unknown"}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 12px;background:#f4f4f5;font-weight:600">Lock duration</td>
                    <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${holdHours} hours (or until manually cleared)</td>
                  </tr>
                </table>
                <p><strong>If this was you</strong> — you may have mistyped your password from multiple devices. Sign in to KoaPOS and go to <strong>Account → Account Lock</strong> to confirm your identity and clear the hold.</p>
                <p><strong>If this wasn't you</strong> — someone may be attempting to access your account. We recommend changing your password as soon as possible.</p>
                <p style="color:#666;font-size:14px">You can review recent sign-in activity in <strong>Account → Recent Sign-ins</strong>.</p>
              </div>
            `,
            text: `Unusual sign-in activity detected on your KoaPOS account.\n\nMultiple failed login attempts from different locations have triggered an automatic account hold.\n\nIP: ${ip ?? "Unknown"}\nLock duration: ${holdHours} hours\n\nIf this was you, sign in to KoaPOS and go to Account > Account Lock to clear the hold.\nIf this wasn't you, change your password immediately.`,
          });
        }
      } catch (_err) {
        // Non-blocking — do not fail the login response
      }
    })();
    res.status(401).json({ error: "Invalid email or password", attemptsRemaining });
    return;
  }

  await clearFailedAttempts(email);
  await db.insert(authEventsTable).values({ merchantId: merchant.id, ipAddress: ip, userAgent: ua, outcome: "success" });

  // Fire-and-forget login notification email (does not block the response)
  if (merchant.loginNotifyEmail === "true") {
    const loginTime = new Date().toLocaleString("en-AU", {
      timeZone: merchant.timezone ?? "Australia/Sydney",
      dateStyle: "full",
      timeStyle: "short",
    });
    const browserLabel = ua ? parseUserAgent(ua) : "Unknown browser";
    const ipLabel = ip ?? "Unknown";
    void sendEmail(merchant.id, {
      to: merchant.email,
      subject: "New sign-in to your KoaPOS account",
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
          <h2 style="margin-top:0">New sign-in detected</h2>
          <p>Someone (hopefully you) just signed in to your KoaPOS account.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr>
              <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;width:40%">Time</td>
              <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${loginTime}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f4f5;font-weight:600">IP address</td>
              <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${ipLabel}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f4f5;font-weight:600">Browser</td>
              <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${browserLabel}</td>
            </tr>
          </table>
          <p style="color:#666;font-size:14px">
            If this wasn't you, change your password immediately and check your recent sign-ins in
            <strong>Account → Recent Sign-ins</strong>.
          </p>
          <p style="color:#666;font-size:14px">
            To stop receiving these emails, turn off <strong>Login email notifications</strong> in your Account settings.
          </p>
        </div>
      `,
      text: `New sign-in to KoaPOS\n\nTime: ${loginTime}\nIP: ${ipLabel}\nBrowser: ${browserLabel}\n\nIf this wasn't you, change your password immediately.`,
    });
  }

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
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    }))
  );
});

router.get("/auth/events/unread-count", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [merchant] = await db
    .select({ lastAuthEventsViewedAt: merchantsTable.lastAuthEventsViewedAt })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));

  const since = merchant?.lastAuthEventsViewedAt;

  const whereClause = since
    ? and(eq(authEventsTable.merchantId, merchantId), gt(authEventsTable.createdAt, since))
    : eq(authEventsTable.merchantId, merchantId);

  const rows = await db
    .select({ id: authEventsTable.id })
    .from(authEventsTable)
    .where(whereClause);

  res.json({ count: rows.length });
});

router.post("/auth/events/mark-read", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  await db
    .update(merchantsTable)
    .set({ lastAuthEventsViewedAt: new Date() })
    .where(eq(merchantsTable.id, merchantId));
  res.json({ ok: true });
});

router.patch("/auth/events/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const eventId = parseInt(String(req.params.id), 10);
  if (isNaN(eventId)) {
    res.status(400).json({ error: "Invalid event id" });
    return;
  }

  const parsed = UpdateAuthEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(authEventsTable)
    .set({ status: parsed.data.status })
    .where(and(eq(authEventsTable.id, eventId), eq(authEventsTable.merchantId, merchantId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.json({
    id: updated.id,
    merchantId: updated.merchantId,
    ipAddress: updated.ipAddress,
    userAgent: updated.userAgent,
    outcome: updated.outcome,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many reset attempts — please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip ?? "";
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  },
});

/**
 * Returns the trusted public origin for this app (used in password-reset links).
 *
 * Priority:
 *   1. APP_BASE_URL — operator-configured, most explicit (e.g. "https://my.koapos.com")
 *   2. REPLIT_DOMAINS — set by Replit infrastructure, not by inbound requests
 *
 * Request headers (Host, X-Forwarded-Host, etc.) are intentionally NOT used
 * because they are attacker-controlled and can be poisoned to redirect reset
 * links to an attacker-owned domain.
 *
 * In development neither var may be set; we fall back to localhost so local
 * testing still works — but we never use request headers even then.
 */
function getAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const first = replitDomains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }

  // Development fallback — never used in production (REPLIT_DOMAINS is always set there)
  return "http://localhost";
}

router.post("/auth/forgot-password", resetPasswordLimiter, async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [merchant] = await db
    .select({ id: merchantsTable.id, email: merchantsTable.email })
    .from(merchantsTable)
    .where(eq(merchantsTable.email, email));

  // Always return 200 to prevent email enumeration
  if (!merchant) {
    res.json({ ok: true });
    return;
  }

  // Generate a cryptographically secure token
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Invalidate any existing unused tokens for this merchant
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokensTable.merchantId, merchant.id),
        gt(passwordResetTokensTable.expiresAt, new Date())
      )
    );

  await db.insert(passwordResetTokensTable).values({
    merchantId: merchant.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = `${getAppBaseUrl()}/reset-password?token=${rawToken}`;

  void sendEmail(merchant.id, {
    to: merchant.email,
    subject: "Reset your KoaPOS password",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="margin-top:0">Reset your password</h2>
        <p>We received a request to reset the password for your KoaPOS account. Click the button below to choose a new password.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
            Reset password
          </a>
        </p>
        <p style="color:#666;font-size:14px">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your account remains secure.</p>
        <p style="color:#999;font-size:12px">If the button doesn't work, copy and paste this URL into your browser:<br>${resetUrl}</p>
      </div>
    `,
    text: `Reset your KoaPOS password\n\nClick the link below to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request a password reset, ignore this email.`,
  });

  res.json({ ok: true });
});

router.post("/auth/reset-password", resetPasswordLimiter, async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { token: rawToken, newPassword } = parsed.data;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.tokenHash, tokenHash));

  if (!record) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    return;
  }

  if (record.usedAt) {
    res.status(400).json({ error: "This reset link has already been used. Please request a new one." });
    return;
  }

  if (record.expiresAt < new Date()) {
    res.status(400).json({ error: "This reset link has expired. Please request a new one." });
    return;
  }

  const [merchant] = await db
    .select({ email: merchantsTable.email })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, record.merchantId));

  if (!merchant) {
    res.status(400).json({ error: "Account not found." });
    return;
  }

  const passwordHash = await hashPassword(newPassword);

  // Update password, clear account lock, mark token as used — all atomically
  await db.transaction(async (tx) => {
    await tx
      .update(merchantsTable)
      .set({ passwordHash })
      .where(eq(merchantsTable.id, record.merchantId));

    await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, record.id));
  });

  // Clear account lockout so the merchant can sign in immediately
  await clearFailedAttempts(merchant.email);

  res.json({ ok: true });
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
    isAnomalyHold: status.isAnomalyHold ?? false,
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
