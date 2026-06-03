import { Router, type IRouter } from "express";
import { db, kpiSettingsTable, kpiTargetsTable, transactionsTable, invoicesTable, customersTable, appointmentsTable, serviceJobsTable } from "@workspace/db";
import { eq, and, gte, sql, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const PatchKpiSettings = z.object({
  trackCategories: z.string(), trackAppointments: z.string(),
  trackServices: z.string(), trackSuppliers: z.string(), trackWastage: z.string(),
  weekStartDay: z.string(),
}).partial();

const router: IRouter = Router();

/* ── Settings ──────────────────────────────────────────────────────────────── */

router.get("/kpi-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(kpiSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/kpi-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = PatchKpiSettings.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(kpiSettingsTable)
      .set(parsed.data)
      .where(eq(kpiSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(kpiSettingsTable)
    .values({ merchantId, ...parsed.data }).returning();
  res.json(created);
});

/* ── Targets ───────────────────────────────────────────────────────────────── */

router.get("/kpi-targets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(kpiTargetsTable).where(eq(kpiTargetsTable.merchantId, merchantId));
  res.json({ items: items.map(r => ({ ...r, target: parseFloat(r.target as unknown as string) })), total: items.length });
});

router.post("/kpi-targets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { targetId, name, metric, categoryId = "", period = "monthly", target = 0, staffIds = "[]", reward = "null", notes = "", isActive = "true", startDate = null, endDate = null } = req.body;
  if (!targetId || !name || !metric) { res.status(400).json({ error: "targetId, name, and metric are required" }); return; }
  const [row] = await db.insert(kpiTargetsTable).values({ merchantId, targetId, name, metric, categoryId, period, target, staffIds, reward, notes, isActive, startDate, endDate }).returning();
  res.status(201).json({ ...row, target: parseFloat(row.target as unknown as string) });
});

router.patch("/kpi-targets/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, metric, categoryId, period, target, staffIds, reward, notes, isActive, showOnDashboard, startDate, endDate } = req.body;

  // When marking this KPI for dashboard display, unset all others first
  if (showOnDashboard === "true") {
    await db.update(kpiTargetsTable)
      .set({ showOnDashboard: "false" })
      .where(and(eq(kpiTargetsTable.merchantId, merchantId), ne(kpiTargetsTable.id, id)));
  }

  const updates: Partial<typeof kpiTargetsTable.$inferInsert> = {};
  if (name             !== undefined) updates.name            = name;
  if (metric           !== undefined) updates.metric          = metric;
  if (categoryId       !== undefined) updates.categoryId      = categoryId;
  if (period           !== undefined) updates.period          = period;
  if (target           !== undefined) updates.target          = target;
  if (staffIds         !== undefined) updates.staffIds        = staffIds;
  if (reward           !== undefined) updates.reward          = reward;
  if (notes            !== undefined) updates.notes           = notes;
  if (isActive         !== undefined) updates.isActive        = isActive;
  if (showOnDashboard  !== undefined) updates.showOnDashboard = showOnDashboard;
  if (startDate        !== undefined) updates.startDate       = startDate;
  if (endDate          !== undefined) updates.endDate         = endDate;

  const [row] = await db.update(kpiTargetsTable)
    .set(updates)
    .where(and(eq(kpiTargetsTable.id, id), eq(kpiTargetsTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, target: parseFloat(row.target as unknown as string) });
});

router.delete("/kpi-targets/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(kpiTargetsTable).where(and(eq(kpiTargetsTable.id, id), eq(kpiTargetsTable.merchantId, merchantId)));
  res.status(204).end();
});

/* ── Dashboard KPI ─────────────────────────────────────────────────────────── */

