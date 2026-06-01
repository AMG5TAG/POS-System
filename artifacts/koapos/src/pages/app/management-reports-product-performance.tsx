import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Package, Download, RefreshCw, TrendingUp, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

interface ProductRow {
  productId: number; name: string; sku: string | null;
  quantitySold: number; totalRevenue: number; totalCogs: number;
  grossProfit: number; marginPct: number;
}
interface PerfData { startDate: string; endDate: string; items: ProductRow[] }

type SortKey = "totalRevenue" | "quantitySold" | "grossProfit" | "marginPct";

export default function ManagementReportsProductPerformancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(thirtyAgo);
  const [endDate, setEndDate] = useState(today);
  const [sortKey, setSortKey] = useState<SortKey>("totalRevenue");

  const { data, isLoading, refetch } = useQuery<PerfData>({
    queryKey: ["product-performance", startDate, endDate],
    queryFn: async () => {
      const r = await fetch(`/api/reports/product-performance?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load product performance");
      return r.json();
    },
    enabled: startDate <= endDate,
  });

  const sorted = useMemo(() => {
    if (!data?.items) return [];
    return [...data.items].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [data, sortKey]);

  const top10 = useMemo(() => sorted.slice(0, 10), [sorted]);

  const totals = useMemo(() => sorted.reduce((acc, r) => ({
    qty: acc.qty + r.quantitySold,
    revenue: acc.revenue + r.totalRevenue,
    profit: acc.profit + r.grossProfit,
  }), { qty: 0, revenue: 0, profit: 0 }), [sorted]);

  const handleExport = () => {
    if (!data) return;
    const header = ["Product", "SKU", "Qty Sold", "Revenue", "COGS", "Gross Profit", "Margin %"];
    const rows = sorted.map(r => [r.name, r.sku ?? "", r.quantitySold, r.totalRevenue, r.totalCogs, r.grossProfit, r.marginPct]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `product-performance-${startDate}-to-${endDate}.csv`;
    a.click();
    toast.success("Report exported");
  };

  const sortButtons: Array<{ key: SortKey; label: string }> = [
    { key: "totalRevenue",  label: "Revenue" },
    { key: "quantitySold", label: "Qty Sold" },
    { key: "grossProfit",  label: "Profit" },
    { key: "marginPct",    label: "Margin %" },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Product Performance</h1>
              <p className="text-sm text-muted-foreground">Best sellers, revenue share and margin by product</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
            <span className="text-muted-foreground text-sm">→</span>
            <Input type="date" value={endDate} min={startDate} max={today} onChange={e => setEndDate(e.target.value)} className="w-36" />
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!sorted.length}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.revenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Total Units Sold</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{totals.qty.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Gross Profit</p>
              <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{formatCurrency(totals.profit)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Bar chart: top 10 by revenue */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Top 10 Products by Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : !top10.length ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="totalRevenue" name="Revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Gross profit chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Top 10 by Gross Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : !top10.length ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="grossProfit" name="Gross Profit" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Full table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4" /> All Products
                  {sorted.length > 0 && <Badge variant="secondary">{sorted.length} products</Badge>}
                </CardTitle>
                <div className="flex gap-1">
                  {sortButtons.map(b => (
                    <Button key={b.key} size="sm" variant={sortKey === b.key ? "default" : "outline"}
                      className="text-xs h-7" onClick={() => setSortKey(b.key)}>
                      {b.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!sorted.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No product sales data for this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4">Product</th>
                        <th className="text-left py-2 pr-4">SKU</th>
                        <th className="text-right py-2 pr-4">Qty Sold</th>
                        <th className="text-right py-2 pr-4">Revenue</th>
                        <th className="text-right py-2 pr-4">COGS</th>
                        <th className="text-right py-2 pr-4">Gross Profit</th>
                        <th className="text-right py-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p, i) => (
                        <tr key={p.productId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-medium max-w-[200px] truncate">{p.name}</td>
                          <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">{p.sku ?? "—"}</td>
                          <td className="py-2 pr-4 text-right">{p.quantitySold.toFixed(0)}</td>
                          <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(p.totalRevenue)}</td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">{formatCurrency(p.totalCogs)}</td>
                          <td className="py-2 pr-4 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(p.grossProfit)}</td>
                          <td className="py-2 text-right">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.marginPct >= 40 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : p.marginPct >= 20 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                              {p.marginPct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-bold text-sm">
                        <td colSpan={2} className="pt-2 pr-4">Total</td>
                        <td className="pt-2 pr-4 text-right">{totals.qty.toFixed(0)}</td>
                        <td className="pt-2 pr-4 text-right">{formatCurrency(totals.revenue)}</td>
                        <td className="pt-2 pr-4 text-right text-muted-foreground">{formatCurrency(sorted.reduce((s, r) => s + r.totalCogs, 0))}</td>
                        <td className="pt-2 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.profit)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
