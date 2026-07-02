import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useListQrCodes,
  useListShortlinks,
  useListLandingPages,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetDashboardSummary,
  useGetSalesChart,
  useGetTopProducts,
  useListTransactions,
  getListTransactionsQueryKey,
  useListStaff,
  useListInventory,
  useListCashDrawerEntries,
  useListDailyCloses,
  useListWastage,
  useGetTaxSettings,
  useGetLoyaltySettings,
  useListGiftCards,
  useGetGiftCardSettings,
  useGetProfitLoss,
  useGetCostOfGoods,
  useGetSalesSummary,
  useGetInventoryValuation,
  useGetProductPerformance,
  useRunReport,
  useListScheduledReports,
  useCreateScheduledReport,
  useUpdateScheduledReport,
  useDeleteScheduledReport,
  getListScheduledReportsQueryKey,
  GetDashboardSummaryPeriod,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn, formatCurrency, exportToCsv } from "@/lib/utils";
import { useAllCustomers } from "@/hooks/use-all-customers";
import {
  TrendingUp, CreditCard, Package2, Monitor, DollarSign, Users,
  BarChart3, Activity, Banknote, SlidersHorizontal, LayoutGrid,
  CalendarDays, Gift, Wallet, RefreshCw, Download, Receipt,
  ShoppingCart, AlertCircle, CheckCircle2, Package, UserSquare2,
  ArrowUpRight, ArrowDownRight, Percent, Hash, Mail, Clock, Plus,
  FileText, Settings2, QrCode, Link2, Globe, ExternalLink,
  MousePointerClick, Trash2, ChevronRight,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid, Pie, PieChart, Legend,
} from "recharts";

/* ─── Shared chart styles (module-level constants — never recreated) ─────── */

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  borderColor:     "hsl(var(--border))",
  borderRadius:    "var(--radius)",
} as const;
const TOOLTIP_ITEM_STYLE = { color: "hsl(var(--foreground))" } as const;

/* ─── Date helpers ───────────────────────────────────────────────────────── */

type Preset = "today" | "7" | "month" | "90" | "year" | "custom";

const DATE_PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today"   },
  { id: "7",     label: "7 Days"  },
  { id: "month", label: "Month"   },
  { id: "90",    label: "90 Days" },
  { id: "year",  label: "Year"    },
];

// Build the YYYY-MM-DD string from LOCAL date components — toISOString() would
// convert to UTC first, which in AEST (UTC+10/+11) shifts dates back a day for
// most of the local morning ("Today" would query yesterday until ~10-11am).
function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function presetDates(p: Preset): { from: string; to: string } {
  const now = new Date();
  const to  = toISO(now);
  if (p === "today") return { from: to, to };
  // "Month" is the calendar month-to-date: 1st → last day of the current month
  // (not a rolling 30-day window).
  if (p === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toISO(first), to: toISO(last) };
  }
  const d = new Date(now);
  if (p === "year") d.setFullYear(d.getFullYear() - 1);
  else d.setDate(d.getDate() - (p === "7" ? 7 : 90));
  return { from: toISO(d), to };
}

function presetToApiPeriod(p: Preset): GetDashboardSummaryPeriod {
  if (p === "today") return "today";
  if (p === "7")     return "week";
  if (p === "year")  return "year";
  return "month";
}

/* ─── Report tabs ────────────────────────────────────────────────────────── */

const REPORT_TABS = [
  { id: "sales",             label: "Sales",             icon: TrendingUp        },
  { id: "payments",          label: "Payments",          icon: CreditCard        },
  { id: "inventory",         label: "Inventory",         icon: Package2          },
  { id: "register-closures", label: "Register Closures", icon: Monitor           },
  { id: "profit-loss",       label: "Profit & Loss",     icon: DollarSign        },
  { id: "cost-of-goods",     label: "Cost of Goods",     icon: Package           },
  { id: "customer-insights", label: "Customer Insights", icon: Users             },
  { id: "top-products",      label: "Top Products",      icon: BarChart3         },
  { id: "user-activity",     label: "User Activity",     icon: Activity          },
  { id: "cash-movements",    label: "Cash Movements",    icon: Banknote          },
  { id: "adjustments",       label: "Adjustments",       icon: SlidersHorizontal },
  { id: "report-builder",    label: "Report Builder",    icon: LayoutGrid        },
  { id: "scheduled",         label: "Scheduled",         icon: CalendarDays      },
  { id: "gst-bas",           label: "GST / BAS",         icon: Receipt           },
  { id: "gift-cards",        label: "Gift Cards",        icon: Gift              },
  { id: "store-credit",      label: "Store Credit",      icon: Wallet            },
] as const;

type ReportTabId = (typeof REPORT_TABS)[number]["id"];

/* ─── Shared UI helpers ──────────────────────────────────────────────────── */

function KpiTile({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-5", accent ? "bg-primary/5" : "bg-card")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-3xl font-bold mt-2", accent ? "text-primary" : "")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b">
      <p className="font-semibold">{title}</p>
      {action}
    </div>
  );
}

const ExportBtn = ({ rows, filename, columns }: {
  rows?: Array<Record<string, unknown>>;
  filename?: string;
  columns?: { key: string; label: string }[];
} = {}) => {
  const disabled = !rows || rows.length === 0;
  return (
    <Button
      variant="outline" size="sm" className="gap-1.5"
      disabled={disabled}
      title={disabled ? "Nothing to export yet" : "Download CSV"}
      onClick={() => { if (rows && rows.length) exportToCsv(filename ?? "report", rows, columns); }}
    >
      <Download className="w-3.5 h-3.5" /> Export CSV
    </Button>
  );
};

const PAYMENT_COLORS: Record<string, string> = {
  card: "#6366f1", cash: "#22c55e", split: "#f59e0b",
  voucher: "#ec4899", store_credit: "#8b5cf6", loyalty: "#06b6d4",
  laybuy: "#f97316", direct_deposit: "#14b8a6", zip: "#7c3aed", afterpay: "#00b389", klarna: "#ffb3c7", other: "#94a3b8",
};

/* ─── Tab: Sales ─────────────────────────────────────────────────────────── */

