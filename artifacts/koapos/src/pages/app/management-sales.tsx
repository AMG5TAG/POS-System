import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetDashboardSummary,
  useGetSalesChart,
  useGetTopProducts,
  useGetRecentTransactions,
  GetDashboardSummaryPeriod,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { DollarSign, CreditCard, Users, AlertTriangle } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export default function ManagementSalesPage() {
  const [period, setPeriod] = useState<GetDashboardSummaryPeriod>("today");

  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary(
    { period },
    { query: { queryKey: ["mgmt-summary", period] } }
  );
  const { data: chartData, isLoading: isChartLoading } = useGetSalesChart(
    { period: period === "today" ? "week" : period },
    { query: { queryKey: ["mgmt-chart", period] } }
  );
  const { data: topProducts, isLoading: isTopLoading } = useGetTopProducts(
    { period, limit: 5 },
    { query: { queryKey: ["mgmt-top", period] } }
  );
  const { data: recentTx, isLoading: isRecentLoading } = useGetRecentTransactions(
    { limit: 10 },
    { query: { queryKey: ["mgmt-recent-tx"] } }
  );

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Sales Overview</h1>
          <Select value={period} onValueChange={(val) => setPeriod(val as GetDashboardSummaryPeriod)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPI cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isSummaryLoading ? "-" : formatCurrency(summary?.totalSales || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isSummaryLoading ? "-" : formatNumber(summary?.transactionCount || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isSummaryLoading ? "-" : formatNumber(summary?.newCustomers || 0)}
              </div>
            </CardContent>
          </Card>
          <Card className={summary?.lowStockCount && summary.lowStockCount > 0 ? "border-destructive/50 bg-destructive/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${summary?.lowStockCount && summary.lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isSummaryLoading ? "-" : formatNumber(summary?.lowStockCount || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart + top products */}
        <div className="grid gap-4 md:grid-cols-7">
          <Card className="md:col-span-4">
            <CardHeader>
              <CardTitle>Sales Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isChartLoading ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : chartData?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSalesMgmt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "var(--radius)" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorSalesMgmt)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No data for this period</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isTopLoading ? (
                  <div className="text-center py-4 text-muted-foreground">Loading...</div>
                ) : topProducts?.length ? (
                  topProducts.map((product, i) => (
                    <div key={product.productId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {i + 1}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{product.productName}</p>
                          <p className="text-xs text-muted-foreground">{product.quantitySold} sold</p>
                        </div>
                      </div>
                      <div className="font-medium">{formatCurrency(product.revenue)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">No top products yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {isRecentLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading...</div>
            ) : recentTx?.length ? (
              <div className="divide-y">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{tx.customerName || "Walk-in"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <div className="text-sm font-semibold">{formatCurrency(tx.total)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">No recent transactions</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
