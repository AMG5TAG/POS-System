import { Router, type IRouter } from "express";
import {
  db, merchantsTable, dashboardAppSettingsTable,
  serviceJobsTable, appointmentsTable, invoicesTable, transactionsTable,
  dashboardNotesTable, customersTable,
} from "@workspace/db";
import { eq, and, gte, lte, lt, ne, notInArray, desc, sql } from "drizzle-orm";
import { customerDisplayName } from "../lib/customer-name";

/**
 * Public, read-only snapshot for the shared Dashboard app (/d/:token). NO
 * authentication — the merchant opts in via the `enabled` flag and chooses
 * exactly which sections are exposed. The link is addressed by an unguessable
 * per-merchant token (not the guessable business username) so it can't be found
 * by trying usernames. Only the data for enabled widgets is ever computed.
 */

const router: IRouter = Router();

const FINISHED = ["completed", "cancelled"];

router.get("/public/dashboard/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token || "").trim();
  if (!token) { res.status(404).json({ error: "Not found" }); return; }

  const [settings] = await db
    .select()
    .from(dashboardAppSettingsTable)
    .where(eq(dashboardAppSettingsTable.publicToken, token))
    .limit(1);

  // Master switch: when off (or the token doesn't resolve) the link is inert.
  // Both cases return 403 so a valid-but-disabled token can't be distinguished
  // from a bad one by the response.
  if (!settings?.enabled) {
    res.status(403).json({ error: "This dashboard is not currently shared." });
    return;
  }

  const [merchant] = await db
    .select({ id: merchantsTable.id, businessName: merchantsTable.businessName, logoUrl: merchantsTable.logoUrl })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, settings.merchantId))
    .limit(1);
  if (!merchant) { res.status(404).json({ error: "Dashboard not found" }); return; }

  const merchantId = merchant.id;
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const flags = {
    statusTiles:      settings.showStatusTiles,
    metricTiles:      settings.showMetricTiles,
    overdueBanner:    settings.showOverdueBanner,
    notifications:    settings.showNotifications,
    serviceJobs:      settings.showServiceJobsPanel,
    calendar:         settings.showCalendar,
    referralRevenue:  settings.showReferralRevenue,
  };

  // Resolve customer names once if any job/appointment widget is enabled.
  const needCustomers = flags.overdueBanner || flags.serviceJobs || flags.calendar;
  const customerMap = new Map<number, string | null>();
  if (needCustomers) {
    const customers = await db
      .select({ id: customersTable.id, firstName: customersTable.firstName, lastName: customersTable.lastName, company: customersTable.company })
      .from(customersTable)
      .where(eq(customersTable.merchantId, merchantId));
    for (const c of customers) customerMap.set(c.id, customerDisplayName(c.firstName, c.lastName, c.company));
  }
  const nameFor = (id: number | null) => (id != null ? customerMap.get(id) ?? null : null);

  const data: Record<string, unknown> = {};

  // ── Status tiles + service jobs share the active-jobs query ──
  if (flags.statusTiles || flags.serviceJobs || flags.overdueBanner) {
    const jobs = await db
      .select({
        jobNumber: serviceJobsTable.jobNumber,
        title: serviceJobsTable.title,
        status: serviceJobsTable.status,
        isCritical: serviceJobsTable.isCritical,
        customerId: serviceJobsTable.customerId,
        createdAt: serviceJobsTable.createdAt,
      })
      .from(serviceJobsTable)
      .where(eq(serviceJobsTable.merchantId, merchantId))
      .orderBy(desc(serviceJobsTable.createdAt));

    const active = jobs.filter((j) => !FINISHED.includes(j.status));

    if (flags.statusTiles) {
      data.statusTiles = {
        inProgress:       active.filter((j) => j.status === "in-progress").length,
        awaitingCustomer: active.filter((j) => j.status === "awaiting-customer").length,
        pending:          active.filter((j) => j.status === "pending").length,
        critical:         active.filter((j) => j.isCritical === "true").length,
        totalActive:      active.length,
      };
    }
    if (flags.serviceJobs) {
      data.serviceJobs = active.slice(0, 50).map((j) => ({
        jobNumber: j.jobNumber, title: j.title, status: j.status, customerName: nameFor(j.customerId),
      }));
    }
    if (flags.overdueBanner) {
      data.overdueJobs = active
        .filter((j) => j.createdAt < sevenDaysAgo)
        .slice(0, 25)
        .map((j) => ({ jobNumber: j.jobNumber, title: j.title, customerName: nameFor(j.customerId), since: j.createdAt.toISOString() }));
    }
  }

  // ── Metric tiles ──
  if (flags.metricTiles) {
    const [txnAgg, invPaidToday, pendingInv, activeJobsCount, upcomingApptCount] = await Promise.all([
      db.select({ total: sql<string>`COALESCE(SUM(CASE WHEN ${transactionsTable.status} = 'completed' THEN ${transactionsTable.total}::numeric ELSE 0 END), 0)` })
        .from(transactionsTable)
        .where(and(eq(transactionsTable.merchantId, merchantId), gte(transactionsTable.createdAt, startOfToday))),
      db.select({ total: sql<string>`COALESCE(SUM(${invoicesTable.total}::numeric), 0)` })
        .from(invoicesTable)
        .where(and(eq(invoicesTable.merchantId, merchantId), eq(invoicesTable.status, "paid"), gte(invoicesTable.paidAt, startOfToday))),
      db.select({ count: sql<string>`COUNT(*)` })
        .from(invoicesTable)
        .where(and(eq(invoicesTable.merchantId, merchantId), notInArray(invoicesTable.status, ["paid", "draft", "cancelled"]))),
      db.select({ count: sql<string>`COUNT(*)` })
        .from(serviceJobsTable)
        .where(and(eq(serviceJobsTable.merchantId, merchantId), notInArray(serviceJobsTable.status, FINISHED))),
      db.select({ count: sql<string>`COUNT(*)` })
        .from(appointmentsTable)
        .where(and(eq(appointmentsTable.merchantId, merchantId), gte(appointmentsTable.scheduledAt, now), lte(appointmentsTable.scheduledAt, in14Days), ne(appointmentsTable.status, "cancelled"))),
    ]);
    const todaySales = parseFloat(txnAgg[0]?.total ?? "0") + parseFloat(invPaidToday[0]?.total ?? "0");
    data.metricTiles = {
      todaySales:           Math.round(todaySales * 100) / 100,
      pendingInvoices:      Number(pendingInv[0]?.count ?? 0),
      activeJobs:           Number(activeJobsCount[0]?.count ?? 0),
      upcomingAppointments: Number(upcomingApptCount[0]?.count ?? 0),
    };
  }

  // ── Notifications (sticky notes) ──
  if (flags.notifications) {
    const notes = await db
      .select({ text: dashboardNotesTable.text, isCritical: dashboardNotesTable.isCritical })
      .from(dashboardNotesTable)
      .where(eq(dashboardNotesTable.merchantId, merchantId))
      .orderBy(desc(dashboardNotesTable.isCritical), desc(dashboardNotesTable.createdAt))
      .limit(30);
    data.notifications = notes;
  }

  // ── Calendar (upcoming appointments, next 14 days) ──
  if (flags.calendar) {
    const appts = await db
      .select({ title: appointmentsTable.title, scheduledAt: appointmentsTable.scheduledAt, customerId: appointmentsTable.customerId })
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.merchantId, merchantId), gte(appointmentsTable.scheduledAt, startOfToday), lt(appointmentsTable.scheduledAt, in14Days), ne(appointmentsTable.status, "cancelled")))
      .orderBy(appointmentsTable.scheduledAt)
      .limit(30);
    data.calendar = appts.map((a) => ({ title: a.title, scheduledAt: a.scheduledAt.toISOString(), customerName: nameFor(a.customerId) }));
  }

  // ── Top channels (by customer count) ──
  if (flags.referralRevenue) {
    const channels = await db
      .select({ channel: customersTable.heardFrom, count: sql<string>`COUNT(*)` })
      .from(customersTable)
      .where(and(eq(customersTable.merchantId, merchantId), ne(customersTable.heardFrom, "")))
      .groupBy(customersTable.heardFrom)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(8);
    data.referralChannels = channels
      .filter((c) => c.channel)
      .map((c) => ({ channel: c.channel as string, count: Number(c.count) }));
  }

  res.json({
    businessName: merchant.businessName,
    logoUrl: merchant.logoUrl,
    generatedAt: now.toISOString(),
    widgets: flags,
    data,
  });
});

export default router;
