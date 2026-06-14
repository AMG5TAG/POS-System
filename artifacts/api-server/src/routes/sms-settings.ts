import { Router, type IRouter } from "express";
import { db, smsSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { upsertVault, deleteVault, readVault } from "../services/tokenVault";
import { sendSms } from "../services/sms";

const router: IRouter = Router();

const PROVIDER = "twilio";

async function getRow(merchantId: number) {
  const [row] = await db.select().from(smsSettingsTable).where(eq(smsSettingsTable.merchantId, merchantId));
  return row ?? null;
}

async function getVaultStatus(merchantId: number) {
  const vault = await readVault(merchantId, PROVIDER).catch(() => null);
  return {
    connected:        !!vault?.accessToken,
    fromNumber:       vault?.accountHandle ?? null,
    accountSidPrefix: vault?.accountId ? `${vault.accountId.slice(0, 6)}…` : null,
  };
}

function fmt(row: { smsEnabled: boolean; autoNotifyOnStatus: boolean } | null, vaultInfo: Awaited<ReturnType<typeof getVaultStatus>>) {
  return {
    smsEnabled:         row?.smsEnabled         ?? false,
    autoNotifyOnStatus: row?.autoNotifyOnStatus  ?? false,
    ...vaultInfo,
  };
}

// GET /settings/sms
router.get("/settings/sms", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row, vaultInfo] = await Promise.all([getRow(merchantId), getVaultStatus(merchantId)]);
  res.json(fmt(row, vaultInfo));
});

// PUT /settings/sms
router.put("/settings/sms", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { smsEnabled, autoNotifyOnStatus } = req.body as { smsEnabled?: boolean; autoNotifyOnStatus?: boolean };
  const existing = await getRow(merchantId);
  const patch = {
    smsEnabled:         smsEnabled         ?? existing?.smsEnabled         ?? false,
    autoNotifyOnStatus: autoNotifyOnStatus ?? existing?.autoNotifyOnStatus ?? false,
  };
  if (existing) {
    await db.update(smsSettingsTable).set(patch).where(eq(smsSettingsTable.merchantId, merchantId));
  } else {
    await db.insert(smsSettingsTable).values({ merchantId, ...patch });
  }
  const vaultInfo = await getVaultStatus(merchantId);
  res.json(fmt(patch, vaultInfo));
});

// POST /settings/sms/connect
router.post("/settings/sms/connect", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { accountSid, authToken, fromNumber } = req.body as { accountSid: string; authToken: string; fromNumber: string };
  if (!accountSid?.trim() || !authToken?.trim() || !fromNumber?.trim()) {
    res.status(400).json({ error: "accountSid, authToken, and fromNumber are required" });
    return;
  }
  // Store Auth Token as the access token (encrypted), Account SID as accountId, From Number as accountHandle
  await upsertVault(merchantId, {
    provider:      PROVIDER,
    accountId:     accountSid.trim(),
    accountHandle: fromNumber.trim(),
    accessToken:   authToken.trim(),
  });
  const [row, vaultInfo] = await Promise.all([getRow(merchantId), getVaultStatus(merchantId)]);
  res.json(fmt(row, vaultInfo));
});

// DELETE /settings/sms/disconnect
router.delete("/settings/sms/disconnect", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  await deleteVault(merchantId, PROVIDER);
  res.status(204).end();
});

// POST /settings/sms/test
router.post("/settings/sms/test", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { to } = req.body as { to?: string };
  if (!to?.trim()) { res.status(400).json({ error: "Phone number is required" }); return; }
  const result = await sendSms({ to: to.trim(), body: "KoaPOS: SMS test message. Your Twilio integration is working!" }, merchantId);
  if (!result.success) {
    res.status(400).json({ error: result.error ?? "Failed to send test SMS" });
    return;
  }
  res.json({ success: true, provider: result.provider });
});

export default router;
