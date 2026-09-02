import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { KpiImportDialog, type KpiImportRow } from "@/components/kpi-import-dialog";
import {
  useListStaff,
  useListKpiTargets, useCreateKpiTarget, useUpdateKpiTarget, useDeleteKpiTarget,
  useGetKpiSettings, useUpsertKpiSettings, useGetKpiProgress, useListKpiHistory,
  type KpiHistoryEntry,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Target, Users, Trophy, TrendingUp,
  DollarSign, ShoppingCart, UserPlus, Star, CalendarClock,
  Wrench, BarChart3, AlertCircle, CheckCircle2, Clock,
  Award, Gift, Coins, Tag, Zap, Layers, ChevronRight,
  SplitSquareHorizontal, Flame, Store, Banknote, CalendarDays, Calendar,
  FileSpreadsheet, RefreshCw,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type KpiMetric =
  | "revenue" | "transactions" | "avg_transaction" | "items_per_transaction"
  | "new_customers" | "loyalty_signups" | "category_revenue" | "appointments"
  | "services" | "refund_rate" | "gross_margin" | "upsell_rate" | "net_profit";

type KpiPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
type RewardType = "cash" | "percent" | "voucher" | "time_off" | "badge" | "custom";

interface KpiReward { type: RewardType; value: number; label: string; note: string; }

interface KpiTarget {
  id: string; name: string; metric: KpiMetric; categoryId: string;
  period: KpiPeriod; target: number; staffIds: string[];
  reward: KpiReward | null; notes: string; isActive: boolean;
  startDate: string; endDate: string; repeats: boolean;
  showOnDashboard?: string;
}

/* ─── API converters ─────────────────────────────────────────────────────── */

function apiToTarget(r: Record<string, unknown>): KpiTarget {
  let staffIds: string[] = [];
  let reward: KpiReward | null = null;
  try { staffIds = typeof r.staffIds === "string" ? JSON.parse(r.staffIds as string) : Array.isArray(r.staffIds) ? r.staffIds as string[] : []; } catch { staffIds = []; }
  try { reward = typeof r.reward === "string" ? JSON.parse(r.reward as string) : null; } catch { reward = null; }
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    metric: (String(r.metric ?? "revenue")) as KpiMetric,
    categoryId: String(r.categoryId ?? ""),
    period: (String(r.period ?? "monthly")) as KpiPeriod,
    target: parseFloat(String(r.target ?? 0)),
    staffIds,
    reward,
    notes: String(r.notes ?? ""),
    startDate: String(r.startDate ?? ""),
    endDate: String(r.endDate ?? ""),
    repeats: String(r.repeats) === "true",
    isActive: String(r.isActive) !== "false",
    showOnDashboard: String(r.showOnDashboard ?? "false"),
  };
}

/* ─── Metadata ───────────────────────────────────────────────────────────── */

const METRIC_META: Record<KpiMetric, { label: string; icon: React.ElementType; unit: string; isCurrency: boolean; isInverse?: boolean }> = {
  revenue:              { label: "Total Revenue",           icon: DollarSign,   unit: "$",   isCurrency: true  },
  transactions:         { label: "Transactions",            icon: ShoppingCart, unit: "txn", isCurrency: false },
  avg_transaction:      { label: "Avg Transaction Value",   icon: TrendingUp,   unit: "$",   isCurrency: true  },
  items_per_transaction:{ label: "Items Per Transaction",   icon: Layers,       unit: "itm", isCurrency: false },
  new_customers:        { label: "New Customers",           icon: UserPlus,     unit: "cst", isCurrency: false },
  loyalty_signups:      { label: "Loyalty Sign-ups",        icon: Star,         unit: "mbr", isCurrency: false },
  category_revenue:     { label: "Category Revenue",        icon: Tag,          unit: "$",   isCurrency: true  },
  appointments:         { label: "Appointments Completed",  icon: CalendarClock,unit: "appt",isCurrency: false },
  services:             { label: "Services Completed",      icon: Wrench,       unit: "svc", isCurrency: false },
  refund_rate:          { label: "Refund Rate",             icon: AlertCircle,  unit: "%",   isCurrency: false, isInverse: true },
  gross_margin:         { label: "Gross Margin",            icon: BarChart3,    unit: "%",   isCurrency: false },
  upsell_rate:          { label: "Upsell / Add-on Rate",    icon: Zap,          unit: "%",   isCurrency: false },
  net_profit:           { label: "Net Profit",               icon: Banknote,     unit: "$",   isCurrency: true  },
};

const PERIOD_LABELS: Record<KpiPeriod, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual",
};

