import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListLoanerDevices,
  useCreateLoanerDevice,
  useUpdateLoanerDevice,
  useDeleteLoanerDevice,
  getListLoanerDevicesQueryKey,
  type LoanerDevice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Smartphone, Plus, Loader2, Trash2, ArrowRightLeft, RotateCcw, AlertTriangle } from "lucide-react";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  on_loan:   { label: "On loan",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  retired:   { label: "Retired",   cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

export default function ManagementLoanersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useListLoanerDevices({ query: { queryKey: getListLoanerDevicesQueryKey() } });
  const create = useCreateLoanerDevice();
  const update = useUpdateLoanerDevice();
  const remove = useDeleteLoanerDevice();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListLoanerDevicesQueryKey() });

  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [issuing, setIssuing] = useState<LoanerDevice | null>(null);
  const [issueCustomerId, setIssueCustomerId] = useState("");
  const [issueDueBack, setIssueDueBack] = useState("");
  const [issueCondition, setIssueCondition] = useState("");

  const items = data?.items ?? [];
  const onLoan = items.filter((l) => l.status === "on_loan");
  const overdue = onLoan.filter((l) => l.dueBackAt && new Date(l.dueBackAt).getTime() < Date.now());

  const addLoaner = async () => {
    if (!name.trim()) { toast.error("Enter a device name"); return; }
    try {
      await create.mutateAsync({ data: { name: name.trim(), identifier: identifier.trim() || undefined } as never });
      invalidate(); setName(""); setIdentifier(""); toast.success("Loaner registered");
    } catch { toast.error("Couldn't register loaner"); }
  };

  const doIssue = async () => {
    if (!issuing) return;
    if (!issueCustomerId) { toast.error("Select a customer"); return; }
    try {
      await update.mutateAsync({ id: issuing.id, data: {
        action: "issue",
        assignedCustomerId: Number(issueCustomerId),
        dueBackAt: issueDueBack ? new Date(issueDueBack).toISOString() : null,
        conditionOut: issueCondition.trim() || undefined,
      } as never });
      invalidate(); setIssuing(null); setIssueCustomerId(""); setIssueDueBack(""); setIssueCondition("");
      toast.success("Loaner issued");
    } catch { toast.error("Couldn't issue loaner"); }
  };

  const doReturn = async (l: LoanerDevice) => {
    try { await update.mutateAsync({ id: l.id, data: { action: "return" } as never }); invalidate(); toast.success("Loaner returned"); }
    catch { toast.error("Couldn't return loaner"); }
  };

  const del = async (l: LoanerDevice) => {
    if (!confirm(`Delete loaner "${l.name}"?`)) return;
    try { await remove.mutateAsync({ id: l.id }); invalidate(); toast.success("Loaner deleted"); }
    catch { toast.error("Couldn't delete loaner"); }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <Smartphone className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Loaner Devices</h1>
            <p className="text-sm text-muted-foreground">Track courtesy devices lent to customers during repairs.</p>
          </div>
        </div>

        {overdue.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <strong>{overdue.length}</strong> loaner{overdue.length !== 1 ? "s" : ""} overdue for return.
            </p>
          </div>
        )}

        {/* Register */}
        <div className="rounded-xl border bg-card p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Device name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Loaner iPhone 12" className="h-9 w-56" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Serial / asset tag</Label>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Optional" className="h-9 w-48" />
          </div>
          <Button onClick={addLoaner} disabled={create.isPending} className="gap-1.5 h-9">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Register loaner
          </Button>
        </div>

        {/* List */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {isLoading ? (
            <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="py-14 text-center text-sm text-muted-foreground">Couldn't load loaners. <button className="text-primary underline" onClick={() => refetch()}>Retry</button></div>
          ) : items.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">No loaner devices yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Device</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">With</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Due back</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => {
                  const meta = STATUS_META[l.status] ?? STATUS_META.available;
                  const isOverdue = l.dueBackAt && l.status === "on_loan" && new Date(l.dueBackAt).getTime() < Date.now();
                  return (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <p className="font-medium">{l.name}</p>
                        {l.identifier && <p className="text-xs text-muted-foreground font-mono">{l.identifier}</p>}
                      </td>
                      <td className="px-5 py-3"><Badge variant="outline" className={cn("text-xs", meta.cls)}>{meta.label}</Badge></td>
                      <td className="px-5 py-3 text-muted-foreground">{l.assignedCustomerName ?? "—"}</td>
                      <td className={cn("px-5 py-3", isOverdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
                        {l.dueBackAt ? new Date(l.dueBackAt).toLocaleDateString("en-AU") : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {l.status === "on_loan" ? (
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => doReturn(l)}>
                              <RotateCcw className="w-3.5 h-3.5" /> Return
                            </Button>
                          ) : l.status === "available" ? (
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setIssuing(l)}>
                              <ArrowRightLeft className="w-3.5 h-3.5" /> Issue
                            </Button>
                          ) : null}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => del(l)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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

      {/* Issue dialog */}
      <Dialog open={!!issuing} onOpenChange={(v) => { if (!v) setIssuing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Issue {issuing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer</Label>
              <CustomerSearchInput value={issueCustomerId} onChange={setIssueCustomerId} placeholder="Search customer..." invalid={!issueCustomerId} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Due back</Label>
              <Input type="date" value={issueDueBack} onChange={(e) => setIssueDueBack(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Condition when issued</Label>
              <Input value={issueCondition} onChange={(e) => setIssueCondition(e.target.value)} placeholder="e.g. No marks, charger included" className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssuing(null)}>Cancel</Button>
            <Button onClick={doIssue} disabled={update.isPending}>
              {update.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Issue loaner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
