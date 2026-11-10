import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Loader2, TrendingUp, TrendingDown, AlertTriangle, ExternalLink } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

/* End of Week › Weekly budget. The budget is the business's own Net Profit
   KPI (Staff & Operations › KPIs & Targets — the one named "Budget" when there
   are several), spread by its period (monthly × 12 ÷ 52) and measured on
   profit after staff. Rules: api-server lib/end-of-week.ts (weekBudget). */

export interface WeekBudget {
  kpiId: number;
  kpiName: string;
  period: string;
  periodTarget: number;
  windowStart: string | null;
  windowEnd: string | null;
  outsideWindow: boolean;
  weeklyBudget: number;
  actual: number;
  difference: number;
}

const KPI_PATH = "/management/staff-operations/kpis-targets";

const SPREAD: Record<string, string> = {
  monthly: "× 12 ÷ 52",
  quarterly: "× 4 ÷ 52",
  annual: "÷ 52",
  weekly: "",
  daily: "× 7",
};

const fmtDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function WeeklyBudgetCard({ budget, loading, finalised }: {
  budget: WeekBudget | null | undefined;
  loading: boolean;
  /** A finalised week keeps the budget it was judged against. */
  finalised: boolean;
}) {
  const made = (budget?.difference ?? 0) >= 0;

  return (
    <Card className={cn(budget && (made ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-red-300 bg-red-50/50 dark:bg-red-950/20"))}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-2 min-w-[180px]">
            <Target className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Weekly budget</p>
              <p className="text-xs text-muted-foreground">Measured on profit after staff</p>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>
          ) : !budget ? (
            <div className="flex-1 text-sm text-muted-foreground">
              No budget found. Add a business-wide <strong>Net Profit</strong> KPI named <strong>Budget</strong> under KPIs &amp; Targets and each week will be measured against it.
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Needed this week</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(budget.weeklyBudget)}</p>
                <p className="text-[11px] text-muted-foreground">
                  KPI "{budget.kpiName}" {formatCurrency(budget.periodTarget)} {budget.period} {SPREAD[budget.period] ?? ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Profit after staff</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(budget.actual)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{made ? "Made over budget" : "Missed budget by"}</p>
                <p className={cn("text-xl font-bold tabular-nums flex items-center gap-1.5", made ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                  {made ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {formatCurrency(Math.abs(budget.difference))}
                </p>
                {budget.weeklyBudget > 0 && (
                  <p className="text-[11px] text-muted-foreground">{Math.round((budget.actual / budget.weeklyBudget) * 100)}% of budget</p>
                )}
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href={KPI_PATH}><ExternalLink className="w-4 h-4" /> KPIs &amp; Targets</Link>
          </Button>
        </div>

        {budget?.outsideWindow && budget.windowStart && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-3 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            The "{budget.kpiName}" KPI is set for {fmtDate(budget.windowStart)}{budget.windowEnd ? ` – ${fmtDate(budget.windowEnd)}` : ""}, which doesn't cover this week, so its target was used as it stands. Update it (or turn on Repeat) in KPIs &amp; Targets if this month's budget is different.
          </p>
        )}
        {finalised && budget && (
          <p className="text-[11px] text-muted-foreground mt-3">This week is finalised, so it keeps the budget it was finalised against — changing the KPI won't restate it.</p>
        )}
      </CardContent>
    </Card>
  );
}
