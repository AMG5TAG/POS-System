import { Router, type IRouter } from "express";
import {
  db,
  merchantIntegrationsTable,
  payrollSettingsTable,
  payrollEmployeeLinksTable,
  payrollPayRunsTable,
  payrollPayslipsTable,
  payrollLeaveBalancesTable,
  staffTable,
  staffTimesheetsTable,
} from "@workspace/db";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getPayrollProvider,
  getOAuthConfig,
  isProviderConfigured,
  buildAuthorizeUrl,
  exchangeCode,
  refreshTokens,
  clientId,
  type PayrollAuth,
  type PayrollRegion,
} from "../services/payroll";

const router: IRouter = Router();

const DEFAULT_PROVIDER_KEY = "xero_payroll";
const XERO_ACCOUNTING_API = "https://api.xero.com/api.xro/2.0"; // journal sync (accounting connection)

type PayrollIntegrationCreds = { tenantId?: string; tenantName?: string };

/* ── settings helpers ──────────────────────────────────────────────────── */

async function getSettings(merchantId: number) {
  const [row] = await db
    .select()
    .from(payrollSettingsTable)
    .where(eq(payrollSettingsTable.merchantId, merchantId));
  return row ?? null;
}

async function ensureSettings(merchantId: number) {
  const existing = await getSettings(merchantId);
  if (existing) return existing;
  const [row] = await db
    .insert(payrollSettingsTable)
    .values({ merchantId, providerKey: DEFAULT_PROVIDER_KEY, region: "AU", status: "disconnected" })
    .returning();
  return row!;
}

/** The payroll provider this merchant has selected (defaults to Xero). */
async function activeProviderKey(merchantId: number): Promise<string> {
  const s = await getSettings(merchantId);
  return s?.providerKey ?? DEFAULT_PROVIDER_KEY;
}

function parseMappings(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

/* ── OAuth / token helpers (token row keyed by the active provider key) ──── */

async function getIntegrationRow(merchantId: number, providerKey: string) {
  const [row] = await db
    .select()
    .from(merchantIntegrationsTable)
    .where(
      and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, providerKey),
      ),
    );
  return row ?? null;
}

function buildCallbackUrl(proto: string, host: string): string {
  return `${proto}://${host}/api/payroll/auth/callback`;
}

/** Refresh the OAuth token if needed and return an adapter auth context. */
async function withFreshPayrollAuth(merchantId: number): Promise<PayrollAuth | null> {
  const settings = await getSettings(merchantId);
  const providerKey = settings?.providerKey ?? DEFAULT_PROVIDER_KEY;
  const cfg = getOAuthConfig(providerKey);
  if (!cfg) return null;

  const row = await getIntegrationRow(merchantId, providerKey);
  if (!row?.accessToken) return null;
  const creds: PayrollIntegrationCreds = row.credentials ? JSON.parse(row.credentials) : {};
  if (!creds.tenantId) return null;

  const region = (settings?.region as PayrollRegion) ?? "AU";

  const now = Date.now();
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() - now > 3 * 60 * 1000) {
    return cfg.buildAuth({ accessToken: row.accessToken, tenantId: creds.tenantId, region, clientId: clientId(cfg) });
  }

  if (!row.refreshToken) return null;
  const tokens = await refreshTokens(cfg, row.refreshToken);
  if (!tokens) return null;

  await db
    .update(merchantIntegrationsTable)
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? row.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    })
    .where(eq(merchantIntegrationsTable.id, row.id));

  return cfg.buildAuth({ accessToken: tokens.access_token, tenantId: creds.tenantId, region, clientId: clientId(cfg) });
}

async function appendSyncLog(merchantId: number, type: string, message: string): Promise<void> {
  const settings = await ensureSettings(merchantId);
  let log: Array<{ timestamp: string; type: string; message: string }> = [];
  try {
    log = settings.syncLog ? JSON.parse(settings.syncLog) : [];
  } catch {
    log = [];
  }
  log.unshift({ timestamp: new Date().toISOString(), type, message });
  await db
    .update(payrollSettingsTable)
    .set({ syncLog: JSON.stringify(log.slice(0, 50)), lastSyncAt: new Date() })
    .where(eq(payrollSettingsTable.merchantId, merchantId));
}