const WEEK_START_DAY: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function getPeriodStartForKpi(period: string, weekStartDay = "monday", startDate?: string | null): Date {
  // Fixed-start budget: use the provided start date
  if (startDate) {
    const d = new Date(startDate + "T00:00:00");
    if (!isNaN(d.getTime())) return d;
  }

  const now = new Date();
  switch (period) {
    case "daily": {
      const d = new Date(now); d.setHours(0, 0, 0, 0); return d;
    }
    case "weekly": {
      const d = new Date(now);
      const startDow = WEEK_START_DAY[weekStartDay] ?? 1;
      const dow = d.getDay();
      const daysBack = (dow - startDow + 7) % 7;
      d.setDate(d.getDate() - daysBack);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "monthly": {
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0);
    }
    case "annual": {
      return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    }
    default: {
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
  }
}

router.get("/kpi-targets/dashboard-kpi", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const [kpiRow] = await db
    .select()
    .from(kpiTargetsTable)
    .where(and(
      eq(kpiTargetsTable.merchantId, merchantId),
      eq(kpiTargetsTable.showOnDashboard, "true"),
      eq(kpiTargetsTable.isActive, "true"),
    ))
    .limit(1);

  if (!kpiRow) {
    res.json(null);
    return;
  }

  const [settingsRow] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.merchantId, merchantId)).limit(1);
  const weekStartDay = settingsRow?.weekStartDay ?? "monday";

  const kpi = { ...kpiRow, target: parseFloat(kpiRow.target as unknown as string) };
  const periodStart = getPeriodStartForKpi(kpi.period, weekStartDay, kpi.startDate);
  const metric = kpi.metric as string;

  let actual: number | null = null;

  try {
    if (metric === "revenue" || metric === "transactions" || metric === "avg_transaction") {
      const [txnAgg] = await db.select({
        totalSales: sql<string>`COALESCE(SUM(CASE WHEN ${transactionsTable.status} = 'completed' THEN ${transactionsTable.total}::numeric ELSE 0 END), 0)`,
        txnCount:   sql<string>`COUNT(CASE WHEN ${transactionsTable.status} = 'completed' THEN 1 END)`,
      }).from(transactionsTable)
        .where(and(eq(transactionsTable.merchantId, merchantId), gte(transactionsTable.createdAt, periodStart)));

      const [invAgg] = await db.select({
        invoiceSales: sql<string>`COALESCE(SUM(${invoicesTable.total}::numeric), 0)`,
        invCount:     sql<string>`COUNT(*)`,
      }).from(invoicesTable)
        .where(and(eq(invoicesTable.merchantId, merchantId), eq(invoicesTable.status, "paid"), gte(invoicesTable.paidAt, periodStart)));

      const totalSales = parseFloat(txnAgg?.totalSales ?? "0") + parseFloat(invAgg?.invoiceSales ?? "0");
      const txnCount   = Number(txnAgg?.txnCount ?? 0) + Number(invAgg?.invCount ?? 0);

      if (metric === "revenue")          actual = Math.round(totalSales * 100) / 100;
      else if (metric === "transactions") actual = txnCount;
      else                                actual = txnCount > 0 ? Math.round((totalSales / txnCount) * 100) / 100 : 0;

    } else if (metric === "new_customers") {
      const [r] = await db.select({ count: sql<string>`COUNT(*)` })
        .from(customersTable)
        .where(and(eq(customersTable.merchantId, merchantId), gte(customersTable.createdAt, periodStart)));
      actual = Number(r?.count ?? 0);

    } else if (metric === "appointments") {
      const [r] = await db.select({ count: sql<string>`COUNT(*)` })
        .from(appointmentsTable)
        .where(and(eq(appointmentsTable.merchantId, merchantId), gte(appointmentsTable.scheduledAt, periodStart)));
      actual = Number(r?.count ?? 0);

    } else if (metric === "services") {
      const [r] = await db.select({ count: sql<string>`COUNT(*)` })
        .from(serviceJobsTable)
        .where(and(eq(serviceJobsTable.merchantId, merchantId), gte(serviceJobsTable.createdAt, periodStart)));
      actual = Number(r?.count ?? 0);

    } else if (metric === "items_per_transaction") {
      const rows = await db.execute(sql`
        SELECT COALESCE(AVG(item_count), 0)::float AS avg_items
        FROM (
          SELECT jsonb_array_length(items) AS item_count
          FROM transactions
          WHERE merchant_id = ${merchantId}
            AND status = 'completed'
            AND created_at >= ${periodStart}
            AND jsonb_typeof(items) = 'array'
        ) sub
      `);
      actual = Math.round(Number((rows.rows[0] as { avg_items: number })?.avg_items ?? 0) * 100) / 100;
    }
    // metrics like loyalty_signups, category_revenue, refund_rate, gross_margin, upsell_rate, net_profit
    // are left as null (complex queries or require additional data)
  } catch {
    actual = null;
  }

  res.json({ kpi, actual });
});

export default router;
