import { useState } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListProducts, useListCategories } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Clock, Plus, Pencil, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface PricingRule {
  id: number; name: string; productId: number | null; categoryId: number | null;
  discountType: "percent" | "fixed"; discountValue: number;
  startTime: string; endTime: string; daysOfWeek: string;
  label: string | null; isActive: string;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ALL_DAYS = "1,2,3,4,5,6,7";

const defaultForm = () => ({
  name: "", productId: null as number | null, categoryId: null as number | null,
  discountType: "percent" as "percent" | "fixed", discountValue: 10,
  startTime: "15:00", endTime: "17:00", daysOfWeek: "1,2,3,4,5",
  label: "", isActive: true,
});

export default function SettingsPricingRulesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formTouched, setFormTouched] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm());

  const { ConfirmDialog: PricingRuleFormGuard } = useUnsavedChangesGuard(formTouched, {
    title: "Close pricing rule form?",
    description: "The pricing rule form has unsaved changes. If you leave now, your changes will be lost.",
    cancelLabel: "Stay on page",
    actionLabel: "Leave anyway",
  });

  const { data: rulesData, isLoading } = useQuery<{ rules: PricingRule[] }>({
    queryKey: ["pricing-rules"],
    queryFn: async () => {
      const r = await fetch("/api/pricing-rules", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const { data: productsData } = useListProducts({ limit: 200 });
  const { data: categoriesData } = useListCategories({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["pricing-rules"] });

  const saveMutation = useMutation({
    mutationFn: async (body: typeof form & { id?: number }) => {
      const url = body.id ? `/api/pricing-rules/${body.id}` : "/api/pricing-rules";
      const r = await fetch(url, {
        method: body.id ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, isActive: body.isActive }),
      });
      if (!r.ok) throw new Error("Save failed");
      return r.json();
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); setFormTouched(false); toast.success(editingId ? "Rule updated" : "Rule created"); },
    onError: () => toast.error("Failed to save rule"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/pricing-rules/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => { invalidate(); toast.success("Rule deleted"); },
    onError: () => toast.error("Failed to delete rule"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await fetch(`/api/pricing-rules/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("Toggle failed");
    },
    onSuccess: invalidate,
  });

  const openCreate = () => { setEditingId(null); setForm(defaultForm()); setFormTouched(false); setDialogOpen(true); };
  const openEdit = (r: PricingRule) => {
    setEditingId(r.id);
    setForm({
      name: r.name, productId: r.productId, categoryId: r.categoryId,
      discountType: r.discountType, discountValue: r.discountValue,
      startTime: r.startTime, endTime: r.endTime, daysOfWeek: r.daysOfWeek,
      label: r.label ?? "", isActive: r.isActive === "true",
    });
    setFormTouched(false);
    setDialogOpen(true);
  };

  const toggleDay = (day: number) => {
    const days = form.daysOfWeek ? form.daysOfWeek.split(",").map(Number) : [];
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
    setForm(f => ({ ...f, daysOfWeek: next.join(",") }));
  };

  const activeDays = form.daysOfWeek ? form.daysOfWeek.split(",").map(Number) : [];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Clock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Pricing Rules</h1>
              <p className="text-sm text-muted-foreground">Time-based automatic discounts — happy hours, promotions, scheduled pricing</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add Rule</Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !rulesData?.rules.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Clock className="w-12 h-12 text-muted-foreground/40 mb-3" />
              <p className="font-medium text-muted-foreground">No pricing rules yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Create your first rule to automatically apply discounts at certain times</p>
              <Button className="mt-4" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Create First Rule</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rulesData.rules.map(rule => {
              const days = rule.daysOfWeek.split(",").map(Number);
              const isActive = rule.isActive === "true";
              const product = productsData?.items?.find(p => p.id === rule.productId);
              const category = categoriesData?.find((c: { id: number; name: string }) => c.id === rule.categoryId);
              return (
                <Card key={rule.id} className={`transition-opacity ${isActive ? "" : "opacity-60"}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{rule.name}</p>
                          {rule.label && <Badge variant="secondary" className="text-[10px]">{rule.label}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {rule.discountType === "percent" ? `${rule.discountValue}% off` : `${formatCurrency(rule.discountValue)} off`}
                          {product ? ` · ${product.name}` : category ? ` · ${category.name} (all)` : " · All products"}
                        </p>
                      </div>
                      <Switch checked={isActive} onCheckedChange={v => toggleMutation.mutate({ id: rule.id, isActive: v })} />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">{rule.startTime} – {rule.endTime}</span>
                      <div className="flex gap-0.5 ml-1">
                        {DAY_LABELS.map((d, i) => (
                          <span key={i} className={`text-[10px] px-1 py-0.5 rounded font-medium ${days.includes(i + 1) ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground"}`}>{d}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(rule)}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(rule.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setFormTouched(false); setDialogOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Pricing Rule" : "New Pricing Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Rule Name</Label>
                <Input value={form.name} onChange={e => { setFormTouched(true); setForm(f => ({ ...f, name: e.target.value })); }} placeholder="e.g. Happy Hour" className="mt-1" />
              </div>
              <div>
                <Label>Discount Type</Label>
                <Select value={form.discountType} onValueChange={v => { setFormTouched(true); setForm(f => ({ ...f, discountType: v as "percent" | "fixed" })); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discount Value</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{form.discountType === "percent" ? "%" : "$"}</span>
                  <Input type="number" min={0} max={form.discountType === "percent" ? 100 : undefined}
                    value={form.discountValue} onChange={e => { setFormTouched(true); setForm(f => ({ ...f, discountValue: parseFloat(e.target.value) || 0 })); }}
                    className="pl-7" />
                </div>
              </div>
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={form.startTime} onChange={e => { setFormTouched(true); setForm(f => ({ ...f, startTime: e.target.value })); }} className="mt-1" />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={form.endTime} onChange={e => { setFormTouched(true); setForm(f => ({ ...f, endTime: e.target.value })); }} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Applies On</Label>
                <div className="flex gap-1.5 mt-1.5">
                  {DAY_LABELS.map((d, i) => (
                    <button key={i} type="button"
                      className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${activeDays.includes(i + 1) ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                      onClick={() => { setFormTouched(true); toggleDay(i + 1); }}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Product (optional)</Label>
                <Select value={String(form.productId ?? "")} onValueChange={v => { setFormTouched(true); setForm(f => ({ ...f, productId: v ? Number(v) : null, categoryId: v ? null : f.categoryId })); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="All products" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All products</SelectItem>
                    {productsData?.items?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category (optional)</Label>
                <Select value={String(form.categoryId ?? "")} onValueChange={v => { setFormTouched(true); setForm(f => ({ ...f, categoryId: v ? Number(v) : null, productId: v ? null : f.productId })); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="All categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All categories</SelectItem>
                    {categoriesData?.map((c: { id: number; name: string }) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Display Label (optional)</Label>
                <Input value={form.label} onChange={e => { setFormTouched(true); setForm(f => ({ ...f, label: e.target.value })); }} placeholder="e.g. Happy Hour — shown on receipt" className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFormTouched(false); setDialogOpen(false); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate({ ...form, ...(editingId ? { id: editingId } : {}) })}
              disabled={!form.name || form.discountValue <= 0 || !form.daysOfWeek || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : editingId ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PricingRuleFormGuard />
    </AppLayout>
  );
}
