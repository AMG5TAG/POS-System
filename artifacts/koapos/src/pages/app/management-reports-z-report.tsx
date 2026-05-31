import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Moon, Receipt, Banknote, TrendingDown, RotateCcw, Download, RefreshCw, CreditCard, ScanLine } from "lucide-react";
import { toast } from "sonner";

interface ZReportData {
  date: string;
  grossSales: number;
  discountTotal: number;
  taxCollected: number;
  netSales: number;
  transactionCount: number;
  refundCount: number;
  refundAmount: number;
  byPaymentMethod: Array<{ method: string; count: number; total: number }>;
}

const METHOD_COLORS: Record<string, string> = {
  card: "#6366f1", cash: "#22c55e", split: "#f59e0b", gift_card: "#ec4899", laybuy: "#8b5cf6",
};

const METHOD_ICONS: Record<string, typeof CreditCard> = {
  card: CreditCard, cash: Banknote, gift_card: ScanLine,
};

export default function ManagementReportsZReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const { data, isLoading, refetch } = useQuery<ZReportData>({
    queryKey: ["z-report", date],
    queryFn: async () => {
      const r = await fetch(`/api/reports/z-report?date=${date}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load Z-report");
      return r.json();
    },
  });

  const handleExport = () => {
    if (!data) return;
    const lines = [
      ["Z-REPORT", data.date],
      [],
      ["Gross Sales", data.grossSales],
      ["Discounts", `-${data.discountTotal}`],
      ["Refunds", `-${data.refundAmount}`],
      ["Net Sales", data.netSales],
      ["Tax Collected (GST)", data.taxCollected],
      ["Transaction Count", data.transactionCount],
      ["Refund Count", data.refundCount],
      [],
      ["Payment Method", "Count", "Total"],
      ...data.byPaymentMethod.map(m => [m.method, m.count, m.total]),
    ];
    const csv = lines.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `z-report-${date}.csv`;
    a.click();
    toast.success("Z-Report exported");
  };

  const kpis = [
    { label: "Gross Sales",       value: formatCurrency(data?.grossSales ?? 0),       icon: TrendingDown, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Discounts Given",   value: formatCurrency(data?.discountTotal ?? 0),     icon: TrendingDown, color: "text-amber-600 dark:text-amber-400" },
    { label: "Refunds",           value: formatCurrency(data?.refundAmount ?? 0),      icon: RotateCcw,    color: "text-red-600 dark:text-red-400" },
    { label: "Net Sales",         value: formatCurrency(data?.netSales ?? 0),          icon: Receipt,      color: "text-violet-600 dark:text-violet-400" },
    { label: "GST Collected",     value: formatCurrency(data?.taxCollected ?? 0),      icon: Receipt,      color: "text-blue-600 dark:text-blue-400" },
    { label: "Transactions",      value: String(data?.transactionCount ?? 0),          icon: Banknote,     color: "text-indigo-600 dark:text-indigo-400" },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Moon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">End-of-Day Z-Report</h1>
              <p className="text-sm text-muted-foreground">Daily shift close-out summary</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className="w-40" />
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!data}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Payment breakdown chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sales by Payment Method</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : !data?.byPaymentMethod.length ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No transactions for this date</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byPaymentMethod} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="method" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {data.byPaymentMethod.map((m, i) => (
                        <Cell key={i} fill={METHOD_COLORS[m.method] ?? "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Payment method detail table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Method Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.byPaymentMethod.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data for {date}</p>
              ) : (
                <div className="space-y-2">
                  {data.byPaymentMethod.map(m => {
                    const Icon = METHOD_ICONS[m.method] ?? CreditCard;
                    return (
                      <div key={m.method} className="flex items-center gap-3 py-2 border-b last:border-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${METHOD_COLORS[m.method] ?? "#94a3b8"}20` }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: METHOD_COLORS[m.method] ?? "#94a3b8" }} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium capitalize">{m.method.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">{m.count} transaction{m.count !== 1 ? "s" : ""}</p>
                        </div>
                        <p className="font-semibold text-sm">{formatCurrency(m.total)}</p>
                      </div>
                    );
                  })}
                  <div className="flex justify-between items-center pt-2 font-bold text-sm">
                    <span>Total</span>
                    <span>{formatCurrency(data.grossSales)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Z-Report worksheet */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="w-4 h-4" /> Z-Report Worksheet
                <Badge variant="outline" className="ml-auto">{date}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                {[
                  { label: "Gross Sales (incl. GST)",  value: data?.grossSales ?? 0,      sign: "" },
                  { label: "Less: Discounts",           value: data?.discountTotal ?? 0,   sign: "−" },
                  { label: "Less: Refunds",             value: data?.refundAmount ?? 0,    sign: "−" },
                  { label: "Net Sales",                 value: data?.netSales ?? 0,        sign: "", bold: true },
                  { label: "GST Collected (1A)",        value: data?.taxCollected ?? 0,    sign: "" },
                  { label: "Net Sales (ex-GST)",        value: ((data?.netSales ?? 0) - (data?.taxCollected ?? 0)), sign: "" },
                ].map(row => (
                  <div key={row.label} className={`flex justify-between py-1.5 border-b last:border-0 ${row.bold ? "font-bold" : ""}`}>
                    <span className={row.bold ? "" : "text-muted-foreground"}>{row.label}</span>
                    <span className={row.sign === "−" ? "text-red-600 dark:text-red-400" : ""}>
                      {row.sign}{formatCurrency(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
