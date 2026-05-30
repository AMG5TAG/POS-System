import { SelectXeroTenantBody, UpdateXeroMappingsBody } from "@workspace/api-zod";
import { Router } from "express";
import {
  db,
  merchantIntegrationsTable,
  transactionsTable,
  customersTable,
  suppliersTable,
  purchaseOrdersTable,
} from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

/* ── Xero API constants ────────────────────────────────────────────────────── */

const XERO_AUTH_URL    = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL   = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS = "https://api.xero.com/connections";
const XERO_API         = "https://api.xero.com/api.xro/2.0";
const XERO_SCOPES      =
  "openid profile email accounting.transactions accounting.contacts accounting.settings offline_access";

/* ── Credential shape stored in merchantIntegrationsTable.credentials ─────── */

type XeroCredentials = {
  tenantId?: string;
  tenantName?: string;
  mappings?: {
    revenueAccount?: string;
    revenueAccountName?: string;
    cashAccount?: string;
    cashAccountName?: string;
    cardAccount?: string;
    cardAccountName?: string;
    taxAccount?: string;
    taxAccountName?: string;
    refundAccount?: string;
    refundAccountName?: string;
    roundingAccount?: string;
    roundingAccountName?: string;
    gstTaxType?: string;
  };
  syncSettings?: {
    syncTransactions: boolean;
    syncContacts: boolean;
    syncPurchaseOrders: boolean;
    autoSync: boolean;
    syncFrequency: "daily" | "weekly" | "manual";
    lastSyncAt?: string;
  };
  syncLog?: Array<{
    at: string;
    type: string;
    count: number;
    status: "success" | "error";
    message: string;
  }>;
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function buildCallbackUrl(proto: string, host: string): string {
  return `${proto}://${host}/api/xero/auth/callback`;
}

async function getRow(merchantId: number) {
  const [row] = await db
    .select()
    .from(merchantIntegrationsTable)
    .where(
      and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, "xero"),
      ),
    );
  return row ?? null;
}

async function getCreds(merchantId: number): Promise<XeroCredentials | null> {
  const row = await getRow(merchantId);
  if (!row) return null;
  try { return row.credentials ? (JSON.parse(row.credentials) as XeroCredentials) : {}; } catch { return {}; }
}

async function saveCreds(merchantId: number, creds: XeroCredentials): Promise<void> {
  await db
    .update(merchantIntegrationsTable)
    .set({ credentials: JSON.stringify(creds) })
    .where(
      and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, "xero"),
      ),
    );
}

async function withFreshToken(
  merchantId: number,
): Promise<{ accessToken: string; tenantId: string } | null> {
  const row = await getRow(merchantId);
  if (!row || !row.accessToken) return null;

  const creds = row.credentials ? (JSON.parse(row.credentials) as XeroCredentials) : {};
  const tenantId = creds.tenantId;
  if (!tenantId) return null;

  /* Refresh if expiring within 3 minutes */
  const now = new Date();
  const expiresAt = row.tokenExpiresAt;
  if (expiresAt && expiresAt.getTime() - now.getTime() > 3 * 60 * 1000) {
    return { accessToken: row.accessToken, tenantId };
  }

  const clientId     = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret || !row.refreshToken) return null;

  const r = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: row.refreshToken,
    }),
  });

  if (!r.ok) return null;
  const data = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };

  await db
    .update(merchantIntegrationsTable)
    .set({
      accessToken:    data.access_token,
      refreshToken:   data.refresh_token ?? row.refreshToken,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    })
    .where(
      and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, "xero"),
      ),
    );

  return { accessToken: data.access_token, tenantId };
}

async function appendSyncLog(
  merchantId: number,
  entry: XeroCredentials["syncLog"] extends Array<infer T> | undefined ? T : never,
): Promise<void> {
  const creds = (await getCreds(merchantId)) ?? {};
  const log   = creds.syncLog ?? [];
  log.unshift(entry);
  creds.syncLog = log.slice(0, 50); // keep last 50
  await saveCreds(merchantId, creds);
}

/* ── GET /api/xero/status ────────────────────────────────────────────────── */

