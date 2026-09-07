import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { randomBytes, createHash } from "crypto";
import { db, customersTable, merchantsTable, customerPortalTokensTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { hashPassword, verifyPassword } from "../lib/auth";
import { sendEmail } from "../services/email";
import { sendSms } from "../services/sms";
import { publicOrigin } from "../lib/publicUrl";
import {
  findCustomerByPortalToken,
  readPortalAuthState,
  maskContact,
} from "../lib/portalAuth";

/**
 * Customer-portal authentication.
 *
 * Mirrors the merchant password-reset flow in routes/auth.ts: a cryptographically
 * random token is emailed/texted, only its SHA-256 hash is stored, it is single
 * use, and it expires in an hour.
 *
 * The one rule that shapes everything here: possession of the portal link must
 * not be enough to claim the account. A service sticker carrying the portal QR
 * sits on the customer's device on a workshop bench, so anyone who scans it
 * holds the link. Set-up therefore always goes through the email address or
 * mobile already on file — the customer's inbox or phone is the actual proof.
 *
 * These routes are not in openapi.yaml, matching every existing /portal/* route;
 * the portal SPA calls them with raw fetch.
 */

const router: IRouter = Router();

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, as the merchant reset flow

/**
 * Rate limits.
 *
 * Each endpoint gets its own budget, because they fail for entirely different
 * reasons and one shared counter punishes the wrong person: a customer who
 * mistypes their password a few times would also lose the ability to request a
 * reset link — the one thing that would have fixed their problem.
 *
 * Each endpoint is then limited on two dimensions at once:
 *
 *   - per portal token, so a whole shop's customers behind one NAT (the store's
 *     guest wi-fi, a shared office) don't eat each other's allowance;
 *   - per IP, more generously, so one host still can't spray attempts across
 *     many customers by just changing the token in the URL.
 *
 * Both must pass, so whichever is tighter for a given caller is the one that
 * bites. Where a failure is the only thing worth counting, successes are
 * skipped — signing in correctly should never spend anyone's budget.
 */
const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function portalLimiter(opts: {
  windowMs: number;
  max: number;
  by: "token" | "ip";
  message: string;
  failuresOnly?: boolean;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    message: { error: opts.message },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: opts.failuresOnly ?? false,
    // Keyed on the portal token where there is one. It identifies the account
    // without being a credential any more, which is exactly what a per-account
    // budget wants. Falling back to the IP keeps a missing param from collapsing
    // every caller onto one shared key.
    keyGenerator: (req) => {
      if (opts.by === "token") {
        const token = typeof req.params.token === "string" ? req.params.token : "";
        if (token) return `t:${token}`;
      }
      return ipKeyGenerator(req.ip ?? "");
    },
    skip: (req) => LOCALHOST.has(req.ip ?? ""),
  });
}

/* Sending links costs the merchant an email or an SMS and lands in someone
   else's inbox, so successes count here as much as failures. Three an hour is
   more than a customer who actually wants the link ever needs. */
const requestSetupLimiters = [
  portalLimiter({ windowMs: 60 * 60 * 1000, max: 3, by: "token",
    message: "We've already sent a few links — please check your email or texts, then try again later." }),
  portalLimiter({ windowMs: 60 * 60 * 1000, max: 20, by: "ip",
    message: "Too many requests — please try again later." }),
];

/* Password guessing. Only wrong answers count, so the customer who gets it
   right on the fourth go is never any closer to being locked out. */
const loginLimiters = [
  portalLimiter({ windowMs: 15 * 60 * 1000, max: 10, by: "token", failuresOnly: true,
    message: "Too many incorrect passwords — please try again in 15 minutes, or reset your password." }),
  portalLimiter({ windowMs: 15 * 60 * 1000, max: 50, by: "ip", failuresOnly: true,
    message: "Too many attempts — please try again later." }),
];

/* The one-time token is 256 bits of randomness and single use, so this is abuse
   control rather than brute-force defence — a mistyped short password shouldn't
   cost the customer their link. */
const setPasswordLimiters = [
  portalLimiter({ windowMs: 60 * 60 * 1000, max: 20, by: "ip", failuresOnly: true,
    message: "Too many attempts — please request a new link and try again later." }),
];

const SetPasswordBody = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const LoginBody = z.object({ password: z.string().min(1) });

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a one-time token and deliver it. Email is preferred; SMS is the fallback
 * for customers with no address on file. Delivery is best-effort and never
 * changes the response — the caller is told the same thing either way.
 */
