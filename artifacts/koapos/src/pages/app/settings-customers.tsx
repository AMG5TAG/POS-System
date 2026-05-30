import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { ColourPicker } from "@/components/ui/colour-picker";
import { AppLayout } from "@/components/layout/app-layout";
import { useCustomerSettings, type CustomerGroup, type CustomerRequiredFields, type HeardFromSource, DEFAULT_HEARD_FROM_SOURCES } from "@/lib/customer-settings";
import {
  computeHeardFromAnalytics,
  HEARD_FROM_PERIODS,
  type HeardFromPeriod,
  type HeardFromCustomer,
} from "@/lib/heard-from-analytics";
import { exportHeardFromCSV } from "@/lib/heard-from-export";
import {
  useListCustomers,
  getListCustomersQueryKey,
  useBulkMergePreview,
  useBulkExecuteMerge,
} from "@workspace/api-client-react";
import type { DuplicateBucket } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Users, ScanSearch, Merge,
  Phone, User, CheckCircle2, Loader2, AlertCircle,
  ChevronUp, ChevronDown, Radio, PieChart as PieChartIcon,
  TrendingUp, TrendingDown, Minus, Download, Sparkles,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

const CUSTOMER_TABS = [
  { href: "#customer-groups", label: "Customer Groups", icon: Users },
  { href: "#required-info",   label: "Required Info" },
  { href: "#defaults",        label: "Defaults" },
  { href: "#bulk-duplicates", label: "Bulk Duplicates Resolver" },
];