/* ── serializers (match payroll.openapi.yaml schemas) ──────────────────── */

const serializePayRun = (r: typeof payrollPayRunsTable.$inferSelect) => ({
  id: r.id,
  providerPayRunId: r.providerPayRunId,
  periodStart: r.periodStart,
  periodEnd: r.periodEnd,
  paymentDate: r.paymentDate ?? null,
  status: r.status,
  grossCents: r.grossCents,
  paygCents: r.paygCents,
  superCents: r.superCents,
  netCents: r.netCents,
  employeeCount: r.employeeCount,
  createdAt: r.createdAt.toISOString(),
});

const serializePayslip = (r: typeof payrollPayslipsTable.$inferSelect) => ({
  id: r.id,
  payRunId: r.payRunId,
  staffId: r.staffId ?? null,
  providerPayslipId: r.providerPayslipId,
  providerEmployeeId: r.providerEmployeeId,
  employeeName: r.employeeName,
  grossCents: r.grossCents,
  paygCents: r.paygCents,
  superCents: r.superCents,
  netCents: r.netCents,
  leaveAccruedHours: r.leaveAccruedHours ?? null,
  pdfRef: r.pdfRef ?? null,
});

const serializeLeaveBalance = (r: typeof payrollLeaveBalancesTable.$inferSelect) => ({
  id: r.id,
  staffId: r.staffId ?? null,
  providerEmployeeId: r.providerEmployeeId,
  employeeName: r.employeeName,
  leaveType: r.leaveType,
  leaveTypeName: r.leaveTypeName,
  balanceHours: r.balanceHours,
  accruedHours: r.accruedHours ?? null,
  asAtDate: r.asAtDate ?? null,
});

/** Normalise a provider pay-run status to KoaPOS's vocabulary. */
function normaliseStatus(providerStatus: string): string {
  const s = providerStatus.toLowerCase();
  if (s.includes("post")) return "posted";
  if (s.includes("paid")) return "paid";
  if (s.includes("file")) return "filed";
  return "draft";
}

/* ── GET /payroll/status ───────────────────────────────────────────────── */

router.get("/payroll/status", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const settings = await getSettings(merchantId);
  const providerKey = settings?.providerKey ?? DEFAULT_PROVIDER_KEY;
  const cfg = getOAuthConfig(providerKey);
  const configured = cfg ? isProviderConfigured(cfg) : false;

  const row = await getIntegrationRow(merchantId, providerKey);
  const creds: PayrollIntegrationCreds = row?.credentials ? JSON.parse(row.credentials) : {};
  const connected = !!(row?.status === "connected" && row.accessToken && creds.tenantId);

  res.json({
    configured,
    connected,
    providerKey,
    region: settings?.region ?? "AU",
    accountHandle: creds.tenantName ?? null,
    payCalendarId: settings?.payCalendarId ?? null,
    lastSyncAt: settings?.lastSyncAt?.toISOString() ?? null,
  });
});

/* ── OAuth start / callback (browser redirects; not in generated client) ── */

router.get("/payroll/auth/start", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const providerKey = await activeProviderKey(merchantId);
  const cfg = getOAuthConfig(providerKey);
  if (!cfg || !isProviderConfigured(cfg)) {
    res.redirect("/settings/payroll?error=not_configured");
    return;
  }
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const redirectUri = buildCallbackUrl(proto, req.headers.host ?? "");
  const url = buildAuthorizeUrl(cfg, redirectUri, String(merchantId));
  if (!url) {
    res.redirect("/settings/payroll?error=not_configured");
    return;
  }
  res.redirect(url);
});

