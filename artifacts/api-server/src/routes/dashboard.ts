import { Router, type IRouter } from "express";
import { db, transactionsTable, customersTable, productsTable, appointmentsTable, serviceJobsTable, invoicesTable } from "@workspace/db";
import { eq, and, gte, sql, desc, lt } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { GetDashboardSummaryQueryParams, GetRecentTransactionsQueryParams, GetSalesChartQueryParams, GetTopProductsQueryParams, GetDashboardCalendarQueryParams } from "@workspace/api-zod";

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

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const queryParams = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const period = queryParams.data.period ?? "today";
  const periodStart = getPeriodStart(period);
  const merchantId = req.session.merchantId!;

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.merchantId, merchantId),
        gte(transactionsTable.createdAt, periodStart)
      )
    );

  const completedTxns = transactions.filter((t) => t.status === "completed");
  const refundedTxns = transactions.filter((t) => t.status === "refunded");

  const totalSales = completedTxns.reduce((sum, t) => sum + parseFloat(t.total), 0);
  const refundTotal = refundedTxns.reduce((sum, t) => sum + parseFloat(t.total), 0);
  const transactionCount = completedTxns.length;
  const averageOrderValue = transactionCount > 0 ? totalSales / transactionCount : 0;

  // New customers in period
  const [newCustomersResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), gte(customersTable.createdAt, periodStart)));

  // Low stock count
  const products = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, merchantId), eq(productsTable.trackInventory, "true")));

  const lowStockCount = products.filter((p) => p.stockQuantity <= (p.lowStockThreshold ?? 5)).length;

  // Top payment method
  const paymentCounts: Record<string, number> = {};
  for (const t of completedTxns) {
    paymentCounts[t.paymentMethod] = (paymentCounts[t.paymentMethod] ?? 0) + 1;
  }
  const topPaymentMethod = Object.entries(paymentCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  res.json({
    totalSales: Math.round(totalSales * 100) / 100,
    transactionCount,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    newCustomers: Number(newCustomersResult.count),
    lowStockCount,
    period,
    refundTotal: Math.round(refundTotal * 100) / 100,
    topPaymentMethod,
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

  // Group by day
  const groups: Record<string, { sales: number; transactions: number }> = {};

  for (const t of transactions) {
    const day = t.createdAt.toISOString().split("T")[0];
    if (!groups[day]) groups[day] = { sales: 0, transactions: 0 };
    groups[day].sales += parseFloat(t.total);
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
    ? await db.select().from(customersTable).where(
        sql`${customersTable.id} = ANY(ARRAY[${sql.raw(apptCustomerIds.join(","))}]::int[])`
      )
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

  // Service jobs
  const jobs = await db
    .select()
    .from(serviceJobsTable)
    .where(and(
      eq(serviceJobsTable.merchantId, merchantId),
      gte(serviceJobsTable.scheduledAt, monthStart),
      lt(serviceJobsTable.scheduledAt, monthEnd),
    ));

  for (const j of jobs) {
    const localDate = new Date(j.scheduledAt!.getTime() + 10 * 60 * 60 * 1000);
    const key = localDate.toISOString().split("T")[0];
    if (dayMap[key]) dayMap[key].serviceJobs += 1;
  }

  // Invoices (by due date)
  const invs = await db
    .select()
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.merchantId, merchantId),
      gte(invoicesTable.dueDate, monthStart),
      lt(invoicesTable.dueDate, monthEnd),
    ));

  for (const inv of invs) {
    if (!inv.dueDate) continue;
    const localDate = new Date(inv.dueDate.getTime() + 10 * 60 * 60 * 1000);
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

export default router;
