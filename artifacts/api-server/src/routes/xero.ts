import { SelectXeroTenantBody, UpdateXeroMappingsBody } from "@workspace/api-zod";
import { Router } from "express";
import {
  db,
  merchantIntegrationsTable,
  transactionsTable,
  customersTable,
  suppliersTable,
  purchaseOrdersTable,
  customerNotesTable,
} from "@workspace/db";
import { eq, and, gte, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { publicOrigin } from "../lib/publicUrl";

/* Platform-registered Xero OAuth app credentials. Xero connects in one click
   against this single app — there is no per-merchant developer app. */
function getXeroClientCreds(_merchantId: number): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

const router = Router();

/* ── Xero API constants ────────────────────────────────────────────────────── */

const XERO_AUTH_URL    = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL   = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS = "https://api.xero.com/connections";
const XERO_API         = "https://api.xero.com/api.xro/2.0";
// Xero deprecated the broad `accounting.transactions` scope and split it into
// granular scopes. Apps created on/after 2 March 2026 cannot use the broad scope
// at all (Xero returns invalid_scope), so we request the granular replacement.
// The sync only writes to /Invoices (accounting.invoices), /Contacts
// (accounting.contacts) and reads /Accounts (accounting.settings). Add
// `accounting.payments` here if we ever record payments via the /Payments API.
// See https://developer.xero.com/documentation/guides/oauth2/scopes/
const XERO_SCOPES      =
  "openid profile email accounting.invoices accounting.contacts accounting.settings offline_access";

/* Canonical Xero setup-wizard route. Every OAuth redirect MUST target this exact
   path — never the legacy /management/xero or /management/integrations aliases.
   Those aliases are client-side wouter <Redirect>s that navigate with a hardcoded
   `to` and DROP the query string, so ?success=/?error= would be lost before the
   wizard reads it: a failed connect would then silently bounce the user back to
   the Connect step with no message, looking exactly like "the page just refreshed".
   The error codes below match the wizard's error map in management-xero.tsx. */
const XERO_WIZARD_PATH = "/management/settings-integrations/integrations/xero";

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
    purchasesAccount?: string;
    purchasesAccountName?: string;
    gstTaxType?: string;
  };
  syncSettings?: {
    syncTransactions: boolean;
    syncContacts: boolean;
    syncPurchaseOrders: boolean;
    autoSync: boolean;
    syncOnSale: boolean;
    syncFrequency: "daily" | "weekly" | "manual";
    lastSyncAt?: string;
    includeNotes?: boolean;
    notesConflict?: "append" | "overwrite";
  };
  syncLog?: Array<{
    timestamp: string;
    type: string;
    synced?: number;
    message?: string;
    error?: string;
  }>;
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

// Build the OAuth callback from the app's canonical public origin (koapos.com.au
// in production) — NOT from raw request headers, which in the Replit deployment
// resolve to the internal *.replit.dev host and make Xero reject the redirect_uri.
// This URL must exactly match a Redirect URI registered in the Xero app config.
function buildCallbackUrl(req: { hostname?: string }): string {
  return `${publicOrigin(req)}/api/xero/auth/callback`;
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

  const cc = await getXeroClientCreds(merchantId);
  if (!cc || !row.refreshToken) return null;
  const { clientId, clientSecret } = cc;

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

/* Turn a failed Xero API Response into a human-readable reason.

   Xero's Accounting API returns a rich body on 400 that pinpoints WHY the payload
   was rejected — for a rejected /Invoices or /Contacts PUT it looks like:
     { Type:"ValidationException", Message:"A validation exception occurred",
       Elements:[{ ValidationErrors:[{ Message:"Account code '200' ..." }] }] }
   Older/other errors use a flat { Message } or { detail }. We surface the most
   specific message(s) available so the merchant's sync log and the API response
   say e.g. "Xero API error: 400 — Account code '200' is not a valid code" instead
   of a bare status. The body can only be consumed once, so call this exactly once
   on the `!r.ok` branch. */
type XeroErrorBody = {
  Message?: string;
  detail?: string;
  Detail?: string;
  Elements?: Array<{ ValidationErrors?: Array<{ Message?: string }> }>;
};

// Extract the most specific reason from an already-parsed Xero error body.
// Returns null when the body carries nothing more useful than the status.
function xeroReasonFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as XeroErrorBody;

  // Most specific first: per-element validation errors (deduped).
  const validationMsgs = Array.from(new Set(
    (b.Elements ?? [])
      .flatMap((el) => el.ValidationErrors ?? [])
      .map((ve) => ve.Message)
      .filter((m): m is string => !!m),
  ));
  if (validationMsgs.length > 0) return validationMsgs.join("; ").slice(0, 500);

  const flat = b.Message ?? b.detail ?? b.Detail;
  if (flat) return String(flat).slice(0, 300);

  return null;
}

