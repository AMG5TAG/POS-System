import { randomBytes, createHash } from "crypto";
import { db, customersTable, merchantsTable, customerPortalTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "../services/email";
import { sendSms } from "../services/sms";
import { publicOrigin, shopOrigin } from "./publicUrl";

/**
 * One-time links that let a customer set or reset their account password.
 *
 * A customer has ONE account, reached from two places: the customer portal
 * (/c/<token> on the POS domain) and the online shop (koastal.com.au/shop). Both
 * store the password in customers.portal_password_hash and both use these
 * links; only where the link lands differs (`destination`).
 *
 * Only the SHA-256 of the token is stored, it is single use and expires in an
 * hour — the merchant reset flow's rules. The address on file is the proof of
 * ownership: a link is only ever sent to the customer's own email (or mobile).
 */

export const TOKEN_TTL_MS = 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type LinkDestination = "portal" | "shop";
export type LinkPurpose = "setup" | "reset" | "invite";

/**
 * Mint a one-time token and deliver it. Email is preferred; SMS is the fallback
 * for customers with no address on file. Delivery is best-effort and never
 * changes the response — the caller is told the same thing either way.
 */
export async function issueSetupLink(
  customer: typeof customersTable.$inferSelect,
  purpose: LinkPurpose,
  log: { warn: (o: unknown, m: string) => void; error: (o: unknown, m: string) => void },
  destination: LinkDestination = "portal",
): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");

  await db.insert(customerPortalTokensTable).values({
    customerId: customer.id,
    tokenHash: hashToken(rawToken),
    purpose: purpose === "reset" ? "reset" : "setup",
    // An invite is read whenever the customer gets to it, not within the hour.
    expiresAt: new Date(Date.now() + (purpose === "invite" ? 14 * 24 * 60 * 60 * 1000 : TOKEN_TTL_MS)),
  });

  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName, username: merchantsTable.username, portalDomain: merchantsTable.portalDomain })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, customer.merchantId));

  const bizName = merchant?.businessName ?? "Your store";
  // The link is always built from the trusted public origin (or the merchant's
  // own portal domain) — never from request headers, which are attacker
  // controlled and could redirect a set-up link to someone else's site.
  const base = merchant?.portalDomain ? `https://${merchant.portalDomain}` : publicOrigin();
  const link = destination === "shop"
    ? `${shopOrigin()}/account/set-password?token=${rawToken}`
    : `${base}/c/${customer.portalToken}/set-password?token=${rawToken}`;

  const heading = purpose === "reset" ? "Reset your password"
    : purpose === "invite" ? `Your ${bizName} online account is ready`
    : "Set up your account";
  const lead = purpose === "reset"
    ? `We received a request to reset the password for your ${bizName} account.`
    : purpose === "invite"
      ? `You can now shop online with ${bizName} and see your repairs, quotes, appointments and rewards in one place. Set a password to get started.`
      : `Set a password for your ${bizName} account so only you can see your repairs, quotes and rewards.`;
  const expiry = purpose === "invite" ? "This link expires in 14 days." : "This link expires in 1 hour.";

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
          <p style="color:#666;font-size:14px">${expiry} If you didn't expect it, you can safely ignore this email — nothing changes.</p>
          <p style="color:#999;font-size:12px">If the button doesn't work, copy and paste this URL into your browser:<br>${link}</p>
        </div>
      `,
      text: `${heading} — ${bizName}\n\n${lead}\n\n${link}\n\n${expiry} If you didn't expect it, ignore this email.`,
    }).then((result) => {
      if (!result.success) log.warn({ provider: result.provider, error: result.error }, "Portal set-up email delivery failed");
    }).catch((err: unknown) => {
      log.error({ err }, "Portal set-up email threw unexpectedly");
    });
    return;
  }

  // An invitation is only ever emailed — a bulk invite must not turn into a
  // round of unexpected texts to customers who only left a mobile number.
  if (customer.phone && purpose !== "invite") {
    void sendSms(
      { to: customer.phone, body: `${bizName}: ${heading} — ${link}` },
      customer.merchantId,
    ).catch(() => { /* delivery is best-effort */ });
  }
}

