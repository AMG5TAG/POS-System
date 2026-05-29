import { Router, type IRouter } from "express";
import { db, transactionsTable, customersTable, productsTable, appointmentsTable, serviceJobsTable, invoicesTable, dashboardConfigTable, productTypesTable } from "@workspace/db";
import { eq, and, gte, sql, desc, lt, inArray, or, isNull, isNotNull, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { GetDashboardSummaryQueryParams, GetRecentTransactionsQueryParams, GetSalesChartQueryParams, GetTopProductsQueryParams, GetDashboardCalendarQueryParams, UpsertDashboardConfigBody } from "@workspace/api-zod";

// Australian public holidays (national + NSW) for 2026
const AU_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-26": "Australia Day",
  "2026-04-03": "Good Friday",
  "2026-04-04": "Easter Saturday",
  "2026-04-05": "Easter Sunday",
  "2026-04-06": "Easter Monday",
  "2026-04-25": "Anzac Day",
  "2026-06-08": "King's Birthday",
  "2026-08-03": "Bank Holiday (NSW)",
  "2026-10-05": "Labour Day (NSW)",
  "2026-12-25": "Christmas Day",
  "2026-12-26": "Boxing Day",
};

function getPublicHoliday(dateStr: string): string | null {
  return AU_HOLIDAYS_2026[dateStr] ?? null;
}

const router: IRouter = Router();

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
    default: {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
}

function getPeriodEnd(period: string): Date {
  const now = new Date();
  if (period === "yesterday") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return now;
}