async function xeroErrorMessage(r: Response): Promise<string> {
  const prefix = `Xero API error: ${r.status}`;
  let raw = "";
  try { raw = await r.text(); } catch { return prefix; }
  if (!raw) return prefix;

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return `${prefix} — ${raw.slice(0, 300)}`; }

  const reason = xeroReasonFromBody(body);
  return reason ? `${prefix} — ${reason}` : `${prefix} — ${raw.slice(0, 300)}`;
}

type XeroAuth = { accessToken: string; tenantId: string };

// Standard headers for every Xero Accounting API call. `Accept: application/json`
// is REQUIRED — without it Xero returns XML and `r.json()` throws.
function xeroHeaders(auth: XeroAuth): Record<string, string> {
  return {
    Authorization:    `Bearer ${auth.accessToken}`,
    "xero-tenant-id": auth.tenantId,
    "Content-Type":   "application/json",
    Accept:           "application/json",
  };
}

/* Build name/email → ContactID maps for the org's ACTIVE contacts, so a contact
   sync can attach the ContactID and UPDATE the existing record rather than relying
   on Xero's name-matching (which misses on any whitespace/spelling drift and 400s
   on the unique-name rule). Best-effort: on any read failure we return whatever we
   have so far and let the sync fall back to create-or-update by name. Paginated at
   Xero's 100-per-page cap; bounded so a huge book can't spin forever. */
