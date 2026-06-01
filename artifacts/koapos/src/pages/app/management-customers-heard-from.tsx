import { useState, useMemo } from "react";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useQueryClient } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { AppLayout } from "@/components/layout/app-layout";
import { useCustomerSettings, type HeardFromSource, DEFAULT_HEARD_FROM_SOURCES } from "@/lib/customer-settings";
import {
  computeHeardFromAnalytics,
  HEARD_FROM_PERIODS,
  HEARD_FROM_METRICS,
  type HeardFromPeriod,
  type HeardFromMetric,
  type HeardFromCustomer,
} from "@/lib/heard-from-analytics";
import { exportHeardFromXLSX, exportHeardFromPDF } from "@/lib/heard-from-export";
import {
  useListCustomers,
  useSendReferralDigestNow,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Radio, PieChart as PieChartIcon,
  ChevronUp, ChevronDown, TrendingUp, TrendingDown, Minus,
  Download, Sparkles, FileSpreadsheet, FileText, Mail, Loader2,
} from "lucide-react";

export default function ManagementCustomersHeardFromPage() {
  const { settings, save } = useCustomerSettings();
  const queryClient = useQueryClient();

  const { data: customersData } = useListCustomers(
    { limit: 1000 },
    { query: { queryKey: ["customers-heard-from"] } }
  );
  const customers = customersData?.items ?? [];
  const total = customers.length;

  // ── Source management state ──
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<HeardFromSource | null>(null);
  const [sourceForm, setSourceForm] = useState({ name: "", requiresDetails: false });
  const [deleteSourceConfirm, setDeleteSourceConfirm] = useState<string | null>(null);

  const { isDirty, markClean } = useFormDirty(sourceForm);

  // ── Heard From breakdown ──
  const [heardFromPeriod, setHeardFromPeriod] = useState<HeardFromPeriod>("all");
  const [heardFromMetric, setHeardFromMetric] = useState<HeardFromMetric>("customers");

  const heardFromData = useMemo(
    () => computeHeardFromAnalytics(customers as HeardFromCustomer[], heardFromPeriod, heardFromMetric),
    [customers, heardFromPeriod, heardFromMetric],
  );
  const heardFromBreakdown = heardFromData.breakdown;
  const heardFromIsRevenue = heardFromMetric === "revenue";
  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

  const sendDigestNowMutation = useSendReferralDigestNow();

  // ── Source handlers ──
  const openAddSource = () => {
    const f = { name: "", requiresDetails: false };
    setEditingSource(null);
    setSourceForm(f);
    markClean(f);
    setSourceDialogOpen(true);
  };

  const openEditSource = (s: HeardFromSource) => {
    const f = { name: s.name, requiresDetails: s.requiresDetails };
    setEditingSource(s);
    setSourceForm(f);
    markClean(f);
    setSourceDialogOpen(true);
  };

  const saveSource = () => {
    if (!sourceForm.name.trim()) return;
    const sources = [...settings.heardFromSources];
    if (editingSource) {
      const idx = sources.findIndex(s => s.id === editingSource.id);
      if (idx >= 0) sources[idx] = { ...editingSource, name: sourceForm.name.trim(), requiresDetails: sourceForm.requiresDetails };
    } else {
      sources.push({ id: crypto.randomUUID(), name: sourceForm.name.trim(), requiresDetails: sourceForm.requiresDetails });
    }
    save({ heardFromSources: sources });
    toast.success(editingSource ? "Source updated" : "Source added");
    markClean();
    setSourceDialogOpen(false);
  };

  const moveSource = (id: string, dir: -1 | 1) => {
    const sources = [...settings.heardFromSources];
    const idx = sources.findIndex(s => s.id === id);
    const next = idx + dir;
    if (next < 0 || next >= sources.length) return;
    [sources[idx], sources[next]] = [sources[next], sources[idx]];
    save({ heardFromSources: sources });
  };

  const deleteSource = () => {
    if (!deleteSourceConfirm) return;
    save({ heardFromSources: settings.heardFromSources.filter(s => s.id !== deleteSourceConfirm) });
    toast.success("Source deleted");
    setDeleteSourceConfirm(null);
  };

  const resetSourcesToDefault = () => {
    save({ heardFromSources: DEFAULT_HEARD_FROM_SOURCES });
    toast.success("Sources reset to defaults");
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">

        <div>
          <h1 className="text-2xl font-bold">Heard From</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage referral sources, track where your customers come from, and schedule referral digests.
          </p>
        </div>

        {/* ── Heard From Sources ── */}
        <Card id="heard-from-sources">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary" />
                Heard From Sources
              </CardTitle>
              <CardDescription>
                Referral channels shown in the customer form{"'"}s "Heard From" dropdown. Sources marked as
                "Requires details" prompt staff for extra context (e.g. who referred them).
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={openAddSource}>
              <Plus className="w-3.5 h-3.5" /> Add Source
            </Button>
          </CardHeader>
          <CardContent>
            {settings.heardFromSources.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <Radio className="w-8 h-8 opacity-25" />
                <p className="text-sm">No sources configured.</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={openAddSource}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Source
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetSourcesToDefault}>
                    Reset to defaults
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {settings.heardFromSources.map((s, idx) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-muted/10 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveSource(s.id, -1)}
                        disabled={idx === 0}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSource(s.id, 1)}
                        disabled={idx === settings.heardFromSources.length - 1}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="flex-1 text-sm font-medium">{s.name}</span>
                    {s.requiresDetails && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Requires details
                      </Badge>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSource(s)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteSourceConfirm(s.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-7"
                    onClick={resetSourcesToDefault}
                  >
                    Reset to defaults
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Heard From Breakdown ── */}
        <Card id="heard-from-breakdown">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-primary" />
                Heard From Breakdown
              </CardTitle>
              <CardDescription>
                {heardFromIsRevenue
                  ? heardFromPeriod === "all"
                    ? `Which referral channels drive the most revenue — ${fmtMoney(heardFromData.windowRevenue)} from ${total} customer${total !== 1 ? "s" : ""}.`
                    : `${fmtMoney(heardFromData.windowRevenue)} from ${heardFromData.windowTotal} new customer${heardFromData.windowTotal !== 1 ? "s" : ""} in this window — see which channels actually pay off.`
                  : heardFromPeriod === "all"
                    ? `Which referral channels bring in the most customers, based on ${total} customer${total !== 1 ? "s" : ""}.`
                    : `${heardFromData.windowTotal} new customer${heardFromData.windowTotal !== 1 ? "s" : ""} in this window — see which channels are growing or fading.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={heardFromBreakdown.length === 0}
                  >
                    <Download className="w-4 h-4" />
                    Export
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        await exportHeardFromXLSX(heardFromData, heardFromPeriod);
                      } catch {
                        toast.error("Couldn't generate the Excel file. Please try again.");
                      }
                    }}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Excel (XLSX)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        await exportHeardFromPDF(heardFromData, heardFromPeriod);
                      } catch {
                        toast.error("Couldn't generate the PDF. Please try again.");
                      }
                    }}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="inline-flex rounded-md border p-0.5 bg-muted/40 shrink-0">
                {HEARD_FROM_METRICS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setHeardFromMetric(m.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      heardFromMetric === m.value
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Select value={heardFromPeriod} onValueChange={(v) => setHeardFromPeriod(v as HeardFromPeriod)}>
                <SelectTrigger className="w-[150px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEARD_FROM_PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {heardFromBreakdown.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <PieChartIcon className="w-8 h-8 opacity-25" />
                <p className="text-sm">
                  {total === 0 ? "No customer data yet." : "No customers in this time window."}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={heardFromBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          dataKey="value"
                          nameKey="name"
                          paddingAngle={2}
                        >
                          {heardFromBreakdown.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            fontSize: 12,
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--card))",
                          }}
                          formatter={(v: number, n) => [
                            heardFromIsRevenue ? fmtMoney(v) : `${v} customer${v !== 1 ? "s" : ""}`,
                            n,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5">
                    {heardFromBreakdown.map((s) => {
                      const denom = (heardFromIsRevenue ? heardFromData.windowRevenue : heardFromData.windowTotal) || 1;
                      const pct = Math.round((s.value / denom) * 100);
                      const cmp = heardFromData.comparison?.find((c) => c.name === s.name);
                      const fmtDelta = (n: number) =>
                        heardFromIsRevenue ? fmtMoney(Math.abs(n)) : Math.abs(n);
                      return (
                        <div
                          key={s.name}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-muted/10"
                        >
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: s.fill }}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium block truncate">{s.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {heardFromIsRevenue
                                ? `${s.customers} customer${s.customers !== 1 ? "s" : ""} · ${fmtMoney(s.avgSpend)} avg`
                                : `${fmtMoney(s.revenue)} · ${fmtMoney(s.avgSpend)} avg`}
                            </span>
                          </div>
                          {cmp && cmp.delta !== 0 && (
                            <span
                              className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                                cmp.delta > 0 ? "text-emerald-600" : "text-red-500"
                              }`}
                              title={`${heardFromIsRevenue ? fmtMoney(cmp.previous) : cmp.previous} in the previous period`}
                            >
                              {cmp.delta > 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {cmp.delta > 0 ? "+" : "-"}{fmtDelta(cmp.delta)}
                            </span>
                          )}
                          {cmp && cmp.delta === 0 && cmp.previous > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground" title="No change from the previous period">
                              <Minus className="w-3 h-3" />
                            </span>
                          )}
                          <span className="text-sm font-bold tabular-nums">
                            {heardFromIsRevenue ? fmtMoney(s.value) : s.value}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                    {heardFromData.comparison && (
                      <p className="text-xs text-muted-foreground pt-1.5 px-1">
                        ▲▼ vs the previous {heardFromPeriod === "30d" ? "30 days" : heardFromPeriod === "90d" ? "90 days" : "12 months"}.
                      </p>
                    )}
                  </div>
                </div>

                {/* Highlights */}
                {heardFromData.highlights.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <p className="text-sm font-medium">What's moving</p>
                    </div>
                    <ul className="space-y-1.5">
                      {heardFromData.highlights.map((h) => {
                        const pct = h.pctChange === null ? null : Math.abs(h.pctChange);
                        const cur = heardFromIsRevenue ? fmtMoney(h.current) : h.current;
                        const prev = heardFromIsRevenue ? fmtMoney(h.previous) : h.previous;
                        const absDelta = heardFromIsRevenue ? fmtMoney(Math.abs(h.delta)) : Math.abs(h.delta);
                        return (
                          <li key={h.kind} className="flex items-start gap-2 text-sm">
                            {h.kind === "gainer" ? (
                              <TrendingUp className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                            ) : (
                              <TrendingDown className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                            )}
                            <span className="text-muted-foreground">
                              <span className="font-semibold text-foreground">{h.name}</span>{" "}
                              {h.kind === "gainer" ? (
                                pct !== null ? (
                                  <>is your fastest-growing channel, up {pct}% ({prev} → {cur}) vs the previous period.</>
                                ) : heardFromIsRevenue ? (
                                  <>is your fastest-growing channel, bringing in {cur} this period (none previously).</>
                                ) : (
                                  <>is your fastest-growing channel, with {h.current} new customer{h.current !== 1 ? "s" : ""} this period (none previously).</>
                                )
                              ) : h.current === 0 ? (
                                <>has dropped to zero, down from {prev} in the previous period.</>
                              ) : pct !== null ? (
                                <>is down {pct}% ({prev} → {cur}) vs the previous period.</>
                              ) : (
                                <>is down {absDelta} vs the previous period.</>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Trend bar chart */}
                {heardFromData.trend.sources.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {heardFromIsRevenue ? "Revenue over time" : "New customers over time"}
                      </p>
                    </div>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={heardFromData.trend.data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={heardFromIsRevenue ? 52 : 32}
                            tickFormatter={heardFromIsRevenue ? (v: number) => fmtMoney(v) : undefined}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 8,
                              fontSize: 12,
                              border: "1px solid hsl(var(--border))",
                              background: "hsl(var(--card))",
                            }}
                            formatter={heardFromIsRevenue ? (v: number, n) => [fmtMoney(v), n] : undefined}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                          {heardFromData.trend.sources.map((src) => (
                            <Bar
                              key={src}
                              dataKey={src}
                              stackId="sources"
                              fill={heardFromData.colorMap[src]}
                              radius={[0, 0, 0, 0]}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Weekly Referral Digest ── */}
        <Card id="referral-digest">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              Weekly Referral Digest
            </CardTitle>
            <CardDescription>
              Receive a weekly email summarising your top gaining and fading referral channels over the last 30 days.
              The email is sent to your account email address. You need an email provider configured in Management → Email for delivery to work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Send weekly digest email</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Highlights the biggest gainer and decliner each week so you can act on fading channels.
                </p>
              </div>
              <Switch
                checked={settings.weeklyDigestOptIn}
                onCheckedChange={(v) => {
                  save({ weeklyDigestOptIn: v });
                  toast.success(v ? "Weekly digest enabled" : "Weekly digest disabled");
                }}
              />
            </div>
            {settings.weeklyDigestOptIn && (
              <>
                <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Send day</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The digest will be sent on this day each week.
                    </p>
                  </div>
                  <Select
                    value={String(settings.weeklyDigestSendDay)}
                    onValueChange={(v) => {
                      save({ weeklyDigestSendDay: Number(v) });
                      toast.success("Send day updated");
                    }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                      <SelectItem value="0">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Send test digest now</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sends a digest email to your account address immediately so you can preview the content.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    disabled={sendDigestNowMutation.isPending}
                    onClick={() => {
                      sendDigestNowMutation.mutate(undefined, {
                        onSuccess: (data) => {
                          toast.success(`Digest sent to ${data.email}`);
                        },
                        onError: (err) => {
                          const msg = (err as { data?: { error?: string } })?.data?.error;
                          toast.error(msg ?? "Failed to send digest — check your email settings");
                        },
                      });
                    }}
                  >
                    {sendDigestNowMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Mail className="w-3.5 h-3.5" />
                    }
                    {sendDigestNowMutation.isPending ? "Sending..." : "Send now"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Add / Edit Source Dialog */}
      <Dialog open={sourceDialogOpen} onOpenChange={(o) => { if (!o) markClean(); setSourceDialogOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingSource ? "Edit Source" : "Add Heard From Source"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Source Name <span className="text-destructive">*</span></Label>
              <Input
                value={sourceForm.name}
                onChange={(e) => { setSourceForm(f => ({ ...f, name: e.target.value })); }}
                placeholder="e.g. Instagram, Walk-in, Radio"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && saveSource()}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Requires details</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Staff will be prompted for extra info when this source is selected.
                </p>
              </div>
              <Switch
                checked={sourceForm.requiresDetails}
                onCheckedChange={(v) => { setSourceForm(f => ({ ...f, requiresDetails: v })); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { markClean(); setSourceDialogOpen(false); }}>Cancel</Button>
            <Button onClick={saveSource} disabled={!sourceForm.name.trim()}>
              {editingSource ? "Update Source" : "Add Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Source Confirm Dialog */}
      <Dialog open={!!deleteSourceConfirm} onOpenChange={() => setDeleteSourceConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Source</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Removing this source won't affect existing customers — their saved "Heard From" value
            will be preserved as text. New customers won't see this option.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSourceConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteSource}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