router.get("/xero/status", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const row        = await getRow(merchantId);

  const configured = !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);

  if (!row || row.status !== "connected") {
    res.json({ connected: false, configured });
    return;
  }

  const creds: XeroCredentials = row.credentials ? (JSON.parse(row.credentials) as XeroCredentials) : {};

  res.json({
    connected:    true,
    configured,
    tenantId:     creds.tenantId,
    tenantName:   creds.tenantName,
    mappings:     creds.mappings ?? {},
    syncSettings: creds.syncSettings ?? {},
    syncLog:      creds.syncLog ?? [],
    connectedAt:  row.connectedAt?.toISOString() ?? null,
  });
});

/* ── GET /api/xero/auth/start ─────────────────────────────────────────────── */

router.get("/xero/auth/start", requireAuth, (req, res): void => {
  const clientId = process.env.XERO_CLIENT_ID;
  if (!clientId) {
    res.redirect("/management/xero?error=not_configured");
    return;
  }

  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host  = req.headers.host ?? "";
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     clientId,
    redirect_uri:  buildCallbackUrl(proto, host),
    scope:         XERO_SCOPES,
    state:         String(req.session.merchantId!),
  });

  res.redirect(`${XERO_AUTH_URL}?${params.toString()}`);
});

/* ── GET /api/xero/auth/callback ─────────────────────────────────────────── */

router.get("/xero/auth/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) {
    res.redirect("/management/xero?error=oauth_denied");
    return;
  }

  const merchantId = parseInt(state ?? "", 10);
  if (isNaN(merchantId)) {
    res.redirect("/management/xero?error=invalid_state");
    return;
  }

  const clientId     = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect("/management/xero?error=not_configured");
    return;
  }

  const cbProto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const cbHost  = req.headers.host ?? "";
  const cb = buildCallbackUrl(cbProto, cbHost);

  let tokens: { access_token: string; refresh_token: string; expires_in: number };
  try {
    const r = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cb }),
    });
    if (!r.ok) { res.redirect("/management/xero?error=token_failed"); return; }
    tokens = (await r.json()) as typeof tokens;
  } catch {
    res.redirect("/management/xero?error=token_failed");
    return;
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const existing  = await getRow(merchantId);

  if (existing) {
    await db
      .update(merchantIntegrationsTable)
      .set({
        status:         "connected",
        accessToken:    tokens.access_token,
        refreshToken:   tokens.refresh_token,
        tokenExpiresAt: expiresAt,
        connectedAt:    new Date(),
      })
      .where(
        and(
          eq(merchantIntegrationsTable.merchantId, merchantId),
          eq(merchantIntegrationsTable.integrationKey, "xero"),
        ),
      );
  } else {
    await db.insert(merchantIntegrationsTable).values({
      merchantId,
      integrationKey: "xero",
      status:         "connected",
      accessToken:    tokens.access_token,
      refreshToken:   tokens.refresh_token,
      tokenExpiresAt: expiresAt,
      connectedAt:    new Date(),
    });
  }

  res.redirect("/management/xero?success=connected");
});

/* ── DELETE /api/xero/disconnect ─────────────────────────────────────────── */

router.delete("/xero/disconnect", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  await db
    .delete(merchantIntegrationsTable)
    .where(
      and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, "xero"),
      ),
    );
  res.json({ ok: true });
});

/* ── GET /api/xero/tenants ───────────────────────────────────────────────── */

