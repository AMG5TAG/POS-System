import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProductPreOrders,
  useCreateProductPreOrder,
  useUpdateProductPreOrder,
  useDeleteProductPreOrder,
  getListProductPreOrdersQueryKey,
} from "@workspace/api-client-react";
import { useListProducts } from "@workspace/api-client-react";
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
import { Plus, Clock, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type PreOrderStatus = "Pending" | "Confirmed" | "Ready" | "Collected" | "Cancelled";

const STATUS_COLORS: Record<PreOrderStatus, string> = {
  Pending: "secondary",
  Confirmed: "outline",
  Ready: "default",
  Collected: "secondary",
  Cancelled: "destructive",
};

const emptyForm = () => ({
  customerId: "",
  customerName: "",
  productId: "",
  quantity: "1",
  depositAmount: "",
  expectedDate: "",
  notes: "",
  status: "Pending" as PreOrderStatus,
});

export default function ProductsPreOrdersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());

  const { data, isLoading } = useListProductPreOrders({ search: search || undefined });
  const orders = data?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProductPreOrdersQueryKey() });

  const createMutation = useCreateProductPreOrder({ mutation: { onSuccess: () => { invalidate(); } } });
  const updateMutation = useUpdateProductPreOrder({ mutation: { onSuccess: () => { invalidate(); } } });
  const deleteMutation = useDeleteProductPreOrder({ mutation: { onSuccess: () => { invalidate(); } } });

  const { data: productsData } = useListProducts({ limit: 500 });
  const products = productsData?.items ?? [];

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (o: (typeof orders)[0]) => {
    setEditingId(o.id);
    setForm({
      customerId: o.customerId ? String(o.customerId) : "",
      customerName: o.customerName,
      productId: o.productId ? String(o.productId) : "",
      quantity: String(o.quantity),
      depositAmount: o.depositAmount ? String(o.depositAmount) : "",
      expectedDate: o.expectedDate ?? "",
      notes: o.notes ?? "",
      status: o.status as PreOrderStatus,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.customerId && !form.customerName) { toast.error("Customer is required"); return; }
    const product = products.find((p) => String(p.id) === form.productId);
    const productName = product?.name ?? "";
    if (!productName && !form.productId) { toast.error("Product is required"); return; }

    const payload = {
      customerId: form.customerId ? parseInt(form.customerId) : undefined,
      customerName: form.customerName,
      productId: form.productId ? parseInt(form.productId) : undefined,
      productName,
      quantity: parseInt(form.quantity) || 1,
      depositAmount: parseFloat(form.depositAmount) || 0,
      status: form.status,
      expectedDate: form.expectedDate || undefined,
      notes: form.notes || undefined,
    };

    if (editingId !== null) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => { toast.success("Pre-order updated"); setDialogOpen(false); },
          onError: () => toast.error("Failed to update pre-order"),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: (o) => { toast.success(`${o.poNumber} created`); setDialogOpen(false); setForm(emptyForm()); },
          onError: () => toast.error("Failed to create pre-order"),
        },
      );
    }
  };

  const handleDelete = (id: number, poNumber: string) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => toast.success(`${poNumber} deleted`),
        onError: () => toast.error("Failed to delete pre-order"),
      },
    );
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Pre-Orders</h1>
              <p className="text-sm text-muted-foreground">Manage customer pre-orders and deposits for upcoming stock arrivals.</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Pre-Order</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search pre-orders..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <Card><CardContent className="flex items-center justify-center py-16">
            <p className="text-muted-foreground text-sm">Loading pre-orders…</p>
          </CardContent></Card>
        ) : orders.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Clock className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No pre-orders yet</p><p className="text-muted-foreground text-sm">Accept pre-orders for products not yet in stock.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Pre-Order</Button>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Reference</th>
                  <th className="text-left p-3 font-medium">Customer</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Product</th>
                  <th className="text-right p-3 font-medium hidden md:table-cell">Qty</th>
                  <th className="text-right p-3 font-medium hidden lg:table-cell">Deposit</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Date</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((o) => (
                  <tr key={o.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-xs">{o.poNumber}</td>
                    <td className="p-3 font-medium">{o.customerName}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{o.productName}</td>
                    <td className="p-3 text-right hidden md:table-cell">{o.quantity}</td>
                    <td className="p-3 text-right hidden lg:table-cell">{formatCurrency(o.depositAmount)}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_COLORS[o.status as PreOrderStatus] as "default" | "secondary" | "outline" | "destructive"}>{o.status}</Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(o.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(o.id, o.poNumber)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
          <DialogHeader><DialogTitle>{editingId !== null ? "Edit Pre-Order" : "New Pre-Order"}</DialogTitle></DialogHeader>
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
              <Label>Product</Label>
              <Select value={form.productId} onValueChange={(v) => setForm({ ...form, productId: v })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Deposit ($)</Label>
                <Input type="number" step="0.01" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PreOrderStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Pending", "Confirmed", "Ready", "Collected", "Cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expected Date</Label>
                <Input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving…" : editingId !== null ? "Save Changes" : "Create Pre-Order"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
