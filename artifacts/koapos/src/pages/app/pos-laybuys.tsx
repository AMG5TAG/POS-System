import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListCustomers, useListProducts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Package2, Search, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type LaybyStatus = "Active" | "Collected" | "Cancelled";
type LaybyItem = { productId: number; name: string; quantity: number; price: number };
type Layby = { id: number; reference: string; customerName: string; items: LaybyItem[]; depositPaid: number; totalAmount: number; balance: number; status: LaybyStatus; createdAt: string; nextPaymentDate: string };

let nextId = 1;
const STATUS_COLORS: Record<LaybyStatus, "default" | "secondary" | "destructive" | "outline"> = { Active: "outline", Collected: "default", Cancelled: "destructive" };

export default function POSLaybuysPage() {
  const [laybys, setLaybys] = useState<Layby[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [form, setForm] = useState({ customerId: "", depositAmount: "", nextPaymentDate: "" });
  const [selectedItems, setSelectedItems] = useState<LaybyItem[]>([]);

  const { data: customersData } = useListCustomers({ limit: 500 });
  const { data: productsData } = useListProducts({ limit: 500 });
  const customers = customersData?.items ?? [];
  const products = (productsData?.items ?? []).filter((p) => p.name?.toLowerCase().includes(productSearch.toLowerCase()));

  const addProduct = (p: { id: number; name?: string | null; price?: number | null }) => {
    if (selectedItems.find((i) => i.productId === p.id)) return;
    setSelectedItems((prev) => [...prev, { productId: p.id, name: p.name ?? "", quantity: 1, price: p.price ?? 0 }]);
  };
  const updateQty = (productId: number, qty: number) => setSelectedItems((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i));
  const removeItem = (productId: number) => setSelectedItems((prev) => prev.filter((i) => i.productId !== productId));

  const total = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);

  const handleSave = () => {
    if (!form.customerId) { toast.error("Customer is required"); return; }
    if (!selectedItems.length) { toast.error("Add at least one product"); return; }
    const deposit = parseFloat(form.depositAmount) || 0;
    const customer = customers.find((c) => String(c.id) === form.customerId);
    const layby: Layby = {
      id: nextId,
      reference: `LB-${String(nextId++).padStart(4, "0")}`,
      customerName: `${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim(),
      items: selectedItems,
      depositPaid: deposit,
      totalAmount: total,
      balance: total - deposit,
      status: "Active",
      createdAt: new Date().toISOString(),
      nextPaymentDate: form.nextPaymentDate,
    };
    setLaybys((prev) => [layby, ...prev]);
    toast.success(`${layby.reference} created`);
    setDialogOpen(false);
    setForm({ customerId: "", depositAmount: "", nextPaymentDate: "" });
    setSelectedItems([]);
  };

  const collect = (id: number) => { setLaybys((p) => p.map((l) => l.id === id ? { ...l, status: "Collected", balance: 0 } : l)); toast.success("Layby collected"); };
  const cancel = (id: number) => { setLaybys((p) => p.map((l) => l.id === id ? { ...l, status: "Cancelled" } : l)); toast.success("Layby cancelled"); };

  const filtered = laybys.filter((l) =>
    l.reference.toLowerCase().includes(search.toLowerCase()) ||
    l.customerName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Laybuys</h1>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Layby</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search laybys..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Package2 className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No laybys yet</p><p className="text-muted-foreground text-sm">Allow customers to reserve items with a deposit and pay over time.</p></div>
            <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Layby</Button>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((l) => (
              <Card key={l.id} className={l.status !== "Active" ? "opacity-60" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{l.reference}</p>
                      <p className="font-semibold">{l.customerName}</p>
                    </div>
                    <Badge variant={STATUS_COLORS[l.status]}>{l.status}</Badge>
                  </div>
                  <div className="space-y-0.5 text-sm text-muted-foreground">
                    {l.items.map((i) => <p key={i.productId}>× {i.quantity} {i.name}</p>)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                    <div><p className="text-xs text-muted-foreground">Total</p><p className="font-medium">{formatCurrency(l.totalAmount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-medium text-primary">{formatCurrency(l.balance)}</p></div>
                  </div>
                  {l.status === "Active" && (
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => collect(l.id)}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Collect</Button>
                      <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => cancel(l.id)}>Cancel</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Layby</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <Label>Products</Label>
              <Input placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
              <div className="max-h-36 overflow-y-auto space-y-1">
                {products.slice(0, 10).map((p) => (
                  <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-1.5 rounded hover:bg-muted text-sm flex justify-between">
                    <span>{p.name}</span><span className="text-muted-foreground">{formatCurrency(p.price ?? 0)}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedItems.length > 0 && (
              <div className="border rounded-lg divide-y">
                {selectedItems.map((i) => (
                  <div key={i.productId} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm">{i.name}</span>
                    <Input type="number" min={1} value={i.quantity} onChange={(e) => updateQty(i.productId, parseInt(e.target.value) || 1)} className="w-16 h-7 text-center" />
                    <span className="w-20 text-right text-sm">{formatCurrency(i.price * i.quantity)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(i.productId)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 font-semibold text-sm bg-muted/30">
                  <span>Total</span><span>{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Deposit Amount ($)</Label>
                <Input type="number" step="0.01" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Next Payment Date</Label>
                <Input type="date" value={form.nextPaymentDate} onChange={(e) => setForm({ ...form, nextPaymentDate: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Create Layby</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
