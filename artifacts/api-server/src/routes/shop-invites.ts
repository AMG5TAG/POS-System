import { Router, type IRouter } from "express";
import { db, customersTable, customerPortalTokensTable } from "@workspace/db";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { issueSetupLink } from "../lib/customerPasswordLinks";
import { logger } from "../lib/logger";

/**
 * Invite existing customers to their online shop account (Management).
 *
 * Every POS customer already HAS an account — it is their customer row — so an
 * invite is just a set-password link emailed to them (lib/customerPasswordLinks,
 * purpose "invite", 14-day expiry). Who is invited:
 *   - customers with an email address and no password yet;
 *   - one invite per email address, though the POS may hold duplicates of it;
 *   - not anyone who already has an unused link from the last 14 days, so
 *     pressing Send twice never double-mails anyone.
 *
 * Sending is a bulk email to real people, so it takes a typed confirmation:
 * the caller must send back the exact number it is about to mail. It then runs
 * in the background, paced for the email provider's rate limit.
 */

const router: IRouter = Router();

const PACE_MS = 600;
let running: { total: number; sent: number; startedAt: string } | null = null;

async function eligibleCustomers(merchantId: number) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(customersTable)
    .where(and(
      eq(customersTable.merchantId, merchantId),
      isNotNull(customersTable.email),
      sql`trim(${customersTable.email}) <> ''`,
      sql`not exists (
        select 1 from ${customerPortalTokensTable}
        where ${customerPortalTokensTable.customerId} = ${customersTable.id}
          and ${customerPortalTokensTable.usedAt} is null
          and ${customerPortalTokensTable.createdAt} > ${since}
      )`,
    ))
    .orderBy(desc(customersTable.totalSpent), customersTable.id);

  // One per email address. An address where ANY record already has a password
  // is an active account — its duplicates must not get an invite.
  const byEmail = new Map<string, typeof rows>();
  for (const c of rows) {
    const k = c.email!.trim().toLowerCase();
    byEmail.set(k, [...(byEmail.get(k) ?? []), c]);
  }
  const out: typeof rows = [];
  for (const group of byEmail.values()) {
    if (group.some((c) => c.portalPasswordHash)) continue;
    out.push(group[0]!);
  }
  return out;
}

router.get("/shop-invites/summary", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [{ active }] = await db.select({ active: sql<number>`count(*)::int` }).from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), isNotNull(customersTable.portalPasswordHash)));
  const [{ noEmail }] = await db.select({ noEmail: sql<number>`count(*)::int` }).from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), sql`coalesce(trim(${customersTable.email}), '') = ''`));
  const eligible = await eligibleCustomers(merchantId);
  res.json({ eligible: eligible.length, active, noEmail, sending: running });
});

router.post("/shop-invites/send", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = z.object({ confirmCount: z.number().int().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Type the number of customers to confirm." }); return; }
  if (running) { res.status(409).json({ error: "Invites are already being sent." }); return; }

  const targets = await eligibleCustomers(merchantId);
  if (targets.length !== parsed.data.confirmCount) {
    res.status(409).json({ error: `The number has changed — ${targets.length} customers would be invited now. Check and confirm again.`, eligible: targets.length });
    return;
  }

  running = { total: targets.length, sent: 0, startedAt: new Date().toISOString() };
  res.status(202).json({ queued: targets.length });

  void (async () => {
    for (const c of targets) {
      try {
        await issueSetupLink(c, "invite", logger, "shop");
        running!.sent++;
      } catch (err) {
        logger.warn({ err, customerId: c.id }, "Shop invite failed");
      }
      await new Promise((r) => setTimeout(r, PACE_MS));
    }
    logger.info({ merchantId, sent: running?.sent, total: targets.length }, "Shop invites finished");
    running = null;
  })();
});

export default router;
