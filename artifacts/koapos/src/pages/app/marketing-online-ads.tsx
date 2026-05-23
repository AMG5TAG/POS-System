import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  TrendingUp, TrendingDown, MousePointerClick, Eye, DollarSign,
  BarChart2, Settings, ExternalLink, RefreshCw, Play, Pause,
  ArrowUpRight, ArrowDownRight, Target, Percent,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";

const STORAGE_KEY = "koapos_social_connections";

function loadGoogleAdsConnected(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return !!(obj["google_ads"]?.connected);
  } catch { return false; }
}

/* ─── Mock data generators ─────────────────────────────────────────────── */

function generateSpendData(days: number) {
  const data = [];
  const now   = new Date();
  let spend   = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d        = new Date(now);
    d.setDate(d.getDate() - i);
    const daySpend = parseFloat((18 + Math.random() * 35).toFixed(2));
    const clicks   = Math.floor(40 + Math.random() * 120);
    const impr     = Math.floor(clicks * (8 + Math.random() * 12));
    const conv     = Math.floor(clicks * (0.03 + Math.random() * 0.06));
    spend         += daySpend;
    data.push({
      date:        d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      spend:       daySpend,
      clicks,
      impressions: impr,
      conversions: conv,
    });
  }
  return data;
}

interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "ended";
  type: string;
  budget: number;
  spent: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;
  roas: number;
}

const CAMPAIGNS: Campaign[] = [
  { id: "1", name: "Brand Awareness – Search",     status: "active",  type: "Search",   budget: 50,  spent: 38.42,  clicks: 312,  impressions: 5840,  conversions: 18, ctr: 5.34, cpc: 0.12, roas: 4.2  },
  { id: "2", name: "Product Promo – Display",      status: "active",  type: "Display",  budget: 30,  spent: 22.10,  clicks: 148,  impressions: 14200, conversions: 7,  ctr: 1.04, cpc: 0.15, roas: 3.1  },
  { id: "3", name: "Retargeting – Summer Sale",    status: "active",  type: "Search",   budget: 25,  spent: 19.88,  clicks: 204,  impressions: 3100,  conversions: 22, ctr: 6.58, cpc: 0.10, roas: 5.8  },
  { id: "4", name: "Local Store Visits",           status: "paused",  type: "Local",    budget: 20,  spent: 20.00,  clicks: 89,   impressions: 2200,  conversions: 4,  ctr: 4.05, cpc: 0.22, roas: 2.4  },
  { id: "5", name: "New Arrivals – Performance Max",status: "active", type: "PMax",     budget: 40,  spent: 31.60,  clicks: 276,  impressions: 7800,  conversions: 31, ctr: 3.54, cpc: 0.11, roas: 6.1  },
  { id: "6", name: "Clearance – EOFY",             status: "ended",   type: "Shopping", budget: 15,  spent: 15.00,  clicks: 65,   impressions: 980,   conversions: 9,  ctr: 6.63, cpc: 0.23, roas: 3.9  },
];

const RANGE_OPTIONS = [
  { value: "7",  label: "Last 7 days"  },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];

const STATUS_STYLES: Record<Campaign["status"], string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  ended:  "bg-muted text-muted-foreground",
};

function KpiCard({
  label, value, sub, icon: Icon, trend, trendLabel, positive,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number; trendLabel?: string; positive?: boolean;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 text-xs font-medium",
            (up ? positive !== false : positive === true) ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
          )}>
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}% {trendLabel ?? "vs last period"}
          </div>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/* ─── Google icon ───────────────────────────────────────────────────────── */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

/* ─── Not-connected prompt ──────────────────────────────────────────────── */
function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="rounded-2xl bg-muted/50 p-6">
        <GoogleIcon className="w-16 h-16" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-bold">Connect Google Ads</h2>
        <p className="text-muted-foreground text-sm">
          Link your Google Ads account to view campaign performance, spend, and conversions directly in KoaPOS.
        </p>
      </div>
      <Link href="/management/marketing/social">
        <Button className="gap-2">
          <Settings className="w-4 h-4" />
          Connect in Management → Marketing
        </Button>
      </Link>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */
export default function MarketingOnlineAdsPage() {
  const [connected] = useState(() => loadGoogleAdsConnected());
  const [range, setRange]     = useState("30");
  const [campaigns, setCampaigns] = useState(CAMPAIGNS);
  const [chartData] = useState(() => generateSpendData(30));

  const rangeData = chartData.slice(-parseInt(range));

  const totals = rangeData.reduce(
    (acc, d) => ({
      spend:       acc.spend + d.spend,
      clicks:      acc.clicks + d.clicks,
      impressions: acc.impressions + d.impressions,
      conversions: acc.conversions + d.conversions,
    }),
    { spend: 0, clicks: 0, impressions: 0, conversions: 0 }
  );

  const ctr    = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc    = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const roas   = 4.3;

  const toggleCampaign = (id: string) => {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id && c.status !== "ended"
          ? { ...c, status: c.status === "active" ? "paused" : "active" }
          : c
      )
    );
  };

  if (!connected) {
    return (
      <AppLayout>
        <NotConnected />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white shadow-sm border p-2">
              <GoogleIcon className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Google Ads</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Campaign performance · Demo Account</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5 h-8">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 h-8">
                <ExternalLink className="w-3.5 h-3.5" /> Google Ads
              </Button>
            </a>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard label="Total Spend"   value={`$${totals.spend.toFixed(2)}`}               icon={DollarSign}       trend={-4.2}  positive={false} trendLabel="vs last period" />
          <KpiCard label="Clicks"        value={totals.clicks.toLocaleString()}               icon={MousePointerClick} trend={8.1}                    trendLabel="vs last period" />
          <KpiCard label="Impressions"   value={totals.impressions.toLocaleString()}          icon={Eye}              trend={12.3}                   trendLabel="vs last period" />
          <KpiCard label="CTR"           value={`${ctr.toFixed(2)}%`}                        icon={Percent}          trend={2.8}                    trendLabel="vs last period" />
          <KpiCard label="Avg. CPC"      value={`$${cpc.toFixed(3)}`}                        icon={Target}           trend={-3.1}  positive={false} trendLabel="vs last period" />
          <KpiCard label="ROAS"          value={`${roas}x`}                                  icon={TrendingUp}       trend={5.6}                    trendLabel="vs last period" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Spend over time */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily Spend</CardTitle>
              <CardDescription>Ad spend per day over the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={rangeData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4285F4" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4285F4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.floor(rangeData.length / 5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Spend"]} />
                  <Area type="monotone" dataKey="spend" stroke="#4285F4" strokeWidth={2} fill="url(#spendGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Clicks vs Conversions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Clicks & Conversions</CardTitle>
              <CardDescription>Daily clicks and conversions over the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rangeData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.floor(rangeData.length / 5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="clicks"      fill="#4285F4" radius={[2, 2, 0, 0]} name="Clicks" />
                  <Bar dataKey="conversions" fill="#34A853" radius={[2, 2, 0, 0]} name="Conversions" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Campaigns table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Campaigns</CardTitle>
                <CardDescription className="mt-0.5">{campaigns.filter((c) => c.status === "active").length} active · {campaigns.filter((c) => c.status === "paused").length} paused · {campaigns.filter((c) => c.status === "ended").length} ended</CardDescription>
              </div>
              <a href="https://ads.google.com/aw/campaigns" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 h-8">
                  <BarChart2 className="w-3.5 h-3.5" /> All Campaigns
                </Button>
              </a>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Campaign", "Type", "Status", "Budget/day", "Spent", "Clicks", "Conv.", "CTR", "ROAS", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => (
                    <tr key={c.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", i % 2 === 0 ? "" : "bg-muted/10")}>
                      <td className="px-4 py-3 font-medium max-w-[180px]">
                        <span className="truncate block" title={c.name}>{c.name}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        <Badge variant="secondary" className="text-[10px]">{c.type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn("text-[10px] border-0 capitalize", STATUS_STYLES[c.status])}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">${c.budget.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={cn(c.spent >= c.budget ? "text-amber-600 dark:text-amber-400 font-medium" : "")}>
                          ${c.spent.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{c.clicks.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums">{c.conversions}</td>
                      <td className="px-4 py-3 tabular-nums">{c.ctr.toFixed(2)}%</td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={cn("font-medium", c.roas >= 4 ? "text-emerald-600 dark:text-emerald-400" : c.roas >= 2.5 ? "" : "text-red-500")}>
                          {c.roas}x
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.status !== "ended" && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title={c.status === "active" ? "Pause campaign" : "Resume campaign"}
                            onClick={() => toggleCampaign(c.id)}
                          >
                            {c.status === "active"
                              ? <Pause className="w-3.5 h-3.5" />
                              : <Play  className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Budget summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Budget vs Spend</CardTitle>
              <CardDescription>Active campaigns only</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {campaigns.filter((c) => c.status === "active").map((c) => {
                const pct = Math.min(100, (c.spent / c.budget) * 100);
                return (
                  <div key={c.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="truncate mr-2 font-medium" title={c.name}>{c.name}</span>
                      <span className="tabular-nums shrink-0 text-muted-foreground">${c.spent.toFixed(0)} / ${c.budget}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", pct >= 95 ? "bg-amber-500" : "bg-[#4285F4]")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Performance Summary</CardTitle>
              <CardDescription>Across all campaigns for selected period</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Total spend",      value: `$${totals.spend.toFixed(2)}`,             icon: DollarSign },
                { label: "Total clicks",     value: totals.clicks.toLocaleString(),             icon: MousePointerClick },
                { label: "Total impressions",value: totals.impressions.toLocaleString(),        icon: Eye },
                { label: "Total conversions",value: totals.conversions.toLocaleString(),        icon: Target },
                { label: "Avg. CTR",         value: `${ctr.toFixed(2)}%`,                      icon: Percent },
                { label: "Avg. CPC",         value: `$${cpc.toFixed(3)}`,                      icon: TrendingDown },
                { label: "ROAS",             value: `${roas}x return on ad spend`,             icon: TrendingUp },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Separator />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p>Data is simulated for demonstration. Connect your live account in <Link href="/management/marketing/social" className="underline">Management → Marketing</Link>.</p>
          <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
            Open Google Ads <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </AppLayout>
  );
}