/** Period as a noun, for sentences like "Repeat each month". */
const PERIOD_NOUNS: Record<KpiPeriod, string> = {
  daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", annual: "year",
};

const REWARD_META: Record<RewardType, { label: string; icon: React.ElementType; hasValue: boolean; valueSuffix: string }> = {
  cash:     { label: "Cash Bonus",        icon: Coins,      hasValue: true,  valueSuffix: "$"  },
  percent:  { label: "% Pay Bonus",       icon: TrendingUp, hasValue: true,  valueSuffix: "%"  },
  voucher:  { label: "Gift Voucher",      icon: Gift,       hasValue: true,  valueSuffix: "$"  },
  time_off: { label: "Extra Time Off",    icon: Clock,      hasValue: true,  valueSuffix: "hr" },
  badge:    { label: "Recognition Badge", icon: Award,      hasValue: false, valueSuffix: ""   },
  custom:   { label: "Custom Reward",     icon: Trophy,     hasValue: false, valueSuffix: ""   },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatMetricValue(metric: KpiMetric, value: number) {
  const m = METRIC_META[metric];
  if (m.isCurrency) return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 0 })}`;
  if (m.unit === "%") return `${value}%`;
  return value.toLocaleString();
}

function progressColor(pct: number, isInverse?: boolean) {
  const effective = isInverse ? 100 - pct : pct;
  if (effective >= 100) return "text-green-600";
  if (effective >= 70)  return "text-amber-500";
  return "text-rose-500";
}

/* ─── Blank form ─────────────────────────────────────────────────────────── */

const BLANK: Omit<KpiTarget, "id"> = {
  name: "", metric: "revenue", categoryId: "", period: "monthly",
  target: 0, staffIds: [], reward: null, notes: "", isActive: true,
  startDate: "", endDate: "", repeats: false,
};
const BLANK_REWARD: KpiReward = { type: "cash", value: 0, label: "", note: "" };

/* ─── KPI card ───────────────────────────────────────────────────────────── */

function KpiCard({ kpi, onEdit, onDelete, onToggleDashboard, staffList }: {
  kpi: KpiTarget; onEdit: () => void; onDelete: () => void;
  onToggleDashboard: () => void;
  staffList: { id: number; name: string }[];
}) {
  const meta = METRIC_META[kpi.metric];
  const Icon = meta.icon;
  const isStoreWide = kpi.staffIds.length === 0;
  const onDashboard = (kpi as KpiTarget & { showOnDashboard?: string }).showOnDashboard === "true";
  const assignedNames = kpi.staffIds.map((id) => staffList.find((s) => String(s.id) === id)?.name).filter(Boolean).join(", ");

  return (
    <div className={cn("rounded-xl border bg-card p-4 flex flex-col gap-3 transition-opacity", !kpi.isActive && "opacity-50", onDashboard && "ring-2 ring-primary/30")}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0"><Icon className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{kpi.name}</p>
            {!kpi.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
            {onDashboard && (
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20 gap-0.5">
                <BarChart3 className="w-2.5 h-2.5" /> Dashboard
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.label}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="secondary" className="text-xs">{PERIOD_LABELS[kpi.period]}</Badge>
            <Badge variant="secondary" className="text-xs font-mono">Target: {formatMetricValue(kpi.metric, kpi.target)}</Badge>
            {isStoreWide
              ? <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Store-wide</Badge>
              : <Badge className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Staff</Badge>
            }
          </div>
          {!isStoreWide && assignedNames && <p className="text-xs text-muted-foreground mt-1.5 truncate">{assignedNames}</p>}
          {(kpi.startDate || kpi.endDate) && (
            <div className="flex items-center gap-1 mt-1.5">
              <CalendarDays className="w-3 h-3 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                {kpi.startDate || "—"}{kpi.endDate ? ` → ${kpi.endDate}` : " onwards"}
              </p>
              {kpi.repeats && (
                <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0">
                  <RefreshCw className="w-2.5 h-2.5" /> Repeats
                </Badge>
              )}
            </div>
          )}
          {kpi.reward && (
            <div className="flex items-center gap-1 mt-1.5">
              <Trophy className="w-3 h-3 text-amber-500" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {REWARD_META[kpi.reward.type].label}
                {kpi.reward.value > 0 && ` — ${REWARD_META[kpi.reward.type].valueSuffix}${kpi.reward.value}`}
                {kpi.reward.label && ` (${kpi.reward.label})`}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 pt-1 border-t border-border">
        <Button
          variant={onDashboard ? "default" : "outline"}
          size="sm"
          className={cn("flex-1 text-xs gap-1", onDashboard ? "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" : "text-muted-foreground")}
          onClick={onToggleDashboard}
          title={onDashboard ? "Remove from dashboard" : "Show on dashboard"}
        >
          <BarChart3 className="h-3 w-3" />
          {onDashboard ? "On Dashboard" : "Add to Dashboard"}
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground px-3" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 px-3" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Add/Edit dialog ────────────────────────────────────────────────────── */

function KpiDialog({ open, onOpenChange, initial, staffList, onSave, staffOnly }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initial: Omit<KpiTarget, "id"> | null; staffList: { id: number; name: string }[];
  onSave: (t: Omit<KpiTarget, "id">) => void; staffOnly?: boolean;
}) {
  const [form, setForm] = useState<Omit<KpiTarget, "id">>(initial ?? { ...BLANK });
  const [addReward, setAddReward] = useState(!!initial?.reward);
  const [reward, setReward] = useState<KpiReward>(initial?.reward ?? { ...BLANK_REWARD });

  const setField = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const toggleStaff = (id: string) =>
    setField("staffIds", form.staffIds.includes(id) ? form.staffIds.filter((s) => s !== id) : [...form.staffIds, id]);

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("KPI name is required"); return; }
    if (form.target <= 0)  { toast.error("Target must be greater than zero"); return; }
    onSave({ ...form, reward: addReward ? reward : null });
    onOpenChange(false);
  };

  const rewardMeta = REWARD_META[reward.type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit KPI / Target" : "New KPI / Target"}</DialogTitle>
          <DialogDescription>Configure what to measure, the target value, and an optional reward.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>KPI Name</Label>
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Monthly Revenue Goal" />
          </div>
          <div className="space-y-1.5">
            <Label>Metric</Label>
            <Select value={form.metric} onValueChange={(v) => setField("metric", v as KpiMetric)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(METRIC_META) as [KpiMetric, typeof METRIC_META[KpiMetric]][]).map(([k, m]) => (
                  <SelectItem key={k} value={k}><span className="font-medium">{m.label}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.metric === "category_revenue" && (
            <div className="space-y-1.5">
              <Label>Category Name</Label>
              <Input value={form.categoryId} onChange={(e) => setField("categoryId", e.target.value)} placeholder="e.g. Beverages, Electronics…" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={form.period} onValueChange={(v) => setField("period", v as KpiPeriod)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(PERIOD_LABELS) as [KpiPeriod, string][]).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target Value</Label>
              <div className="relative">
                {METRIC_META[form.metric].isCurrency && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>}
                <Input type="number" min={0} value={form.target || ""} onChange={(e) => setField("target", parseFloat(e.target.value) || 0)}
                  className={METRIC_META[form.metric].isCurrency ? "pl-7" : ""} placeholder="0" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">Budget Date Range <span className="text-muted-foreground font-normal text-xs">(optional — leave blank for rolling period)</span></p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={form.startDate ?? ""} onChange={(e) => setField("startDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={form.endDate ?? ""} onChange={(e) => setField("endDate", e.target.value)} min={form.startDate ?? ""} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              When set, progress tracks from the start date instead of the current {form.period === "weekly" ? "week" : form.period === "monthly" ? "month" : form.period === "daily" ? "day" : form.period === "quarterly" ? "quarter" : "year"}.
            </p>
            {form.startDate && (
              <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-border/60">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0"
                  checked={form.repeats}
                  onChange={(e) => setField("repeats", e.target.checked)}
                />
                <span className="text-xs">
                  <span className="font-medium">Repeat each {PERIOD_NOUNS[form.period]}</span>
                  <span className="block text-muted-foreground mt-0.5">
                    When this {PERIOD_NOUNS[form.period]} ends its result is saved to KPI History and a new
                    one starts automatically, keeping the same target. Leave off for a one-off campaign
                    window that simply finishes.
                  </span>
                </span>
              </label>
            )}
          </div>
          {!staffOnly && (
            <div className="space-y-1.5">
              <Label>Assign to Staff <span className="text-muted-foreground text-xs">(leave blank for store-wide)</span></Label>
              {staffList.length === 0 ? <p className="text-xs text-muted-foreground">No staff found.</p> : (
                <div className="flex flex-wrap gap-2">
                  {staffList.map((s) => {
                    const sel = form.staffIds.includes(String(s.id));
                    return (
                      <button key={s.id} onClick={() => toggleStaff(String(s.id))}
                        className={cn("px-3 py-1.5 rounded-lg border text-sm font-medium transition-all", sel ? "border-primary bg-primary/10 text-primary" : "pill-selector border-border text-muted-foreground hover:border-primary/40")}>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Active</p><p className="text-xs text-muted-foreground">Inactive KPIs are hidden from progress tracking.</p></div>
            <Switch checked={form.isActive} onCheckedChange={(v) => setField("isActive", v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Add a Reward</p><p className="text-xs text-muted-foreground">Optional incentive when this target is hit.</p></div>
            <Switch checked={addReward} onCheckedChange={setAddReward} />
          </div>
          {addReward && (
            <div className="space-y-3 p-4 rounded-xl bg-muted/30 border">
              <div className="space-y-1.5">
                <Label>Reward Type</Label>
                <Select value={reward.type} onValueChange={(v) => setReward((r) => ({ ...r, type: v as RewardType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(REWARD_META) as [RewardType, typeof REWARD_META[RewardType]][]).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {rewardMeta.hasValue && (
                <div className="space-y-1.5">
                  <Label>Value ({rewardMeta.valueSuffix})</Label>
                  <Input type="number" min={0} value={reward.value || ""} onChange={(e) => setReward((r) => ({ ...r, value: parseFloat(e.target.value) || 0 }))} placeholder="0" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Label <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={reward.label} onChange={(e) => setReward((r) => ({ ...r, label: e.target.value }))} placeholder="e.g. Top Performer Bonus" />
              </div>
              <div className="space-y-1.5">
                <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea value={reward.note} onChange={(e) => setReward((r) => ({ ...r, note: e.target.value }))} placeholder="Any additional details about the reward…" className="h-20 resize-none" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Internal notes about this KPI…" className="h-20 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{initial ? "Save Changes" : "Create KPI"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Spread dialog ──────────────────────────────────────────────────────── */

function SpreadDialog({ open, onOpenChange, storeTargets, staffList, onSpread }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  storeTargets: KpiTarget[]; staffList: { id: number; name: string }[];
  onSpread: (targets: KpiTarget[]) => void;
}) {
  const [selectedKpiId, setSelectedKpiId] = useState<string>("");
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [divideEqually, setDivideEqually] = useState(true);
  const selectedKpi = storeTargets.find((t) => t.id === selectedKpiId);
  const toggleStaff = (id: string) => setSelectedStaffIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  const handleSpread = () => {
    if (!selectedKpi || selectedStaffIds.length === 0) { toast.error("Select a store KPI and at least one staff member"); return; }
    const perStaffTarget = divideEqually ? Math.ceil(selectedKpi.target / selectedStaffIds.length) : selectedKpi.target;
    const newTargets: KpiTarget[] = selectedStaffIds.map((staffId) => ({
      id: crypto.randomUUID(),
      name: `${selectedKpi.name} — ${staffList.find((s) => String(s.id) === staffId)?.name ?? "Staff"}`,
      metric: selectedKpi.metric, categoryId: selectedKpi.categoryId, period: selectedKpi.period,
      target: perStaffTarget, staffIds: [staffId], reward: selectedKpi.reward,
      notes: `Spread from store target: ${selectedKpi.name}`, isActive: true,
      startDate: selectedKpi.startDate ?? "", endDate: selectedKpi.endDate ?? "",
      repeats: selectedKpi.repeats,
    }));
    onSpread(newTargets);
    onOpenChange(false);
    toast.success(`Spread to ${selectedStaffIds.length} staff member${selectedStaffIds.length > 1 ? "s" : ""}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Spread Store Target to Staff</DialogTitle>
          <DialogDescription>Distribute a store-wide target across selected staff members.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Store KPI</Label>
            <Select value={selectedKpiId} onValueChange={setSelectedKpiId}>
              <SelectTrigger><SelectValue placeholder="Select a store target…" /></SelectTrigger>
              <SelectContent>
                {storeTargets.filter((t) => t.staffIds.length === 0).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} — {formatMetricValue(t.metric, t.target)} / {PERIOD_LABELS[t.period]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assign to Staff</Label>
            <div className="flex flex-wrap gap-2">
              {staffList.map((s) => {
                const sel = selectedStaffIds.includes(String(s.id));
                return (
                  <button key={s.id} onClick={() => toggleStaff(String(s.id))}
                    className={cn("px-3 py-1.5 rounded-lg border text-sm font-medium transition-all", sel ? "border-primary bg-primary/10 text-primary" : "pill-selector border-border text-muted-foreground hover:border-primary/40")}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
          {selectedKpi && selectedStaffIds.length > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Divide equally between staff</p>
                <p className="text-xs text-muted-foreground">
                  {divideEqually ? `Each gets ${formatMetricValue(selectedKpi.metric, Math.ceil(selectedKpi.target / selectedStaffIds.length))}` : `Each gets the full ${formatMetricValue(selectedKpi.metric, selectedKpi.target)}`}
                </p>
              </div>
              <Switch checked={divideEqually} onCheckedChange={setDivideEqually} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSpread}><SplitSquareHorizontal className="w-4 h-4 mr-1.5" />Spread</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Progress bar row ───────────────────────────────────────────────────── */

function ProgressRow({ kpi, current }: { kpi: KpiTarget; current: number | null }) {
  const meta = METRIC_META[kpi.metric];
  const unavailable = current === null;
  const pct = !unavailable && kpi.target > 0 ? Math.min(Math.round((current / kpi.target) * 100), 100) : 0;
  // A null actual means the metric can't be computed for this target yet — show
  // it as neutral/"—" rather than letting an inverse metric read as 100% "good".
  const color = unavailable ? "text-muted-foreground" : progressColor(pct, meta.isInverse);
  const Icon = meta.icon;
  const hit = !unavailable && pct >= 100;

  return (
    <div className="space-y-1.5 py-3 border-b last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{kpi.name}</span>
          {hit && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
        </div>
        <span className={cn("text-sm font-semibold shrink-0 tabular-nums", color)}>
          {unavailable ? "—" : formatMetricValue(kpi.metric, current)} / {formatMetricValue(kpi.metric, kpi.target)}
        </span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{unavailable ? "Not available yet" : `${pct}% of target`}</span>
        <span>{PERIOD_LABELS[kpi.period]}</span>
      </div>
      {kpi.reward && (
        <div className="flex items-center gap-1.5">
          <Trophy className="w-3 h-3 text-amber-500" />
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Reward: {REWARD_META[kpi.reward.type].label}
            {kpi.reward.value > 0 && ` — ${REWARD_META[kpi.reward.type].valueSuffix}${kpi.reward.value}`}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── KPI history row ────────────────────────────────────────────────────── */

function HistoryRow({ entry }: { entry: KpiHistoryEntry }) {
  const metric = entry.metric as KpiMetric;
  const meta = METRIC_META[metric];
  const Icon = meta?.icon ?? Target;
  const actual = entry.actual ?? null;
  const unavailable = actual === null;
  const pct = !unavailable && entry.target > 0 ? Math.min(Math.round((actual / entry.target) * 100), 100) : 0;
  const color = unavailable ? "text-muted-foreground" : progressColor(pct, meta?.isInverse);
  const hit = !unavailable && pct >= 100;
  const fmt = (v: number) => (meta ? formatMetricValue(metric, v) : v.toLocaleString());

  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{entry.name}</span>
        {hit && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
      </div>
      <span className={cn("text-sm font-semibold shrink-0 tabular-nums", color)}>
        {unavailable ? "—" : fmt(actual)} / {fmt(entry.target)}
      </span>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementKpisPage() {
  const queryClient = useQueryClient();
  const { data: kpiListData, refetch: refetchTargets } = useListKpiTargets({ query: { queryKey: ["kpi-targets"] } });
  const { data: rawSettings } = useGetKpiSettings({ query: { queryKey: ["kpi-settings"] } });
  const createTarget = useCreateKpiTarget();
  const updateTarget = useUpdateKpiTarget();
  const deleteTarget = useDeleteKpiTarget();
  const upsertSettings = useUpsertKpiSettings();

  const rawItems = kpiListData?.items ?? [];
  const targets: KpiTarget[] = (rawItems as unknown as Record<string, unknown>[]).map(apiToTarget).filter((t) => t.metric in METRIC_META);
  const settingsRaw = rawSettings as Record<string, unknown> | undefined;
  const trackCategories   = settingsRaw ? String(settingsRaw.trackCategories)   !== "false" : true;
  const trackAppointments = settingsRaw ? String(settingsRaw.trackAppointments) !== "false" : true;
  const trackServices     = settingsRaw ? String(settingsRaw.trackServices)     !== "false" : true;
  const weekStartDay      = settingsRaw ? String(settingsRaw.weekStartDay ?? "monday") : "monday";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [spreadOpen, setSpreadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<KpiTarget | null>(null);
  const [staffOnly, setStaffOnly] = useState(false);

  const { data: staffData } = useListStaff({ query: { queryKey: ["staff"] } });

  // Actuals are computed server-side (period- and staff-scoped, with the
  // budget end date and every metric handled consistently) so the Progress
  // Tracker, the Staff KPI page and the dashboard tile always agree.
  const { data: progressData } = useGetKpiProgress({ query: { queryKey: ["kpi-progress"] } });

  // Archived monthly KPI results (one snapshot per KPI per completed month),
  // returned newest-first by the API.
  const { data: historyData } = useListKpiHistory(undefined, { query: { queryKey: ["kpi-history"] } });
  const historyGroups = useMemo(() => {
    const map = new Map<string, KpiHistoryEntry[]>();
    for (const e of (historyData?.items ?? [])) {
      const label = e.periodLabel || "—";
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(e);
    }
    return Array.from(map.entries()).map(([label, entries]) => ({ label, entries }));
  }, [historyData]);
  const historyCount = historyData?.items?.length ?? 0;

  const staffList = (Array.isArray(staffData) ? staffData : []) as { id: number; name: string; email?: string }[];

  // Per-target actual keyed by target id (null = not computable for this target).
  const actualByTargetId = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const p of (progressData?.items ?? [])) map[String(p.id)] = p.actual ?? null;
    return map;
  }, [progressData]);

  const updateSetting = (key: "trackCategories" | "trackAppointments" | "trackServices", value: boolean) => {
    upsertSettings.mutate({ data: { [key]: value ? "true" : "false" } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kpi-settings"] }),
      onError: () => toast.error("Failed to save settings"),
    });
  };

  const updateWeekStartDay = (day: string) => {
    upsertSettings.mutate({ data: { weekStartDay: day } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kpi-settings"] }),
      onError: () => toast.error("Failed to save settings"),
    });
  };

  const openNew = (isStaffOnly?: boolean) => { setEditing(null); setStaffOnly(!!isStaffOnly); setDialogOpen(true); };
  const openEdit = (kpi: KpiTarget) => { setEditing(kpi); setStaffOnly(false); setDialogOpen(true); };

  const handleSave = (t: Omit<KpiTarget, "id">) => {
    const payload = {
      name: t.name,
      metric: t.metric,
      categoryId: t.categoryId,
      period: t.period,
      target: t.target,
      staffIds: JSON.stringify(t.staffIds),
      // Send an explicit "null" (not undefined) so clearing a reward actually
      // persists — the PATCH route ignores undefined fields, which previously
      // made it impossible to remove a reward once set.
      reward: t.reward ? JSON.stringify(t.reward) : "null",
      notes: t.notes,
      isActive: t.isActive ? "true" : "false",
      startDate: t.startDate || null,
      endDate: t.endDate || null,
      // Only meaningful alongside a start date — a rolling period already resets
      // on its own, so never persist a stray repeat flag without a window.
      repeats: t.startDate && t.repeats ? "true" : "false",
    };
    const invalidateTargets = () => {
      queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-progress"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpi"] });
    };
    if (editing) {
      updateTarget.mutate({ id: Number(editing.id), data: { ...payload, targetId: editing.id } }, {
        onSuccess: () => { invalidateTargets(); toast.success("KPI updated"); },
        onError: () => toast.error("Failed to update KPI"),
      });
    } else {
      createTarget.mutate({ data: { ...payload, targetId: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } }, {
        onSuccess: () => { invalidateTargets(); toast.success("KPI created"); },
        onError: () => toast.error("Failed to create KPI"),
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteTarget.mutate({ id: Number(id) }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
        queryClient.invalidateQueries({ queryKey: ["kpi-progress"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpi"] });
        toast.success("KPI deleted");
      },
      onError: () => toast.error("Failed to delete KPI"),
    });
  };

  const handleToggleDashboard = (kpi: KpiTarget) => {
    const currentlyOn = (kpi as KpiTarget & { showOnDashboard?: string }).showOnDashboard === "true";
    updateTarget.mutate(
      { id: Number(kpi.id), data: { targetId: kpi.id, name: kpi.name, metric: kpi.metric, period: kpi.period, target: kpi.target, showOnDashboard: currentlyOn ? "false" : "true" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-kpi"] });
          toast.success(currentlyOn ? "Removed from dashboard" : `"${kpi.name}" will now show on the dashboard`);
        },
        onError: () => toast.error("Failed to update KPI"),
      },
    );
  };

  const handleImport = async (rows: KpiImportRow[]) => {
    await Promise.all(rows.map((row, i) =>
      createTarget.mutateAsync({
        data: {
          targetId: `t-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: row.name,
          metric: row.metric,
          period: row.period,
          target: row.target,
          staffIds: JSON.stringify([]),
          notes: row.notes,
          isActive: row.isActive ? "true" : "false",
          startDate: row.startDate || null,
          endDate: row.endDate || null,
        },
      })
    ));
    queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-progress"] });
    toast.success(`${rows.length} KPI${rows.length !== 1 ? "s" : ""} imported`);
  };

  const handleSpread = (newTargets: KpiTarget[]) => {
    Promise.all(newTargets.map((t, i) =>
      createTarget.mutateAsync({ data: {
        targetId: `t-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: t.name, metric: t.metric, categoryId: t.categoryId, period: t.period,
        target: t.target, staffIds: JSON.stringify(t.staffIds),
        reward: t.reward ? JSON.stringify(t.reward) : undefined, notes: t.notes, isActive: "true",
        // Carry the store target's budget window across, so a spread staff
        // target tracks (and rolls over) on the same schedule as its parent.
        startDate: t.startDate || null, endDate: t.endDate || null,
        repeats: t.startDate && t.repeats ? "true" : "false",
      }})
    )).then(() => {
      refetchTargets();
      queryClient.invalidateQueries({ queryKey: ["kpi-progress"] });
    }).catch(() => toast.error("Failed to spread targets"));
  };

  const { storeWide, staffTargets, allWithRewards, inactiveTargets } = useMemo(() => ({
    storeWide:       targets.filter((t) => t.staffIds.length === 0 && t.isActive),
    staffTargets:    targets.filter((t) => t.staffIds.length > 0  && t.isActive),
    allWithRewards:  targets.filter((t) => t.isActive && t.reward),
    inactiveTargets: targets.filter((t) => !t.isActive),
  }), [targets]);

  const staffGroups = useMemo(() => {
    const map = new Map<string, { name: string; targets: KpiTarget[] }>();
    for (const kpi of staffTargets) {
      for (const sid of kpi.staffIds) {
        if (!map.has(sid)) {
          const member = staffList.find((s) => String(s.id) === sid);
          map.set(sid, { name: member?.name ?? `Staff #${sid}`, targets: [] });
        }
        map.get(sid)!.targets.push(kpi);
      }
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [staffTargets, staffList]);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">KPIs & Targets</h1>
            <p className="text-sm text-muted-foreground mt-1">Set performance targets for your store and team, track progress, and reward results.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />Import
            </Button>
            <Button onClick={() => openNew()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" />New KPI
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <section id="store-targets" className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Store className="w-4 h-4 text-primary" /><h2 className="font-semibold">Store Targets</h2><Badge variant="secondary">{storeWide.length}</Badge></div>
                <Button size="sm" variant="outline" onClick={() => openNew()}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
              </div>
              {storeWide.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-sm">No store targets yet</p>
                  <p className="text-xs mt-1">Add targets for revenue, transactions, new customers and more.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {storeWide.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} staffList={staffList} onEdit={() => openEdit(kpi)} onDelete={() => handleDelete(kpi.id)} onToggleDashboard={() => handleToggleDashboard(kpi)} />)}
                </div>
              )}
            </section>

            <section id="progress" className="space-y-3">
              <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /><h2 className="font-semibold">Progress Tracker</h2></div>
              {targets.filter((t) => t.isActive).length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-sm">No active KPIs to track</p>
                </div>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Current Period Overview</CardTitle>
                    <CardDescription className="text-xs">Based on all available transaction data. Revenue and transaction metrics are live.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {targets.filter((t) => t.isActive).map((kpi) => (
                      <ProgressRow key={kpi.id} kpi={kpi} current={actualByTargetId[kpi.id] ?? null} />
                    ))}
                  </CardContent>
                </Card>
              )}
            </section>

            {inactiveTargets.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /><h2 className="font-semibold text-muted-foreground text-sm">Inactive KPIs</h2><Badge variant="outline">{inactiveTargets.length}</Badge></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {inactiveTargets.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} staffList={staffList} onEdit={() => openEdit(kpi)} onDelete={() => handleDelete(kpi.id)} onToggleDashboard={() => handleToggleDashboard(kpi)} />)}
                </div>
              </section>
            )}

            {historyCount > 0 && (
              <section id="kpi-history" className="space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold">KPI History</h2>
                  <Badge variant="secondary">{historyCount}</Badge>
                </div>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Completed Periods</CardTitle>
                    <CardDescription className="text-xs">Final results captured when each KPI reset at the end of its period.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-4">
                    {historyGroups.map((g) => (
                      <div key={g.label}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{g.label}</p>
                        {g.entries.map((e) => <HistoryRow key={e.id} entry={e} />)}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Flame className="w-4 h-4 text-orange-500" />Available Metrics</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {(Object.entries(METRIC_META) as [KpiMetric, typeof METRIC_META[KpiMetric]][]).map(([k, m]) => {
                    const Icon = m.icon;
                    return (
                      <div key={k} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm flex-1 min-w-0 truncate">{m.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="text-xs font-mono">{m.unit}</Badge>
                          {m.isInverse && <span className="text-xs text-rose-500">↓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <section id="staff-targets" className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /><h2 className="font-semibold">Staff Targets</h2><Badge variant="secondary">{staffTargets.length}</Badge></div>
                <div className="flex gap-2">
                  {storeWide.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setSpreadOpen(true)}><SplitSquareHorizontal className="w-3.5 h-3.5 mr-1" />Spread</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openNew(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
                </div>
              </div>
              {staffGroups.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-sm">No staff targets yet</p>
                  <p className="text-xs mt-1">Add individual targets or use "Spread" to distribute a store target across your team.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {staffGroups.map((group) => (
                    <div key={group.id} className="rounded-xl border overflow-hidden">
                      <div className="px-4 py-3 bg-muted/20 border-b flex items-center gap-2">
                        <div className="p-1.5 rounded-full bg-primary/10 text-primary"><Users className="w-3 h-3" /></div>
                        <p className="font-semibold text-sm">{group.name}</p>
                        <Badge variant="secondary" className="text-xs ml-auto">{group.targets.length} targets</Badge>
                      </div>
                      <div className="p-3 grid grid-cols-1 gap-3">
                        {group.targets.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} staffList={staffList} onEdit={() => openEdit(kpi)} onDelete={() => handleDelete(kpi.id)} onToggleDashboard={() => handleToggleDashboard(kpi)} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section id="rewards" className="space-y-3">
              <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /><h2 className="font-semibold">Reward Summary</h2></div>
              {allWithRewards.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground">
                  <Trophy className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-sm">No rewards configured</p>
                  <p className="text-xs mt-1">Add a reward to any KPI to incentivise your team.</p>
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden divide-y">
                  {allWithRewards.map((kpi) => {
                    const RewardIcon = REWARD_META[kpi.reward!.type].icon;
                    return (
                      <div key={kpi.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 shrink-0"><RewardIcon className="w-4 h-4" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{kpi.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {REWARD_META[kpi.reward!.type].label}
                            {kpi.reward!.value > 0 && ` — ${REWARD_META[kpi.reward!.type].valueSuffix}${kpi.reward!.value}`}
                            {kpi.reward!.label && ` · ${kpi.reward!.label}`}
                          </p>
                        </div>
                        <button onClick={() => openEdit(kpi)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section id="tracking" className="space-y-3">
              <div className="flex items-center gap-2"><Target className="w-4 h-4 text-primary" /><h2 className="font-semibold">Tracking Options</h2></div>
              <Card>
                <CardContent className="pt-4 space-y-0 divide-y">
                  {([
                    { key: "trackCategories"   as const, label: "Product Categories", desc: "Track KPIs by product category revenue",         icon: Tag           },
                    { key: "trackAppointments" as const, label: "Appointments",        desc: "Count completed appointments toward KPI targets", icon: CalendarClock },
                    { key: "trackServices"     as const, label: "Service Jobs",         desc: "Count completed service jobs toward KPI targets", icon: Wrench        },
                  ]).map(({ key, label, desc, icon: Icon }) => {
                    const value = key === "trackCategories" ? trackCategories : key === "trackAppointments" ? trackAppointments : trackServices;
                    return (
                      <div key={key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-muted text-muted-foreground"><Icon className="w-3.5 h-3.5" /></div>
                          <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
                        </div>
                        <Switch checked={value} onCheckedChange={(v) => updateSetting(key, v)} />
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between py-3 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-muted text-muted-foreground"><Calendar className="w-3.5 h-3.5" /></div>
                      <div>
                        <p className="text-sm font-medium">Week Starts On</p>
                        <p className="text-xs text-muted-foreground">Affects how weekly KPI periods are calculated</p>
                      </div>
                    </div>
                    <Select value={weekStartDay} onValueChange={updateWeekStartDay}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Monday</SelectItem>
                        <SelectItem value="tuesday">Tuesday</SelectItem>
                        <SelectItem value="wednesday">Wednesday</SelectItem>
                        <SelectItem value="thursday">Thursday</SelectItem>
                        <SelectItem value="friday">Friday</SelectItem>
                        <SelectItem value="saturday">Saturday</SelectItem>
                        <SelectItem value="sunday">Sunday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

            </section>
          </div>
        </div>
      </div>

      <KpiDialog
        key={editing?.id ?? "new"}
        open={dialogOpen} onOpenChange={setDialogOpen}
        initial={editing ? { ...editing } : null}
        staffList={staffList} onSave={handleSave} staffOnly={staffOnly}
      />
      <SpreadDialog
        open={spreadOpen} onOpenChange={setSpreadOpen}
        storeTargets={targets} staffList={staffList} onSpread={handleSpread}
      />
      <KpiImportDialog
        open={importOpen} onOpenChange={setImportOpen}
        onImport={handleImport}
      />
    </AppLayout>
  );
}
