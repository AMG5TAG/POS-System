import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProductReturnAuths,
  useCreateProductReturnAuth,
  useUpdateProductReturnAuth,
  useDeleteProductReturnAuth,
  getListProductReturnAuthsQueryKey,
} from "@workspace/api-client-react";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, RotateCcw, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type RAStatus = "Pending" | "Approved" | "Rejected" | "Completed";

const STATUS_COLORS: Record<RAStatus, string> = {
  Pending: "secondary",
  Approved: "default",
  Rejected: "destructive",
  Completed: "outline",
};

const emptyForm = () => ({
  customerId: "",
  customerName: "",
  reason: "",
  items: "",
  refundAmount: "",
  notes: "",
  status: "Pending" as RAStatus,
});

export default function ProductsReturnAuthPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());

  const { data, isLoading } = useListProductReturnAuths({ search: search || undefined });
  const returns = data?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProductReturnAuthsQueryKey() });

  const createMutation = useCreateProductReturnAuth({ mutation: { onSuccess: () => { invalidate(); } } });
  const updateMutation = useUpdateProductReturnAuth({ mutation: { onSuccess: () => { invalidate(); } } });
  const deleteMutation = useDeleteProductReturnAuth({ mutation: { onSuccess: () => { invalidate(); } } });

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (r: (typeof returns)[0]) => {
    setEditingId(r.id);
    setForm({
      customerId: r.customerId ? String(r.customerId) : "",
      customerName: r.customerName,
      reason: r.reason ?? "",
      items: r.items,
      refundAmount: r.refundAmount ? String(r.refundAmount) : "",
      notes: r.notes ?? "",
      status: r.status as RAStatus,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.customerId && !form.customerName) { toast.error("Customer is required"); return; }
    if (!form.items) { toast.error("Describe the items being returned"); return; }

    const payload = {
      customerId: form.customerId ? parseInt(form.customerId) : undefined,
      customerName: form.customerName,
      reason: form.reason || undefined,
      items: form.items,
      refundAmount: parseFloat(form.refundAmount) || 0,
      status: form.status,
      notes: form.notes || undefined,
    };

    if (editingId !== null) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => { toast.success("Return authorisation updated"); setDialogOpen(false); },
          onError: () => toast.error("Failed to update return authorisation"),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: (r) => { toast.success(`${r.raNumber} created`); setDialogOpen(false); setForm(emptyForm()); },
          onError: () => toast.error("Failed to create return authorisation"),
        },
      );
    }
  };

  const handleDelete = (id: number, raNumber: string) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => toast.success(`${raNumber} deleted`),
        onError: () => toast.error("Failed to delete return authorisation"),
      },
    );
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <RotateCcw className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Return Authorisations</h1>
              <p className="text-sm text-muted-foreground">Create and manage return authorisation requests from customers.</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Return</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search returns..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <Card><CardContent className="flex items-center justify-center py-16">
            <p className="text-muted-foreground text-sm">Loading return authorisations…</p>
          </CardContent></Card>
        ) : returns.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <RotateCcw className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No return authorisations yet</p><p className="text-muted-foreground text-sm">Create RAs to manage customer product returns.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Return</Button>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">RA Number</th>
                  <th className="text-left p-3 font-medium">Customer</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Items</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Reason</th>
                  <th className="text-right p-3 font-medium hidden lg:table-cell">Refund</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Date</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {returns.map((r) => (
                  <tr key={r.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-xs">{r.raNumber}</td>
                    <td className="p-3 font-medium">{r.customerName}</td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground max-w-[180px] truncate">{r.items}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{r.reason || "—"}</td>
                    <td className="p-3 text-right hidden lg:table-cell">{formatCurrency(r.refundAmount)}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_COLORS[r.status as RAStatus] as "default" | "secondary" | "outline" | "destructive"}>{r.status}</Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(r.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id, r.raNumber)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId !== null ? "Edit Return Authorisation" : "New Return Authorisation"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <CustomerSearchInput
                value={form.customerId}
                onChange={(id, c) => setForm({
                  ...form,
                  customerId: id,
                  customerName: c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : "",
                })}
                placeholder="Select customer"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Items Being Returned</Label>
              <Input value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} placeholder="e.g. iPhone case × 1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {["Faulty", "Wrong item", "Change of mind", "Damaged in transit", "Other"].map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as RAStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Pending", "Approved", "Rejected", "Completed"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Refund Amount ($)</Label>
              <Input type="number" step="0.01" value={form.refundAmount} onChange={(e) => setForm({ ...form, refundAmount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving…" : editingId !== null ? "Save Changes" : "Create RA"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
