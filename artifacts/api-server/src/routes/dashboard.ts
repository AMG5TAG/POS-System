import { Router, type IRouter } from "express";
import { db, transactionsTable, customersTable, productsTable } from "@workspace/db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { GetDashboardSummaryQueryParams, GetRecentTransactionsQueryParams, GetSalesChartQueryParams, GetTopProductsQueryParams } from "@workspace/api-zod";

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

export default router;
