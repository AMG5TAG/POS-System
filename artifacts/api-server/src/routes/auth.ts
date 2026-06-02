import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes, createHash } from "crypto";
import { db, merchantsTable, plansTable, subscriptionsTable, productTypesTable, authEventsTable, passwordResetTokensTable, accountHoldTokensTable } from "@workspace/db";
import { eq, desc, and, gt, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/auth";
import { RegisterBody, LoginBody, ChangePasswordBody, ChangeEmailBody, UpdateAuthEventBody, ForgotPasswordBody, ResetPasswordBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { checkAccountLock, recordFailedAttempt, clearFailedAttempts, checkAndApplyAnomalyHold, LOCKOUT_MS } from "../lib/accountLimiter";
import { sendEmail } from "../services/email";


const FAILED_LOGIN_NOTIFY_COOLDOWN_MS = parseInt(
  process.env.LOGIN_NOTIFY_FAILED_COOLDOWN_MS ?? String(5 * 60 * 1000),
  10
);

/**
 * Atomically claims the failed-login notification slot for a merchant.
 * Performs a single conditional UPDATE that only succeeds when no email has
 * been sent within the cooldown window (loginNotifyFailedLastSentAt IS NULL
 * or older than FAILED_LOGIN_NOTIFY_COOLDOWN_MS).  Returns true if the slot
 * was claimed (i.e. an email should be sent), false if still within cooldown.
 * Because this is a single statement, concurrent requests cannot both claim
 * the slot — only one UPDATE wins and gets rows back.
 */
async function claimFailedLoginNotifySlot(merchantId: number): Promise<boolean> {
  const cooldownInterval = sql`make_interval(secs => ${FAILED_LOGIN_NOTIFY_COOLDOWN_MS / 1000})`;
  const result = await db
    .update(merchantsTable)
    .set({ loginNotifyFailedLastSentAt: new Date() })
    .where(
      and(
        eq(merchantsTable.id, merchantId),
        sql`(${merchantsTable.loginNotifyFailedLastSentAt} IS NULL OR ${merchantsTable.loginNotifyFailedLastSentAt} <= now() - ${cooldownInterval})`
      )
    )
    .returning({ id: merchantsTable.id });
  return result.length > 0;
}

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
    // Guarded by a per-merchant cooldown to prevent inbox flooding.
    if (lockedMerchant?.loginNotifyEmailFailed === "true" && await claimFailedLoginNotifySlot(lockedMerchant.id)) {
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
    // Fire-and-forget failed-login notification email if opted in.
    // Guarded by a per-merchant cooldown to prevent inbox flooding.
    if (merchant.loginNotifyEmailFailed === "true" && await claimFailedLoginNotifySlot(merchant.id)) {
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

          // Generate a single-use, 1-hour token so the merchant can clear the hold without an active session
          const rawToken = randomBytes(32).toString("hex");
          const tokenHash = createHash("sha256").update(rawToken).digest("hex");
          const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

          // Invalidate any existing unused hold-clear tokens for this merchant
          await db
            .update(accountHoldTokensTable)
            .set({ usedAt: new Date() })
            .where(
              and(
                eq(accountHoldTokensTable.merchantId, merchant.id),
                gt(accountHoldTokensTable.expiresAt, new Date())
              )
            );

          await db.insert(accountHoldTokensTable).values({
            merchantId: merchant.id,
            tokenHash,
            expiresAt: tokenExpiresAt,
          });

          const clearUrl = `${getAppBaseUrl()}/api/auth/account-hold/clear?token=${rawToken}`;

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
                <p><strong>If this was you</strong> — you may have mistyped your password from multiple devices. Click the button below to clear the hold immediately. The link expires in 1 hour.</p>
                <p style="margin:24px 0">
                  <a href="${clearUrl}"
                     style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
                    Clear account hold
                  </a>
                </p>
                <p style="color:#999;font-size:12px">If the button doesn't work, copy and paste this URL into your browser:<br>${clearUrl}</p>
                <p><strong>If this wasn't you</strong> — someone may be attempting to access your account. Do not click the link above. We recommend changing your password as soon as possible.</p>
                <p style="color:#666;font-size:14px">You can review recent sign-in activity in <strong>Account → Recent Sign-ins</strong>.</p>
              </div>
            `,
            text: `Unusual sign-in activity detected on your KoaPOS account.\n\nMultiple failed login attempts from different locations have triggered an automatic account hold.\n\nIP: ${ip ?? "Unknown"}\nLock duration: ${holdHours} hours\n\nIf this was you, clear the hold immediately using this link (expires in 1 hour):\n${clearUrl}\n\nIf this wasn't you, do NOT click the link above and change your password immediately.`,
          });
        }
      } catch (_err) {
        // Non-blocking — do not fail the login response
      }
    })();
    // When a standard lockout is first triggered, schedule a delayed email to notify
    // the merchant exactly when the cooldown expires so they know they can try again.
    if (attemptsRemaining === 0) {
      const lockedMerchantId = merchant.id;
      const lockedMerchantEmail = merchant.email;
      const lockedMerchantTimezone = merchant.timezone ?? "Australia/Sydney";
      const loginUrl = `${getAppBaseUrl()}/login`;
      setTimeout(() => {
        const unlockTime = new Date().toLocaleString("en-AU", {
          timeZone: lockedMerchantTimezone,
          dateStyle: "full",
          timeStyle: "short",
        });
        void sendEmail(lockedMerchantId, {
          to: lockedMerchantEmail,
          subject: "Your KoaPOS account is now unlocked",
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
              <h2 style="margin-top:0;color:#16a34a">Your account is unlocked</h2>
              <p>The temporary lock on your KoaPOS account has expired. You can now sign in again.</p>
              <table style="border-collapse:collapse;width:100%;margin:16px 0">
                <tr>
                  <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;width:40%">Unlocked at</td>
                  <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${unlockTime}</td>
                </tr>
              </table>
              <p style="margin:24px 0">
                <a href="${loginUrl}"
                   style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
                  Sign in to KoaPOS
                </a>
              </p>
              <p style="color:#999;font-size:12px">If the button doesn't work, copy and paste this URL into your browser:<br>${loginUrl}</p>
              <p style="color:#666;font-size:14px">
                If you didn't request any sign-ins and don't recognise this activity, we recommend changing your password after you log in and reviewing recent sign-in events in <strong>Account → Recent Sign-ins</strong>.
              </p>
            </div>
          `,
          text: `Your KoaPOS account is now unlocked.\n\nThe temporary lock has expired and you can sign in again.\n\nUnlocked at: ${unlockTime}\n\nSign in here: ${loginUrl}\n\nIf you don't recognise recent sign-in attempts, change your password after logging in.`,
        }).catch(() => {
          // Non-blocking — suppress errors from the delayed notification
        });
      }, LOCKOUT_MS);
    }
    res.status(401).json({ error: "Invalid email or password", attemptsRemaining });
    return;
  }

  await clearFailedAttempts(email);

  // Check if this IP has been seen before for this merchant (only when an IP is present)
  let isNewIp = false;
  if (ip) {
    const [existingIpEvent] = await db
      .select({ id: authEventsTable.id })
      .from(authEventsTable)
      .where(
        and(
          eq(authEventsTable.merchantId, merchant.id),
          eq(authEventsTable.ipAddress, ip),
          eq(authEventsTable.outcome, "success")
        )
      )
      .limit(1);
    isNewIp = !existingIpEvent;
  }

  const [insertedEvent] = await db
    .insert(authEventsTable)
    .values({
      merchantId: merchant.id,
      ipAddress: ip,
      userAgent: ua,
      outcome: "success",
      ...(isNewIp ? { status: "flagged", flagReason: "new_ip" } : {}),
    })
    .returning();

  const loginTime = new Date().toLocaleString("en-AU", {
    timeZone: merchant.timezone ?? "Australia/Sydney",
    dateStyle: "full",
    timeStyle: "short",
  });
  const browserLabel = ua ? parseUserAgent(ua) : "Unknown browser";
  const ipLabel = ip ?? "Unknown";

  // Auto-flag alert: fire when a new IP is detected; email is gated on merchant preference
  if (isNewIp && merchant.loginNotifyEmailNewLocation !== "false") {
    void sendEmail(merchant.id, {
      to: merchant.email,
      subject: "⚠️ Sign-in from a new location on your KoaPOS account",
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
          <h2 style="margin-top:0;color:#d97706">Sign-in from a new location</h2>
          <p>Your KoaPOS account was signed in to from an IP address that has not been used before.</p>
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
          <p><strong>If this was you</strong> — you can dismiss this alert in <strong>Account → Recent Sign-ins</strong>.</p>
          <p><strong>If this wasn't you</strong> — change your password immediately and review your recent sign-in activity.</p>
          <p style="color:#666;font-size:14px">
            To review recent sign-in events, go to <strong>Account → Recent Sign-ins</strong> in KoaPOS.
          </p>
        </div>
      `,
      text: `Sign-in from a new location on your KoaPOS account.\n\nTime: ${loginTime}\nIP: ${ipLabel}\nBrowser: ${browserLabel}\n\nIf this was you, you can dismiss the alert in Account → Recent Sign-ins.\nIf this wasn't you, change your password immediately.`,
    });
  }

  // Regular login notification email (opted-in, shown for all successful logins)
  if (merchant.loginNotifyEmail === "true") {
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

  void insertedEvent;

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
      flagReason: e.flagReason ?? null,
      createdAt: e.createdAt.toISOString(),
    }))
  );
});