router.get("/xero/tenants", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const row = await getRow(merchantId);
  if (!row?.accessToken) { res.status(401).json({ error: "Not connected" }); return; }

  const r = await fetch(XERO_CONNECTIONS, {
    headers: {
      Authorization:  `Bearer ${row.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!r.ok) { res.status(r.status).json({ error: "Failed to fetch tenants" }); return; }

  const tenants = (await r.json()) as Array<{ tenantId: string; tenantName: string; tenantType: string }>;
  res.json(tenants);
});

/* ── POST /api/xero/tenant ───────────────────────────────────────────────── */

router.post("/xero/tenant", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = SelectXeroTenantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { tenantId, tenantName } = parsed.data;

  const creds = (await getCreds(merchantId)) ?? {};
  creds.tenantId   = tenantId;
  creds.tenantName = tenantName;
  await saveCreds(merchantId, creds);

  res.json({ ok: true });
});

/* ── GET /api/xero/accounts ──────────────────────────────────────────────── */

router.get("/xero/accounts", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const auth       = await withFreshToken(merchantId);
  if (!auth) { res.status(401).json({ error: "Not connected or no tenant selected" }); return; }

  const r = await fetch(`${XERO_API}/Accounts?where=Status%3D%3D%22ACTIVE%22`, {
    headers: {
      Authorization:    `Bearer ${auth.accessToken}`,
      "xero-tenant-id": auth.tenantId,
      "Content-Type":   "application/json",
    },
  });

  if (!r.ok) { res.status(r.status).json({ error: "Failed to fetch accounts" }); return; }

  type XeroAccount = { AccountID: string; Code: string; Name: string; Type: string; Status: string };
  const data = (await r.json()) as { Accounts: XeroAccount[] };
  res.json(data.Accounts ?? []);
});

/* ── GET /api/xero/mappings ──────────────────────────────────────────────── */

router.get("/xero/mappings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const creds      = (await getCreds(merchantId)) ?? {};
  res.json({ mappings: creds.mappings ?? {}, syncSettings: creds.syncSettings ?? {} });
});

/* ── PUT /api/xero/mappings ──────────────────────────────────────────────── */

router.put("/xero/mappings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = UpdateXeroMappingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { mappings, syncSettings } = parsed.data;

  const creds = (await getCreds(merchantId)) ?? {};
  creds.mappings = mappings;
  if (syncSettings) creds.syncSettings = syncSettings as XeroCredentials["syncSettings"];
  await saveCreds(merchantId, creds);

  res.json({ ok: true });
});

/* ── POST /api/xero/sync/contacts ────────────────────────────────────────── */

router.post("/xero/sync/contacts", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const auth       = await withFreshToken(merchantId);
  if (!auth) { res.status(401).json({ error: "Not connected" }); return; }

  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));

  const suppliers = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.merchantId, merchantId));

  const xeroContacts = [
    ...customers.map((c) => ({
      Name:        `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || `Customer ${c.id}`,
      FirstName:   c.firstName ?? undefined,
      LastName:    c.lastName  ?? undefined,
      EmailAddress: c.email    ?? undefined,
      Phones:      c.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: c.phone }] : [],
      IsCustomer:  true,
      IsSupplier:  false,
    })),
    ...suppliers.map((s) => ({
      Name:        s.name,
      EmailAddress: s.email    ?? undefined,
      Phones:      s.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: s.phone }] : [],
      IsCustomer:  false,
      IsSupplier:  true,
      AccountNumber: s.accountNumber ?? undefined,
    })),
  ];

  if (xeroContacts.length === 0) {
    res.json({ ok: true, synced: 0, message: "No contacts to sync" });
    return;
  }

  const r = await fetch(`${XERO_API}/Contacts`, {
    method:  "PUT",
    headers: {
      Authorization:    `Bearer ${auth.accessToken}`,
      "xero-tenant-id": auth.tenantId,
      "Content-Type":   "application/json",
    },
    body: JSON.stringify({ Contacts: xeroContacts }),
  });

  const status = r.ok ? "success" : "error";
  const msg    = r.ok
    ? `Synced ${xeroContacts.length} contacts`
    : `Xero API error: ${r.status}`;

  await appendSyncLog(merchantId, { at: new Date().toISOString(), type: "contacts", count: xeroContacts.length, status, message: msg });

  if (!r.ok) { res.status(r.status).json({ error: msg }); return; }
  res.json({ ok: true, synced: xeroContacts.length, message: msg });
});

/* ── POST /api/xero/sync/transactions ───────────────────────────────────────
   Syncs the last 90 days of completed transactions as Xero Invoices (ACCREC).
   Each KoaPOS transaction becomes one Xero invoice with line items.
   ─────────────────────────────────────────────────────────────────────────── */