/** Returns [currentStart, currentEnd, prevStart, prevEnd] for activity comparison */
function getActivityWindows(period: string): [Date, Date, Date, Date] {
  const now = new Date();
  switch (period) {
    case "day": {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 1);
      const prevEnd = new Date(start);
      return [start, now, prevStart, prevEnd];
    }
    case "week": {
      const start = new Date(now); start.setDate(start.getDate() - 7);
      const prevStart = new Date(now); prevStart.setDate(prevStart.getDate() - 14);
      const prevEnd = new Date(start);
      return [start, now, prevStart, prevEnd];
    }
    case "month": {
      const start = new Date(now); start.setDate(start.getDate() - 30);
      const prevStart = new Date(now); prevStart.setDate(prevStart.getDate() - 60);
      const prevEnd = new Date(start);
      return [start, now, prevStart, prevEnd];
    }
    case "year": {
      const start = new Date(now); start.setFullYear(start.getFullYear() - 1);
      const prevStart = new Date(now); prevStart.setFullYear(prevStart.getFullYear() - 2);
      const prevEnd = new Date(start);
      return [start, now, prevStart, prevEnd];
    }
    default: {
      const start = new Date(now); start.setDate(start.getDate() - 7);
      const prevStart = new Date(now); prevStart.setDate(prevStart.getDate() - 14);
      const prevEnd = new Date(start);
      return [start, now, prevStart, prevEnd];
    }
  }
}

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const queryParams = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const period = queryParams.data.period ?? "today";
  const periodStart = getPeriodStart(period);
  const periodEnd = getPeriodEnd(period);
  const merchantId = req.session.merchantId!;

  const [transactions, paidInvoices] = await Promise.all([
    db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.merchantId, merchantId),
          gte(transactionsTable.createdAt, periodStart),
          period === "yesterday" ? lt(transactionsTable.createdAt, periodEnd) : undefined,
        )
      ),
    db
      .select()
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.merchantId, merchantId),
          eq(invoicesTable.status, "paid"),
          gte(invoicesTable.paidAt, periodStart),
          period === "yesterday" ? lt(invoicesTable.paidAt, periodEnd) : undefined,
        )
      ),
  ]);

  const completedTxns = transactions.filter((t) => t.status === "completed");
  const refundedTxns = transactions.filter((t) => t.status === "refunded");

  const posSales = completedTxns.reduce((sum, t) => sum + parseFloat(t.total), 0);
  const invoiceSales = paidInvoices.reduce((sum, i) => sum + parseFloat(String(i.total)), 0);
  const totalSales = posSales + invoiceSales;
  const refundTotal = refundedTxns.reduce((sum, t) => sum + parseFloat(t.total), 0);
  const discountTotal = completedTxns.reduce((sum, t) => sum + parseFloat(t.discountTotal), 0);
  const transactionCount = completedTxns.length + paidInvoices.length;
  const averageOrderValue = transactionCount > 0 ? totalSales / transactionCount : 0;

  // Items sold + collect unique productIds for COGS lookup
  let itemsSold = 0;
  const soldItems: { productId: number; quantity: number }[] = [];
  for (const t of completedTxns) {
    const items = Array.isArray(t.items) ? t.items : [];
    for (const item of items as { productId?: number; quantity?: number }[]) {
      const qty = item.quantity ?? 0;
      itemsSold += qty;
      if (item.productId && item.productId > 0 && qty > 0) {
        soldItems.push({ productId: item.productId, quantity: qty });
      }
    }
  }

  // COGS: look up costPrice for each unique product sold, then multiply by quantity
  let costTotal = 0;
  if (soldItems.length > 0) {
    const uniqueIds = [...new Set(soldItems.map((i) => i.productId))];
    const costRows = await db
      .select({ id: productsTable.id, costPrice: productsTable.costPrice })
      .from(productsTable)
      .where(and(eq(productsTable.merchantId, merchantId), inArray(productsTable.id, uniqueIds)));
    const costMap = new Map(costRows.map((r) => [r.id, r.costPrice ? parseFloat(r.costPrice) : 0]));
    for (const { productId, quantity } of soldItems) {
      costTotal += (costMap.get(productId) ?? 0) * quantity;
    }
  }

  // New customers in period
  const newCustomersWhere = period === "yesterday"
    ? and(eq(customersTable.merchantId, merchantId), gte(customersTable.createdAt, periodStart), lt(customersTable.createdAt, periodEnd))
    : and(eq(customersTable.merchantId, merchantId), gte(customersTable.createdAt, periodStart));
  const [newCustomersResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(customersTable)
    .where(newCustomersWhere);

  // Low stock count (exclude service-type products — they have no stock)
  const [serviceType] = await db.select({ id: productTypesTable.id })
    .from(productTypesTable)
    .where(and(eq(productTypesTable.merchantId, merchantId), eq(productTypesTable.slug, "service")));
  const products = await db
    .select()
    .from(productsTable)
    .where(and(
      eq(productsTable.merchantId, merchantId),
      eq(productsTable.trackInventory, "true"),
      serviceType ? ne(productsTable.productTypeId, serviceType.id) : undefined,
    ));

  const lowStockCount = products.filter((p) => p.stockQuantity <= (p.lowStockThreshold ?? 5)).length;

  // Top payment method
  const paymentCounts: Record<string, number> = {};
  for (const t of completedTxns) {
    paymentCounts[t.paymentMethod] = (paymentCounts[t.paymentMethod] ?? 0) + 1;
  }
  const topPaymentMethod = Object.entries(paymentCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  // Invoices awaiting payment (status sent or overdue — not draft, not paid)
  const [pendingInvoiceResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.merchantId, merchantId),
      inArray(invoicesTable.status, ["sent", "overdue"]),
    ));
  const pendingInvoiceCount = Number(pendingInvoiceResult?.count ?? 0);

  res.json({
    totalSales: Math.round(totalSales * 100) / 100,
    posSales: Math.round(posSales * 100) / 100,
    invoiceSales: Math.round(invoiceSales * 100) / 100,
    posCount: completedTxns.length,
    invoiceCount: paidInvoices.length,
    pendingInvoiceCount,
    transactionCount,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    newCustomers: Number(newCustomersResult.count),
    lowStockCount,
    period,
    refundTotal: Math.round(refundTotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    itemsSold,
    costTotal: Math.round(costTotal * 100) / 100,
    topPaymentMethod,
  });
});