const GROUP_COLORS = [
  { label: "Blue",   value: "#3b82f6" },
  { label: "Amber",  value: "#f59e0b" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Green",  value: "#10b981" },
  { label: "Red",    value: "#ef4444" },
  { label: "Pink",   value: "#ec4899" },
  { label: "Orange", value: "#f97316" },
  { label: "Teal",   value: "#14b8a6" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Gray",   value: "#6b7280" },
];

const REQUIRED_FIELD_LABELS: { key: keyof CustomerRequiredFields; label: string; hint?: string }[] = [
  { key: "email",          label: "Email Address" },
  { key: "phone",          label: "Phone Number" },
  { key: "dateOfBirth",    label: "Date of Birth" },
  { key: "company",        label: "Company / Business Name" },
  { key: "abn",            label: "ABN",            hint: "Australian Business Number" },
  { key: "billingAddress", label: "Billing Address" },
];

type MergeProgress = {
  total: number;
  current: number;
  running: boolean;
  done: boolean;
  failed: number;
};

export default function SettingsCustomersPage() {
  const { settings, save } = useCustomerSettings();
  const queryClient = useQueryClient();
  const { data: customersData } = useListCustomers(
    { limit: 1000 },
    { query: { queryKey: ["customers-settings"] } }
  );
  const customers = customersData?.items ?? [];

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup]         = useState<CustomerGroup | null>(null);
  const [groupForm, setGroupForm]               = useState({ name: "", description: "", color: "#3b82f6" });
  const [deleteConfirm, setDeleteConfirm]       = useState<string | null>(null);

  // ── Heard From Sources state ───────────────────────────────────────────────
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource]         = useState<HeardFromSource | null>(null);
  const [sourceForm, setSourceForm]               = useState({ name: "", requiresDetails: false });
  const [deleteSourceConfirm, setDeleteSourceConfirm] = useState<string | null>(null);

  // ── Bulk duplicates state ──────────────────────────────────────────────────
  const [buckets, setBuckets]           = useState<DuplicateBucket[] | null>(null);
  const [scanTotal, setScanTotal]       = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [mergeProgress, setMergeProgress] = useState<MergeProgress>({
    total: 0, current: 0, running: false, done: false, failed: 0,
  });

  const scanMutation    = useBulkMergePreview();
  const executeMutation = useBulkExecuteMerge();

  const groupCounts = (customers as { customerGroup?: string }[]).reduce<Record<string, number>>((acc, c) => {
    const g = c.customerGroup || "Standard";
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});
  const total = customers.length;

  // ── Heard From breakdown (referral source, with time-window trends) ────────
  const [heardFromPeriod, setHeardFromPeriod] = useState<HeardFromPeriod>("all");

  const heardFromData = useMemo(
    () => computeHeardFromAnalytics(customers as HeardFromCustomer[], heardFromPeriod),
    [customers, heardFromPeriod],
  );
  const heardFromBreakdown = heardFromData.breakdown;

  const openAdd = () => {
    setEditingGroup(null);
    setGroupForm({ name: "", description: "", color: "#3b82f6" });
    setGroupDialogOpen(true);
  };

  const openEdit = (g: CustomerGroup) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, description: g.description, color: g.color });
    setGroupDialogOpen(true);
  };

  const saveGroup = () => {
    if (!groupForm.name.trim()) return;
    const groups = [...settings.groups];
    if (editingGroup) {
      const idx = groups.findIndex(g => g.id === editingGroup.id);
      if (idx >= 0) groups[idx] = { ...editingGroup, ...groupForm, name: groupForm.name.trim() };
    } else {
      groups.push({ id: crypto.randomUUID(), ...groupForm, name: groupForm.name.trim() });
    }
    save({ groups });
    toast.success(editingGroup ? "Group updated" : "Group added");
    setGroupDialogOpen(false);
  };

  const confirmDelete = (id: string) => setDeleteConfirm(id);

  const doDelete = () => {
    if (!deleteConfirm) return;
    save({ groups: settings.groups.filter(g => g.id !== deleteConfirm) });
    toast.success("Group deleted");
    setDeleteConfirm(null);
  };

  const toggleRequired = (key: keyof CustomerRequiredFields, checked: boolean) => {
    save({ requiredFields: { ...settings.requiredFields, [key]: checked } });
  };

  // ── Heard From Sources handlers ────────────────────────────────────────────
  const openAddSource = () => {
    setEditingSource(null);
    setSourceForm({ name: "", requiresDetails: false });
    setSourceDialogOpen(true);
  };

  const openEditSource = (s: HeardFromSource) => {
    setEditingSource(s);
    setSourceForm({ name: s.name, requiresDetails: s.requiresDetails });
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

  // ── Bulk duplicates handlers ───────────────────────────────────────────────
  const runScan = () => {
    setBuckets(null);
    setSelectedKeys(new Set());
    setMergeProgress({ total: 0, current: 0, running: false, done: false, failed: 0 });
    scanMutation.mutate(undefined, {
      onSuccess: (data) => {
        setBuckets(data.buckets);
        setScanTotal(data.scannedTotal);
      },
      onError: () => toast.error("Scan failed — please try again"),
    });
  };

  const toggleBucket = (key: string, checked: boolean) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const runAutoMerge = async () => {
    const selected = (buckets ?? []).filter(b => selectedKeys.has(b.bucketKey));
    if (selected.length === 0) return;

    setMergeProgress({ total: selected.length, current: 0, running: true, done: false, failed: 0 });

    let failCount = 0;
    for (let i = 0; i < selected.length; i++) {
      const bucket = selected[i];
      const secondaryIds = bucket.customers
        .map(c => c.id)
        .filter(id => id !== bucket.suggestedPrimaryId);

      try {
        await executeMutation.mutateAsync({
          data: { clusters: [{ primaryId: bucket.suggestedPrimaryId, secondaryIds }] },
        });
      } catch {
        failCount++;
      }
      setMergeProgress(p => ({ ...p, current: i + 1, failed: failCount }));
    }

    setMergeProgress(p => ({ ...p, running: false, done: true, failed: failCount }));
    queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });

    const succeeded = selected.length - failCount;
    if (failCount === 0) {
      toast.success(`${succeeded} cluster${succeeded !== 1 ? "s" : ""} merged successfully`);
    } else {
      toast.warning(`${succeeded} merged, ${failCount} failed`);
    }
  };

  const resetResolver = () => {
    setMergeProgress({ total: 0, current: 0, running: false, done: false, failed: 0 });
    setBuckets(null);
    setSelectedKeys(new Set());
  };

  const progressPct = mergeProgress.total > 0
    ? Math.round((mergeProgress.current / mergeProgress.total) * 100)
    : 0;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">

        <div>
          <h1 className="text-2xl font-bold">Customer Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage how customers are organised and what information is collected.
          </p>
        </div>


        {/* Summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-3xl font-bold text-primary">{total}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Customers</p>
            </CardContent>
          </Card>
          {settings.groups.slice(0, 3).map(g => {
            const count = groupCounts[g.name] ?? 0;
            const pct   = total ? Math.round((count / total) * 100) : 0;
            return (
              <Card key={g.id}>
                <CardContent className="pt-5 pb-4 text-center">
                  <p className="text-3xl font-bold" style={{ color: g.color }}>{count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{g.name}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: g.color }}>{pct}%</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Customer Groups */}
        <Card id="customer-groups">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
            <div>
              <CardTitle>Customer Groups</CardTitle>
              <CardDescription>Organise customers for segmentation, pricing, and reporting.</CardDescription>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" /> Add Group
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {settings.groups.map(g => {
                const count = groupCounts[g.name] ?? 0;
                const pct   = total ? Math.round((count / total) * 100) : 0;
                return (
                  <div
                    key={g.id}
                    className="rounded-xl border bg-muted/10 p-4 flex flex-col gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border"
                          style={{
                            backgroundColor: g.color + "20",
                            color: g.color,
                            borderColor: g.color + "50",
                          }}
                        >
                          {g.name}
                        </span>
                        <span className="text-sm font-bold tabular-nums">{count}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => confirmDelete(g.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed flex-1 min-h-[2.5rem]">
                      {g.description || <span className="italic">No description</span>}
                    </p>

                    <div className="flex items-center gap-2 pt-2 border-t">
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: g.color }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {count} · {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}

              {settings.groups.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-3 py-12 text-muted-foreground">
                  <Users className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No groups yet. Add your first customer group.</p>
                  <Button size="sm" variant="outline" onClick={openAdd}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Group
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Required Information + Defaults */}
        <div className="space-y-6">
        <Card id="required-info">
          <CardHeader>
            <CardTitle>Required Information</CardTitle>
            <CardDescription>
              Fields that staff must fill in when creating or editing a customer record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {REQUIRED_FIELD_LABELS.map(({ key, label, hint }) => (
              <label
                key={key}
                className="flex items-start gap-3 py-2.5 cursor-pointer rounded-lg px-2 hover:bg-muted/40 transition-colors"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={!!settings.requiredFields[key]}
                  onCheckedChange={(v) => toggleRequired(key, !!v)}
                />
                <div>
                  <p className="text-sm font-medium leading-tight">{label}</p>
                  {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        {/* Defaults */}
        <Card id="defaults">
          <CardHeader>
            <CardTitle>Default Values</CardTitle>
            <CardDescription>Values pre-filled when creating a new customer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Default Customer Group</Label>
              <Select value={settings.defaultGroup} onValueChange={(v) => save({ defaultGroup: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.groups.map(g => (
                    <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Applied automatically when a new customer is added.</p>
            </div>
          </CardContent>
        </Card>

        </div>{/* end col 2 */}
        </div>{/* end 2-col grid */}

        {/* ── Heard From Sources ───────────────────────────────────────────── */}
        <Card id="heard-from-sources">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary" />
                Heard From Sources
              </CardTitle>
              <CardDescription>
                Referral channels shown in the customer form's "Heard From" dropdown. Sources marked as
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
                    {/* Reorder arrows */}
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

                    {/* Name */}
                    <span className="flex-1 text-sm font-medium">{s.name}</span>

                    {/* Requires-details badge */}
                    {s.requiresDetails && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Requires details
                      </Badge>
                    )}

                    {/* Actions */}
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

        {/* ── Heard From Breakdown ─────────────────────────────────────────── */}
        <Card id="heard-from-breakdown">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-primary" />
                Heard From Breakdown
              </CardTitle>
              <CardDescription>
                {heardFromPeriod === "all"
                  ? `Which referral channels bring in the most customers, based on ${total} customer${total !== 1 ? "s" : ""}.`
                  : `${heardFromData.windowTotal} new customer${heardFromData.windowTotal !== 1 ? "s" : ""} in this window — see which channels are growing or fading.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={heardFromBreakdown.length === 0}
                onClick={() => exportHeardFromCSV(heardFromData, heardFromPeriod)}
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
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
                {/* Distribution within the selected window */}
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
                            `${v} customer${v !== 1 ? "s" : ""}`,
                            n,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5">
                    {heardFromBreakdown.map((s) => {
                      const denom = heardFromData.windowTotal || 1;
                      const pct = Math.round((s.value / denom) * 100);
                      const cmp = heardFromData.comparison?.find((c) => c.name === s.name);
                      return (
                        <div
                          key={s.name}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-muted/10"
                        >
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: s.fill }}
                          />
                          <span className="flex-1 text-sm font-medium">{s.name}</span>
                          {cmp && cmp.delta !== 0 && (
                            <span
                              className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                                cmp.delta > 0 ? "text-emerald-600" : "text-red-500"
                              }`}
                              title={`${cmp.previous} in the previous period`}
                            >
                              {cmp.delta > 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {cmp.delta > 0 ? "+" : ""}{cmp.delta}
                            </span>
                          )}
                          {cmp && cmp.delta === 0 && cmp.previous > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground" title="No change from the previous period">
                              <Minus className="w-3 h-3" />
                            </span>
                          )}
                          <span className="text-sm font-bold tabular-nums">{s.value}</span>
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

                {/* At-a-glance highlights: biggest gainer / decliner */}
                {heardFromData.highlights.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <p className="text-sm font-medium">What's moving</p>
                    </div>
                    <ul className="space-y-1.5">
                      {heardFromData.highlights.map((h) => {
                        const pct = h.pctChange === null ? null : Math.abs(h.pctChange);
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
                                  <>is your fastest-growing channel, up {pct}% ({h.previous} → {h.current}) vs the previous period.</>
                                ) : (
                                  <>is your fastest-growing channel, with {h.current} new customer{h.current !== 1 ? "s" : ""} this period (none previously).</>
                                )
                              ) : h.current === 0 ? (
                                <>has dropped to zero, down from {h.previous} in the previous period.</>
                              ) : pct !== null ? (
                                <>is down {pct}% ({h.previous} → {h.current}) vs the previous period.</>
                              ) : (
                                <>is down {Math.abs(h.delta)} vs the previous period.</>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Trend over time (stacked bars per source) */}
                {heardFromData.trend.sources.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium">New customers over time</p>
                    </div>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={heardFromData.trend.data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 8,
                              fontSize: 12,
                              border: "1px solid hsl(var(--border))",
                              background: "hsl(var(--card))",
                            }}
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

        {/* ── Bulk Duplicates Resolver ─────────────────────────────────────── */}
        <Card id="bulk-duplicates">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ScanSearch className="w-5 h-5 text-primary" />
                Bulk Duplicates Resolver
              </CardTitle>
              <CardDescription>
                Scan all customer records for duplicate phone numbers or matching names, then auto-merge selected
                clusters into a single master record. All historical data, transactions, and loyalty points are
                consolidated into the primary.
              </CardDescription>
            </div>
            {!mergeProgress.running && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                onClick={runScan}
                disabled={scanMutation.isPending}
              >
                {scanMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ScanSearch className="w-3.5 h-3.5" />
                }
                {scanMutation.isPending ? "Scanning…" : "Scan for Duplicates"}
              </Button>
            )}
          </CardHeader>

          <CardContent>
            {/* Idle — no scan yet */}
            {!buckets && !scanMutation.isPending && !mergeProgress.running && !mergeProgress.done && (
              <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
                <ScanSearch className="w-10 h-10 opacity-20" />
                <p className="text-sm text-center max-w-sm leading-relaxed">
                  Click <span className="font-medium text-foreground">Scan for Duplicates</span> to identify
                  customers sharing the same phone number or first + last name. No records are modified until
                  you confirm.
                </p>
              </div>
            )}

            {/* Scanning spinner */}
            {scanMutation.isPending && (
              <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Scanning {total.toLocaleString()} customer records…</p>
              </div>
            )}

            {/* No duplicates found */}
            {buckets && buckets.length === 0 && !mergeProgress.running && !mergeProgress.done && (
              <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 text-green-500 opacity-70" />
                <p className="text-sm font-medium text-foreground">No duplicates found</p>
                <p className="text-xs text-center">
                  All {scanTotal.toLocaleString()} customer records appear to be unique.
                </p>
                <Button size="sm" variant="ghost" onClick={runScan} className="mt-1">
                  <ScanSearch className="w-3.5 h-3.5 mr-1.5" /> Scan Again
                </Button>
              </div>
            )}

            {/* Bucket list */}
            {buckets && buckets.length > 0 && !mergeProgress.running && !mergeProgress.done && (
              <>
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-4 gap-4">
                  <p className="text-sm text-muted-foreground">
                    Found{" "}
                    <span className="font-semibold text-foreground">{buckets.length}</span>{" "}
                    duplicate cluster{buckets.length !== 1 ? "s" : ""} across{" "}
                    <span className="font-semibold text-foreground">{scanTotal.toLocaleString()}</span>{" "}
                    customers.
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => setSelectedKeys(new Set(buckets.map(b => b.bucketKey)))}
                    >
                      Select all
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => setSelectedKeys(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Bucket rows */}
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {buckets.map(bucket => {
                    const isSelected = selectedKeys.has(bucket.bucketKey);
                    return (
                      <div
                        key={bucket.bucketKey}
                        className={`rounded-lg border p-4 transition-colors cursor-pointer ${
                          isSelected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10 hover:bg-muted/20"
                        }`}
                        onClick={() => toggleBucket(bucket.bucketKey, !isSelected)}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            className="mt-0.5 shrink-0"
                            checked={isSelected}
                            onCheckedChange={(v) => toggleBucket(bucket.bucketKey, !!v)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            {/* Meta badges */}
                            <div className="flex items-center gap-2 flex-wrap mb-2.5">
                              <Badge
                                variant="outline"
                                className={`gap-1 ${
                                  bucket.matchType === "phone"
                                    ? "text-blue-600 border-blue-300 bg-blue-50"
                                    : bucket.matchType === "name"
                                    ? "text-purple-600 border-purple-300 bg-purple-50"
                                    : "text-amber-600 border-amber-300 bg-amber-50"
                                }`}
                              >
                                {bucket.matchType === "phone"
                                  ? <Phone className="w-3 h-3" />
                                  : bucket.matchType === "name"
                                  ? <User className="w-3 h-3" />
                                  : <Merge className="w-3 h-3" />
                                }
                                {bucket.matchType === "phone"
                                  ? "Duplicate phone"
                                  : bucket.matchType === "name"
                                  ? "Duplicate name"
                                  : "Phone & name match"
                                }
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {bucket.customers.length} records
                              </span>
                              {bucket.totalTransactions > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {bucket.totalTransactions} txn{bucket.totalTransactions !== 1 ? "s" : ""}{" "}
                                  · ${bucket.totalSpent.toFixed(2)} total
                                </span>
                              )}
                            </div>

                            {/* Customer pills */}
                            <div className="flex flex-wrap gap-1.5">
                              {bucket.customers.map(c => {
                                const isPrimary = c.id === bucket.suggestedPrimaryId;
                                const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || `Customer #${c.id}`;
                                return (
                                  <div
                                    key={c.id}
                                    title={isPrimary ? "Suggested primary — will be kept" : "Will be merged into primary"}
                                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${
                                      isPrimary
                                        ? "bg-primary/10 border-primary/30 font-semibold text-primary"
                                        : "bg-background border-border text-muted-foreground"
                                    }`}
                                  >
                                    {isPrimary && <span className="text-[9px] leading-none">★</span>}
                                    {name}
                                    {c.phone && !isPrimary && (
                                      <span className="opacity-50 text-[10px]">· {c.phone}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <p className="text-xs text-muted-foreground mt-1.5">
                              <span className="text-primary font-medium">★ Primary:</span>{" "}
                              record with most activity — all others will be absorbed and removed.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Action bar */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t gap-4">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{selectedKeys.size}</span>{" "}
                    cluster{selectedKeys.size !== 1 ? "s" : ""} selected
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={runScan}>
                      <ScanSearch className="w-3.5 h-3.5 mr-1.5" /> Re-scan
                    </Button>
                    <Button
                      onClick={runAutoMerge}
                      disabled={selectedKeys.size === 0}
                      className="gap-1.5"
                    >
                      <Merge className="w-4 h-4" />
                      Auto-Merge Selected Clusters
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Progress during merge */}
            {mergeProgress.running && (
              <div className="py-10 space-y-5 max-w-lg mx-auto">
                <div className="text-center space-y-1">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-3" />
                  <p className="text-sm font-medium">Merging duplicate clusters…</p>
                  <p className="text-xs text-muted-foreground">
                    Processing {mergeProgress.current + 1} of {mergeProgress.total} — do not close this page.
                  </p>
                </div>
                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5 tabular-nums">
                    <span>{mergeProgress.current} / {mergeProgress.total} complete</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {mergeProgress.failed > 0 && (
                    <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {mergeProgress.failed} cluster{mergeProgress.failed !== 1 ? "s" : ""} failed
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Done state */}
            {mergeProgress.done && (
              <div className="py-12 flex flex-col items-center gap-4">
                {mergeProgress.failed === 0
                  ? <CheckCircle2 className="w-12 h-12 text-green-500" />
                  : <AlertCircle className="w-12 h-12 text-amber-500" />
                }
                <div className="text-center">
                  <p className="text-base font-semibold">
                    {mergeProgress.failed === 0 ? "All merges completed" : "Merge finished with errors"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {mergeProgress.total - mergeProgress.failed} cluster{(mergeProgress.total - mergeProgress.failed) !== 1 ? "s" : ""} merged
                    successfully
                    {mergeProgress.failed > 0 && ` · ${mergeProgress.failed} failed`}.
                  </p>
                </div>
                <Button variant="outline" onClick={resetResolver} className="gap-1.5 mt-1">
                  <ScanSearch className="w-4 h-4" /> Scan Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Add / Edit Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "Add Customer Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Group Name <span className="text-destructive">*</span></Label>
              <Input
                value={groupForm.name}
                onChange={(e) => setGroupForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Wholesale"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={groupForm.description}
                onChange={(e) => setGroupForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this group"
              />
            </div>
            <div className="space-y-2">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setGroupForm(f => ({ ...f, color: c.value }))}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c.value,
                      borderColor: groupForm.color === c.value ? "#000" : "transparent",
                      transform: groupForm.color === c.value ? "scale(1.15)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
              <ColourPicker value={groupForm.color} onChange={(v) => setGroupForm(f => ({ ...f, color: v }))} />
              <div className="flex items-center gap-2 pt-1">
                <div
                  className="w-5 h-5 rounded-full border shrink-0"
                  style={{ backgroundColor: groupForm.color }}
                />
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: groupForm.color + "20",
                    color: groupForm.color,
                    borderColor: groupForm.color + "50",
                  }}
                >
                  {groupForm.name || "Preview"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveGroup} disabled={!groupForm.name.trim()}>
              {editingGroup ? "Update Group" : "Add Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Deleting this group won't remove customers — they'll keep their current group label.
            You can reassign them later.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Source Dialog */}
      <Dialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingSource ? "Edit Source" : "Add Heard From Source"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Source Name <span className="text-destructive">*</span></Label>
              <Input
                value={sourceForm.name}
                onChange={(e) => setSourceForm(f => ({ ...f, name: e.target.value }))}
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
                onCheckedChange={(v) => setSourceForm(f => ({ ...f, requiresDetails: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSourceDialogOpen(false)}>Cancel</Button>
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