router.get("/payroll/auth/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code) {
    res.redirect("/settings/payroll?error=oauth_denied");
    return;
  }
  const merchantId = parseInt(state ?? "", 10);
  if (Number.isNaN(merchantId)) {
    res.redirect("/settings/payroll?error=invalid_state");
    return;
  }
  const providerKey = await activeProviderKey(merchantId);
  const cfg = getOAuthConfig(providerKey);
  if (!cfg) {
    res.redirect("/settings/payroll?error=not_configured");
    return;
  }

  const cbProto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const redirectUri = buildCallbackUrl(cbProto, req.headers.host ?? "");

  const tokens = await exchangeCode(cfg, code, redirectUri);
  if (!tokens) {
    res.redirect("/settings/payroll?error=token_failed");
    return;
  }

  // Resolve the provider's connection identifier (e.g. the Xero tenant).
  let tenantId = "";
  let tenantName = "";
  try {
    const resolved = await cfg.resolveTenant(tokens.access_token, clientId(cfg));
    tenantId = resolved.tenantId;
    tenantName = resolved.tenantName;
  } catch {
    /* best-effort */
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const credentials = JSON.stringify({ tenantId, tenantName } satisfies PayrollIntegrationCreds);
  const existing = await getIntegrationRow(merchantId, providerKey);
  if (existing) {
    await db
      .update(merchantIntegrationsTable)
      .set({
        status: "connected",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
        credentials,
        connectedAt: new Date(),
      })
      .where(eq(merchantIntegrationsTable.id, existing.id));
  } else {
    await db.insert(merchantIntegrationsTable).values({
      merchantId,
      integrationKey: providerKey,
      status: "connected",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: expiresAt,
      credentials,
      connectedAt: new Date(),
    });
  }

  const settings = await ensureSettings(merchantId);
  await db
    .update(payrollSettingsTable)
    .set({ status: "connected" })
    .where(eq(payrollSettingsTable.id, settings.id));

  res.redirect("/staff/payroll?success=connected");
});

router.delete("/payroll/disconnect", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const providerKey = await activeProviderKey(merchantId);
  await db
    .delete(merchantIntegrationsTable)
    .where(
      and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, providerKey),
      ),
    );
  const settings = await getSettings(merchantId);
  if (settings) {
    await db
      .update(payrollSettingsTable)
      .set({ status: "disconnected" })
      .where(eq(payrollSettingsTable.id, settings.id));
  }
  res.json({ ok: true });
});

/* ── GET / PUT /payroll/settings ───────────────────────────────────────── */

router.get("/payroll/settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const s = await ensureSettings(merchantId);
  res.json({
    providerKey: s.providerKey,
    region: s.region,
    status: s.status,
    payCalendarId: s.payCalendarId ?? null,
    accountMappings: parseMappings(s.accountMappings),
    lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
  });
});

router.put("/payroll/settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { providerKey, region, payCalendarId, accountMappings } = req.body as {
    providerKey?: string;
    region?: string;
    payCalendarId?: string | null;
    accountMappings?: Record<string, string> | null;
  };
  // Reject unknown providers so the connect flow always has a config.
  if (providerKey !== undefined && !getOAuthConfig(providerKey)) {
    res.status(400).json({ error: "Unknown payroll provider" });
    return;
  }
  const s = await ensureSettings(merchantId);
  const updates: Partial<typeof payrollSettingsTable.$inferInsert> = {};
  if (providerKey !== undefined) updates.providerKey = providerKey;
  if (region !== undefined) updates.region = region;
  if (payCalendarId !== undefined) updates.payCalendarId = payCalendarId ?? null;
  if (accountMappings !== undefined) updates.accountMappings = accountMappings ? JSON.stringify(accountMappings) : null;
  const [updated] = await db
    .update(payrollSettingsTable)
    .set(updates)
    .where(eq(payrollSettingsTable.id, s.id))
    .returning();
  res.json({
    providerKey: updated!.providerKey,
    region: updated!.region,
    status: updated!.status,
    payCalendarId: updated!.payCalendarId ?? null,
    accountMappings: parseMappings(updated!.accountMappings),
    lastSyncAt: updated!.lastSyncAt?.toISOString() ?? null,
  });
});

/* ── POST /payroll/sync/employees ──────────────────────────────────────── */