router.get("/dashboard/activity", requireAuth, async (req, res): Promise<void> => {
  const period = (req.query.period as string) ?? "week";
  const merchantId = req.session.merchantId!;
  const [curStart, curEnd, prevStart, prevEnd] = getActivityWindows(period);

  const [curJobs, curAppts, prevJobs, prevAppts, curCustomers, prevCustomers] = await Promise.all([
    db.select().from(serviceJobsTable).where(
      and(eq(serviceJobsTable.merchantId, merchantId), gte(serviceJobsTable.createdAt, curStart), lt(serviceJobsTable.createdAt, curEnd))
    ),
    db.select().from(appointmentsTable).where(
      and(eq(appointmentsTable.merchantId, merchantId), gte(appointmentsTable.scheduledAt, curStart), lt(appointmentsTable.scheduledAt, curEnd))
    ),
    db.select().from(serviceJobsTable).where(
      and(eq(serviceJobsTable.merchantId, merchantId), gte(serviceJobsTable.createdAt, prevStart), lt(serviceJobsTable.createdAt, prevEnd))
    ),
    db.select().from(appointmentsTable).where(
      and(eq(appointmentsTable.merchantId, merchantId), gte(appointmentsTable.scheduledAt, prevStart), lt(appointmentsTable.scheduledAt, prevEnd))
    ),
    db.select({ count: sql<number>`count(*)` }).from(customersTable).where(
      and(eq(customersTable.merchantId, merchantId), gte(customersTable.createdAt, curStart), lt(customersTable.createdAt, curEnd))
    ),
    db.select({ count: sql<number>`count(*)` }).from(customersTable).where(
      and(eq(customersTable.merchantId, merchantId), gte(customersTable.createdAt, prevStart), lt(customersTable.createdAt, prevEnd))
    ),
  ]);

  // Aggregate device types from current-period service jobs
  const deviceTypeCounts: Record<string, number> = {};
  for (const j of curJobs) {
    const dtype = (j.deviceType as string | null) ?? "Unknown";
    deviceTypeCounts[dtype] = (deviceTypeCounts[dtype] ?? 0) + 1;
  }
  const deviceTypes = Object.entries(deviceTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => ({ type, count }));

  res.json({
    services: curJobs.length,
    appointments: curAppts.length,
    newCustomers: Number(curCustomers[0]?.count ?? 0),
    prevServices: prevJobs.length,
    prevAppointments: prevAppts.length,
    prevNewCustomers: Number(prevCustomers[0]?.count ?? 0),
    deviceTypes,
  });
});

router.get("/dashboard/recent-transactions", requireAuth, async (req, res): Promise<void> => {
  const queryParams = GetRecentTransactionsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const limit = queryParams.data.limit ?? 10;

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.merchantId, req.session.merchantId!))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit);

  res.json(
    transactions.map((t) => ({
      id: t.id,
      merchantId: t.merchantId,
      customerId: t.customerId ?? null,
      staffId: t.staffId ?? null,
      receiptNumber: t.receiptNumber,
      status: t.status,
      subtotal: parseFloat(t.subtotal),
      taxTotal: parseFloat(t.taxTotal),
      discountTotal: parseFloat(t.discountTotal),
      total: parseFloat(t.total),
      paymentMethod: t.paymentMethod,
      amountTendered: t.amountTendered ? parseFloat(t.amountTendered) : null,
      changeDue: t.changeDue ? parseFloat(t.changeDue) : null,
      notes: t.notes ?? null,
      items: Array.isArray(t.items) ? t.items : [],
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

router.get("/dashboard/sales-chart", requireAuth, async (req, res): Promise<void> => {
  const queryParams = GetSalesChartQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const period = queryParams.data.period ?? "week";
  const periodStart = getPeriodStart(period);
  const merchantId = req.session.merchantId!;

  const [transactions, paidInvoices] = await Promise.all([
    db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.merchantId, merchantId),
          gte(transactionsTable.createdAt, periodStart),
          eq(transactionsTable.status, "completed")
        )
      ),
    db
      .select()
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.merchantId, merchantId),
          eq(invoicesTable.status, "paid"),
          gte(invoicesTable.paidAt, periodStart)
        )
      ),
  ]);

  // Group by day
  const groups: Record<string, { sales: number; transactions: number }> = {};

  for (const t of transactions) {
    const day = t.createdAt.toISOString().split("T")[0];
    if (!groups[day]) groups[day] = { sales: 0, transactions: 0 };
    groups[day].sales += parseFloat(t.total);
    groups[day].transactions += 1;
  }

  for (const inv of paidInvoices) {
    if (!inv.paidAt) continue;
    const day = inv.paidAt.toISOString().split("T")[0];
    if (!groups[day]) groups[day] = { sales: 0, transactions: 0 };
    groups[day].sales += parseFloat(String(inv.total));
    groups[day].transactions += 1;
  }

  // Fill in missing days
  const result = [];
  const days = period === "week" ? 7 : period === "month" ? 30 : 12;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    if (period === "year") {
      d.setMonth(d.getMonth() - i);
      const label = d.toLocaleString("default", { month: "short" });
      const key = d.toISOString().substring(0, 7);
      const dayKeys = Object.keys(groups).filter((k) => k.startsWith(key));
      const sales = dayKeys.reduce((sum, k) => sum + groups[k].sales, 0);
      const txns = dayKeys.reduce((sum, k) => sum + groups[k].transactions, 0);
      result.push({ label, sales: Math.round(sales * 100) / 100, transactions: txns });
    } else {
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
      result.push({
        label,
        sales: Math.round((groups[key]?.sales ?? 0) * 100) / 100,
        transactions: groups[key]?.transactions ?? 0,
      });
    }
  }

  res.json(result);
});

