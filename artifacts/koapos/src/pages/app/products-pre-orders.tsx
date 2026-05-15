import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListProducts, useListCustomers } from "@workspace/api-client-react";
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
type PreOrder = { id: number; poNumber: string; customerName: string; productName: string; quantity: number; depositAmount: number; status: PreOrderStatus; expectedDate: string; notes: string; createdAt: string };

let nextId = 1;
const STATUS_COLORS: Record<PreOrderStatus, string> = { Pending: "secondary", Confirmed: "outline", Ready: "default", Collected: "secondary", Cancelled: "destructive" };

export default function ProductsPreOrdersPage() {
  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ customerId: "", productId: "", quantity: "1", depositAmount: "", expectedDate: "", notes: "", status: "Pending" as PreOrderStatus });

  const { data: productsData } = useListProducts({ limit: 500 });
  const { data: customersData } = useListCustomers({ limit: 500 });
  const products = productsData?.items ?? [];
  const customers = Array.isArray(customersData?.items) ? customersData.items : [];

  const filtered = orders.filter((o) =>
    o.customerName.toLowerCase().includes(search.toLowerCase()) ||
    o.productName.toLowerCase().includes(search.toLowerCase()) ||
    o.poNumber.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    if (!form.customerId || !form.productId) { toast.error("Customer and product are required"); return; }
    const customer = customers.find((c) => String(c.id) === form.customerId);
    const product = products.find((p) => String(p.id) === form.productId);
    const po: PreOrder = {
      id: nextId,
      poNumber: `PRE-${String(nextId++).padStart(4, "0")}`,
      customerName: `${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim(),
      productName: product?.name ?? "",
      quantity: parseInt(form.quantity) || 1,
      depositAmount: parseFloat(form.depositAmount) || 0,
      status: form.status,
      expectedDate: form.expectedDate,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    };
    setOrders((prev) => [po, ...prev]);
    toast.success(`${po.poNumber} created`);
    setDialogOpen(false);
    setForm({ customerId: "", productId: "", quantity: "1", depositAmount: "", expectedDate: "", notes: "", status: "Pending" });
  };

  const deleteOrder = (id: number) => { setOrders((prev) => prev.filter((o) => o.id !== id)); toast.success("Pre-order deleted"); };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Pre-Orders</h1>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Pre-Order</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search pre-orders..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Clock className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No pre-orders yet</p><p className="text-muted-foreground text-sm">Accept pre-orders for products not yet in stock.</p></div>
            <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Pre-Order</Button>
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
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((o) => (
                  <tr key={o.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-xs">{o.poNumber}</td>
                    <td className="p-3 font-medium">{o.customerName}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{o.productName}</td>
                    <td className="p-3 text-right hidden md:table-cell">{o.quantity}</td>
                    <td className="p-3 text-right hidden lg:table-cell">{formatCurrency(o.depositAmount)}</td>
                    <td className="p-3"><Badge variant={STATUS_COLORS[o.status] as "default"|"secondary"|"outline"|"destructive"}>{o.status}</Badge></td>
                    <td className="p-3"><div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteOrder(o.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Pre-Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}</SelectItem>)}</SelectContent>
              </Select>
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
            <div className="space-y-1.5">
              <Label>Expected Date</Label>
              <Input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Create Pre-Order</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