router.post("/payroll/sync/employees", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const providerKey = await activeProviderKey(merchantId);
  const auth = await withFreshPayrollAuth(merchantId);
  if (!auth) {
    res.status(401).json({ error: "Payroll provider not connected" });
    return;
  }
  const provider = getPayrollProvider(providerKey);
  if (!provider) {
    res.status(400).json({ error: "Unknown payroll provider" });
    return;
  }

  let synced = 0;
  let failed = 0;
  try {
    const employees = await provider.listEmployees(auth);
    const staff = await db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId));

    const byEmail = new Map<string, (typeof employees)[number]>();
    const byName = new Map<string, (typeof employees)[number]>();
    for (const e of employees) {
      if (e.email) byEmail.set(e.email.toLowerCase(), e);
      byName.set(`${e.firstName} ${e.lastName}`.trim().toLowerCase(), e);
    }

    for (const member of staff) {
      const match =
        (member.email ? byEmail.get(member.email.toLowerCase()) : undefined) ??
        byName.get(member.name.trim().toLowerCase());
      if (!match) {
        failed++;
        continue;
      }
      const [existing] = await db
        .select()
        .from(payrollEmployeeLinksTable)
        .where(
          and(
            eq(payrollEmployeeLinksTable.merchantId, merchantId),
            eq(payrollEmployeeLinksTable.staffId, member.id),
            eq(payrollEmployeeLinksTable.providerKey, providerKey),
          ),
        );
      if (existing) {
        await db
          .update(payrollEmployeeLinksTable)
          .set({ providerEmployeeId: match.employeeId, status: "linked", lastSyncedAt: new Date() })
          .where(eq(payrollEmployeeLinksTable.id, existing.id));
      } else {
        await db.insert(payrollEmployeeLinksTable).values({
          merchantId,
          staffId: member.id,
          providerKey,
          providerEmployeeId: match.employeeId,
          status: "linked",
          lastSyncedAt: new Date(),
        });
      }
      synced++;
    }
  } catch (err) {
    res.status(502).json({ error: `Provider error: ${(err as Error).message}` });
    return;
  }

  const message = `Linked ${synced} employee${synced !== 1 ? "s" : ""}${failed ? `, ${failed} unmatched` : ""}`;
  await appendSyncLog(merchantId, "employees", message);
  res.json({ synced, failed, message });
});

/* ── POST /payroll/sync/timesheets ─────────────────────────────────────── */

router.post("/payroll/sync/timesheets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { periodStart, periodEnd } = req.body as { periodStart?: string; periodEnd?: string };
  if (!periodStart || !periodEnd) {
    res.status(400).json({ error: "periodStart and periodEnd are required" });
    return;
  }
  const providerKey = await activeProviderKey(merchantId);
  const auth = await withFreshPayrollAuth(merchantId);
  if (!auth) {
    res.status(401).json({ error: "Payroll provider not connected" });
    return;
  }
  const provider = getPayrollProvider(providerKey)!;

  const links = await db
    .select()
    .from(payrollEmployeeLinksTable)
    .where(
      and(
        eq(payrollEmployeeLinksTable.merchantId, merchantId),
        eq(payrollEmployeeLinksTable.providerKey, providerKey),
      ),
    );
  const staffToEmployee = new Map(links.map((l) => [l.staffId, l.providerEmployeeId]));

  const entries = await db
    .select()
    .from(staffTimesheetsTable)
    .where(
      and(
        eq(staffTimesheetsTable.merchantId, merchantId),
        gte(staffTimesheetsTable.date, periodStart),
        lte(staffTimesheetsTable.date, periodEnd),
      ),
    );

  const lines = entries
    .filter((e) => e.clockOut && staffToEmployee.has(e.staffId))
    .map((e) => {
      const [ih, im] = e.clockIn.split(":").map(Number);
      const [oh, om] = (e.clockOut as string).split(":").map(Number);
      const hours = Math.max(0, (oh * 60 + om - (ih * 60 + im)) / 60);
      return { employeeId: staffToEmployee.get(e.staffId)!, date: e.date, hours: Math.round(hours * 100) / 100 };
    });

  if (lines.length === 0) {
    res.json({ synced: 0, failed: 0, message: "No matched timesheet entries in range" });
    return;
  }
  try {
    const { pushed } = await provider.pushTimesheets(auth, lines);
    const message = `Pushed timesheets for ${pushed} employee${pushed !== 1 ? "s" : ""}`;
    await appendSyncLog(merchantId, "timesheets", message);
    res.json({ synced: pushed, failed: 0, message });
  } catch (err) {
    res.status(502).json({ error: `Provider error: ${(err as Error).message}` });
  }
});