router.post("/xero/sync/transactions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const auth       = await withFreshToken(merchantId);
  if (!auth) { res.status(401).json({ error: "Not connected" }); return; }

  const creds = (await getCreds(merchantId)) ?? {};
  const revenueCode = creds.mappings?.revenueAccount ?? "200";
  const gstType     = creds.mappings?.gstTaxType     ?? "OUTPUT";

  const since = new Date();
  since.setDate(since.getDate() - 90);

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.merchantId, merchantId),
        eq(transactionsTable.status, "completed"),
        gte(transactionsTable.createdAt, since),
      ),
    )
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);

  if (txs.length === 0) {
    res.json({ ok: true, synced: 0, message: "No transactions to sync" });
    return;
  }

  type XeroInvoice = Record<string, unknown>;
  const invoices: XeroInvoice[] = txs.map((tx) => {
    const items = Array.isArray(tx.items) ? (tx.items as Array<{
      name?: string; quantity?: number; unitPrice?: number; taxAmount?: number;
    }>) : [];

    const lineItems = items.length > 0
      ? items.map((item) => ({
          Description: item.name ?? "Product",
          Quantity:    item.quantity ?? 1,
          UnitAmount:  item.unitPrice ?? 0,
          AccountCode: revenueCode,
          TaxType:     gstType,
        }))
      : [{
          Description: "Sale",
          Quantity:    1,
          UnitAmount:  parseFloat(String(tx.subtotal ?? tx.total ?? 0)),
          AccountCode: revenueCode,
          TaxType:     gstType,
        }];

    return {
      Type:      "ACCREC",
      Status:    "AUTHORISED",
      InvoiceNumber: tx.receiptNumber ?? `KP-${tx.id}`,
      Date:      new Date(tx.createdAt).toISOString().split("T")[0],
      DueDate:   new Date(tx.createdAt).toISOString().split("T")[0],
      Reference: `KoaPOS Receipt ${tx.receiptNumber ?? tx.id}`,
      LineItems: lineItems,
      LineAmountTypes: "INCLUSIVE",
    };
  });

  const r = await fetch(`${XERO_API}/Invoices`, {
    method:  "PUT",
    headers: {
      Authorization:    `Bearer ${auth.accessToken}`,
      "xero-tenant-id": auth.tenantId,
      "Content-Type":   "application/json",
    },
    body: JSON.stringify({ Invoices: invoices }),
  });

  const status = r.ok ? "success" : "error";
  const msg    = r.ok
    ? `Synced ${invoices.length} transactions`
    : `Xero API error: ${r.status}`;

  await appendSyncLog(merchantId, { at: new Date().toISOString(), type: "transactions", count: invoices.length, status, message: msg });

  if (!r.ok) { res.status(r.status).json({ error: msg }); return; }
  res.json({ ok: true, synced: invoices.length, message: msg });
});

/* ── POST /api/xero/sync/purchase-orders ─────────────────────────────────── */

router.post("/xero/sync/purchase-orders", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const auth       = await withFreshToken(merchantId);
  if (!auth) { res.status(401).json({ error: "Not connected" }); return; }

  const pos = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.merchantId, merchantId))
    .limit(100);

  if (pos.length === 0) {
    res.json({ ok: true, synced: 0, message: "No purchase orders to sync" });
    return;
  }

  type XeroPO = Record<string, unknown>;
  const xeroPos: XeroPO[] = pos.map((po) => {
    return {
      Type:            "ACCPAY",
      Status:          po.status === "received" ? "AUTHORISED" : "DRAFT",
      InvoiceNumber:   po.poNumber ?? `PO-${po.id}`,
      Date:            new Date(po.createdAt).toISOString().split("T")[0],
      DueDate:         po.expectedDate
        ? new Date(po.expectedDate).toISOString().split("T")[0]
        : new Date(po.createdAt).toISOString().split("T")[0],
      Reference:       `KoaPOS PO ${po.poNumber ?? po.id}`,
      LineItems:       [{ Description: "Purchase Order", Quantity: 1, UnitAmount: parseFloat(String(po.totalCost ?? 0)) }],
      LineAmountTypes: "EXCLUSIVE",
    };
  });

  const r = await fetch(`${XERO_API}/Invoices`, {
    method:  "PUT",
    headers: {
      Authorization:    `Bearer ${auth.accessToken}`,
      "xero-tenant-id": auth.tenantId,
      "Content-Type":   "application/json",
    },
    body: JSON.stringify({ Invoices: xeroPos }),
  });

  const status = r.ok ? "success" : "error";
  const msg    = r.ok
    ? `Synced ${xeroPos.length} purchase orders as bills`
    : `Xero API error: ${r.status}`;

  await appendSyncLog(merchantId, { at: new Date().toISOString(), type: "purchase_orders", count: xeroPos.length, status, message: msg });

  if (!r.ok) { res.status(r.status).json({ error: msg }); return; }
  res.json({ ok: true, synced: xeroPos.length, message: msg });
});

/* ── GET /api/xero/sync/log ──────────────────────────────────────────────── */

router.get("/xero/sync/log", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const creds      = (await getCreds(merchantId)) ?? {};
  res.json(creds.syncLog ?? []);
});

export default router;