router.get("/dashboard/top-products", requireAuth, async (req, res): Promise<void> => {
  const queryParams = GetTopProductsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const limit = queryParams.data.limit ?? 5;
  const period = queryParams.data.period ?? "month";
  const periodStart = getPeriodStart(period);

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.merchantId, req.session.merchantId!),
        gte(transactionsTable.createdAt, periodStart),
        eq(transactionsTable.status, "completed")
      )
    );

  const productStats: Record<number, { productId: number; productName: string; quantitySold: number; revenue: number }> = {};

  for (const t of transactions) {
    const items = Array.isArray(t.items) ? t.items : [];
    for (const item of items as { productId: number; productName: string; quantity: number; totalPrice: number }[]) {
      if (!productStats[item.productId]) {
        productStats[item.productId] = {
          productId: item.productId,
          productName: item.productName,
          quantitySold: 0,
          revenue: 0,
        };
      }
      productStats[item.productId].quantitySold += item.quantity;
      productStats[item.productId].revenue += item.totalPrice;
    }
  }

  const sorted = Object.values(productStats)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((p) => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

  res.json(sorted);
});

router.get("/dashboard/calendar", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetDashboardCalendarQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { year, month } = parsed.data;
  const merchantId = req.session.merchantId!;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  // Build a map of date -> events
  const dayMap: Record<string, {
    publicHoliday: string | null;
    sales: number;
    serviceJobs: number;
    invoices: number;
    appointments: { id: number; title: string; scheduledAt: string; durationMinutes: number; status: string; customerName: string | null; notes: string | null }[];
    customerBirthdays: { id: number; firstName: string; lastName: string | null; phone: string | null; email: string | null }[];
  }> = {};

  // Pre-fill all days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    dayMap[key] = {
      publicHoliday: getPublicHoliday(key),
      sales: 0,
      serviceJobs: 0,
      invoices: 0,
      appointments: [],
      customerBirthdays: [],
    };
  }

  // Sales (transactions) aggregated by day
  const txns = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.merchantId, merchantId),
      eq(transactionsTable.status, "completed"),
      gte(transactionsTable.createdAt, monthStart),
      lt(transactionsTable.createdAt, monthEnd),
    ));

  for (const t of txns) {
    const key = t.createdAt.toISOString().split("T")[0];
    if (dayMap[key]) dayMap[key].sales += 1;
  }

  // Appointments
  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.merchantId, merchantId),
      gte(appointmentsTable.scheduledAt, monthStart),
      lt(appointmentsTable.scheduledAt, monthEnd),
    ));

  // Get customer names for appointments
  const apptCustomerIds = [...new Set(appts.filter((a) => a.customerId).map((a) => a.customerId!))];
  const apptCustomers = apptCustomerIds.length > 0
    ? await db.select().from(customersTable).where(inArray(customersTable.id, apptCustomerIds))
    : [];
  const apptCustomerMap = new Map(apptCustomers.map((c) => [c.id, c]));

  for (const a of appts) {
    // Convert to AEST (UTC+10) for the date key
    const localDate = new Date(a.scheduledAt.getTime() + 10 * 60 * 60 * 1000);
    const key = localDate.toISOString().split("T")[0];
    if (!dayMap[key]) continue;
    const customer = a.customerId ? apptCustomerMap.get(a.customerId) : null;
    dayMap[key].appointments.push({
      id: a.id,
      title: a.title,
      scheduledAt: a.scheduledAt.toISOString(),
      durationMinutes: a.durationMinutes,
      status: a.status,
      customerName: customer ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || null : null,
      notes: a.notes ?? null,
    });
  }

  // Service jobs — use scheduledAt when set, fall back to createdAt so unscheduled jobs still appear
  const jobs = await db
    .select()
    .from(serviceJobsTable)
    .where(and(
      eq(serviceJobsTable.merchantId, merchantId),
      or(
        and(
          isNotNull(serviceJobsTable.scheduledAt),
          gte(serviceJobsTable.scheduledAt, monthStart),
          lt(serviceJobsTable.scheduledAt, monthEnd),
        ),
        and(
          isNull(serviceJobsTable.scheduledAt),
          gte(serviceJobsTable.createdAt, monthStart),
          lt(serviceJobsTable.createdAt, monthEnd),
        ),
      ),
    ));

  for (const j of jobs) {
    const dateSource = j.scheduledAt ?? j.createdAt;
    const localDate = new Date(dateSource.getTime() + 10 * 60 * 60 * 1000);
    const key = localDate.toISOString().split("T")[0];
    if (dayMap[key]) dayMap[key].serviceJobs += 1;
  }

  // Invoices — group by creation date so all invoices created in the month appear on that day
  const invs = await db
    .select()
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.merchantId, merchantId),
      gte(invoicesTable.createdAt, monthStart),
      lt(invoicesTable.createdAt, monthEnd),
    ));

  for (const inv of invs) {
    const localDate = new Date(inv.createdAt.getTime() + 10 * 60 * 60 * 1000);
    const key = localDate.toISOString().split("T")[0];
    if (dayMap[key]) dayMap[key].invoices += 1;
  }

  // Customer birthdays (match by month/day)
  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));

  for (const c of customers) {
    if (!c.dateOfBirth) continue;
    // dateOfBirth is stored as "YYYY-MM-DD"
    const dob = c.dateOfBirth as string;
    const dobParts = dob.split("-");
    if (dobParts.length < 3) continue;
    const dobMonth = parseInt(dobParts[1], 10);
    const dobDay = parseInt(dobParts[2], 10);
    if (dobMonth !== month) continue;
    const key = `${year}-${String(month).padStart(2, "0")}-${String(dobDay).padStart(2, "0")}`;
    if (!dayMap[key]) continue;
    dayMap[key].customerBirthdays.push({
      id: c.id,
      firstName: c.firstName ?? "",
      lastName: c.lastName ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
    });
  }

  const days = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));

  res.json({ year, month, days });
});

