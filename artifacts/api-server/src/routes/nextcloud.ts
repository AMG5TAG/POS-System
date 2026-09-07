/**
 * Nextcloud connect routes — Login Flow v2.
 *
 * Nextcloud instances are merchant-hosted, so there is no OAuth redirect back to
 * us to hang a callback off. The browser instead drives the flow:
 *
 *   1. POST .../login-flow/start with the server address → we open a login
 *      session on that server and return the URL to send the merchant to.
 *   2. The merchant approves in a new tab on their own Nextcloud.
 *   3. The browser polls .../login-flow/poll until it flips to "connected";
 *      that call is what stores the issued app password in the vault.
 *
 * The poll token is the credential that redeems the app password, so it stays
 * server-side in the session and is never handed to the browser.
 */
import { Router, type IRouter } from "express";
import { db, merchantIntegrationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  NEXTCLOUD_PROVIDER,
  pollLoginFlow,
  saveNextcloudCredentials,
  startLoginFlow,
  type PendingLoginFlow,
} from "../services/nextcloudAuth";

declare module "express-session" {
  interface SessionData {
    /** Nextcloud login flow awaiting the merchant's approval, if any. */
    nextcloudLoginFlow?: PendingLoginFlow;
  }
}

const router: IRouter = Router();

/** Record the connection on the marker row the rest of the app reads. */
async function markConnected(merchantId: number): Promise<void> {
  const [existing] = await db
    .select()
    .from(merchantIntegrationsTable)
    .where(
      and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, NEXTCLOUD_PROVIDER),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(merchantIntegrationsTable)
      .set({ status: "connected", credentials: null, connectedAt: new Date() })
      .where(eq(merchantIntegrationsTable.id, existing.id));
  } else {
    await db.insert(merchantIntegrationsTable).values({
      merchantId,
      integrationKey: NEXTCLOUD_PROVIDER,
      status: "connected",
      connectedAt: new Date(),
    });
  }
}

/* ── POST /integrations/nextcloud/login-flow/start ───────────────────────────
   Body: { serverUrl }  →  { loginUrl } */
router.post(
  "/integrations/nextcloud/login-flow/start",
  requireAuth,
  async (req, res): Promise<void> => {
    const serverUrl = String((req.body as { serverUrl?: unknown })?.serverUrl ?? "");

    try {
      const { loginUrl, pending } = await startLoginFlow(serverUrl);
      req.session.nextcloudLoginFlow = pending;
      res.json({ loginUrl, serverUrl: pending.serverUrl });
    } catch (err) {
      // These messages are written for the merchant ("check the address…"), so
      // pass them straight through rather than flattening to a generic error.
      res.status(400).json({
        error: err instanceof Error ? err.message : "Could not start the Nextcloud login",
      });
    }
  },
);

/* ── POST /integrations/nextcloud/login-flow/poll ────────────────────────────
   →  { status: "pending" | "connected" | "expired", accountHandle?, serverUrl? } */
router.post(
  "/integrations/nextcloud/login-flow/poll",
  requireAuth,
  async (req, res): Promise<void> => {
    const merchantId = req.session.merchantId!;
    const pending = req.session.nextcloudLoginFlow;
    if (!pending) {
      res.status(400).json({ error: "No Nextcloud login is in progress" });
      return;
    }

    let result;
    try {
      result = await pollLoginFlow(pending);
    } catch (err) {
      delete req.session.nextcloudLoginFlow;
      res.status(400).json({
        error: err instanceof Error ? err.message : "Nextcloud login failed",
      });
      return;
    }

    if (result.status === "pending") {
      res.json({ status: "pending" });
      return;
    }

    if (result.status === "expired") {
      delete req.session.nextcloudLoginFlow;
      res.json({ status: "expired" });
      return;
    }

    // Nextcloud consumed the poll token to issue this app password — it cannot
    // be fetched a second time, so drop the pending state whatever happens next.
    delete req.session.nextcloudLoginFlow;

    try {
      await saveNextcloudCredentials(merchantId, result.credentials, result.displayName);
      await markConnected(merchantId);
    } catch (err) {
      req.log.warn({ merchantId, err }, "Nextcloud credential verification failed");
      res.status(400).json({
        error: err instanceof Error ? err.message : "Could not verify the Nextcloud connection",
      });
      return;
    }

    res.json({
      status: "connected",
      accountHandle: result.displayName,
      serverUrl: result.credentials.serverUrl,
    });
  },
);

/* ── POST /integrations/nextcloud/login-flow/cancel ──────────────────────────
   Drops a flow the merchant abandoned, so a later attempt starts clean. */
router.post(
  "/integrations/nextcloud/login-flow/cancel",
  requireAuth,
  async (req, res): Promise<void> => {
    delete req.session.nextcloudLoginFlow;
    res.json({ ok: true });
  },
);

export default router;
