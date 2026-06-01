import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Trophy, Download, RefreshCw, TrendingUp, ShoppingCart, Percent } from "lucide-react";
import { toast } from "sonner";

interface StaffRow {
  staffId: number; staffName: string; staffRole: string;
  transactionCount: number; totalRevenue: number; avgBasket: number; totalDiscounts: number;
}
interface LeaderboardData { startDate: string; endDate: string; staff: StaffRow[] }

const ROLE_COLORS: Record<string, string> = { owner: "bg-amber-100 text-amber-700", manager: "bg-blue-100 text-blue-700", cashier: "bg-gray-100 text-gray-700" };

export default function ManagementReportsStaffLeaderboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(thirtyAgo);
  const [endDate, setEndDate] = useState(today);

  const { data, isLoading, refetch } = useQuery<LeaderboardData>({
    queryKey: ["staff-leaderboard", startDate, endDate],
    queryFn: async () => {
      const r = await fetch(`/api/reports/staff-leaderboard?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load leaderboard");
      return r.json();
    },
    enabled: startDate <= endDate,
  });

  const topEarner = useMemo(() => data?.staff[0], [data]);

  const handleExport = () => {
    if (!data) return;
    const header = ["Name", "Role", "Transactions", "Revenue", "Avg Basket", "Discounts"];
    const rows = data.staff.map(s => [s.staffName, s.staffRole, s.transactionCount, s.totalRevenue, s.avgBasket, s.totalDiscounts]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `staff-leaderboard-${startDate}-to-${endDate}.csv`;
    a.click();
    toast.success("Leaderboard exported");
  };

  const totalRevenue = useMemo(() => data?.staff.reduce((s, r) => s + r.totalRevenue, 0) ?? 0, [data]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Staff Sales Leaderboard</h1>
              <p className="text-sm text-muted-foreground">Revenue, transactions and basket size by staff member</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
            <span className="text-muted-foreground text-sm">→</span>
            <Input type="date" value={endDate} min={startDate} max={today} onChange={e => setEndDate(e.target.value)} className="w-36" />
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!data?.staff.length}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
        </div>

        {/* Top performer highlight */}
        {topEarner && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-200 dark:bg-amber-700 flex items-center justify-center font-bold text-amber-800 dark:text-amber-100 text-lg">
                  🏆
                </div>
                <div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mb-0.5">Top Performer</p>
                  <p className="font-bold text-lg">{topEarner.staffName}</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(topEarner.totalRevenue)} revenue · {topEarner.transactionCount} transactions</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{formatCurrency(topEarner.avgBasket)}</p>
                  <p className="text-xs text-muted-foreground">avg basket</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Revenue by Staff Member
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : !data?.staff.length ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.staff} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="staffName" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="totalRevenue" name="Revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Avg basket chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Average Basket Size
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : !data?.staff.length ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.staff} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="staffName" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="avgBasket" name="Avg Basket" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Detail table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Full Breakdown
                {data?.staff.length ? <Badge variant="secondary">{data.staff.length} staff</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.staff.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sales recorded for this period with staff assigned</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4">Rank</th>
                        <th className="text-left py-2 pr-4">Staff Member</th>
                        <th className="text-left py-2 pr-4">Role</th>
                        <th className="text-right py-2 pr-4">Transactions</th>
                        <th className="text-right py-2 pr-4">Revenue</th>
                        <th className="text-right py-2 pr-4">Avg Basket</th>
                        <th className="text-right py-2">Discounts Given</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.staff.map((s, i) => (
                        <tr key={s.staffId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-mono text-muted-foreground">#{i + 1}</td>
                          <td className="py-2 pr-4 font-medium">{s.staffName}</td>
                          <td className="py-2 pr-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-medium ${ROLE_COLORS[s.staffRole] ?? "bg-gray-100 text-gray-700"}`}>
                              {s.staffRole}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right">{s.transactionCount}</td>
                          <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(s.totalRevenue)}</td>
                          <td className="py-2 pr-4 text-right">{formatCurrency(s.avgBasket)}</td>
                          <td className="py-2 text-right text-amber-600 dark:text-amber-400">{formatCurrency(s.totalDiscounts)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-bold text-sm">
                        <td colSpan={4} className="pt-2 pr-4">Total</td>
                        <td className="pt-2 pr-4 text-right">{formatCurrency(totalRevenue)}</td>
                        <td colSpan={2} />
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