async function fetchXeroContactIndex(
  auth: XeroAuth,
): Promise<{ byName: Map<string, string>; byEmail: Map<string, string> }> {
  const byName  = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const MAX_PAGES = 50; // 50 × 100 = 5000 contacts

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${XERO_API}/Contacts?where=${encodeURIComponent('ContactStatus=="ACTIVE"')}&page=${page}`;
    let r: Response;
    try { r = await fetch(url, { headers: xeroHeaders(auth) }); } catch { break; }
    if (!r.ok) break;

    let body: { Contacts?: Array<{ ContactID?: string; Name?: string; EmailAddress?: string }> };
    try { body = await r.json() as typeof body; } catch { break; }

    const contacts = body.Contacts ?? [];
    for (const c of contacts) {
      if (!c.ContactID) continue;
      if (c.Name)         byName.set(c.Name.trim().toLowerCase(), c.ContactID);
      if (c.EmailAddress) byEmail.set(c.EmailAddress.trim().toLowerCase(), c.ContactID);
    }
    if (contacts.length < 100) break; // last page
  }
  return { byName, byEmail };
}

/* Return the subset of the given InvoiceNumbers that ALREADY exist in Xero (any
   status), so an invoice/bill sync can skip re-creating them — making re-syncs
   idempotent. Uses Xero's `InvoiceNumbers` filter, chunked to keep the URL bounded.
   Best-effort: a failed read for a chunk just means those numbers aren't treated as
   existing (worst case a duplicate, same as before this guard). */
async function fetchExistingInvoiceNumbers(
  auth: XeroAuth,
  numbers: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  const unique = Array.from(new Set(numbers.filter(Boolean)));
  if (unique.length === 0) return existing;

  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const qs = new URLSearchParams({ InvoiceNumbers: chunk.join(",") });
    let r: Response;
    try { r = await fetch(`${XERO_API}/Invoices?${qs.toString()}`, { headers: xeroHeaders(auth) }); }
    catch { continue; }
    if (!r.ok) continue;

    let body: { Invoices?: Array<{ InvoiceNumber?: string }> };
    try { body = await r.json() as typeof body; } catch { continue; }
    for (const inv of body.Invoices ?? []) {
      if (inv.InvoiceNumber) existing.add(inv.InvoiceNumber);
    }
  }
  return existing;
}

/* ── GET /api/xero/status ────────────────────────────────────────────────── */

router.get("/xero/status", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const row        = await getRow(merchantId);

  const configured = !!(await getXeroClientCreds(merchantId));

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

router.get("/xero/auth/start", requireAuth, async (req, res): Promise<void> => {
  const cc = await getXeroClientCreds(req.session.merchantId!);
  if (!cc) {
    // Platform Xero app isn't configured (no XERO_CLIENT_ID/SECRET). Send the user
    // to the wizard, which shows a clear "Xero isn't available yet" message, rather
    // than bouncing back to the integrations list (which looks like a page refresh).
    res.redirect(`${XERO_WIZARD_PATH}?error=not_configured`);
    return;
  }
  const clientId = cc.clientId;

  const params = new URLSearchParams({
    response_type: "code",
    client_id:     clientId,
    redirect_uri:  buildCallbackUrl(req),
    scope:         XERO_SCOPES,
    state:         String(req.session.merchantId!),
  });

  res.redirect(`${XERO_AUTH_URL}?${params.toString()}`);
});

/* ── GET /api/xero/auth/callback ─────────────────────────────────────────── */

router.get("/xero/auth/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) {
    res.redirect(`${XERO_WIZARD_PATH}?error=oauth_denied`);
    return;
  }

  const merchantId = parseInt(state ?? "", 10);
  if (isNaN(merchantId)) {
    res.redirect(`${XERO_WIZARD_PATH}?error=invalid_state`);
    return;
  }

  const cc = await getXeroClientCreds(merchantId);
  if (!cc) {
    res.redirect(`${XERO_WIZARD_PATH}?error=not_configured`);
    return;
  }
  const { clientId, clientSecret } = cc;

  const cb = buildCallbackUrl(req);

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
    if (!r.ok) { res.redirect(`${XERO_WIZARD_PATH}?error=token_failed`); return; }
    tokens = (await r.json()) as typeof tokens;
  } catch {
    res.redirect(`${XERO_WIZARD_PATH}?error=token_failed`);
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

  res.redirect(`${XERO_WIZARD_PATH}?success=connected`);
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
    headers: xeroHeaders(auth),
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
/*
 * Syncs KoaPOS customers and suppliers to Xero as Contacts via PUT /Contacts.
 * When `syncSettings.includeNotes` is enabled, a follow-up POST to each
 * contact's /History endpoint records CRM notes as a History entry. Notes sync
 * is best-effort: individual failures are logged and counted but do not abort
 * the main contact sync.
 *
 * notesConflict modes:
 *   "append"    — all notes concatenated newest-first (default)
 *   "overwrite" — only the single most-recent note is sent
 */

router.post("/xero/sync/contacts", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const auth       = await withFreshToken(merchantId);
  if (!auth) { res.status(401).json({ error: "Not connected" }); return; }

  // Read sync settings to determine notes behaviour
  const creds         = await getCreds(merchantId);
  const includeNotes  = creds?.syncSettings?.includeNotes  ?? false;
  const notesConflict = creds?.syncSettings?.notesConflict ?? "append";

  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));

  const suppliers = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.merchantId, merchantId));

  type XeroContactPayload = {
    ContactID?:    string;
    Name:          string;
    FirstName?:    string;
    LastName?:     string;
    EmailAddress?: string;
    Phones:        Array<{ PhoneType: string; PhoneNumber: string }>;
    IsCustomer:    boolean;
    IsSupplier:    boolean;
    AccountNumber?: string;
  };

  const xeroContacts: XeroContactPayload[] = [
    ...customers.map((c): XeroContactPayload => ({
      Name:         `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || `Customer ${c.id}`,
      FirstName:    c.firstName  ?? undefined,
      LastName:     c.lastName   ?? undefined,
      EmailAddress: c.email      ?? undefined,
      Phones:       c.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: c.phone }] : [],
      IsCustomer:   true,
      IsSupplier:   false,
    })),
    ...suppliers.map((s): XeroContactPayload => ({
      Name:          s.name,
      EmailAddress:  s.email         ?? undefined,
      Phones:        s.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: s.phone }] : [],
      IsCustomer:    false,
      IsSupplier:    true,
      AccountNumber: s.accountNumber ?? undefined,
    })),
  ];

  if (xeroContacts.length === 0) {
    res.json({ ok: true, synced: 0, message: "No contacts to sync" });
    return;
  }

  // Xero rejects a whole batch that contains two contacts with the same Name — and
  // a customer and a supplier can legitimately share one ("Ross Gregory" as both).
  // Dedupe by name so the batch can't self-collide; the first row for a name wins.
  const seenNames = new Set<string>();
  const contactsToSync = xeroContacts.filter((c) => {
    const key = c.Name.trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  // Bulletproof upsert: look up each contact's existing Xero ContactID (by email
  // first, then name) and attach it, so Xero UPDATES the record by ID instead of
  // trying to create a duplicate and 400ing on the unique-name rule. Contacts with
  // no match get created fresh (no ContactID).
  const { byName, byEmail } = await fetchXeroContactIndex(auth);
  for (const c of contactsToSync) {
    const email = c.EmailAddress?.trim().toLowerCase();
    const name  = c.Name.trim().toLowerCase();
    const id    = (email ? byEmail.get(email) : undefined) ?? byName.get(name);
    if (id) c.ContactID = id;
  }

  // POST (create-or-update), NOT PUT (create-only): Contact Name must be unique
  // across active contacts, so PUT 400s the moment a name already exists in Xero.
  // `summarizeErrors=false` makes Xero return HTTP 200 and validate each contact
  // INDEPENDENTLY — so one still-colliding row can't fail the whole batch; we read
  // the per-contact ValidationErrors below and report them instead of losing every
  // good contact to one bad one.
  const r = await fetch(`${XERO_API}/Contacts?summarizeErrors=false`, {
    method:  "POST",
    headers: xeroHeaders(auth),
    body: JSON.stringify({ Contacts: contactsToSync }),
  });

  // Parse the body once: it feeds ContactIDs to the notes sync AND carries per-row
  // ValidationErrors (present because of summarizeErrors=false).
  type XeroContactRecord = {
    ContactID?:        string;
    EmailAddress?:     string;
    ValidationErrors?: Array<{ Message?: string }>;
  };
  let responseBody: { Contacts?: XeroContactRecord[] } = {};
  try { responseBody = await r.json() as { Contacts?: XeroContactRecord[] }; } catch { /* ignore */ }

  const returned    = responseBody.Contacts ?? [];
  const rowErrors   = Array.from(new Set(
    returned.flatMap((c) => c.ValidationErrors ?? [])
            .map((v) => v.Message)
            .filter((m): m is string => !!m),
  ));
  const failedCount = returned.filter((c) => (c.ValidationErrors?.length ?? 0) > 0).length;
  const syncedCount = Math.max(0, contactsToSync.length - failedCount);

  // `!r.ok` = whole-request failure (auth/structural). A 200 with some failed rows
  // is a partial success — sync what we can and surface the rest.
  const syncStatus = (!r.ok || syncedCount === 0) ? "error" : "success";
  let msg: string;
  if (!r.ok) {
    const errReason = xeroReasonFromBody(responseBody);
    msg = `Xero API error: ${r.status}${errReason ? ` — ${errReason}` : ""}`;
    req.log.warn({ merchantId, count: contactsToSync.length, status: r.status, msg }, "Xero sync/contacts failed");
  } else {
    msg = `Synced ${syncedCount} contact${syncedCount !== 1 ? "s" : ""}`;
    if (failedCount > 0) {
      msg += `, ${failedCount} failed${rowErrors.length ? `: ${rowErrors.slice(0, 3).join("; ").slice(0, 300)}` : ""}`;
      req.log.warn({ merchantId, failedCount, rowErrors: rowErrors.slice(0, 5) }, "Xero sync/contacts partial failure");
    }
  }

  // ── Notes sync (best-effort, only when the main contact sync succeeded) ──
  let notesSynced = 0;
  let notesFailed = 0;

  if (r.ok && includeNotes) {
    // Build email → Xero ContactID lookup from Xero's upsert response
    const emailToContactId = new Map<string, string>();
    for (const xc of responseBody.Contacts ?? []) {
      if (xc.ContactID && xc.EmailAddress) {
        emailToContactId.set(xc.EmailAddress.toLowerCase(), xc.ContactID);
      }
    }

    // Fetch all notes for this merchant ordered newest-first
    const allNotes = await db
      .select()
      .from(customerNotesTable)
      .where(eq(customerNotesTable.merchantId, merchantId))
      .orderBy(desc(customerNotesTable.createdAt));

    // Group notes by customerId
    const notesByCustomer = new Map<number, typeof allNotes>();
    for (const note of allNotes) {
      const bucket = notesByCustomer.get(note.customerId) ?? [];
      bucket.push(note);
      notesByCustomer.set(note.customerId, bucket);
    }

    const MAX_NOTE_CHARS = 2000;

    for (const customer of customers) {
      const notes = notesByCustomer.get(customer.id);
      if (!notes || notes.length === 0) continue;

      const contactId = customer.email
        ? emailToContactId.get(customer.email.toLowerCase())
        : undefined;
      if (!contactId) continue; // Xero didn't return a ContactID for this customer — skip

      // "overwrite": only send the single most-recent note.
      // "append": concatenate all notes newest-first.
      const notesToFormat = notesConflict === "overwrite" ? notes.slice(0, 1) : notes;
      let noteText =
        "[KoaPOS Notes]\n" +
        notesToFormat
          .map((n) => {
            const date = new Date(n.createdAt).toLocaleDateString("en-AU", {
              day: "numeric", month: "short", year: "numeric",
            });
            return `• ${date}: ${n.note}`;
          })
          .join("\n");
      if (noteText.length > MAX_NOTE_CHARS) {
        noteText = noteText.slice(0, MAX_NOTE_CHARS - 3) + "...";
      }

      try {
        const hr = await fetch(`${XERO_API}/Contacts/${contactId}/History`, {
          method:  "POST",
          headers: xeroHeaders(auth),
          body: JSON.stringify({ HistoryRecords: [{ Details: noteText }] }),
        });
        if (hr.ok) {
          notesSynced++;
        } else {
          req.log.warn({ merchantId, contactId, status: hr.status }, "Xero notes History POST failed");
          notesFailed++;
        }
      } catch (err) {
        req.log.warn({ merchantId, contactId, err }, "Xero notes History POST threw");
        notesFailed++;
      }
    }

    if (notesSynced > 0 || notesFailed > 0) {
      msg += ` — ${notesSynced} note${notesSynced !== 1 ? "s" : ""} synced`;
      if (notesFailed > 0) msg += `, ${notesFailed} failed`;
    }
  }

  await appendSyncLog(merchantId, {
    timestamp: new Date().toISOString(),
    type:      "contacts",
    synced:    syncedCount,
    ...(syncStatus === "error" ? { error: msg } : { message: msg }),
  });

  if (!r.ok) { res.status(r.status).json({ error: msg }); return; }
  res.json({ ok: true, synced: syncedCount, failed: failedCount, notesSynced, notesFailed, message: msg });
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

  // Xero requires a Contact on every ACCREC invoice. Resolve the customer name for
  // linked sales; walk-in sales (no customerId) fall back to a shared contact.
  const custIds = Array.from(new Set(
    txs.map((t) => t.customerId).filter((id): id is number => id != null),
  ));
  const custRows = custIds.length
    ? await db.select().from(customersTable).where(and(
        eq(customersTable.merchantId, merchantId),
        inArray(customersTable.id, custIds),
      ))
    : [];
  const custName = new Map<number, string>();
  for (const c of custRows) {
    custName.set(c.id, `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || `Customer ${c.id}`);
  }
  const WALK_IN_CONTACT = "Walk-in Customer";

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
      Contact:   { Name: (tx.customerId != null ? custName.get(tx.customerId) : undefined) ?? WALK_IN_CONTACT },
      InvoiceNumber: tx.receiptNumber ?? `KP-${tx.id}`,
      Date:      new Date(tx.createdAt).toISOString().split("T")[0],
      DueDate:   new Date(tx.createdAt).toISOString().split("T")[0],
      Reference: `KoaPOS Receipt ${tx.receiptNumber ?? tx.id}`,
      LineItems: lineItems,
      LineAmountTypes: "Inclusive",
    };
  });

  // Idempotent re-sync: skip any invoice whose InvoiceNumber already exists in
  // Xero, so re-running never creates duplicates (or 400s under the org's "unique
  // invoice numbers" setting). Only brand-new invoices are pushed.
  const existingNumbers = await fetchExistingInvoiceNumbers(
    auth,
    invoices.map((inv) => String(inv.InvoiceNumber)),
  );
  const toCreate = invoices.filter((inv) => !existingNumbers.has(String(inv.InvoiceNumber)));
  const skipped  = invoices.length - toCreate.length;

  if (toCreate.length === 0) {
    const msg = `All ${invoices.length} transactions already in Xero — nothing to sync`;
    await appendSyncLog(merchantId, { timestamp: new Date().toISOString(), type: "transactions", synced: 0, message: msg });
    res.json({ ok: true, synced: 0, skipped, message: msg });
    return;
  }

  const r = await fetch(`${XERO_API}/Invoices`, {
    method:  "PUT",
    headers: xeroHeaders(auth),
    body: JSON.stringify({ Invoices: toCreate }),
  });

  const status = r.ok ? "success" : "error";
  const msg    = r.ok
    ? `Synced ${toCreate.length} transactions${skipped ? ` (${skipped} already in Xero)` : ""}`
    : await xeroErrorMessage(r);
  if (!r.ok) req.log.warn({ merchantId, count: toCreate.length, status: r.status, msg }, "Xero sync/transactions failed");

  await appendSyncLog(merchantId, { timestamp: new Date().toISOString(), type: "transactions", synced: toCreate.length, ...(status === "error" ? { error: msg } : { message: msg }) });

  if (!r.ok) { res.status(r.status).json({ error: msg }); return; }
  res.json({ ok: true, synced: toCreate.length, skipped, message: msg });
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

  // Xero requires a Contact (the supplier) on every ACCPAY bill, and an AccountCode
  // on each bill line. Resolve supplier names; bills with no linked supplier fall
  // back to a shared contact. The expense account uses the mapped purchases account
  // if set, else Xero's conventional "300" (Purchases) — a wrong/absent code will
  // now surface a clear 400 reason to map.
  const creds = (await getCreds(merchantId)) ?? {};
  const purchasesCode = creds.mappings?.purchasesAccount ?? "300";

  const supIds = Array.from(new Set(
    pos.map((p) => p.supplierId).filter((id): id is number => id != null),
  ));
  const supRows = supIds.length
    ? await db.select().from(suppliersTable).where(and(
        eq(suppliersTable.merchantId, merchantId),
        inArray(suppliersTable.id, supIds),
      ))
    : [];
  const supName = new Map<number, string>();
  for (const s of supRows) supName.set(s.id, s.name);
  const UNKNOWN_SUPPLIER = "Unknown Supplier";

  type XeroPO = Record<string, unknown>;
  const xeroPos: XeroPO[] = pos.map((po) => {
    return {
      Type:            "ACCPAY",
      Status:          po.status === "received" ? "AUTHORISED" : "DRAFT",
      Contact:         { Name: (po.supplierId != null ? supName.get(po.supplierId) : undefined) ?? UNKNOWN_SUPPLIER },
      InvoiceNumber:   po.poNumber ?? `PO-${po.id}`,
      Date:            new Date(po.createdAt).toISOString().split("T")[0],
      DueDate:         po.expectedDate
        ? new Date(po.expectedDate).toISOString().split("T")[0]
        : new Date(po.createdAt).toISOString().split("T")[0],
      Reference:       `KoaPOS PO ${po.poNumber ?? po.id}`,
      LineItems:       [{ Description: "Purchase Order", Quantity: 1, UnitAmount: parseFloat(String(po.totalCost ?? 0)), AccountCode: purchasesCode }],
      LineAmountTypes: "Exclusive",
    };
  });

  // Idempotent re-sync: skip bills whose InvoiceNumber already exists in Xero.
  const existingNumbers = await fetchExistingInvoiceNumbers(
    auth,
    xeroPos.map((po) => String(po.InvoiceNumber)),
  );
  const toCreate = xeroPos.filter((po) => !existingNumbers.has(String(po.InvoiceNumber)));
  const skipped  = xeroPos.length - toCreate.length;

  if (toCreate.length === 0) {
    const msg = `All ${xeroPos.length} purchase orders already in Xero — nothing to sync`;
    await appendSyncLog(merchantId, { timestamp: new Date().toISOString(), type: "purchase_orders", synced: 0, message: msg });
    res.json({ ok: true, synced: 0, skipped, message: msg });
    return;
  }

  const r = await fetch(`${XERO_API}/Invoices`, {
    method:  "PUT",
    headers: xeroHeaders(auth),
    body: JSON.stringify({ Invoices: toCreate }),
  });

  const status = r.ok ? "success" : "error";
  const msg    = r.ok
    ? `Synced ${toCreate.length} purchase orders as bills${skipped ? ` (${skipped} already in Xero)` : ""}`
    : await xeroErrorMessage(r);
  if (!r.ok) req.log.warn({ merchantId, count: toCreate.length, status: r.status, msg }, "Xero sync/purchase-orders failed");

  await appendSyncLog(merchantId, { timestamp: new Date().toISOString(), type: "purchase_orders", synced: toCreate.length, ...(status === "error" ? { error: msg } : { message: msg }) });

  if (!r.ok) { res.status(r.status).json({ error: msg }); return; }
  res.json({ ok: true, synced: toCreate.length, skipped, message: msg });
});

/* ── GET /api/xero/sync/log ──────────────────────────────────────────────── */

router.get("/xero/sync/log", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const creds      = (await getCreds(merchantId)) ?? {};
  res.json(creds.syncLog ?? []);
});

/* ── POST /api/xero/sync-sale ───────────────────────────────────────────────
   Push a single transaction as a Xero Invoice (ACCREC). Called automatically
   after each sale when syncOnSale is enabled in syncSettings.
   ─────────────────────────────────────────────────────────────────────────── */

router.post("/xero/sync-sale", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const auth       = await withFreshToken(merchantId);
  if (!auth) { res.status(401).json({ error: "Not connected" }); return; }

  const { transactionId } = req.body as { transactionId?: number };
  if (!transactionId) { res.status(400).json({ error: "transactionId required" }); return; }

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.id, transactionId),
      eq(transactionsTable.merchantId, merchantId),
    ));

  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }

  const creds = (await getCreds(merchantId)) ?? {};
  const revenueCode = creds.mappings?.revenueAccount ?? "200";
  const gstType     = creds.mappings?.gstTaxType     ?? "OUTPUT";

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

  // Xero requires a Contact on every ACCREC invoice — resolve the linked customer,
  // else fall back to the shared walk-in contact.
  let contactName = "Walk-in Customer";
  if (tx.customerId != null) {
    const [cust] = await db.select().from(customersTable).where(and(
      eq(customersTable.id, tx.customerId),
      eq(customersTable.merchantId, merchantId),
    ));
    if (cust) contactName = `${cust.firstName ?? ""} ${cust.lastName ?? ""}`.trim() || cust.email || `Customer ${cust.id}`;
  }

  const invoiceNumber = tx.receiptNumber ?? `KP-${tx.id}`;
  const invoice = {
    Type:      "ACCREC",
    Status:    "AUTHORISED",
    Contact:   { Name: contactName },
    InvoiceNumber: invoiceNumber,
    Date:      new Date(tx.createdAt).toISOString().split("T")[0],
    DueDate:   new Date(tx.createdAt).toISOString().split("T")[0],
    Reference: `KoaPOS Receipt ${tx.receiptNumber ?? tx.id}`,
    LineItems: lineItems,
    LineAmountTypes: "Inclusive",
  };

  // Idempotent: if this sale's invoice is already in Xero (e.g. a manual retry
  // after the auto sync-on-sale already landed it), don't create a duplicate.
  const existingNumbers = await fetchExistingInvoiceNumbers(auth, [invoiceNumber]);
  if (existingNumbers.has(invoiceNumber)) {
    const msg = `Sale ${invoiceNumber} already in Xero`;
    await appendSyncLog(merchantId, { timestamp: new Date().toISOString(), type: "sale", synced: 0, message: msg });
    res.json({ ok: true, synced: 0, skipped: 1, message: msg });
    return;
  }

  const r = await fetch(`${XERO_API}/Invoices`, {
    method:  "PUT",
    headers: xeroHeaders(auth),
    body: JSON.stringify({ Invoices: [invoice] }),
  });

  const status = r.ok ? "success" : "error";
  const msg    = r.ok
    ? `Synced sale ${tx.receiptNumber ?? tx.id} to Xero`
    : await xeroErrorMessage(r);
  if (!r.ok) req.log.warn({ merchantId, transactionId, status: r.status, msg }, "Xero sync-sale failed");

  await appendSyncLog(merchantId, {
    timestamp: new Date().toISOString(),
    type: "sale",
    synced: 1,
    ...(status === "error" ? { error: msg } : { message: msg }),
  });

  if (!r.ok) { res.status(r.status).json({ error: msg }); return; }
  res.json({ ok: true, message: msg });
});

export default router;
