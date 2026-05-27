import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProductRecalls,
  useCreateProductRecall,
  useUpdateProductRecall,
  useDeleteProductRecall,
  getListProductRecallsQueryKey,
} from "@workspace/api-client-react";
import { useListProducts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { Plus, AlertTriangle, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Severity = "Low" | "Medium" | "High" | "Critical";
type RecallStatus = "Active" | "Resolved" | "Monitoring";

const SEV_COLORS: Record<Severity, string> = { Low: "secondary", Medium: "outline", High: "outline", Critical: "destructive" };
const SEV_TEXT: Record<Severity, string> = { Low: "text-green-600", Medium: "text-amber-600", High: "text-orange-600", Critical: "text-red-600" };

const emptyForm = () => ({
  productId: "",
  customProductName: "",
  reason: "",
  severity: "Medium" as Severity,
  status: "Active" as RecallStatus,
  affectedBatch: "",
  notes: "",
});

export default function ProductsRecallsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());

  const { data, isLoading } = useListProductRecalls({ search: search || undefined });
  const recalls = data?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProductRecallsQueryKey() });

  const createMutation = useCreateProductRecall({ mutation: { onSuccess: () => { invalidate(); } } });
  const updateMutation = useUpdateProductRecall({ mutation: { onSuccess: () => { invalidate(); } } });
  const deleteMutation = useDeleteProductRecall({ mutation: { onSuccess: () => { invalidate(); } } });

  const { data: productsData } = useListProducts({ limit: 500 });
  const products = productsData?.items ?? [];

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (r: (typeof recalls)[0]) => {
    setEditingId(r.id);
    setForm({
      productId: r.productId ? String(r.productId) : "",
      customProductName: r.productName,
      reason: r.reason,
      severity: r.severity as Severity,
      status: r.status as RecallStatus,
      affectedBatch: r.affectedBatch ?? "",
      notes: r.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const product = products.find((p) => String(p.id) === form.productId);
    const productName = product?.name ?? form.customProductName;
    if (!productName) { toast.error("Product is required"); return; }
    if (!form.reason) { toast.error("Reason is required"); return; }

    const payload = {
      productId: form.productId ? parseInt(form.productId) : undefined,
      productName,
      reason: form.reason,
      severity: form.severity,
      status: form.status,
      affectedBatch: form.affectedBatch || undefined,
      notes: form.notes || undefined,
    };

    if (editingId !== null) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => { toast.success("Recall updated"); setDialogOpen(false); },
          onError: () => toast.error("Failed to update recall"),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: (r) => { toast.success(`${r.recallId} recorded`); setDialogOpen(false); setForm(emptyForm()); },
          onError: () => toast.error("Failed to log recall"),
        },
      );
    }
  };

  const handleDelete = (id: number, recallId: string) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => toast.success(`${recallId} deleted`),
        onError: () => toast.error("Failed to delete recall"),
      },
    );
  };

  const activeCount = recalls.filter((r) => r.status === "Active").length;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Product Recalls</h1>
              <p className="text-sm text-muted-foreground">Record and manage product recall notices and affected stock.</p>
              {activeCount > 0 && <p className="text-sm text-amber-600 font-medium">{activeCount} active recall{activeCount !== 1 ? "s" : ""}</p>}
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Log Recall</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search recalls..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <Card><CardContent className="flex items-center justify-center py-16">
            <p className="text-muted-foreground text-sm">Loading recalls…</p>
          </CardContent></Card>
        ) : recalls.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <AlertTriangle className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No recalls recorded</p><p className="text-muted-foreground text-sm">Log product recalls or safety alerts here.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Log Recall</Button>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Reference</th>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Reason</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Severity</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Batch</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Date</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {recalls.map((r) => (
                  <tr key={r.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-xs">{r.recallId}</td>
                    <td className="p-3 font-medium">{r.productName}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground max-w-[200px] truncate">{r.reason}</td>
                    <td className="p-3 hidden md:table-cell">
                      <span className={`font-medium text-xs ${SEV_TEXT[r.severity as Severity]}`}>{r.severity}</span>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground">{r.affectedBatch || "—"}</td>
                    <td className="p-3">
                      <Badge variant={SEV_COLORS[r.severity as Severity] as "default" | "secondary" | "outline" | "destructive"}>{r.status}</Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(r.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id, r.recallId)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
          <DialogHeader><DialogTitle>{editingId !== null ? "Edit Recall" : "Log Product Recall"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={form.productId} onValueChange={(v) => setForm({ ...form, productId: v, customProductName: "" })}>
                <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!form.productId && (
              <div className="space-y-1.5">
                <Label>Or enter product name manually</Label>
                <Input value={form.customProductName} onChange={(e) => setForm({ ...form, customProductName: e.target.value })} placeholder="Product name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Reason for Recall *</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Safety hazard, contamination..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as Severity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Low", "Medium", "High", "Critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as RecallStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Active", "Monitoring", "Resolved"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Affected Batch / Lot</Label>
              <Input value={form.affectedBatch} onChange={(e) => setForm({ ...form, affectedBatch: e.target.value })} placeholder="e.g. LOT2024-01" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving…" : editingId !== null ? "Save Changes" : "Log Recall"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
