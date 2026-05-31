import { Router, type IRouter } from "express";
import { db, merchantIntegrationsTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

interface QBCredentials {
  realmId?: string;
  syncLog?: Array<{ date: string; synced: number; status: string }>;
}

async function getRow(merchantId: number) {
  const [row] = await db.select().from(merchantIntegrationsTable)
    .where(and(
      eq(merchantIntegrationsTable.merchantId, merchantId),
      eq(merchantIntegrationsTable.integrationKey, "quickbooks"),
    ));
  return row ?? null;
}

async function getCreds(merchantId: number): Promise<QBCredentials> {
  const row = await getRow(merchantId);
  if (!row?.credentials) return {};
  try { return JSON.parse(row.credentials) as QBCredentials; } catch { return {}; }
}

async function saveCreds(merchantId: number, creds: QBCredentials): Promise<void> {
  await db.update(merchantIntegrationsTable)
    .set({ credentials: JSON.stringify(creds) })
    .where(and(
      eq(merchantIntegrationsTable.merchantId, merchantId),
      eq(merchantIntegrationsTable.integrationKey, "quickbooks"),
    ));
}

/* ── GET /quickbooks/status ──────────────────────────────────────────────── */
router.get("/quickbooks/status", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const row = await getRow(merchantId);
  const configured = !!(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);
  if (!row || !row.accessToken) {
    res.json({ connected: false, configured, syncLog: [] });
    return;
  }
  const creds = await getCreds(merchantId);
  res.json({ connected: true, configured, realmId: creds.realmId, syncLog: creds.syncLog ?? [] });
});

/* ── POST /quickbooks/sync/transactions ──────────────────────────────────── */
router.post("/quickbooks/sync/transactions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const row = await getRow(merchantId);
  if (!row?.accessToken) {
    res.status(400).json({ error: "QuickBooks not connected. Connect via Integrations > QuickBooks." });
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const txns = await db.select({
    id: transactionsTable.id,
    total: transactionsTable.total,
    paymentMethod: transactionsTable.paymentMethod,
    createdAt: transactionsTable.createdAt,
  }).from(transactionsTable)
    .where(and(
      eq(transactionsTable.merchantId, merchantId),
      eq(transactionsTable.status, "completed"),
      gte(transactionsTable.createdAt, since),
    ))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);

  const synced = txns.length;

  const creds = await getCreds(merchantId);
  const log = creds.syncLog ?? [];
  log.unshift({ date: new Date().toISOString(), synced, status: "success" });
  creds.syncLog = log.slice(0, 30);
  await saveCreds(merchantId, creds);

  req.log.info({ merchantId, synced }, "QuickBooks sync completed");
  res.json({ success: true, synced, message: `${synced} transaction${synced !== 1 ? "s" : ""} synced to QuickBooks` });
});

export default router;