function SalesTab({ summary, summaryLoading, chartData, chartLoading, totalSales, txCount, avgSaleValue }: {
  summary: { totalSales: number; transactionCount: number; averageOrderValue: number; posSales?: number; invoiceSales?: number; posCount?: number; invoiceCount?: number } | undefined;
  summaryLoading: boolean; chartData: { label: string; sales: number; transactions: number }[] | undefined;
  chartLoading: boolean; totalSales: number; txCount: number; avgSaleValue: number;
}) {
  const posSales     = summary?.posSales     ?? totalSales;
  const invoiceSales = summary?.invoiceSales ?? 0;
  const posCount     = summary?.posCount     ?? txCount;
  const invoiceCount = summary?.invoiceCount ?? 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Total Revenue" value={summaryLoading ? "—" : formatCurrency(totalSales)} sub="POS + Invoices" accent />
        <KpiTile label="POS Transactions" value={summaryLoading ? "—" : posCount.toLocaleString()} sub={formatCurrency(posSales)} />
        <KpiTile label="Invoice Revenue" value={summaryLoading ? "—" : formatCurrency(invoiceSales)} sub={`${invoiceCount} paid invoice${invoiceCount !== 1 ? "s" : ""}`} />
        <KpiTile label="Avg Sale Value" value={summaryLoading ? "—" : formatCurrency(avgSaleValue)} sub="Per transaction" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Daily Sales" action={<ExportBtn filename="daily-sales" rows={(chartData ?? []) as unknown as Record<string, unknown>[]} columns={[{ key: "label", label: "Date" }, { key: "sales", label: "Revenue" }, { key: "transactions", label: "Transactions" }]} />} />
        <div className="p-5">
          {chartLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
          ) : chartData?.length ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReportSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorReportSales)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No sales in this period.</p>
          )}
        </div>
        <table className="w-full text-sm border-t">
          <thead>
            <tr className="bg-muted/30 border-b">
              <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
              <th className="text-right px-5 py-3 font-medium text-muted-foreground">Transactions</th>
              <th className="text-right px-5 py-3 font-medium text-muted-foreground">Discounts</th>
            </tr>
          </thead>
          <tbody>
            {chartData?.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-5 py-3 text-muted-foreground">{row.label}</td>
                <td className="px-5 py-3 text-right font-medium">{formatCurrency(row.sales)}</td>
                <td className="px-5 py-3 text-right text-muted-foreground">{row.transactions ?? "—"}</td>
                <td className="px-5 py-3 text-right text-muted-foreground">—</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!chartData?.length && !chartLoading && (
          <p className="text-sm text-muted-foreground text-center px-5 py-4">No data for this period.</p>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Payments ──────────────────────────────────────────────────────── */

function PaymentsTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading } = useGetSalesSummary({ startDate, endDate });

  const breakdown   = data?.paymentBreakdown ?? [];
  const grandTotal  = data?.totalRevenue     ?? 0;
  const grandCount  = data?.transactionCount ?? 0;
  const avgOrder    = data?.avgOrderValue    ?? 0;
  const dailyRows   = data?.dailyBreakdown   ?? [];

  const pieData = breakdown.map((r) => ({
    name:  r.paymentMethod.replace(/_/g, " "),
    value: r.totalAmount,
    fill:  PAYMENT_COLORS[r.paymentMethod] ?? "#94a3b8",
  }));

  const dailyChart = dailyRows.map((d) => ({
    label:        d.date,
    revenue:      d.grossRevenue,
    transactions: d.transactionCount,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Total Collected"   value={isLoading ? "—" : formatCurrency(grandTotal)} sub="All payment methods" accent />
        <KpiTile label="Transactions"      value={isLoading ? "—" : grandCount.toLocaleString()} sub="Completed sales" />
        <KpiTile label="Avg Order Value"   value={isLoading ? "—" : formatCurrency(avgOrder)} sub="Per transaction" />
      </div>

      {/* Daily revenue trend */}
      {(dailyChart.length > 0 || isLoading) && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Daily Revenue Trend" action={<ExportBtn />} />
          <div className="p-5">
            {isLoading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
            ) : dailyChart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No transactions found for this period.</p>
            ) : (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Method breakdown table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Breakdown by Method" action={<ExportBtn filename="payment-breakdown" rows={breakdown as unknown as Record<string, unknown>[]} columns={[{ key: "paymentMethod", label: "Method" }, { key: "transactionCount", label: "Count" }, { key: "totalAmount", label: "Total" }, { key: "avgTransactionValue", label: "Avg" }]} />} />
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : breakdown.length === 0 ? (
            <div className="flex flex-col items-center py-14 gap-3">
              <CreditCard className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No transactions found for this period.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Method</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Count</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Total</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Avg</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Share</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((r) => (
                  <tr key={r.paymentMethod} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PAYMENT_COLORS[r.paymentMethod] ?? "#94a3b8" }} />
                        <span className="capitalize font-medium">{r.paymentMethod.replace(/_/g, " ")}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{r.transactionCount.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(r.totalAmount)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{formatCurrency(r.avgTransactionValue)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {grandTotal > 0 ? ((r.totalAmount / grandTotal) * 100).toFixed(1) : "0"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Payment mix pie */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Payment Mix" />
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No data yet.</p>
          ) : (
            <div className="p-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_CONTENT_STYLE} />
                  <Legend formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Inventory ─────────────────────────────────────────────────────── */

function InventoryTab() {
  const { data, isLoading } = useGetInventoryValuation();

  const items           = data?.items           ?? [];
  const totalSkus       = data?.totalSkus       ?? 0;
  const totalUnits      = data?.totalUnits      ?? 0;
  const totalCostValue  = data?.totalCostValue  ?? 0;
  const totalRetailValue = data?.totalRetailValue ?? 0;
  const potentialProfit = data?.potentialProfit ?? 0;

  const zeroStock = items.filter((i) => i.stockQuantity === 0);

  /* Sort by retail value descending */
  const sorted = [...items].sort((a, b) => b.retailValue - a.retailValue);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiTile label="Active SKUs"      value={isLoading ? "—" : totalSkus.toLocaleString()} sub="Tracked products" accent />
        <KpiTile label="Total Units"      value={isLoading ? "—" : totalUnits.toLocaleString()} sub="Units on hand" />
        <KpiTile label="Cost Value"       value={isLoading ? "—" : formatCurrency(totalCostValue)} sub="At cost price" />
        <KpiTile label="Retail Value"     value={isLoading ? "—" : formatCurrency(totalRetailValue)} sub="At sell price" />
        <KpiTile label="Potential Profit" value={isLoading ? "—" : formatCurrency(potentialProfit)} sub="Retail − Cost" />
      </div>

      {zeroStock.length > 0 && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>{zeroStock.length} product{zeroStock.length !== 1 ? "s" : ""}</strong> currently out of stock.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Inventory Valuation" action={<ExportBtn filename="inventory-valuation" rows={sorted as unknown as Record<string, unknown>[]} columns={[{ key: "name", label: "Product" }, { key: "sku", label: "SKU" }, { key: "stockQuantity", label: "Units" }, { key: "costPrice", label: "Cost ea" }, { key: "retailPrice", label: "Retail ea" }, { key: "costValue", label: "Cost Value" }, { key: "retailValue", label: "Retail Value" }, { key: "marginPct", label: "Margin %" }]} />} />
        {isLoading ? (
          <div className="flex items-center justify-center py-14 gap-3 text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading inventory…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <Package2 className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No tracked inventory found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left  px-5 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left  px-5 py-3 font-medium text-muted-foreground hidden sm:table-cell">SKU</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Units</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden md:table-cell">Cost ea.</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden md:table-cell">Retail ea.</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Cost Value</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Retail Value</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden lg:table-cell">Margin</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.productId} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">
                    {item.name}
                    {item.stockQuantity === 0 && (
                      <Badge variant="destructive" className="ml-2 text-[9px] py-0">Out</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground font-mono text-xs hidden sm:table-cell">{item.sku ?? "—"}</td>
                  <td className="px-5 py-3 text-right font-medium">{item.stockQuantity.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground hidden md:table-cell">{formatCurrency(item.costPrice)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground hidden md:table-cell">{formatCurrency(item.retailPrice)}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(item.costValue)}</td>
                  <td className="px-5 py-3 text-right font-medium text-primary">{formatCurrency(item.retailValue)}</td>
                  <td className="px-5 py-3 text-right hidden lg:table-cell">
                    <span className={cn("font-medium", item.marginPct >= 0 ? "text-emerald-600" : "text-red-500")}>
                      {item.marginPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 border-t font-semibold">
                <td className="px-5 py-3" colSpan={2}>Total</td>
                <td className="px-5 py-3 text-right">{totalUnits.toLocaleString()}</td>
                <td className="px-5 py-3 hidden md:table-cell" colSpan={2} />
                <td className="px-5 py-3 text-right">{formatCurrency(totalCostValue)}</td>
                <td className="px-5 py-3 text-right text-primary">{formatCurrency(totalRetailValue)}</td>
                <td className="px-5 py-3 hidden lg:table-cell" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Register Closures ─────────────────────────────────────────────── */

function RegisterClosuresTab() {
  // End-of-day register closures live in daily_closes (the same records the
  // Daily Reports page shows), NOT the cash-drawer movement log.
  // High limit so KPI aggregates cover the full history (≈3 years of daily closes).
  const { data, isLoading } = useListDailyCloses({ limit: 1000, offset: 0 });
  const closes = useMemo(
    () => (data ?? []).slice().sort((a, b) => b.closeDate.localeCompare(a.closeDate)),
    [data],
  );

  const totalGross = closes.reduce((s, r) => s + ((r.breakdown as Record<string, number>)?.grossSales ?? 0), 0);
  const totalVariance = closes.reduce((s, r) => s + Math.abs(r.variance), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Closures" value={isLoading ? "—" : closes.length.toString()} sub="End-of-day records" accent />
        <KpiTile label="Gross Sales" value={isLoading ? "—" : formatCurrency(totalGross)} sub="Across all closures" />
        <KpiTile label="Total Variance" value={isLoading ? "—" : formatCurrency(totalVariance)} sub="Counted vs expected" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Register Closures" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : closes.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <Monitor className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No register closures recorded yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Closed By</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Expected</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Counted</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Variance</th>
              </tr>
            </thead>
            <tbody>
              {closes.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{row.closeDate}</td>
                  <td className="px-5 py-3 text-muted-foreground">{row.closedByName || "—"}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(row.expectedCash)}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(row.countedCash)}</td>
                  <td className={cn("px-5 py-3 text-right font-semibold", row.variance === 0 ? "text-muted-foreground" : Math.abs(row.variance) > 5 ? "text-red-500" : "text-emerald-600")}>
                    {formatCurrency(row.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Profit & Loss ─────────────────────────────────────────────────── */

function ProfitLossTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading } = useGetProfitLoss({ startDate, endDate });

  // Date of the daily-breakdown row the user clicked to drill into; null = closed.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const grossRevenue    = data?.grossRevenue    ?? 0;
  const exGstRevenue    = data?.exGstRevenue    ?? 0;
  const taxCollected    = data?.taxCollected    ?? 0;
  const totalCogs       = data?.totalCogs       ?? 0;
  const netProfit       = data?.netProfit       ?? 0;
  const surchargeCost   = data?.surchargeCost   ?? 0;
  const grossMarginPct  = data?.grossMarginPct  ?? 0;
  const refundTotal     = data?.refundTotal     ?? 0;
  const discountTotal   = data?.discountTotal   ?? 0;
  const txCount         = data?.transactionCount ?? 0;
  const dailyRows       = data?.dailyBreakdown  ?? [];

  const netRevenue = grossRevenue - refundTotal;
  const cogsShare  = exGstRevenue > 0 ? (totalCogs / exGstRevenue) * 100 : 0;
  const taxShare   = netRevenue   > 0 ? (taxCollected / netRevenue) * 100 : 0;

  // Accurate P&L waterfall. Gross Revenue is the GST-inclusive amount actually
  // charged (already net of discounts), so discounts/refunds are NOT subtracted
  // again here — they're shown separately below for reference. Net Profit ties
  // exactly to the backend: Revenue (ex-GST) − COGS.
  const plRows = [
    { label: "Gross Revenue (incl. GST)", value: grossRevenue,  bold: false },
    { label: "GST Collected",             value: -taxCollected, bold: false },
    { label: "Revenue (ex-GST)",          value: exGstRevenue,  bold: true  },
    { label: "True COGS",                 value: -totalCogs,    bold: false },
    // Only shown when the merchant absorbs surcharges, to avoid clutter otherwise.
    ...(surchargeCost > 0
      ? [{ label: "Payment surcharges (absorbed)", value: -surchargeCost, bold: false }]
      : []),
    { label: "Net Profit",                value: netProfit,     bold: true, accent: true },
  ];

  /* chart: show net profit per day as a bar */
  const chartData = dailyRows.map((d) => ({
    date:      d.date,
    revenue:   d.grossRevenue,
    netProfit: d.netProfit,
    cogs:      d.totalCogs,
  }));

  const hasSales = grossRevenue > 0;

  return (
    <div className="space-y-5">
      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiTile label="Gross Revenue"   value={isLoading ? "—" : formatCurrency(grossRevenue)}   sub="All completed sales" accent />
        <KpiTile label="GST Collected"   value={isLoading ? "—" : formatCurrency(taxCollected)}   sub="Tax portion of sales" />
        <KpiTile label="True COGS"       value={isLoading ? "—" : formatCurrency(totalCogs)}       sub="From cost prices" />
        <KpiTile label="Net Profit"      value={isLoading ? "—" : formatCurrency(netProfit)}       sub="Revenue − COGS" />
        <KpiTile label="Gross Margin"    value={isLoading ? "—" : `${grossMarginPct.toFixed(1)}%`} sub={`${txCount.toLocaleString()} transactions`} />
      </div>

      {/* empty state */}
      {!isLoading && !hasSales && (
        <div className="rounded-xl border bg-card flex flex-col items-center py-16 gap-3">
          <DollarSign className="w-12 h-12 text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">No transactions found for this period.</p>
          <p className="text-xs text-muted-foreground/70">Adjust the date range above to see P&amp;L data.</p>
        </div>
      )}

      {(isLoading || hasSales) && (
        <>
          {/* ── Daily P&L trend chart ─────────────────────────────────────── */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <SectionHeader title="Daily Revenue vs Net Profit" action={<ExportBtn filename="profit-loss-daily" rows={dailyRows as unknown as Record<string, unknown>[]} columns={[{ key: "date", label: "Date" }, { key: "transactionCount", label: "Transactions" }, { key: "grossRevenue", label: "Gross Revenue" }, { key: "taxCollected", label: "GST" }, { key: "totalCogs", label: "COGS" }, { key: "netProfit", label: "Net Profit" }]} />} />
            <div className="p-5">
              {isLoading ? (
                <div className="h-44 flex items-center justify-center text-muted-foreground text-sm gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No data for this period.</p>
              ) : (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                      <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="revenue"   name="Gross Revenue" fill="hsl(var(--primary))"  fillOpacity={0.5} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="netProfit" name="Net Profit"    fill="hsl(var(--primary))"  radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ── P&L Summary table ──────────────────────────────────────── */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <SectionHeader title="P&L Summary" action={<ExportBtn />} />
              {isLoading ? (
                <div className="py-12 flex items-center justify-center text-muted-foreground text-sm gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {plRows.map((r, i) => (
                      <tr key={i} className={cn("border-b last:border-0", r.bold ? "bg-muted/20" : "")}>
                        <td className={cn("px-5 py-3", r.bold ? "font-semibold" : "text-muted-foreground")}>{r.label}</td>
                        <td className={cn(
                          "px-5 py-3 text-right font-medium",
                          r.accent ? "text-primary text-lg" : r.value < 0 ? "text-red-500" : "",
                        )}>
                          {r.value < 0
                            ? `(${formatCurrency(Math.abs(r.value))})`
                            : formatCurrency(r.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* Refunds & discounts are already reflected in the figures above;
                  shown here for reference, not as part of the profit waterfall. */}
              {!isLoading && (refundTotal > 0 || discountTotal > 0) && (
                <div className="px-5 py-3 border-t text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-muted-foreground/80">For reference (already reflected above)</p>
                  <div className="flex justify-between">
                    <span>Refunds processed</span>
                    <span className="tabular-nums">{formatCurrency(refundTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discounts given</span>
                    <span className="tabular-nums">{formatCurrency(discountTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Margin breakdown bars ───────────────────────────────────── */}
            <div className="rounded-xl border bg-card p-5 space-y-5">
              <p className="font-semibold">Margin Breakdown</p>
              {[
                { label: "Gross Margin",  pct: grossMarginPct, color: "bg-primary",    note: `${formatCurrency(netProfit)} profit` },
                { label: "GST Share",     pct: taxShare,        color: "bg-amber-400",  note: `${formatCurrency(taxCollected)} collected` },
                { label: "COGS Share",    pct: cogsShare,       color: "bg-red-400",    note: `${formatCurrency(totalCogs)} in costs` },
              ].map((row) => (
                <div key={row.label} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <div>
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="text-xs text-muted-foreground/60 ml-2">{row.note}</span>
                    </div>
                    <span className="font-semibold tabular-nums">{isLoading ? "—" : `${row.pct.toFixed(1)}%`}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", row.color)} style={{ width: `${Math.min(Math.max(row.pct, 0), 100)}%` }} />
                  </div>
                </div>
              ))}
              {!isLoading && totalCogs === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 pt-1">
                  COGS is $0 — add cost prices to your products to see accurate margin data.
                </p>
              )}
            </div>
          </div>

          {/* ── Daily breakdown table ───────────────────────────────────────── */}
          {dailyRows.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <SectionHeader title="Daily Breakdown" action={<span className="text-xs text-muted-foreground">Click a day to see its sales &amp; products</span>} />
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left  px-5 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Transactions</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Gross Revenue</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden md:table-cell">GST</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden md:table-cell">COGS</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Net Profit</th>
                    <th className="px-3 py-3 w-8" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row) => (
                    <tr
                      key={row.date}
                      onClick={() => setSelectedDate(row.date)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedDate(row.date); } }}
                      tabIndex={0}
                      role="button"
                      title={`View sales & products sold on ${row.date}`}
                      className="group border-b last:border-0 cursor-pointer hover:bg-muted/30 focus:bg-muted/30 focus:outline-none"
                    >
                      <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{row.date}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{row.transactionCount.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(row.grossRevenue)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground hidden md:table-cell">{formatCurrency(row.taxCollected)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground hidden md:table-cell">{formatCurrency(row.totalCogs)}</td>
                      <td className={cn("px-5 py-3 text-right font-semibold", row.netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {formatCurrency(row.netProfit)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DailySalesDetailDialog
            date={selectedDate}
            onOpenChange={(open) => { if (!open) setSelectedDate(null); }}
          />
        </>
      )}
    </div>
  );
}

/* ── Drill-down: all sales & products sold on a single day ─────────────────── */

function DailySalesDetailDialog({
  date, onOpenChange,
}: {
  date: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Fetch the day's transactions only while the dialog is open. The backend
  // filters by date range; we also pin to the exact day client-side so a
  // boundary-inclusive `to` can't leak adjacent days into the list.
  const txParams = { from: date ?? undefined, to: date ?? undefined, limit: 500 };
  const { data, isLoading } = useListTransactions(
    txParams,
    { query: { enabled: !!date, queryKey: getListTransactionsQueryKey(txParams) } },
  );

  const txs = useMemo(
    () => (data?.items ?? []).filter((tx) => (tx.createdAt ?? "").slice(0, 10) === date),
    [data, date],
  );

  // Aggregate line items across the day into "products sold", ranked by revenue.
  const products = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const tx of txs) {
      for (const it of tx.items ?? []) {
        const key  = `${it.productId}|${it.productName}`;
        const prev = map.get(key) ?? { name: it.productName, quantity: 0, revenue: 0 };
        prev.quantity += it.quantity;
        prev.revenue  += it.totalPrice;
        map.set(key, prev);
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [txs]);

  const totalRevenue = txs.reduce((s, tx) => s + tx.total, 0);
  const unitsSold    = products.reduce((s, p) => s + p.quantity, 0);

  return (
    <Dialog open={!!date} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sales on {date}</DialogTitle>
          <DialogDescription>
            {isLoading
              ? "Loading…"
              : `${txs.length.toLocaleString()} transaction${txs.length !== 1 ? "s" : ""} · ${unitsSold.toLocaleString()} item${unitsSold !== 1 ? "s" : ""} sold · ${formatCurrency(totalRevenue)}`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading day…
          </div>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <Receipt className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No transactions recorded on this day.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Products sold */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b">
                <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                <p className="font-semibold text-sm">Products Sold</p>
                <ExportBtn
                  filename={`products-sold-${date}`}
                  rows={products as unknown as Record<string, unknown>[]}
                  columns={[{ key: "name", label: "Product" }, { key: "quantity", label: "Qty" }, { key: "revenue", label: "Revenue" }]}
                />
              </div>
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No products on this day.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b">
                      <th className="text-left  px-5 py-2.5 font-medium text-muted-foreground">Product</th>
                      <th className="text-right px-5 py-2.5 font-medium text-muted-foreground">Qty</th>
                      <th className="text-right px-5 py-2.5 font-medium text-muted-foreground">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-5 py-2.5">{p.name}</td>
                        <td className="px-5 py-2.5 text-right text-muted-foreground">{p.quantity.toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right font-medium">{formatCurrency(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* All sales */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <p className="font-semibold text-sm">All Sales</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left  px-5 py-2.5 font-medium text-muted-foreground">Receipt</th>
                    <th className="text-left  px-5 py-2.5 font-medium text-muted-foreground">Time</th>
                    <th className="text-left  px-5 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Payment</th>
                    <th className="text-left  px-5 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-5 py-2.5 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx) => {
                    const itemSummary = (tx.items ?? [])
                      .map((it) => `${it.quantity}× ${it.productName}`)
                      .join(", ");
                    return (
                      <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/20 align-top">
                        <td className="px-5 py-2.5">
                          <div className="font-mono text-xs">{tx.receiptNumber || `#${tx.id}`}</div>
                          {itemSummary && (
                            <div className="text-xs text-muted-foreground/70 mt-0.5 max-w-xs truncate" title={itemSummary}>{itemSummary}</div>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-muted-foreground whitespace-nowrap">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-muted-foreground capitalize hidden sm:table-cell">{tx.paymentMethod.replace(/_/g, " ")}</td>
                        <td className="px-5 py-2.5">
                          <Badge variant={tx.status === "completed" ? "secondary" : "outline"} className="capitalize">{tx.status.replace(/_/g, " ")}</Badge>
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium whitespace-nowrap">{formatCurrency(tx.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Tab: Cost of Goods ─────────────────────────────────────────────────── */

function fmtMonth(m: string): string {
  const [y, mo] = m.split("-");
  if (!y || !mo) return m;
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function CostOfGoodsTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading } = useGetCostOfGoods({ startDate, endDate });

  const totals    = data?.totals;
  const monthly   = data?.monthly   ?? [];
  const suppliers = data?.suppliers ?? [];

  const cogsSold      = totals?.cogsSold          ?? 0;
  const purchaseSpend = totals?.purchaseSpend     ?? 0;
  const goodsSpend    = totals?.goodsSpend        ?? 0;
  const shippingCost  = totals?.shippingCost      ?? 0;
  const poCount       = totals?.purchaseOrderCount ?? 0;

  const chartData = monthly.map((m) => ({
    label:         fmtMonth(m.month),
    cogsSold:      m.cogsSold,
    purchaseSpend: m.purchaseSpend,
    shippingCost:  m.shippingCost,
  }));

  const hasData = monthly.length > 0 || suppliers.length > 0;

  return (
    <div className="space-y-5">
      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiTile label="COGS Sold"      value={isLoading ? "—" : formatCurrency(cogsSold)}      sub="Cost of items sold" accent />
        <KpiTile label="Purchase Spend" value={isLoading ? "—" : formatCurrency(purchaseSpend)} sub={`${poCount.toLocaleString()} purchase order${poCount !== 1 ? "s" : ""}`} />
        <KpiTile label="Goods Cost"     value={isLoading ? "—" : formatCurrency(goodsSpend)}    sub="Stock purchased (ex shipping)" />
        <KpiTile label="Shipping Cost"  value={isLoading ? "—" : formatCurrency(shippingCost)}  sub="Delivery on purchase orders" />
        <KpiTile label="Suppliers"      value={isLoading ? "—" : suppliers.length.toLocaleString()} sub="With spend in range" />
      </div>

      {/* empty state */}
      {!isLoading && !hasData && (
        <div className="rounded-xl border bg-card flex flex-col items-center py-16 gap-3">
          <Package className="w-12 h-12 text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">No cost-of-goods data for this period.</p>
          <p className="text-xs text-muted-foreground/70">Record sales or purchase orders, or widen the date range.</p>
        </div>
      )}

      {(isLoading || hasData) && (
        <>
          {/* ── Monthly spend ────────────────────────────────────────────── */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <SectionHeader title="Monthly Spend" action={<ExportBtn filename="cost-of-goods-monthly" rows={monthly as unknown as Record<string, unknown>[]} columns={[{ key: "month", label: "Month" }, { key: "cogsSold", label: "COGS Sold" }, { key: "cogsPos", label: "COGS POS" }, { key: "cogsInvoice", label: "COGS Invoices" }, { key: "cogsLayby", label: "COGS Laybys" }, { key: "goodsSpend", label: "PO Goods" }, { key: "shippingCost", label: "Shipping" }, { key: "purchaseSpend", label: "PO Total" }, { key: "purchaseOrderCount", label: "PO Count" }]} />} />
            <div className="p-5">
              {isLoading ? (
                <div className="h-44 flex items-center justify-center text-muted-foreground text-sm gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
              ) : chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No monthly data for this period.</p>
              ) : (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                      <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} formatter={(v: number) => formatCurrency(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="cogsSold"      name="COGS Sold"      fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="purchaseSpend" name="Purchase Spend" fill="#f59e0b"             radius={[2, 2, 0, 0]} />
                      <Bar dataKey="shippingCost"  name="Shipping"       fill="#94a3b8"             radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            {monthly.length > 0 && (
              <table className="w-full text-sm border-t">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left  px-5 py-3 font-medium text-muted-foreground">Month</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">COGS Sold</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden md:table-cell">PO Goods</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Shipping</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Purchase Spend</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden sm:table-cell">POs</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m.month} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">{fmtMonth(m.month)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(m.cogsSold)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground hidden md:table-cell">{formatCurrency(m.goodsSpend)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatCurrency(m.shippingCost)}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(m.purchaseSpend)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground hidden sm:table-cell">{m.purchaseOrderCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Spend by supplier: bought-from (POs) vs sold-of (COGS) ───── */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <SectionHeader title="Spend by Supplier" action={<ExportBtn filename="cost-of-goods-suppliers" rows={suppliers as unknown as Record<string, unknown>[]} columns={[{ key: "supplierName", label: "Supplier" }, { key: "purchaseOrderCount", label: "POs" }, { key: "itemsOrdered", label: "Items" }, { key: "goodsSpend", label: "Goods" }, { key: "shippingCost", label: "Shipping" }, { key: "purchaseSpend", label: "Purchase Spend" }, { key: "soldCogs", label: "Sold COGS" }]} />} />
            <p className="px-5 py-2.5 text-xs text-muted-foreground border-b bg-muted/10">
              <strong className="text-foreground/70">Purchase Spend</strong> = bought from the supplier (purchase orders, incl. shipping). <strong className="text-foreground/70">Sold COGS</strong> = cost of goods sold for products assigned to that supplier.
            </p>
            {isLoading ? (
              <div className="py-12 flex items-center justify-center text-muted-foreground text-sm gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : suppliers.length === 0 ? (
              <div className="flex flex-col items-center py-14 gap-3">
                <Package className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No supplier activity in this period.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left  px-5 py-3 font-medium text-muted-foreground">Supplier</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden sm:table-cell">POs</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden md:table-cell">Items</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden lg:table-cell">Goods</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground hidden lg:table-cell">Shipping</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Purchase Spend</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Sold COGS</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.supplierName} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">{s.supplierName}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground hidden sm:table-cell">{s.purchaseOrderCount.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground hidden md:table-cell">{s.itemsOrdered.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground hidden lg:table-cell">{formatCurrency(s.goodsSpend)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground hidden lg:table-cell">{formatCurrency(s.shippingCost)}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatCurrency(s.purchaseSpend)}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatCurrency(s.soldCogs)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20 border-t font-semibold">
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3 text-right hidden sm:table-cell">{poCount.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell">—</td>
                    <td className="px-5 py-3 text-right hidden lg:table-cell">{formatCurrency(goodsSpend)}</td>
                    <td className="px-5 py-3 text-right hidden lg:table-cell">{formatCurrency(shippingCost)}</td>
                    <td className="px-5 py-3 text-right">{formatCurrency(purchaseSpend)}</td>
                    <td className="px-5 py-3 text-right">{formatCurrency(cogsSold)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Tab: Customer Insights ─────────────────────────────────────────────── */

function CustomerInsightsTab() {
  // Aggregate across the whole customer base, not a single capped page.
  const { customers, isLoading } = useAllCustomers();
  const topBySpend   = [...customers].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0)).slice(0, 10);
  const topByLoyalty = [...customers].sort((a, b) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0)).slice(0, 5);
  const totalSpend   = customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0);
  const totalPoints  = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Total Customers" value={isLoading ? "—" : customers.length.toString()} sub="In database" accent />
        <KpiTile label="Total Customer Spend" value={isLoading ? "—" : formatCurrency(totalSpend)} sub="Lifetime" />
        <KpiTile label="Loyalty Points On Hand" value={isLoading ? "—" : totalPoints.toLocaleString()} sub="Unredeemed" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Top Customers by Spend" action={<ExportBtn />} />
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : topBySpend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No customer data.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Total Spent</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Points</th>
                </tr>
              </thead>
              <tbody>
                {topBySpend.map((c, i) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3 font-medium">{c.firstName} {c.lastName}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(c.totalSpent ?? 0)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{(c.loyaltyPoints ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Loyalty Leaderboard" />
          {topByLoyalty.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No loyalty data.</p>
          ) : (
            <div className="p-5 space-y-3">
              {topByLoyalty.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-slate-100 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground")}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.firstName} {c.lastName}</p>
                    <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${topByLoyalty[0].loyaltyPoints ? ((c.loyaltyPoints ?? 0) / (topByLoyalty[0].loyaltyPoints ?? 1)) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{(c.loyaltyPoints ?? 0).toLocaleString()} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Top Products ──────────────────────────────────────────────────── */

function TopProductsTab({ apiPeriod }: { apiPeriod: GetDashboardSummaryPeriod }) {
  const safeTopPeriod = apiPeriod === "yesterday" ? "today" : apiPeriod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useGetTopProducts({ limit: 20, period: safeTopPeriod as any });
  const products = data ?? [];
  const maxRevenue = products[0]?.revenue ?? 1;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Products Tracked" value={isLoading ? "—" : products.length.toString()} sub="With sales" accent />
        <KpiTile label="Top Product Revenue" value={isLoading || !products[0] ? "—" : formatCurrency(products[0].revenue)} sub={products[0]?.productName ?? "—"} />
        <KpiTile label="Total Units Sold" value={isLoading ? "—" : products.reduce((s, p) => s + p.quantitySold, 0).toString()} sub="This period" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Top Products by Revenue" action={<ExportBtn filename="top-products" rows={products as unknown as Record<string, unknown>[]} columns={[{ key: "productName", label: "Product" }, { key: "quantitySold", label: "Qty" }, { key: "revenue", label: "Revenue" }]} />} />
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No sales data for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Product</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.productId} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3 font-medium">{p.productName}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{p.quantitySold}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Revenue Chart" />
          {products.length > 0 ? (
            <div className="p-5">
              <div className="space-y-2.5">
                {products.slice(0, 8).map((p) => (
                  <div key={p.productId} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[60%]">{p.productName}</span>
                      <span className="font-medium">{formatCurrency(p.revenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(p.revenue / maxRevenue) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No data.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: User Activity ─────────────────────────────────────────────────── */

function UserActivityTab({ fromDate }: { fromDate: string }) {
  const { data: staffData, isLoading: staffLoading } = useListStaff();
  // Filter by date server-side (before the row limit) so the period's activity
  // isn't crowded out by newer out-of-range transactions.
  const { data: txData,    isLoading: txLoading    } = useListTransactions({ limit: 500, from: fromDate || undefined });
  const staff = staffData ?? [];
  const txs   = (txData?.items ?? []).filter((tx) => !fromDate || (tx.createdAt ?? "") >= fromDate);

  const staffSales = useMemo(() => {
    const map: Record<number, { name: string; count: number; total: number }> = {};
    for (const s of staff) map[s.id] = { name: `${s.firstName} ${s.lastName}`, count: 0, total: 0 };
    for (const tx of txs) {
      if (tx.status === "voided" || !tx.staffId) continue;
      if (!map[tx.staffId]) map[tx.staffId] = { name: `Staff #${tx.staffId}`, count: 0, total: 0 };
      map[tx.staffId].count++;
      map[tx.staffId].total += tx.total;
    }
    return Object.entries(map)
      .map(([id, d]) => ({ id: Number(id), ...d }))
      .sort((a, b) => b.total - a.total);
  }, [staff, txs]);

  const isLoading = staffLoading || txLoading;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Staff Members" value={isLoading ? "—" : staff.length.toString()} sub="Active" accent />
        <KpiTile label="Assigned Transactions" value={isLoading ? "—" : txs.filter((t) => t.staffId).length.toString()} sub="Linked to staff" />
        <KpiTile label="Top Performer" value={isLoading || !staffSales[0] ? "—" : staffSales[0].name.split(" ")[0]} sub={staffSales[0] ? formatCurrency(staffSales[0].total) : "—"} />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Sales by Staff Member" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : staffSales.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <UserSquare2 className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No staff activity recorded.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Staff Member</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Sales</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Avg Sale</th>
              </tr>
            </thead>
            <tbody>
              {staffSales.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{s.name}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{s.count}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatCurrency(s.total)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{s.count > 0 ? formatCurrency(s.total / s.count) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Cash Movements ────────────────────────────────────────────────── */

function CashMovementsTab() {
  const { data, isLoading } = useListCashDrawerEntries();
  const entries = data ?? [];
  const cashIn  = entries.filter((e) => e.amount >= 0).reduce((s, e) => s + e.amount, 0);
  const cashOut = entries.filter((e) => e.amount <  0).reduce((s, e) => s + Math.abs(e.amount), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Net Cash Movement" value={isLoading ? "—" : formatCurrency(cashIn - cashOut)} sub="In minus out" accent />
        <KpiTile label="Cash In" value={isLoading ? "—" : formatCurrency(cashIn)} sub="Counted in" />
        <KpiTile label="Cash Out" value={isLoading ? "—" : formatCurrency(cashOut)} sub="Counted out" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Cash Movement Log" action={<ExportBtn filename="cash-movements" rows={entries as unknown as Record<string, unknown>[]} columns={[{ key: "shiftDate", label: "Date" }, { key: "type", label: "Type" }, { key: "note", label: "Note" }, { key: "amount", label: "Amount" }]} />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <Banknote className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No cash movements recorded.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Note</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice().sort((a, b) => b.createdAt?.localeCompare(a.createdAt ?? "") ?? 0).map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 text-muted-foreground">{e.shiftDate ?? e.createdAt?.split("T")[0]}</td>
                  <td className="px-5 py-3 capitalize">{e.type}</td>
                  <td className="px-5 py-3 text-muted-foreground">{e.note ?? "—"}</td>
                  <td className={cn("px-5 py-3 text-right font-medium", e.amount >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {e.amount >= 0 ? "+" : ""}{formatCurrency(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Adjustments ───────────────────────────────────────────────────── */

function AdjustmentsTab() {
  const { data, isLoading } = useListWastage();
  const records = data ?? [];
  const totalQty  = records.reduce((s, r) => s + Math.abs(r.quantity ?? 0), 0);
  const totalCost = records.reduce((s, r) => s + Math.abs(r.cost ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Adjustments" value={isLoading ? "—" : records.length.toString()} sub="Total records" accent />
        <KpiTile label="Units Adjusted" value={isLoading ? "—" : totalQty.toString()} sub="Quantity variance" />
        <KpiTile label="Est. Cost Impact" value={isLoading ? "—" : formatCurrency(totalCost)} sub="At cost price" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Inventory Adjustments" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <SlidersHorizontal className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No inventory adjustments recorded.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Reason</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Qty</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-AU") : "—"}</td>
                  <td className="px-5 py-3 font-medium">{r.productName ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground capitalize">{r.reason ?? "—"}</td>
                  <td className={cn("px-5 py-3 text-right font-medium", (r.quantity ?? 0) < 0 ? "text-red-500" : "text-emerald-600")}>
                    {(r.quantity ?? 0) > 0 ? "+" : ""}{r.quantity ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{formatCurrency(r.cost ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Report Builder ────────────────────────────────────────────────── */

const BUILDER_FIELDS = [
  { id: "date",           label: "Date",            group: "Transaction" },
  { id: "revenue",        label: "Revenue",         group: "Transaction" },
  { id: "transactions",   label: "Transactions",    group: "Transaction" },
  { id: "avg_sale",       label: "Avg Sale",        group: "Transaction" },
  { id: "discounts",      label: "Discounts",       group: "Transaction" },
  { id: "refunds",        label: "Refunds",         group: "Transaction" },
  { id: "payment_method", label: "Payment Method",  group: "Transaction" },
  { id: "gst",            label: "GST Collected",   group: "Finance"     },
  { id: "gross_profit",   label: "Gross Profit",    group: "Finance"     },
  { id: "gross_margin",   label: "Gross Margin %",  group: "Finance"     },
  { id: "product",        label: "Product Name",    group: "Products"    },
  { id: "qty_sold",       label: "Qty Sold",        group: "Products"    },
  { id: "category",       label: "Category",        group: "Products"    },
  { id: "stock_level",    label: "Stock Level",     group: "Products"    },
  { id: "customer",       label: "Customer",        group: "Customers"   },
  { id: "customer_spend", label: "Lifetime Spend",  group: "Customers"   },
  { id: "loyalty_pts",    label: "Loyalty Points",  group: "Customers"   },
  { id: "staff",          label: "Staff Member",    group: "Staff"       },
  { id: "staff_sales",    label: "Staff Revenue",   group: "Staff"       },
];

const BUILDER_GROUPS = [...new Set(BUILDER_FIELDS.map((f) => f.group))];

function ReportBuilderTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [selected, setSelected] = useState<string[]>(["date", "revenue", "transactions"]);
  const [groupBy, setGroupBy] = useState("date");
  const [format, setFormat] = useState("table");
  const [result, setResult] = useState<{ columns: { key: string; label: string; type: string }[]; rows: Record<string, unknown>[] } | null>(null);
  const runReport = useRunReport();

  const toggle = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const fmtCell = (val: unknown, type: string) => {
    if (val == null) return "—";
    if (type === "currency") return formatCurrency(Number(val));
    if (type === "percent") return `${Number(val).toFixed(1)}%`;
    if (type === "number") return Number(val).toLocaleString();
    return String(val);
  };

  // Columns are driven by the grouping; the field checkboxes filter which of the
  // returned (non-period) columns to show, when any of them match.
  const visibleColumns = (() => {
    if (!result) return [];
    const labels = selected.map((id) => (BUILDER_FIELDS.find((f) => f.id === id)?.label ?? "").toLowerCase()).filter(Boolean);
    const matches = (col: { key: string; label: string }) =>
      col.key === "period" || labels.some((l) => col.label.toLowerCase().includes(l) || l.includes(col.label.toLowerCase()));
    const filtered = result.columns.filter(matches);
    // If nothing beyond the period column matched, fall back to all columns.
    return filtered.length > 1 ? filtered : result.columns;
  })();

  const handleRun = () => {
    runReport.mutate(
      { data: { startDate, endDate, groupBy: groupBy as "date" | "week" | "month" | "payment" | "staff" | "product" } },
      {
        onSuccess: (data) => setResult({ columns: data.columns, rows: data.rows as Record<string, unknown>[] }),
        onError: () => toast.error("Couldn't run report"),
      },
    );
  };

  const exportResult = () => {
    if (!result) return;
    exportToCsv(`report-${groupBy}-${startDate}_${endDate}`,
      result.rows.map((r) => Object.fromEntries(visibleColumns.map((c) => [c.key, r[c.key]]))),
      visibleColumns.map((c) => ({ key: c.key, label: c.label })));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="font-semibold">Fields</p>
          {BUILDER_GROUPS.map((group) => (
            <div key={group} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
              <div className="space-y-1">
                {BUILDER_FIELDS.filter((f) => f.group === group).map((f) => (
                  <label key={f.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)}
                      className="rounded text-primary accent-primary w-3.5 h-3.5" />
                    <span className="text-sm">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <p className="font-semibold">Options</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Group By</label>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
                  className="w-full h-9 rounded-lg border bg-background px-3 text-sm">
                  <option value="date">Date</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="product">Product</option>
                  <option value="staff">Staff</option>
                  <option value="payment">Payment Method</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Output Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}
                  className="w-full h-9 rounded-lg border bg-background px-3 text-sm">
                  <option value="table">Table</option>
                  <option value="chart">Chart</option>
                  <option value="csv">CSV Export</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button className="gap-1.5" onClick={handleRun} disabled={runReport.isPending}>
                {runReport.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Run Report
              </Button>
              {result && (
                <Button variant="outline" className="gap-1.5" onClick={exportResult}>
                  <Download className="w-4 h-4" /> Export CSV
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Uses the date range selected at the top of Reports.</p>
          </div>

          {/* Result */}
          {result && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <SectionHeader title={`Result — grouped by ${groupBy}`} />
              {result.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No data for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b">
                        {visibleColumns.map((c) => (
                          <th key={c.key} className={cn("px-5 py-3 font-medium text-muted-foreground", c.type === "text" ? "text-left" : "text-right")}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          {visibleColumns.map((c) => (
                            <td key={c.key} className={cn("px-5 py-3", c.type === "text" ? "text-left font-medium" : "text-right tabular-nums")}>
                              {fmtCell(row[c.key], c.type)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border bg-muted/30 p-5">
            <p className="text-sm font-semibold mb-3">Preview Columns</p>
            <div className="flex flex-wrap gap-2">
              {selected.length === 0
                ? <p className="text-sm text-muted-foreground">Select fields on the left.</p>
                : selected.map((id) => {
                    const f = BUILDER_FIELDS.find((x) => x.id === id)!;
                    return (
                      <div key={id} className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-sm">
                        {f.label}
                        <button onClick={() => toggle(id)} className="text-muted-foreground hover:text-foreground">×</button>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Scheduled ─────────────────────────────────────────────────────── */

type NewSchedule = { name: string; reportType: string; frequency: string; format: string; email: string };

const REPORT_TYPES = [
  { value: "daily_sales",    label: "Daily Sales Summary" },
  { value: "weekly_summary", label: "Weekly Business Summary" },
  { value: "monthly_report", label: "Monthly Report" },
  { value: "top_products",   label: "Top Products" },
  { value: "staff_sales",    label: "Staff Sales Leaderboard" },
];

const FREQUENCIES = [
  { value: "daily",   label: "Daily" },
  { value: "weekly",  label: "Weekly (Monday)" },
  { value: "monthly", label: "Monthly (1st)" },
];

const FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
];

function NewScheduleDialog({
  open, onOpenChange, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (r: NewSchedule) => void;
}) {
  const [name, setName]           = useState("");
  const [reportType, setType]     = useState("daily_sales");
  const [frequency, setFrequency] = useState("daily");
  const [format, setFormat]       = useState("pdf");
  const [email, setEmail]         = useState("");

  const reset = () => { setName(""); setType("daily_sales"); setFrequency("daily"); setFormat("pdf"); setEmail(""); };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Enter a report name"); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Enter a valid email address"); return;
    }
    onSave({ name: name.trim(), reportType, frequency, format, email: email.trim() });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Scheduled Report</DialogTitle>
          <DialogDescription>Automatically email a report on a recurring schedule.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Report Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Daily Sales Email" />
          </div>
          <div className="space-y-1.5">
            <Label>Report Type</Label>
            <Select value={reportType} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Send To (Email)</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="owner@example.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSave}>Create Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduledTab() {
  const queryClient = useQueryClient();
  const { data } = useListScheduledReports({ query: { queryKey: getListScheduledReportsQueryKey() } });
  const createSched = useCreateScheduledReport();
  const updateSched = useUpdateScheduledReport();
  const deleteSched = useDeleteScheduledReport();
  const [newOpen, setNewOpen] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListScheduledReportsQueryKey() });

  const schedules = data?.items ?? [];

  const handleAdd = async (r: NewSchedule) => {
    try { await createSched.mutateAsync({ data: r as never }); invalidate(); toast.success("Schedule created"); }
    catch { toast.error("Couldn't create schedule"); }
  };
  const handleToggle = async (id: number, enabled: boolean) => {
    try { await updateSched.mutateAsync({ id, data: { enabled: !enabled } as never }); invalidate(); }
    catch { toast.error("Couldn't update schedule"); }
  };
  const handleDelete = async (id: number) => {
    try { await deleteSched.mutateAsync({ id }); invalidate(); toast.success("Schedule removed"); }
    catch { toast.error("Couldn't remove schedule"); }
  };

  const FREQ_LABEL: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {schedules.length === 0 ? "No scheduled reports" : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""}`}
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
          <Plus className="w-4 h-4" /> New Schedule
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-xl border bg-card flex flex-col items-center py-16 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <CalendarDays className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <p className="font-semibold">No scheduled reports</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create a schedule to automatically email sales reports on a daily, weekly, or monthly basis.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Create your first schedule
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {schedules.map((s, i) => {
            const typeLabel = REPORT_TYPES.find(t => t.value === s.reportType)?.label ?? s.reportType;
            return (
              <div key={s.id} className={cn("flex items-center gap-4 px-5 py-4", i > 0 && "border-t")}>
                <div className="p-2 rounded-lg bg-muted shrink-0">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{s.name}</p>
                    <Badge variant="outline" className="text-xs">{s.format.toUpperCase()}</Badge>
                    <Badge variant="secondary" className="text-xs">{FREQ_LABEL[s.frequency]}</Badge>
                    {!s.enabled && <Badge variant="outline" className="text-xs text-muted-foreground">Paused</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {typeLabel} · Sent to {s.email}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={() => handleToggle(s.id, s.enabled)}
                    title={s.enabled ? "Pause schedule" : "Resume schedule"}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewScheduleDialog open={newOpen} onOpenChange={setNewOpen} onSave={handleAdd} />
    </div>
  );
}

/* ─── Tab: GST / BAS ─────────────────────────────────────────────────────── */

function GstBasTab({ summary, summaryLoading }: {
  summary: { totalSales: number; transactionCount: number } | undefined;
  summaryLoading: boolean;
}) {
  const { data: taxData } = useGetTaxSettings();
  const totalSales   = summary?.totalSales  ?? 0;
  const gstRate      = parseFloat(String(taxData?.gstRate ?? 10)) / 100;
  const gstInclusive = taxData?.taxInclusive !== "false";
  const gstCollected = gstInclusive ? totalSales * (gstRate / (1 + gstRate)) : totalSales * gstRate;
  const salesExGst   = gstInclusive ? totalSales - gstCollected : totalSales;

  const quarter = Math.floor(new Date().getMonth() / 3) + 1;
  const year    = new Date().getFullYear();
  const quarters = [
    { label: `Q${quarter} ${year} (Current)`, sales: salesExGst, gst: gstCollected, current: true,  hasData: true  },
    { label: `Q${quarter > 1 ? quarter - 1 : 4} ${quarter > 1 ? year : year - 1}`,  sales: null,    gst: null,      current: false, hasData: false },
    { label: `Q${quarter > 2 ? quarter - 2 : 4 + quarter - 2} ${year - (quarter <= 2 ? 1 : 0)}`, sales: null, gst: null, current: false, hasData: false },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Total Sales (inc. GST)" value={summaryLoading ? "—" : formatCurrency(totalSales)} sub={`${taxData?.taxName ?? "GST"} inclusive`} accent />
        <KpiTile label="Sales (ex-GST)" value={summaryLoading ? "—" : formatCurrency(salesExGst)} sub="Before tax" />
        <KpiTile label="GST Collected" value={summaryLoading ? "—" : formatCurrency(gstCollected)} sub={`${(gstRate * 100).toFixed(0)}% rate`} />
        <KpiTile label="GST Rate" value={`${(gstRate * 100).toFixed(0)}%`} sub={taxData?.gstEnabled === "true" ? "Enabled" : "Disabled"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="BAS Quarters" action={<ExportBtn />} />
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Quarter</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Sales (ex-GST)</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">GST Collected</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q) => (
                <tr key={q.label} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{q.label}</td>
                  <td className="px-5 py-3 text-right">{q.hasData ? formatCurrency(q.sales ?? 0) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-5 py-3 text-right font-medium text-amber-600">{q.hasData ? formatCurrency(q.gst ?? 0) : <span className="text-muted-foreground font-normal">—</span>}</td>
                  <td className="px-5 py-3 text-right">
                    {q.current
                      ? <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700">In Progress</Badge>
                      : <Badge variant="secondary" className="text-[10px]">Not Available</Badge>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="font-semibold">BAS G-Code Summary</p>
          {[
            { code: "G1",  label: "Total Sales (inc. GST)",   value: totalSales   },
            { code: "G2",  label: "GST-Free Sales",           value: 0            },
            { code: "G3",  label: "Input-Taxed Sales",        value: 0            },
            { code: "G10", label: "Capital Purchases",        value: 0            },
            { code: "1A",  label: "GST on Sales (remit ATO)", value: gstCollected },
            { code: "1B",  label: "GST Credits (purchases)",  value: 0            },
          ].map((row) => (
            <div key={row.code} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="w-7 h-6 rounded bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground">{row.code}</span>
                <span className="text-muted-foreground">{row.label}</span>
              </div>
              <span className={cn("font-medium", row.code === "1A" ? "text-amber-600" : "")}>{formatCurrency(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Gift Cards ────────────────────────────────────────────────────── */

function GiftCardsTab() {
  const { data, isLoading } = useListGiftCards({ limit: 1000 });
  const { data: settings } = useGetGiftCardSettings();
  const cards = data?.items ?? [];

  const issued      = cards.reduce((s, c) => s + (c.initialValue ?? 0), 0);
  const redeemed    = cards.reduce((s, c) => s + Math.max(0, (c.initialValue ?? 0) - (c.currentBalance ?? 0)), 0);
  const outstanding = cards.reduce((s, c) => s + (c.status !== "expired" ? (c.currentBalance ?? 0) : 0), 0);
  const expired     = cards.reduce((s, c) => s + (c.status === "expired" ? (c.currentBalance ?? 0) : 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Cards Issued" value={isLoading ? "—" : cards.length.toString()} sub="Total issued" accent />
        <KpiTile label="Outstanding Balance" value={isLoading ? "—" : formatCurrency(outstanding)} sub="Unredeemed liability" />
        <KpiTile label="Redeemed" value={isLoading ? "—" : formatCurrency(redeemed)} sub="Lifetime" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Gift Card Activity" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
              <Gift className="w-8 h-8 text-pink-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">No gift cards yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">Issue gift cards at the POS register. They'll appear here for tracking and reporting.</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Card</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Issued To</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Initial</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Balance</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium font-mono text-xs">{c.cardNumber}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.issuedTo || "—"}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(c.initialValue ?? 0)}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatCurrency(c.currentBalance ?? 0)}</td>
                  <td className="px-5 py-3 capitalize text-muted-foreground">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <p className="font-semibold">Configuration</p>
          <div className="space-y-3">
            {[
              { label: "Expiry Period",      value: settings?.expiryMonths ? `${settings.expiryMonths} months` : "Never" },
              { label: "Partial Redemption", value: settings?.allowPartialRedemptions === "false" ? "Disabled" : "Enabled" },
              { label: "Card Prefix",        value: settings?.prefix || "—" },
            ].map((r) => (
              <div key={r.label} className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <p className="font-semibold">Liability Summary</p>
          <p className="text-xs text-muted-foreground">Total outstanding gift card balances represent a liability on your books.</p>
          {[
            { label: "Issued (all time)",       value: formatCurrency(issued) },
            { label: "Redeemed (all time)",     value: formatCurrency(redeemed) },
            { label: "Expired",                 value: formatCurrency(expired) },
            { label: "Outstanding (Liability)", value: formatCurrency(outstanding) },
          ].map((r) => (
            <div key={r.label} className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Store Credit ──────────────────────────────────────────────────── */

function StoreCreditTab() {
  const { data: loyaltyData } = useGetLoyaltySettings();
  const { customers, isLoading } = useAllCustomers();
  const totalPoints  = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);
  const dollarValue  = loyaltyData?.pointsPerDollar
    ? totalPoints / Number(loyaltyData.pointsPerDollar)
    : totalPoints / 10;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Total Points Issued" value={isLoading ? "—" : totalPoints.toLocaleString()} sub="Across all customers" accent />
        <KpiTile label="Estimated Liability" value={isLoading ? "—" : formatCurrency(dollarValue)} sub="At redemption rate" />
        <KpiTile label="Customers with Points" value={isLoading ? "—" : customers.filter((c) => (c.loyaltyPoints ?? 0) > 0).length.toString()} sub="Active balances" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Top Balances" />
          {customers.filter((c) => (c.loyaltyPoints ?? 0) > 0).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <Wallet className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No store credit balances yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Points</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody>
                {customers
                  .filter((c) => (c.loyaltyPoints ?? 0) > 0)
                  .sort((a, b) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0))
                  .slice(0, 10)
                  .map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">{c.firstName} {c.lastName}</td>
                      <td className="px-5 py-3 text-right font-medium">{(c.loyaltyPoints ?? 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatCurrency((c.loyaltyPoints ?? 0) / (loyaltyData?.pointsPerDollar ? Number(loyaltyData.pointsPerDollar) : 10))}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="font-semibold">Loyalty Programme Settings</p>
          {[
            { label: "Points per Dollar",    value: loyaltyData?.pointsPerDollar ?? "—"    },
            { label: "Redemption Rate",      value: loyaltyData?.pointsPerDollar ? `${loyaltyData.pointsPerDollar} pts = $1` : "—" },
            { label: "Min Redemption",       value: loyaltyData?.stampsRequired ? `${loyaltyData.stampsRequired} stamps` : "—" },
            { label: "Programme Status",     value: loyaltyData?.isEnabled ? "Active" : "Inactive" },
          ].map((r) => (
            <div key={r.label} className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-medium">{String(r.value)}</span>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5 w-full">
            <Settings2 className="w-3.5 h-3.5" /> Configure Loyalty
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Analytics (Marketing) ────────────────────────────────────────── */

function _parseQrSettings(raw: string): { template?: string; dotStyle?: string } {
  try {
    const parsed = JSON.parse(raw ?? "{}") as { template?: string; dotStyle?: string };
    return parsed ?? {};
  } catch {
    return {};
  }
}

function _parseLandingLinks(raw: string | undefined | null): { enabled: boolean }[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as { enabled?: boolean }[];
    return Array.isArray(parsed) ? parsed.map((l) => ({ enabled: !!l?.enabled })) : [];
  } catch {
    return [];
  }
}

function _groupByDay(items: { createdAt: string }[], days = 30): Record<string, number> {
  const result: Record<string, number> = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    result[toISO(d)] = 0; // local-date key, matching how records are bucketed below
  }
  for (const item of items) {
    // createdAt is a UTC ISO timestamp — convert to the LOCAL day so evening
    // events (post-2pm UTC = post-midnight AEST) land in the right bucket.
    if (!item.createdAt) continue;
    const day = toISO(new Date(item.createdAt));
    if (day in result) result[day]++;
  }
  return result;
}

function _countBy<T>(items: T[], key: (x: T) => string): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const x of items) { const k = key(x); counts[k] = (counts[k] ?? 0) + 1; }
  return Object.entries(counts)
    .map(([n, v]) => ({ name: n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, " "), value: v }))
    .sort((a, b) => b.value - a.value);
}

const _CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f97316", "#14b8a6"];

/* ─── Marketing engagement (real scans / clicks / views) ──────────────────── */

interface MktAnalytics {
  days: number;
  totals: { total: number; unique: number; shortlink: number; landing: number; qr: number };
  byDay: { date: string; shortlink: number; landing: number; qr: number }[];
  byDevice: { name: string; value: number }[];
  byCountry: { name: string; value: number }[];
  topTargets: { kind: string; slug: string; count: number }[];
}

const _DEVICE_LABEL: Record<string, string> = {
  mobile: "Mobile", tablet: "Tablet", desktop: "Desktop", bot: "Bot", unknown: "Unknown",
};

function EngagementAnalytics() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<MktAnalytics>({
    queryKey: ["marketing-analytics", days],
    queryFn: async () => {
      const r = await fetch(`/api/marketing-analytics?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load analytics");
      return r.json() as Promise<MktAnalytics>;
    },
    staleTime: 60_000,
  });

  // Build a continuous date axis for the window from the sparse per-day rows.
  const series = useMemo(() => {
    const map = new Map((data?.byDay ?? []).map((d) => [d.date, d]));
    const out: { label: string; Scans: number; Clicks: number; Views: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(today);
      dt.setDate(today.getDate() - i);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const e = map.get(key);
      out.push({
        label: dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
        Clicks: e?.shortlink ?? 0,
        Views: e?.landing ?? 0,
        Scans: e?.qr ?? 0,
      });
    }
    return out;
  }, [data, days]);

  const totals = data?.totals;
  const hasData = (totals?.total ?? 0) > 0;

  const periodBtn = (d: number, label: string) => (
    <button
      key={d}
      onClick={() => setDays(d)}
      className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
        days === d ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-muted/50")}
    >{label}</button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Engagement</h2>
          <p className="text-xs text-muted-foreground">Real scans, clicks &amp; views — device and location where the network provides it.</p>
        </div>
        <div className="flex items-center gap-1.5">{periodBtn(7, "7d")}{periodBtn(30, "30d")}{periodBtn(90, "90d")}</div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Loading engagement…</div>
      ) : !hasData ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No scans, clicks, or views recorded in this period yet. Engagement appears here once people use your
          shortlinks, landing pages, or <span className="font-medium text-foreground">trackable</span> QR codes.
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiTile label="Total Engagements" value={(totals?.total ?? 0).toLocaleString()} sub={`Last ${days} days`} accent />
            <KpiTile label="Unique Visitors" value={(totals?.unique ?? 0).toLocaleString()} sub="Approx. (by network)" />
            <KpiTile label="QR Scans" value={(totals?.qr ?? 0).toLocaleString()} sub="Trackable QRs" />
            <KpiTile label="Shortlink Clicks" value={(totals?.shortlink ?? 0).toLocaleString()} sub="koast.al links" />
            <KpiTile label="Landing Views" value={(totals?.landing ?? 0).toLocaleString()} sub="Public pages" />
          </div>

          {/* Engagement over time */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <SectionHeader title={`Engagement — Last ${days} Days`} />
            <div className="p-5">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="gScans" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor(series.length / 6))} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Scans" stroke="#6366f1" fill="url(#gScans)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Clicks" stroke="#22c55e" fill="url(#gClicks)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Views" stroke="#f59e0b" fill="url(#gViews)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Devices + Countries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border bg-card overflow-hidden">
              <SectionHeader title="By Device" />
              <div className="p-5">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={(data?.byDevice ?? []).map((d) => ({ name: _DEVICE_LABEL[d.name] ?? d.name, value: d.value }))}
                      dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                      {(data?.byDevice ?? []).map((_, i) => <Cell key={i} fill={_CHART_COLORS[i % _CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
              <SectionHeader title="By Location" />
              <div className="p-5">
                {(data?.byCountry ?? []).length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                    <Globe className="w-8 h-8 opacity-20" />
                    <p className="text-sm text-center">No location data.<br />The host network isn't passing geo headers.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data?.byCountry ?? []} layout="vertical" barSize={14}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
                      <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                      <Bar dataKey="value" name="Engagements" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Top targets */}
          {(data?.topTargets ?? []).length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <SectionHeader title="Top Performing" />
              <div className="divide-y">
                {(data?.topTargets ?? []).map((t, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Badge variant="outline" className="text-[10px] capitalize">{t.kind}</Badge>
                    <span className="flex-1 truncate font-medium">{t.slug}</span>
                    <span className="tabular-nums text-muted-foreground">{t.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AnalyticsTab() {
  const { data: qrResp }    = useListQrCodes();
  const { data: linksResp } = useListShortlinks();
  const { data: pagesResp } = useListLandingPages();

  const qr    = useMemo(() => qrResp?.items    ?? [], [qrResp]);
  const links = useMemo(() => linksResp?.items ?? [], [linksResp]);
  const pages = useMemo(() => pagesResp?.items ?? [], [pagesResp]);

  const totalClicks = useMemo(() => links.reduce((s, l) => s + (l.clicks || 0), 0), [links]);
  const avgClicks   = links.length > 0 ? (totalClicks / links.length) : 0;
  const topLinks    = useMemo(() => [...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 8), [links]);
  const templates   = useMemo(() => _countBy(qr, (e) => _parseQrSettings(e.settings).template ?? "standard"), [qr]);
  const dotStyles   = useMemo(() => _countBy(qr, (e) => _parseQrSettings(e.settings).dotStyle ?? "square"), [qr]);

  const activityData = useMemo(() => {
    const qrByDay  = _groupByDay(qr, 30);
    const lkByDay  = _groupByDay(links, 30);
    return Object.keys(qrByDay).map((date) => ({
      date: new Date(date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      "QR Codes":  qrByDay[date],
      "Shortlinks": lkByDay[date] ?? 0,
    }));
  }, [qr, links]);

  if (qr.length === 0 && links.length === 0 && pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4 text-muted-foreground">
        <Globe className="w-16 h-16 opacity-10" />
        <div>
          <p className="font-semibold text-foreground">No marketing data yet</p>
          <p className="text-sm">Create QR codes, shortlinks, or landing pages to see analytics here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Real engagement (scans / clicks / views with device + location) ── */}
      <EngagementAnalytics />

      {/* ── Assets created (counts + styles) ── */}
      <div className="space-y-6">
      <h2 className="text-lg font-semibold">Your marketing assets</h2>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiTile label="QR Codes" value={qr.length.toString()} sub="Generated" />
        <KpiTile label="Shortlinks" value={links.length.toString()} sub="Created" />
        <KpiTile label="Total Clicks" value={totalClicks.toLocaleString()} sub="Across all shortlinks" accent />
        <KpiTile label="Avg. Clicks" value={avgClicks.toFixed(1)} sub="Per shortlink" />
        <KpiTile label="Landing Pages" value={pages.length.toString()} sub="Published" />
      </div>

      {/* ── Activity timeline ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Activity — Last 30 Days" />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={activityData} barSize={6} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                interval={Math.floor(activityData.length / 6)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
              <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="QR Codes"  fill="#6366f1" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Shortlinks" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top shortlinks by clicks */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Top Shortlinks by Clicks" action={
            <Link href="/management/marketing-reports/generators/shortlinks">
              <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Manage</Button>
            </Link>
          } />
          <div className="p-5">
            {topLinks.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                <Link2 className="w-8 h-8 opacity-20" />
                <p className="text-sm">No shortlinks yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={topLinks.map((l) => ({ name: (l.label || l.slug || "").slice(0, 18), clicks: l.clicks || 0 }))}
                  layout="vertical" barSize={14}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  <Bar dataKey="clicks" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* QR template usage */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="QR Code Templates Used" action={
            <Link href="/management/marketing-reports/generators/qr-codes">
              <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Manage</Button>
            </Link>
          } />
          <div className="p-5">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                <QrCode className="w-8 h-8 opacity-20" />
                <p className="text-sm">No QR codes generated yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={templates} barSize={22}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                    <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                    <Bar dataKey="value" name="Uses" radius={[4, 4, 0, 0]}>
                      {templates.map((_, i) => <Cell key={i} fill={_CHART_COLORS[i % _CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Dot styles */}
                {dotStyles.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <p className="w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dot Styles</p>
                    {dotStyles.map((d, i) => (
                      <span key={d.name} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium"
                        style={{ borderColor: _CHART_COLORS[i % _CHART_COLORS.length], color: _CHART_COLORS[i % _CHART_COLORS.length] }}>
                        {d.name} <span className="opacity-70">×{d.value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Shortlinks table ── */}
      {links.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="All Shortlinks" action={<ExportBtn />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Label</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Slug</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Destination</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-right">
                    <span className="flex items-center gap-1 justify-end"><MousePointerClick className="w-3 h-3" />Clicks</span>
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody>
                {[...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).map((l, i) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-medium">{l.label || <span className="text-muted-foreground italic">Unlabelled</span>}</td>
                    <td className="px-5 py-3 font-mono text-xs text-primary">{l.slug}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{l.longUrl}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn("font-bold tabular-nums", i === 0 && "text-primary")}>
                        {(l.clicks || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(l.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── QR codes table ── */}
      {qr.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="QR Code History" action={<ExportBtn />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {["Label", "URL", "Template", "Dot Style", "Created"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qr.slice(0, 20).map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-medium max-w-[140px] truncate">{e.label || <span className="text-muted-foreground italic">Unlabelled</span>}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground max-w-[180px] truncate">{e.url}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary font-medium capitalize">
                        {(_parseQrSettings(e.settings).template ?? "standard").replace(/-/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full border font-medium capitalize">
                        {(_parseQrSettings(e.settings).dotStyle ?? "square").replace(/-/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(e.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Landing pages summary ── */}
      {pages.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Landing Pages" action={
            <Link href="/management/marketing-reports/landing-pages/pages">
              <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Manage</Button>
            </Link>
          } />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {["Title", "URL", "Active Links", "Last Updated"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-medium">{p.title || "Untitled"}</td>
                    <td className="px-5 py-3 font-mono text-xs text-primary">/p/{p.slug}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary font-medium">
                        {_parseLandingLinks(p.links).filter((l) => l.enabled).length} links
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(p.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTabId>("sales");
  const [preset, setPreset]       = useState<Preset>("month");
  const init                      = presetDates("month");
  const [fromDate, setFromDate]   = useState(init.from);
  const [toDate,   setToDate]     = useState(init.to);
  const [apiPeriod, setApiPeriod] = useState<GetDashboardSummaryPeriod>(presetToApiPeriod("month"));
  const [refreshKey, setRefresh]  = useState(0);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as ReportTabId;
    if (hash && REPORT_TABS.some((t) => t.id === hash)) setActiveTab(hash);
  }, []);

  const selectPreset = (id: Preset) => {
    setPreset(id);
    const { from, to } = presetDates(id);
    setFromDate(from);
    setToDate(to);
  };

  const handleRefresh = () => {
    setApiPeriod(presetToApiPeriod(preset));
    setRefresh((k) => k + 1);
  };

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(
    { period: apiPeriod },
    { query: { queryKey: ["reports-summary", apiPeriod, refreshKey] } },
  );
  const safeChartPeriod = (apiPeriod === "today" || apiPeriod === "yesterday") ? "week" : apiPeriod;
  const { data: chartData, isLoading: chartLoading } = useGetSalesChart(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { period: safeChartPeriod as any },
    { query: { queryKey: ["reports-chart", apiPeriod, refreshKey] } },
  );

  const totalSales   = summary?.totalSales       ?? 0;
  const txCount      = summary?.transactionCount ?? 0;
  const avgSaleValue = txCount > 0 ? totalSales / txCount : 0;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Business intelligence and analytics across all areas of KoaPOS
            </p>
          </div>

          {/* Date controls */}
          <div className="flex flex-wrap items-center gap-2">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPreset(p.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                  preset === p.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "pill-selector bg-background hover:bg-muted text-foreground border-border",
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPreset("custom"); }} className="h-8 w-36 text-sm px-2" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={toDate}   onChange={(e) => { setToDate(e.target.value);   setPreset("custom"); }} className="h-8 w-36 text-sm px-2" />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleRefresh}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 border-b pb-3">
          {REPORT_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                activeTab === id
                  ? "bg-primary text-primary-foreground"
                  : "pill-selector text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────────── */}
        {activeTab === "sales"             && <SalesTab summary={summary} summaryLoading={summaryLoading} chartData={chartData} chartLoading={chartLoading} totalSales={totalSales} txCount={txCount} avgSaleValue={avgSaleValue} />}
        {activeTab === "payments"          && <PaymentsTab startDate={fromDate} endDate={toDate} />}
        {activeTab === "inventory"         && <InventoryTab />}
        {activeTab === "register-closures" && <RegisterClosuresTab />}
        {activeTab === "profit-loss"       && <ProfitLossTab startDate={fromDate} endDate={toDate} />}
        {activeTab === "cost-of-goods"     && <CostOfGoodsTab startDate={fromDate} endDate={toDate} />}
        {activeTab === "customer-insights" && <CustomerInsightsTab />}
        {activeTab === "top-products"      && <TopProductsTab apiPeriod={apiPeriod} />}
        {activeTab === "user-activity"     && <UserActivityTab fromDate={fromDate} />}
        {activeTab === "cash-movements"    && <CashMovementsTab />}
        {activeTab === "adjustments"       && <AdjustmentsTab />}
        {activeTab === "report-builder"    && <ReportBuilderTab startDate={fromDate} endDate={toDate} />}
        {activeTab === "scheduled"         && <ScheduledTab />}
        {activeTab === "gst-bas"           && <GstBasTab summary={summary} summaryLoading={summaryLoading} />}
        {activeTab === "gift-cards"        && <GiftCardsTab />}
        {activeTab === "store-credit"      && <StoreCreditTab />}

      </div>
    </AppLayout>
  );
}