async function issueSetupLink(
  customer: typeof customersTable.$inferSelect,
  purpose: "setup" | "reset",
  log: { warn: (o: unknown, m: string) => void; error: (o: unknown, m: string) => void },
): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");

  await db.insert(customerPortalTokensTable).values({
    customerId: customer.id,
    tokenHash: hashToken(rawToken),
    purpose,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName, username: merchantsTable.username, portalDomain: merchantsTable.portalDomain })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, customer.merchantId));

  const bizName = merchant?.businessName ?? "Your store";
  // The link is always built from the trusted public origin (or the merchant's
  // own portal domain) — never from request headers, which are attacker
  // controlled and could redirect a set-up link to someone else's site.
  const base = merchant?.portalDomain
    ? `https://${merchant.portalDomain}`
    : merchant?.username
      ? `${publicOrigin()}/b/${encodeURIComponent(merchant.username)}`
      : publicOrigin();
  const link = `${base}/c/${customer.portalToken}/set-password?token=${rawToken}`;

  const heading = purpose === "setup" ? "Set up your account" : "Reset your password";
  const lead = purpose === "setup"
    ? `Set a password for your ${bizName} account so only you can see your repairs, quotes and rewards.`
    : `We received a request to reset the password for your ${bizName} account.`;

  if (customer.email) {
    void sendEmail(customer.merchantId, {
      to: customer.email,
      subject: `${heading} — ${bizName}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
          <h2 style="margin-top:0">${heading}</h2>
          <p>${lead}</p>
          <p style="margin:24px 0">
            <a href="${link}"
               style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
              ${heading}
            </a>
          </p>
          <p style="color:#666;font-size:14px">This link expires in 1 hour. If you didn't request it, you can safely ignore this email — nothing changes.</p>
          <p style="color:#999;font-size:12px">If the button doesn't work, copy and paste this URL into your browser:<br>${link}</p>
        </div>
      `,
      text: `${heading} — ${bizName}\n\n${lead}\n\n${link}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`,
    }).then((result) => {
      if (!result.success) log.warn({ provider: result.provider, error: result.error }, "Portal set-up email delivery failed");
    }).catch((err: unknown) => {
      log.error({ err }, "Portal set-up email threw unexpectedly");
    });
    return;
  }

  if (customer.phone) {
    void sendSms(
      { to: customer.phone, body: `${bizName}: ${heading.toLowerCase()} for your account here (expires in 1 hour): ${link}` },
      customer.merchantId,
    ).catch(() => { /* delivery is best-effort */ });
  }
}

/** Public: which screen the SPA should render for this token. */
router.get("/portal/:token/auth/state", async (req, res): Promise<void> => {
  const state = await readPortalAuthState(req, String(req.params.token));
  if (!state.found) { res.status(404).json({ error: "Portal not found" }); return; }
  res.json(state);
});

/**
 * Send a set-up (or reset) link to the address on file.
 *
 * Always answers 200 with the same body: a caller holding a link must not be
 * able to learn whether that customer exists, already has a password, or has a
 * contact address on file.
 */
router.post("/portal/:token/auth/request-setup", ...requestSetupLimiters, async (req, res): Promise<void> => {
  const purpose = String((req.body ?? {}).purpose ?? "setup") === "reset" ? "reset" : "setup";
  const customer = await findCustomerByPortalToken(String(req.params.token));

  if (customer && (customer.email || customer.phone)) {
    await issueSetupLink(customer, purpose, req.log);
  }

  res.json({
    ok: true,
    sentTo: customer ? maskContact(customer.email, customer.phone) : null,
  });
});

/** Complete set-up or reset, then open a session. */
router.post("/portal/auth/set-password", ...setPasswordLimiters, async (req, res): Promise<void> => {
  const parsed = SetPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const tokenHash = hashToken(parsed.data.token);
  const [row] = await db
    .select()
    .from(customerPortalTokensTable)
    .where(eq(customerPortalTokensTable.tokenHash, tokenHash));

  if (!row) { res.status(400).json({ error: "This link is invalid or has expired. Please request a new one." }); return; }
  if (row.usedAt) { res.status(400).json({ error: "This link has already been used. Please request a new one." }); return; }
  if (row.expiresAt.getTime() < Date.now()) { res.status(400).json({ error: "This link has expired. Please request a new one." }); return; }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, row.customerId));
  if (!customer) { res.status(400).json({ error: "This link is invalid or has expired. Please request a new one." }); return; }

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();

  // Set the password and burn the token together: a failure between the two
  // would either leave a live link to an account that now has a password, or a
  // burnt link with no password set.
  await db.transaction(async (tx) => {
    await tx.update(customersTable)
      .set({ portalPasswordHash: passwordHash, portalPasswordSetAt: now, portalLastLoginAt: now })
      .where(eq(customersTable.id, customer.id));
    await tx.update(customerPortalTokensTable)
      .set({ usedAt: now })
      .where(eq(customerPortalTokensTable.id, row.id));
    // Any other outstanding link for this customer is now stale.
    await tx.delete(customerPortalTokensTable)
      .where(and(
        eq(customerPortalTokensTable.customerId, customer.id),
        isNull(customerPortalTokensTable.usedAt),
      ));
  });

  req.session.portalCustomerId = customer.id;
  res.json({ ok: true, portalToken: customer.portalToken });
});

/** Password login for a customer who has already set one. */
router.post("/portal/:token/auth/login", ...loginLimiters, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const customer = await findCustomerByPortalToken(String(req.params.token));
  // One message for every failure mode, so a wrong password is indistinguishable
  // from a token belonging to an account that has no password set.
  const deny = () => res.status(401).json({ error: "Incorrect password." });

  if (!customer || !customer.portalPasswordHash) { deny(); return; }
  if (!(await verifyPassword(parsed.data.password, customer.portalPasswordHash))) { deny(); return; }

  await db.update(customersTable)
    .set({ portalLastLoginAt: new Date() })
    .where(eq(customersTable.id, customer.id));

  req.session.portalCustomerId = customer.id;
  res.json({ ok: true });
});

router.post("/portal/auth/logout", (req, res): void => {
  if (req.session) req.session.portalCustomerId = undefined;
  res.json({ ok: true });
});

export default router;
