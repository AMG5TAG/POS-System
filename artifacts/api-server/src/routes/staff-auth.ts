import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes, createHash } from "crypto";
import { db, staffTable, merchantsTable, staffPasswordResetTokensTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod/v4";
import { hashPassword, verifyPassword } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { sendEmail } from "../services/email";
import { publicOrigin } from "../lib/publicUrl";

/**
 * Staff email + password sign-in (the "hybrid" auth model).
 *
 * The PIN remains the primary, fast register login. This adds an OPTIONAL
 * per-staff email + password login so individuals can sign in remotely with
 * their own credentials and reach whatever their role permits. A staff login
 * populates the same session shape as the owner login (merchantId + staffId +
 * staffRole), so all merchant-scoped APIs and the existing role-gated routes
 * work unchanged — just with the staff member's own role.
 */
const router: IRouter = Router();

const role = (r: string): "owner" | "manager" | "cashier" =>
  r === "owner" || r === "manager" ? r : "cashier";

/** Mirror of auth.ts formatMerchant so a staff login returns the same shape the
 *  frontend AuthProvider expects, but carrying the staff member's role. */
function formatMerchant(m: typeof merchantsTable.$inferSelect, staffRole: "owner" | "manager" | "cashier") {
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
    emailVerified: m.emailVerifiedAt !== null,
    onboardingCompleted: m.onboardingCompletedAt !== null,
    isDemoAccount: m.isDemoAccount === "true",
  };
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

const StaffLoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const StaffForgotBody = z.object({ email: z.string().email() });
const StaffResetBody = z.object({ token: z.string().min(1), newPassword: z.string().min(8) });
const StaffEnableBody = z.object({ staffId: z.number().int().positive() });

router.post("/staff-auth/login", loginLimiter, async (req, res): Promise<void> => {
  const parsed = StaffLoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const email = parsed.data.email.trim().toLowerCase();

  // Find active staff with email login enabled. Email isn't globally unique, so
  // verify the password against each candidate and take the first that matches.
  const candidates = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.email, email), eq(staffTable.isActive, "true")));

  let matched: typeof staffTable.$inferSelect | null = null;
  for (const s of candidates) {
    if (s.passwordHash && (await verifyPassword(parsed.data.password, s.passwordHash))) { matched = s; break; }
  }
  if (!matched) { res.status(401).json({ error: "Invalid email or password" }); return; }

  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, matched.merchantId));
  if (!merchant || merchant.status !== "active") {
    res.status(403).json({ error: "This business account is not active. Please contact your manager." });
    return;
  }

  const staffRole = role(matched.role);
  await new Promise<void>((resolve, reject) => { req.session.regenerate((err) => (err ? reject(err) : resolve())); });
  req.session.merchantId = merchant.id;
  req.session.staffId = matched.id;
  req.session.staffRole = staffRole;
  res.json(formatMerchant(merchant, staffRole));
});

/** Issue a set-password / reset token for a staff member and email them a link. */
async function issueStaffResetToken(staffId: number, toEmail: string, intro: string): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db
    .update(staffPasswordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(staffPasswordResetTokensTable.staffId, staffId), gt(staffPasswordResetTokensTable.expiresAt, new Date())));
  await db.insert(staffPasswordResetTokensTable).values({ staffId, tokenHash, expiresAt });

  const url = `${publicOrigin()}/staff-reset-password?token=${rawToken}`;
  const [staff] = await db.select({ merchantId: staffTable.merchantId }).from(staffTable).where(eq(staffTable.id, staffId));
  void sendEmail(staff?.merchantId ?? 0, {
    to: toEmail,
    subject: "Set your KoaPOS staff password",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="margin-top:0">Staff sign-in</h2>
        <p>${intro}</p>
        <p style="margin:24px 0">
          <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Set your password</a>
        </p>
        <p style="color:#666;font-size:14px">This link expires in 1 hour. Your register PIN is unchanged.</p>
        <p style="color:#999;font-size:12px">If the button doesn't work, paste this URL into your browser:<br>${url}</p>
      </div>`,
    text: `${intro}\n\nSet your password (expires in 1 hour):\n${url}\n\nYour register PIN is unchanged.`,
  }).catch(() => { /* delivery failures are logged by the email service */ });
}

/** Owner/manager enables email login for a staff member (sends a setup invite). */
router.post("/staff-auth/enable", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = StaffEnableBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const merchantId = req.session.merchantId!;
  const [staff] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, parsed.data.staffId), eq(staffTable.merchantId, merchantId)));
  if (!staff) { res.status(404).json({ error: "Staff member not found" }); return; }
  if (!staff.email) { res.status(400).json({ error: "This staff member has no email address. Add one first." }); return; }
  await issueStaffResetToken(staff.id, staff.email.trim().toLowerCase(), "You've been invited to sign in to KoaPOS with your email. Set a password to get started.");
  res.json({ ok: true });
});

/** Staff "forgot password" — always 200 to avoid email enumeration. */
router.post("/staff-auth/forgot-password", resetLimiter, async (req, res): Promise<void> => {
  const parsed = StaffForgotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const email = parsed.data.email.trim().toLowerCase();
  const [staff] = await db
    .select({ id: staffTable.id, email: staffTable.email })
    .from(staffTable)
    .where(and(eq(staffTable.email, email), eq(staffTable.isActive, "true")));
  if (staff?.email && staff.id) {
    await issueStaffResetToken(staff.id, staff.email.trim().toLowerCase(), "We received a request to reset your KoaPOS staff password.");
  }
  res.json({ ok: true });
});

/** Set/reset a staff password from an emailed token. */
router.post("/staff-auth/reset-password", resetLimiter, async (req, res): Promise<void> => {
  const parsed = StaffResetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");

  const [record] = await db.select().from(staffPasswordResetTokensTable).where(eq(staffPasswordResetTokensTable.tokenHash, tokenHash));
  if (!record) { res.status(400).json({ error: "This link is invalid or has expired. Please request a new one." }); return; }
  if (record.usedAt) { res.status(400).json({ error: "This link has already been used. Please request a new one." }); return; }
  if (record.expiresAt < new Date()) { res.status(400).json({ error: "This link has expired. Please request a new one." }); return; }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.transaction(async (tx) => {
    await tx.update(staffTable).set({ passwordHash }).where(eq(staffTable.id, record.staffId));
    await tx.delete(staffPasswordResetTokensTable).where(eq(staffPasswordResetTokensTable.id, record.id));
  });
  res.json({ ok: true });
});

export default router;