/* ── GET / POST /payroll/pay-runs ──────────────────────────────────────── */

router.get("/payroll/pay-runs", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(payrollPayRunsTable)
    .where(eq(payrollPayRunsTable.merchantId, merchantId))
    .orderBy(desc(payrollPayRunsTable.periodEnd));
  res.json({ items: rows.map(serializePayRun) });
});

router.post("/payroll/pay-runs", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { periodStart, periodEnd, paymentDate } = req.body as {
    periodStart?: string;
    periodEnd?: string;
    paymentDate?: string | null;
  };
  if (!periodStart || !periodEnd) {
    res.status(400).json({ error: "periodStart and periodEnd are required" });
    return;
  }
  const providerKey = await activeProviderKey(merchantId);
  const auth = await withFreshPayrollAuth(merchantId);
  if (!auth) {
    res.status(401).json({ error: "Payroll provider not connected" });
    return;
  }
  const provider = getPayrollProvider(providerKey)!;
  const settings = await getSettings(merchantId);

  let providerRun;
  try {
    providerRun = await provider.createPayRun(auth, {
      periodStart,
      periodEnd,
      paymentDate: paymentDate ?? undefined,
      payCalendarId: settings?.payCalendarId ?? undefined,
    });
  } catch (err) {
    res.status(502).json({ error: `Provider error: ${(err as Error).message}` });
    return;
  }

  const [row] = await db
    .insert(payrollPayRunsTable)
    .values({
      merchantId,
      providerKey,
      providerPayRunId: providerRun.payRunId,
      periodStart: providerRun.periodStart || periodStart,
      periodEnd: providerRun.periodEnd || periodEnd,
      paymentDate: providerRun.paymentDate ?? paymentDate ?? null,
      status: normaliseStatus(providerRun.status),
      grossCents: providerRun.grossCents,
      paygCents: providerRun.paygCents,
      superCents: providerRun.superCents,
      netCents: providerRun.netCents,
      employeeCount: providerRun.employeeCount,
    })
    .returning();

  await appendSyncLog(merchantId, "pay_run", `Created draft pay run ${periodStart} – ${periodEnd}`);
  res.status(201).json(serializePayRun(row!));
});

/** Refresh and persist payslips for a mirrored pay run from the provider. */
async function refreshPayslips(
  merchantId: number,
  providerKey: string,
  auth: PayrollAuth,
  payRun: typeof payrollPayRunsTable.$inferSelect,
): Promise<(typeof payrollPayslipsTable.$inferSelect)[]> {
  const provider = getPayrollProvider(providerKey)!;
  const slips = await provider.getPayslips(auth, payRun.providerPayRunId);
  const links = await db
    .select()
    .from(payrollEmployeeLinksTable)
    .where(eq(payrollEmployeeLinksTable.merchantId, merchantId));
  const employeeToStaff = new Map(links.map((l) => [l.providerEmployeeId, l.staffId]));

  await db.delete(payrollPayslipsTable).where(eq(payrollPayslipsTable.payRunId, payRun.id));
  if (slips.length === 0) return [];
  await db.insert(payrollPayslipsTable).values(
    slips.map((s) => ({
      merchantId,
      payRunId: payRun.id,
      staffId: employeeToStaff.get(s.employeeId) ?? null,
      providerPayslipId: s.payslipId,
      providerEmployeeId: s.employeeId,
      employeeName: s.employeeName,
      grossCents: s.grossCents,
      paygCents: s.paygCents,
      superCents: s.superCents,
      netCents: s.netCents,
      leaveAccruedHours: s.leaveAccruedHours ?? null,
    })),
  );
  return db.select().from(payrollPayslipsTable).where(eq(payrollPayslipsTable.payRunId, payRun.id));
}

