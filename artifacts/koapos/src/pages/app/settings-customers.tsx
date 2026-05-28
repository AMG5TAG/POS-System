import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ColourPicker } from "@/components/ui/colour-picker";
import { AppLayout } from "@/components/layout/app-layout";
import { useCustomerSettings, type CustomerGroup, type CustomerRequiredFields } from "@/lib/customer-settings";
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
} from "lucide-react";

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

      {/* Delete Confirm Dialog */}
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

    </AppLayout>
  );
}