router.get("/auth/events/flagged-count", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select({ id: authEventsTable.id })
    .from(authEventsTable)
    .where(and(eq(authEventsTable.merchantId, merchantId), eq(authEventsTable.status, "flagged")));
  res.json({ count: rows.length });
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
    .set({
      status: parsed.data.status,
      ...(parsed.data.status === "flagged" ? { flagReason: "manual" } : parsed.data.status === "new" || parsed.data.status === "acknowledged" ? { flagReason: null } : {}),
    })
    .where(and(eq(authEventsTable.id, eventId), eq(authEventsTable.merchantId, merchantId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  // Send suspicious sign-in alert when an event is flagged and the merchant has login notifications enabled
  if (parsed.data.status === "flagged") {
    void (async () => {
      try {
        const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
        if (merchant?.securityAlertEmail === "true") {
          const eventTime = updated.createdAt.toLocaleString("en-AU", {
            timeZone: merchant.timezone ?? "Australia/Sydney",
            dateStyle: "full",
            timeStyle: "short",
          });
          const browserLabel = updated.userAgent ? parseUserAgent(updated.userAgent) : "Unknown browser";
          const ipLabel = updated.ipAddress ?? "Unknown";
          await sendEmail(merchantId, {
            to: merchant.email,
            subject: "⚠️ Suspicious sign-in flagged on your KoaPOS account",
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
                <h2 style="margin-top:0;color:#dc2626">Suspicious sign-in flagged</h2>
                <p>You (or a team member) flagged a sign-in on your KoaPOS account as suspicious.</p>
                <table style="border-collapse:collapse;width:100%;margin:16px 0">
                  <tr>
                    <td style="padding:8px 12px;background:#f4f4f5;font-weight:600;width:40%">Time</td>
                    <td style="padding:8px 12px;border-top:1px solid #e4e4e7">${eventTime}</td>
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
                <p><strong>If this sign-in was not you</strong>, we strongly recommend changing your password immediately to secure your account.</p>
                <p style="color:#666;font-size:14px">You can review all recent sign-in activity in <strong>Account → Recent Sign-ins</strong>.</p>
                <p style="color:#666;font-size:14px">To stop receiving these emails, turn off <strong>Login email notifications</strong> in your Account settings.</p>
              </div>
            `,
            text: `Suspicious sign-in flagged on your KoaPOS account.\n\nTime: ${eventTime}\nIP: ${ipLabel}\nBrowser: ${browserLabel}\n\nIf this sign-in was not you, change your password immediately.\n\nReview recent sign-ins in Account → Recent Sign-ins.`,
          });
        }
      } catch (_err) {
        // Non-blocking — do not fail the flag response
      }
    })();
  }

  res.json({
    id: updated.id,
    merchantId: updated.merchantId,
    ipAddress: updated.ipAddress,
    userAgent: updated.userAgent,
    outcome: updated.outcome,
    status: updated.status,
    flagReason: updated.flagReason ?? null,
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
  }).then((result) => {
    if (!result.success) {
      req.log.warn({ provider: result.provider, error: result.error }, "Password reset email delivery failed — configure SYSTEM_SMTP_* or SYSTEM_RESEND_API_KEY env vars, or set up email in Management → Email");
    }
  }).catch((err: unknown) => {
    req.log.error({ err }, "Password reset email threw unexpectedly");
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

  // Update password, clear account lock, delete the used token — all atomically
  await db.transaction(async (tx) => {
    await tx
      .update(merchantsTable)
      .set({ passwordHash })
      .where(eq(merchantsTable.id, record.merchantId));

    await tx
      .delete(passwordResetTokensTable)
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

  if (merchant.passwordChangeAlertEmail === "true") {
    const changeTime = new Date().toLocaleString("en-AU", { timeZone: merchant.timezone ?? "Australia/Sydney", hour12: true });
    void sendEmail(merchant.id, {
      to: merchant.email,
      subject: "Your KoaPOS password was changed",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="margin-top:0">Password changed</h2>
          <p>The password for your KoaPOS account (<strong>${merchant.email}</strong>) was just changed.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr><td style="padding:6px 12px;font-weight:600;width:120px">Time</td><td style="padding:6px 12px">${changeTime}</td></tr>
          </table>
          <p><strong>If this was you</strong> — no action is needed.</p>
          <p><strong>If this wasn't you</strong> — someone may have access to your account. Use "Forgot password" on the login page to regain control immediately and review your recent sign-in activity in <strong>Account → Recent Sign-ins</strong>.</p>
          <p style="color:#666;font-size:13px">You can turn off these alerts in <strong>Account Settings → Login Email Notifications</strong>.</p>
        </div>
      `,
      text: `Your KoaPOS password was changed\n\nThe password for ${merchant.email} was just changed.\n\nTime: ${changeTime}\n\nIf this was you, no action is needed.\n\nIf this wasn't you, use "Forgot password" on the login page to regain control immediately and review recent sign-ins in Account → Recent Sign-ins.`,
    });
  }

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

/**
 * GET /auth/account-hold/clear?token=<raw-token>
 *
 * No active session required. Validates the single-use token issued when an
 * anomaly hold was applied, clears the hold, and logs a `hold_cleared_via_email`
 * auth event. The browser is redirected to the login page with a success flag
 * so the merchant can sign in immediately.
 */
const holdClearLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many requests — please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip ?? "";
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  },
});

router.get("/auth/account-hold/clear", holdClearLimiter, async (req, res): Promise<void> => {
  const rawToken = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!rawToken) {
    res.status(400).json({ error: "Missing token." });
    return;
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const [record] = await db
    .select()
    .from(accountHoldTokensTable)
    .where(eq(accountHoldTokensTable.tokenHash, tokenHash));

  if (!record) {
    res.status(400).json({ error: "This link is invalid or has already expired." });
    return;
  }

  if (record.usedAt) {
    res.status(400).json({ error: "This link has already been used." });
    return;
  }

  if (record.expiresAt < new Date()) {
    res.status(400).json({ error: "This link has expired. Please contact support or wait for the hold to lift." });
    return;
  }

  const [merchant] = await db
    .select({ id: merchantsTable.id, email: merchantsTable.email })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, record.merchantId));

  if (!merchant) {
    res.status(400).json({ error: "Account not found." });
    return;
  }

  // Mark token as used and clear the hold atomically
  await db.transaction(async (tx) => {
    await tx
      .update(accountHoldTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(accountHoldTokensTable.id, record.id));

    await tx.execute(
      sql`UPDATE login_attempts
          SET account_hold_until = NULL, updated_at = NOW()
          WHERE email = ${merchant.email.trim().toLowerCase()}`
    );
  });

  // Log the hold-cleared event
  const ip = req.ip ?? undefined;
  const ua = req.headers["user-agent"] ?? undefined;
  await db.insert(authEventsTable).values({
    merchantId: merchant.id,
    ipAddress: ip,
    userAgent: ua,
    outcome: "hold_cleared_via_email",
  });

  // Redirect to the login page with a query flag the UI can use to show a confirmation
  const loginUrl = `${getAppBaseUrl()}/login?holdCleared=1`;
  res.redirect(302, loginUrl);
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

export default router;