router.get("/payroll/pay-runs/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [run] = await db
    .select()
    .from(payrollPayRunsTable)
    .where(and(eq(payrollPayRunsTable.id, id), eq(payrollPayRunsTable.merchantId, merchantId)));
  if (!run) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  let payslips = await db
    .select()
    .from(payrollPayslipsTable)
    .where(eq(payrollPayslipsTable.payRunId, run.id));

  if (payslips.length === 0) {
    const auth = await withFreshPayrollAuth(merchantId);
    if (auth) {
      try {
        payslips = await refreshPayslips(merchantId, await activeProviderKey(merchantId), auth, run);
      } catch {
        /* leave payslips empty on provider error */
      }
    }
  }

  res.json({ payRun: serializePayRun(run), payslips: payslips.map(serializePayslip) });
});

router.post("/payroll/pay-runs/:id/post", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [run] = await db
    .select()
    .from(payrollPayRunsTable)
    .where(and(eq(payrollPayRunsTable.id, id), eq(payrollPayRunsTable.merchantId, merchantId)));
  if (!run) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const providerKey = await activeProviderKey(merchantId);
  const auth = await withFreshPayrollAuth(merchantId);
  if (!auth) {
    res.status(401).json({ error: "Payroll provider not connected" });
    return;
  }
  const provider = getPayrollProvider(providerKey)!;

  let posted;
  try {
    posted = await provider.postPayRun(auth, run.providerPayRunId);
  } catch (err) {
    res.status(502).json({ error: `Provider error: ${(err as Error).message}` });
    return;
  }

  const [updated] = await db
    .update(payrollPayRunsTable)
    .set({
      status: normaliseStatus(posted.status),
      grossCents: posted.grossCents,
      paygCents: posted.paygCents,
      superCents: posted.superCents,
      netCents: posted.netCents,
      employeeCount: posted.employeeCount,
    })
    .where(eq(payrollPayRunsTable.id, run.id))
    .returning();

  try {
    await refreshPayslips(merchantId, providerKey, auth, updated!);
  } catch {
    /* best-effort */
  }
  await appendSyncLog(merchantId, "pay_run", `Posted pay run ${run.periodStart} – ${run.periodEnd}`);
  res.json(serializePayRun(updated!));
});

/* ── GET /payroll/payslips ─────────────────────────────────────────────── */

router.get("/payroll/payslips", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { payRunId, staffId } = req.query as { payRunId?: string; staffId?: string };
  const conditions = [eq(payrollPayslipsTable.merchantId, merchantId)];
  if (payRunId) conditions.push(eq(payrollPayslipsTable.payRunId, parseInt(payRunId, 10)));
  if (staffId) conditions.push(eq(payrollPayslipsTable.staffId, parseInt(staffId, 10)));
  const rows = await db
    .select()
    .from(payrollPayslipsTable)
    .where(and(...conditions))
    .orderBy(desc(payrollPayslipsTable.id));
  res.json({ items: rows.map(serializePayslip) });
});

/* ── GET /payroll/leave-balances ───────────────────────────────────────── */

router.get("/payroll/leave-balances", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { staffId } = req.query as { staffId?: string };

  let rows = await db
    .select()
    .from(payrollLeaveBalancesTable)
    .where(eq(payrollLeaveBalancesTable.merchantId, merchantId));

  // Refresh from provider on first load (empty mirror) if connected.
  if (rows.length === 0) {
    const providerKey = await activeProviderKey(merchantId);
    const auth = await withFreshPayrollAuth(merchantId);
    if (auth) {
      try {
        const provider = getPayrollProvider(providerKey)!;
        const balances = await provider.getLeaveBalances(auth);
        const links = await db
          .select()
          .from(payrollEmployeeLinksTable)
          .where(eq(payrollEmployeeLinksTable.merchantId, merchantId));
        const employeeToStaff = new Map(links.map((l) => [l.providerEmployeeId, l.staffId]));
        if (balances.length > 0) {
          await db.insert(payrollLeaveBalancesTable).values(
            balances.map((b) => ({
              merchantId,
              staffId: employeeToStaff.get(b.employeeId) ?? null,
              providerEmployeeId: b.employeeId,
              employeeName: b.employeeName,
              leaveType: b.leaveType,
              leaveTypeName: b.leaveTypeName,
              balanceHours: b.balanceHours,
              accruedHours: b.accruedHours ?? null,
              asAtDate: b.asAtDate ?? null,
            })),
          );
          rows = await db
            .select()
            .from(payrollLeaveBalancesTable)
            .where(eq(payrollLeaveBalancesTable.merchantId, merchantId));
        }
      } catch {
        /* leave empty on provider error */
      }
    }
  }

  if (staffId) {
    const sid = parseInt(staffId, 10);
    rows = rows.filter((r) => r.staffId === sid);
  }
  res.json({ items: rows.map(serializeLeaveBalance) });
});

