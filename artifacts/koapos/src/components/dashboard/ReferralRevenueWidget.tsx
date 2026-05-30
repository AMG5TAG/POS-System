import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListCustomers } from "@workspace/api-client-react";
import { useAuth } from "@/lib/use-auth";
import {
  computeHeardFromAnalytics,
  HEARD_FROM_PERIODS,
  type HeardFromCustomer,
  type HeardFromPeriod,
} from "@/lib/heard-from-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Radio, ExternalLink } from "lucide-react";

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

function isManagementRole(role?: string | null) {
  return role === "owner" || role === "manager";
}

export function ReferralRevenueWidget() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<HeardFromPeriod>("30d");
  const { data: customersData, isLoading } = useListCustomers(
    { limit: 1000 },
    { query: { queryKey: ["customers-referral-widget"] } }
  );
  const customers = customersData?.items ?? [];

  const analytics = useMemo(
    () => computeHeardFromAnalytics(customers as HeardFromCustomer[], period, "revenue"),
    [customers, period]
  );

  const top5 = analytics.breakdown.slice(0, 5);
  const totalRevenue = analytics.windowRevenue;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Radio className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold leading-tight">Top Channels by Revenue</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Where paying customers come from</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as HeardFromPeriod)}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEARD_FROM_PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isManagementRole(user?.staffRole) && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground" asChild>
                <Link href="/settings/customers#heard-from-breakdown">
                  <ExternalLink className="w-3 h-3" />
                  Full report
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 bg-muted/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : top5.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground gap-2">
            <Radio className="w-7 h-7 opacity-25" />
            <p className="text-sm">No referral data for this period</p>
            <p className="text-xs">Add a "Heard From" value when creating customers to track this.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {top5.map((slice) => {
              const pct = totalRevenue > 0 ? Math.round((slice.revenue / totalRevenue) * 100) : 0;
              const cmp = analytics.comparison?.find((c) => c.name === slice.name);
              const delta = cmp?.delta ?? 0;

              return (
                <div key={slice.name} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: slice.fill }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{slice.name}</span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{fmtMoney(slice.revenue)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: slice.fill, opacity: 0.75 }}
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                        {cmp && period !== "all" && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 h-4 gap-0.5 font-normal ${
                              delta > 0
                                ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"
                                : delta < 0
                                ? "text-red-500 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800"
                                : "text-muted-foreground"
                            }`}
                          >
                            {delta > 0 ? (
                              <TrendingUp className="w-2.5 h-2.5" />
                            ) : delta < 0 ? (
                              <TrendingDown className="w-2.5 h-2.5" />
                            ) : (
                              <Minus className="w-2.5 h-2.5" />
                            )}
                            {fmtMoney(Math.abs(delta))}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-2 border-t mt-2">
              <span className="text-xs text-muted-foreground">
                {analytics.windowTotal} customer{analytics.windowTotal !== 1 ? "s" : ""} in window
              </span>
              <span className="text-xs font-medium">{fmtMoney(totalRevenue)} total</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
