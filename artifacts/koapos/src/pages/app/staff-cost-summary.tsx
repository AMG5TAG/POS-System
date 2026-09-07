import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useListStaff,
  useGetStaffSalesReport,
  type Staff,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Coins, Users, TrendingUp, DollarSign, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Preset date ranges ─────────────────────────────────────────────────── */

type Period = "this_week" | "this_month" | "last_month" | "this_quarter" | "this_year";

function getPeriodDates(period: Period): { from: string; to: string; label: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const today = fmt(now);

  if (period === "this_week") {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    return { from: fmt(monday), to: today, label: "This Week" };
  }
  if (period === "this_month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(first), to: today, label: "This Month" };
  }
  if (period === "last_month") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last  = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(first), to: fmt(last), label: "Last Month" };
  }
  if (period === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const first = new Date(now.getFullYear(), q * 3, 1);
    return { from: fmt(first), to: today, label: "This Quarter" };
  }
  // this_year
  const first = new Date(now.getFullYear(), 0, 1);
  return { from: fmt(first), to: today, label: "This Year" };
}

/* ─── Role colours ───────────────────────────────────────────────────────── */

const ROLE_BADGE: Record<string, string> = {
  owner:   "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  manager: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  cashier: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/* ─── Summary card ───────────────────────────────────────────────────────── */

function KpiCard({
  label, value, sub, icon: Icon, loading, highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", highlight && "border-primary/30")}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className={cn("p-1.5 rounded-md", highlight ? "bg-primary/10" : "bg-muted")}>
          <Icon className={cn("w-4 h-4", highlight ? "text-primary" : "text-muted-foreground")} />
        </div>
      </div>
      {loading
        ? <Skeleton className="h-7 w-24 mb-1" />
        : <p className="text-2xl font-bold tracking-tight">{value}</p>
      }
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── Row skeleton ────────────────────────────────────────────────────────── */

function RowSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 7 }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/* ─── Rate display helper ────────────────────────────────────────────────── */

function RateCell({ rate, suffix = "/hr" }: { rate?: string | null; suffix?: string }) {
  const val = parseFloat(rate ?? "");
  if (!val) return <span className="text-muted-foreground text-xs">—</span>;
  return <span className="text-sm font-medium">{formatCurrency(val)}<span className="text-xs text-muted-foreground font-normal">{suffix}</span></span>;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffCostSummaryPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const { from, to, label } = getPeriodDates(period);

  const { data: staffList, isLoading: staffLoading } = useListStaff();
  const { data: salesReport, isLoading: salesLoading } = useGetStaffSalesReport({ from, to });

  const isLoading = staffLoading || salesLoading;

  const activeStaff: Staff[] = useMemo(
    () => (staffList ?? []).filter(s => s.isActive),
    [staffList],
  );

  const rows = useMemo(() => {
    return activeStaff.map(member => {
      const sales = salesReport?.items?.find(
        r => r.staffId === member.id || r.staffName === member.name,
      );
      const payRate     = parseFloat(member.payRate ?? "0") || 0;
      const superRate   = parseFloat(member.superRate ?? "9.5") || 9.5;
      const loadingRate = parseFloat(member.loadingRate ?? "0") || 0;
      const revenue     = sales?.netRevenue ?? 0;
      return { member, payRate, superRate, loadingRate, revenue, sales };
    });
  }, [activeStaff, salesReport]);

  // Total revenue for the period must come from EVERY report row, not just the
  // active-staff rows shown in the table. Otherwise it silently omits
  // unassigned transactions (staffId === null) and sales by inactive/removed
  // staff, undercounting "This Month Revenue".
  const totalRevenue = useMemo(
    () => (salesReport?.items ?? []).reduce((acc, r) => acc + (r.netRevenue ?? 0), 0),
    [salesReport],
  );

  const avgPayRate = useMemo(() => {
    const rates = rows.filter(r => r.payRate > 0).map(r => r.payRate);
    if (!rates.length) return 0;
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }, [rows]);

  const staffWithRates = rows.filter(r => r.payRate > 0).length;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Staff Cost Summary</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pay rates, super, loading, and revenue contribution per staff member.
            </p>
          </div>
          <Select value={period} onValueChange={v => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_quarter">This Quarter</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label="Active Staff"
            value={isLoading ? "—" : String(activeStaff.length)}
            sub={`${staffList?.length ?? 0} total on record`}
            icon={Users}
            loading={isLoading}
          />
          <KpiCard
            label="Avg Pay Rate"
            value={isLoading ? "—" : avgPayRate > 0 ? `${formatCurrency(avgPayRate)}/hr` : "—"}
            sub={staffWithRates > 0 ? `${staffWithRates} of ${activeStaff.length} have rates set` : "No rates configured"}
            icon={DollarSign}
            loading={isLoading}
          />
          <KpiCard
            label={`Revenue (${label})`}
            value={isLoading ? "—" : formatCurrency(totalRevenue)}
            sub="Net across all staff"
            icon={TrendingUp}
            loading={isLoading}
            highlight
          />
          <KpiCard
            label="Labour % of Revenue"
            value="—"
            sub="Requires hours-worked data"
            icon={Percent}
            loading={isLoading}
          />
        </div>

        {/* Pay rates notice if none set */}
        {!isLoading && staffWithRates === 0 && activeStaff.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <Coins className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              No pay rates are configured. Set <strong>Pay Rate</strong>, <strong>Loading Rate</strong>, and <strong>Super Rate</strong> on each staff member to calculate wage costs.
            </span>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Staff Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Pay Rate</TableHead>
                <TableHead>Loading</TableHead>
                <TableHead>Super</TableHead>
                <TableHead className="text-right">{label} Revenue</TableHead>
                <TableHead className="pr-5 text-right">Transactions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <RowSkeleton />
              ) : activeStaff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No active staff found</p>
                    <p className="text-xs mt-1">Add staff members to see cost summaries.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ member, payRate, superRate, loadingRate, revenue, sales }) => (
                  <TableRow key={member.id}>
                    <TableCell className="pl-5">
                      <div>
                        <p className="font-medium text-sm">{member.name}</p>
                        {member.email && (
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs capitalize font-medium border-0", ROLE_BADGE[member.role] ?? ROLE_BADGE.cashier)}>
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RateCell rate={member.payRate} />
                    </TableCell>
                    <TableCell>
                      {loadingRate > 0
                        ? <span className="text-sm">{loadingRate.toFixed(1)}%</span>
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </TableCell>
                    <TableCell>
                      {superRate > 0
                        ? <span className="text-sm">{superRate.toFixed(1)}%</span>
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      {revenue > 0
                        ? <span className="text-sm font-medium">{formatCurrency(revenue)}</span>
                        : <span className="text-muted-foreground text-xs">No sales</span>
                      }
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {sales
                        ? <span className="text-sm">{sales.transactionCount}</span>
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer note */}
        {!isLoading && activeStaff.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Labour percentage and total wage cost calculations require timesheet data (hours worked per staff member).
            These will be populated once the Timesheet module is connected.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