router.get("/dashboard/config", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db
    .select()
    .from(dashboardConfigTable)
    .where(eq(dashboardConfigTable.merchantId, merchantId))
    .limit(1);

  if (!row) {
    const [created] = await db
      .insert(dashboardConfigTable)
      .values({ merchantId })
      .returning();
    res.json({ ...created, updatedAt: created.updatedAt.toISOString() });
    return;
  }

  res.json({ ...row, updatedAt: row.updatedAt.toISOString() });
});

router.put("/dashboard/config", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpsertDashboardConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const merchantId = req.session.merchantId!;
  const body = parsed.data;

  const patch = {
    ...(body.showStatusTiles !== undefined && { showStatusTiles: body.showStatusTiles }),
    ...(body.showMetricTiles !== undefined && { showMetricTiles: body.showMetricTiles }),
    ...(body.showOverdueBanner !== undefined && { showOverdueBanner: body.showOverdueBanner }),
    ...(body.showNotifications !== undefined && { showNotifications: body.showNotifications }),
    ...(body.showServiceJobsPanel !== undefined && { showServiceJobsPanel: body.showServiceJobsPanel }),
    ...(body.showCalendar !== undefined && { showCalendar: body.showCalendar }),
  };

  const [existing] = await db
    .select()
    .from(dashboardConfigTable)
    .where(eq(dashboardConfigTable.merchantId, merchantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(dashboardConfigTable)
      .set(patch)
      .where(eq(dashboardConfigTable.merchantId, merchantId))
      .returning();
    res.json({ ...updated, updatedAt: updated.updatedAt.toISOString() });
    return;
  }

  const [created] = await db
    .insert(dashboardConfigTable)
    .values({ merchantId, ...patch })
    .returning();
  res.json({ ...created, updatedAt: created.updatedAt.toISOString() });
});

export default router;
