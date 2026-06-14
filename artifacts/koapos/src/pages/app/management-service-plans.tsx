import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListServicePlans,
  useCreateServicePlan,
  useUpdateServicePlan,
  useBillServicePlan,
  useDeleteServicePlan,
  getListServicePlansQueryKey,
  type ServicePlan,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { formatCurrency, cn } from "@/lib/utils";
import { Repeat, Plus, Loader2, Trash2, Receipt, Pause, Play, Ban } from "lucide-react";
import { toast } from "sonner";

const CYCLE_LABEL: Record<string, string> = {
  weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  active:    { label: "Active",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  paused:    { label: "Paused",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
  cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

export default function ManagementServicePlansPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useListServicePlans({ query: { queryKey: getListServicePlansQueryKey() } });
  const create = useCreateServicePlan();
  const update = useUpdateServicePlan();
  const bill = useBillServicePlan();
  const remove = useDeleteServicePlan();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListServicePlansQueryKey() });

  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [sla, setSla] = useState("");

  const items = data?.items ?? [];
  const mrr = items.filter((p) => p.status === "active").reduce((s, p) => {
    const f = p.feeAmount;
    const perMonth = p.billingCycle === "weekly" ? f * 52 / 12 : p.billingCycle === "fortnightly" ? f * 26 / 12
      : p.billingCycle === "quarterly" ? f / 3 : p.billingCycle === "yearly" ? f / 12 : f;
    return s + perMonth;
  }, 0);

  const reset = () => { setCustomerId(""); setName(""); setFee(""); setCycle("monthly"); setSla(""); };

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a plan name"); return; }
    try {
      await create.mutateAsync({ data: {
        customerId: customerId ? Number(customerId) : undefined,
        name: name.trim(), feeAmount: parseFloat(fee) || 0, billingCycle: cycle,
        slaHours: sla ? Number(sla) : undefined,
      } as never });
      invalidate(); reset(); setOpen(false); toast.success("Service plan created");
    } catch { toast.error("Couldn't create plan"); }
  };

  const setStatus = async (p: ServicePlan, status: string) => {
    try { await update.mutateAsync({ id: p.id, data: { status } as never }); invalidate(); }
    catch { toast.error("Couldn't update plan"); }
  };
  const billNow = async (p: ServicePlan) => {
    try { const r = await bill.mutateAsync({ id: p.id }); invalidate(); toast.success(`Invoice ${(r as { invoiceNumber?: string })?.invoiceNumber ?? ""} created`); }
    catch { toast.error("Couldn't generate invoice"); }
  };
  const del = async (p: ServicePlan) => {
    if (!confirm(`Delete plan "${p.name}"?`)) return;
    try { await remove.mutateAsync({ id: p.id }); invalidate(); }
    catch { toast.error("Couldn't delete plan"); }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Repeat className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Service Plans</h1>
              <p className="text-sm text-muted-foreground">Managed-service contracts &amp; retainers with recurring billing and SLAs.</p>
            </div>
          </div>
          <Button className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> New plan</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-primary/5 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly Recurring Revenue</p>
            <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(mrr)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Plans</p>
            <p className="text-2xl font-bold mt-1">{items.filter((p) => p.status === "active").length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Plans</p>
            <p className="text-2xl font-bold mt-1">{items.length}</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          {isLoading ? (
            <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="py-14 text-center text-sm text-muted-foreground">Couldn't load plans. <button className="text-primary underline" onClick={() => refetch()}>Retry</button></div>
          ) : items.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">No service plans yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Plan</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Fee</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Cycle</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Next bill</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">SLA</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const meta = STATUS_META[p.status] ?? STATUS_META.active;
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.customerName ?? "—"}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(p.feeAmount)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{CYCLE_LABEL[p.billingCycle] ?? p.billingCycle}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.nextBillDate ?? "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.slaHours != null ? `${p.slaHours}h` : "—"}</td>
                      <td className="px-5 py-3"><Badge variant="outline" className={cn("text-xs", meta.cls)}>{meta.label}</Badge></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {p.status === "active" && (
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => billNow(p)} disabled={bill.isPending}>
                              <Receipt className="w-3.5 h-3.5" /> Bill now
                            </Button>
                          )}
                          {p.status === "active" ? (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Pause" onClick={() => setStatus(p, "paused")}><Pause className="w-3.5 h-3.5" /></Button>
                          ) : p.status === "paused" ? (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Resume" onClick={() => setStatus(p, "active")}><Play className="w-3.5 h-3.5" /></Button>
                          ) : null}
                          {p.status !== "cancelled" && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" title="Cancel" onClick={() => setStatus(p, "cancelled")}><Ban className="w-3.5 h-3.5" /></Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => del(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); reset(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New service plan</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5"><Label className="text-xs">Customer</Label>
              <CustomerSearchInput value={customerId} onChange={setCustomerId} placeholder="Search customer..." /></div>
            <div className="space-y-1.5"><Label className="text-xs">Plan name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Business IT Care — 10 devices" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Fee</Label>
                <Input type="number" min={0} step={0.01} value={fee} onChange={(e) => setFee(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Billing cycle</Label>
                <Select value={cycle} onValueChange={setCycle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CYCLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Response SLA (hours, optional)</Label>
              <Input type="number" min={0} value={sla} onChange={(e) => setSla(e.target.value)} placeholder="e.g. 4" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