/* ── POST /payroll/sync/journal — push posted pay run to Xero accounting ── */

router.post("/payroll/sync/journal", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { payRunId } = req.body as { payRunId?: number };
  if (!payRunId) {
    res.status(400).json({ error: "payRunId is required" });
    return;
  }
  const [run] = await db
    .select()
    .from(payrollPayRunsTable)
    .where(and(eq(payrollPayRunsTable.id, payRunId), eq(payrollPayRunsTable.merchantId, merchantId)));
  if (!run) {
    res.status(404).json({ error: "Pay run not found" });
    return;
  }

  const settings = await getSettings(merchantId);
  const m = parseMappings(settings?.accountMappings ?? null);
  const required = ["wagesExpenseAccount", "payeLiabilityAccount", "superLiabilityAccount", "wagesPayableAccount"];
  if (required.some((k) => !m[k])) {
    res.json({ synced: 0, failed: 1, message: "Configure account mappings before syncing the journal" });
    return;
  }

  // Journal uses the ACCOUNTING (xero) connection, independent of the payroll provider.
  const [acct] = await db
    .select()
    .from(merchantIntegrationsTable)
    .where(
      and(eq(merchantIntegrationsTable.merchantId, merchantId), eq(merchantIntegrationsTable.integrationKey, "xero")),
    );
  const acctCreds: PayrollIntegrationCreds = acct?.credentials ? JSON.parse(acct.credentials) : {};
  if (!acct?.accessToken || !acctCreds.tenantId) {
    res.json({ synced: 0, failed: 1, message: "Connect the Xero accounting integration to sync journals" });
    return;
  }

  const d = (cents: number) => Math.round(cents) / 100;
  const journal = {
    ManualJournals: [
      {
        Narration: `KoaPOS Payroll ${run.periodStart} – ${run.periodEnd}`,
        Date: run.paymentDate ?? run.periodEnd,
        Status: "POSTED",
        JournalLines: [
          { LineAmount: d(run.grossCents), AccountCode: m.wagesExpenseAccount, Description: "Gross wages" },
          { LineAmount: d(run.superCents), AccountCode: m.superLiabilityAccount, Description: "Superannuation expense" },
          { LineAmount: -d(run.paygCents), AccountCode: m.payeLiabilityAccount, Description: "PAYG withholding" },
          { LineAmount: -d(run.superCents), AccountCode: m.superLiabilityAccount, Description: "Super payable" },
          { LineAmount: -d(run.grossCents - run.paygCents), AccountCode: m.wagesPayableAccount, Description: "Net wages payable" },
        ],
      },
    ],
  };

  try {
    const r = await fetch(`${XERO_ACCOUNTING_API}/ManualJournals`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${acct.accessToken}`,
        "xero-tenant-id": acctCreds.tenantId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(journal),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      res.status(502).json({ error: `Xero accounting error ${r.status}: ${body.slice(0, 200)}` });
      return;
    }
  } catch (err) {
    res.status(502).json({ error: `Journal sync failed: ${(err as Error).message}` });
    return;
  }

  await appendSyncLog(merchantId, "journal", `Posted payroll journal for ${run.periodStart} – ${run.periodEnd}`);
  res.json({ synced: 1, failed: 0, message: "Payroll journal posted to Xero" });
});

export default router;
