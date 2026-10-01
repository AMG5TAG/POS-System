import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProductPreOrders,
  useCreateProductPreOrder,
  useUpdateProductPreOrder,
  useDeleteProductPreOrder,
  getListProductPreOrdersQueryKey,
} from "@workspace/api-client-react";
import { useGetLaybySettings, getGetLaybySettingsQueryKey, type Product } from "@workspace/api-client-react";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { ProductSearchInput } from "@/components/products/ProductSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Clock, Search, Pencil, Trash2, X, ShoppingCart, PackageCheck, Truck, Ban, Package } from "lucide-react";
import { formatPreOrderDate } from "@/lib/pre-order";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* Statuses: a sale-made pre-order starts "Awaiting stock"; purchase-order
   receiving moves it to "Arrived"; the till (or these buttons) close it as
   "Collected" or "Shipped". Pending/Confirmed/Ready are the older manual ones. */
type PreOrderStatus = "Awaiting stock" | "Arrived" | "Collected" | "Shipped" | "Cancelled" | "Pending" | "Confirmed" | "Ready";
const EDITABLE_STATUSES: PreOrderStatus[] = ["Awaiting stock", "Arrived", "Collected", "Shipped", "Cancelled"];

const STATUS_TONE: Record<string, string> = {
  "Awaiting stock": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Confirmed: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Arrived: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Collected: "bg-muted text-muted-foreground",
  Shipped: "bg-muted text-muted-foreground",
  Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};
const AWAITING = new Set(["Awaiting stock", "Pending", "Confirmed"]);
const ARRIVED = new Set(["Arrived", "Ready"]);
const DONE = new Set(["Collected", "Shipped"]);
const FILTERS = [
  { key: "waiting", label: "Waiting for stock", match: (s: string) => AWAITING.has(s) },
  { key: "arrived", label: "Arrived", match: (s: string) => ARRIVED.has(s) },
  { key: "done", label: "Finished", match: (s: string) => DONE.has(s) },
  { key: "cancelled", label: "Cancelled", match: (s: string) => s === "Cancelled" },
  { key: "all", label: "All", match: () => true },
] as const;

/* The list API returns more than the generated type knows about. */
type Extra = {
  source?: string; receiptNumber?: string | null; collectedReceiptNumber?: string | null;
  totalAmount?: number; balanceOwing?: number; allocatedQuantity?: number;
  customerPhone?: string | null; arrivedAt?: string | null; notifiedAt?: string | null; collectedAt?: string | null;
};

type PreOrderProductRow = {
  id: number; name: string; sku: string | null; price: number; stockQuantity: number | null;
  preOrderReleaseDate: string | null; preOrderEtaDate: string | null; active: boolean;
  openOrders: number; unitsWaiting: number; unitsAllocated: number; unitsOnOrder: number;
};

// A product line in the form. unitPrice is a snapshot of the product's sell
// price at the time it was added, used for the total / deposit suggestion.
type FormItem = { productId: string; productName: string; quantity: number; unitPrice: number };

const emptyForm = () => ({
  customerId: "",
  customerName: "",
  depositAmount: "",
  expectedDate: "",
  notes: "",
  status: "Awaiting stock" as PreOrderStatus,
});

export default function ProductsPreOrdersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [items, setItems] = useState<FormItem[]>([]);
  // Bumped after each add so the "add product" search input remounts and clears.
  const [addKey, setAddKey] = useState(0);

  const [, navigate] = useLocation();
  const [view, setView] = useState<"orders" | "products">("orders");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("waiting");
  const { data, isLoading } = useListProductPreOrders({ search: search || undefined });
  const orders = (data?.items ?? []) as Array<NonNullable<typeof data>["items"][number] & Extra>;
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, orders.filter((o) => f.match(o.status)).length])), [orders]);
  const shown = orders.filter((o) => FILTERS.find((f) => f.key === filter)!.match(o.status));
  const { data: preOrderProducts, isLoading: productsLoading } = useQuery({
    queryKey: ["pre-orders", "products"],
    queryFn: async (): Promise<PreOrderProductRow[]> => {
      const r = await fetch("/api/pre-orders/products", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load pre-order products");
      return r.json();
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListProductPreOrdersQueryKey() });
    void queryClient.invalidateQueries({ queryKey: ["pre-orders", "products"] });
  };
  const setStatus = (o: { id: number; poNumber: string }, status: PreOrderStatus) => {
    updateMutation.mutate(
      { id: o.id, data: { status } as never },
      { onSuccess: () => toast.success(`${o.poNumber} marked ${status.toLowerCase()}`), onError: () => toast.error("Failed to update pre-order") },
    );
  };

  const createMutation = useCreateProductPreOrder({ mutation: { onSuccess: () => { invalidate(); } } });
  const updateMutation = useUpdateProductPreOrder({ mutation: { onSuccess: () => { invalidate(); } } });
  const deleteMutation = useDeleteProductPreOrder({ mutation: { onSuccess: () => { invalidate(); } } });

  const { data: laybySettings } = useGetLaybySettings({ query: { queryKey: getGetLaybySettingsQueryKey() } });

  /* Order total across all line items */
  const totalPrice = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

  /* Default deposit from the Laybys settings (Management → Staff & Operations → Sales Settings → Laybys) */
  const depositIsPercent = (laybySettings?.minimumDepositType ?? "percentage") === "percentage";
  const depositValue = laybySettings?.minimumDepositValue ?? 0;
  const suggestedDeposit = depositIsPercent ? (totalPrice * depositValue) / 100 : depositValue;

  const applySuggestedDeposit = () => {
    setForm((f) => ({ ...f, depositAmount: suggestedDeposit.toFixed(2) }));
  };

  const addProduct = (id: string, p: Product | null) => {
    if (!id || !p) return;
    setItems((prev) => {
      const existing = prev.find((it) => it.productId === id);
      if (existing) return prev.map((it) => (it.productId === id ? { ...it, quantity: it.quantity + 1 } : it));
      return [...prev, { productId: id, productName: p.name, quantity: 1, unitPrice: p.price ?? 0 }];
    });
    setAddKey((k) => k + 1);
  };

  const setItemQty = (idx: number, qty: number) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, qty || 1) } : it)));
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setItems([]); setDialogOpen(true); };
  const openEdit = (o: (typeof orders)[0]) => {
    setEditingId(o.id);
    setForm({
      customerId: o.customerId ? String(o.customerId) : "",
      customerName: o.customerName,
      depositAmount: o.depositAmount ? String(o.depositAmount) : "",
      expectedDate: o.expectedDate ?? "",
      notes: o.notes ?? "",
      status: o.status as PreOrderStatus,
    });
    setItems((o.items ?? []).map((it) => ({
      productId: it.productId ? String(it.productId) : "",
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice ?? 0,
    })));
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.customerId && !form.customerName) { toast.error("Customer is required"); return; }
    if (items.length === 0) { toast.error("Add at least one product"); return; }

    const payload = {
      customerId: form.customerId ? parseInt(form.customerId) : undefined,
      customerName: form.customerName,
      items: items.map((it) => ({
        productId: it.productId ? parseInt(it.productId) : undefined,
        productName: it.productName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
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
          onSuccess: (o) => { toast.success(`${o.poNumber} created`); setDialogOpen(false); setForm(emptyForm()); setItems([]); },
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
              <p className="text-sm text-muted-foreground">Every pre-order sold at the till or taken by hand, and the products on pre-order. Received stock is set aside for them oldest first.</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Pre-Order</Button>
        </div>

        <div className="flex rounded-lg border overflow-hidden w-fit">
          {([["orders", "Customer pre-orders"], ["products", "Pre-order products"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              className={cn("px-4 py-2 text-sm font-medium transition-colors", view === k ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>

        {view === "products" ? (
          <Card>
            <CardContent className="p-0">
              {productsLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : (preOrderProducts?.length ?? 0) === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground space-y-1">
                  <Package className="w-10 h-10 mx-auto text-muted-foreground/30" />
                  <p className="font-medium text-foreground">No pre-order products</p>
                  <p>Turn on "Sell as a pre-order" in a product's Stock tab, with its release and ETA dates, and it appears here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b text-left">
                      <tr>
                        <th className="p-3 font-medium">Product</th>
                        <th className="p-3 font-medium">Release</th>
                        <th className="p-3 font-medium">ETA</th>
                        <th className="p-3 font-medium text-right">Pre-orders</th>
                        <th className="p-3 font-medium text-right">Units waiting</th>
                        <th className="p-3 font-medium text-right">Set aside</th>
                        <th className="p-3 font-medium text-right">On order</th>
                        <th className="p-3 font-medium text-right">In stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preOrderProducts!.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="p-3">
                            <p className="font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.sku ?? ""} {formatCurrency(p.price)}</p>
                          </td>
                          <td className="p-3">
                            {p.preOrderReleaseDate ? formatPreOrderDate(p.preOrderReleaseDate) : <span className="text-muted-foreground">—</span>}
                            {!p.active && <span className="ml-1.5 text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Released</span>}
                          </td>
                          <td className="p-3">{p.preOrderEtaDate ? formatPreOrderDate(p.preOrderEtaDate) : <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-3 text-right tabular-nums">{p.openOrders}</td>
                          <td className="p-3 text-right tabular-nums font-medium">{p.unitsWaiting}</td>
                          <td className="p-3 text-right tabular-nums">{p.unitsAllocated}</td>
                          <td className={cn("p-3 text-right tabular-nums", p.unitsOnOrder < p.unitsWaiting - p.unitsAllocated && "text-amber-600 font-medium")}>{p.unitsOnOrder}</td>
                          <td className="p-3 text-right tabular-nums">{p.stockQuantity ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="p-3 text-xs text-muted-foreground border-t">"On order" is shown in amber when purchase orders don't yet cover the units customers are waiting for.</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border overflow-hidden">
                {FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={cn("px-3 py-1.5 text-xs font-medium transition-colors", filter === f.key ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>
                    {f.label} <span className="opacity-70 tabular-nums">({counts[f.key] ?? 0})</span>
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[14rem]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search pre-order number, customer or product…" className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} noPhoneFormat />
              </div>
            </div>

            {isLoading ? (
              <Card><CardContent className="flex items-center justify-center py-16">
                <p className="text-muted-foreground text-sm">Loading pre-orders…</p>
              </CardContent></Card>
            ) : shown.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Clock className="w-14 h-14 text-muted-foreground/30" />
                <p className="font-medium">{orders.length === 0 ? "No pre-orders yet" : "Nothing here"}</p>
                <p className="text-muted-foreground text-sm max-w-md">Selling a pre-order product at the till adds it here automatically, with the customer and sale.</p>
              </CardContent></Card>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b text-left">
                    <tr>
                      <th className="p-3 font-medium">Pre-order</th>
                      <th className="p-3 font-medium">Customer</th>
                      <th className="p-3 font-medium">Product</th>
                      <th className="p-3 font-medium">Sale</th>
                      <th className="p-3 font-medium">ETA</th>
                      <th className="p-3 font-medium text-right">Paid / owing</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shown.map((o) => {
                      const orderItems = o.items ?? [];
                      const qty = orderItems.length > 0 ? orderItems.reduce((s, it) => s + it.quantity, 0) : o.quantity;
                      const label = orderItems.length > 1 ? `${orderItems[0].productName} +${orderItems.length - 1} more` : (orderItems[0]?.productName ?? o.productName);
                      const owing = o.balanceOwing ?? 0;
                      const open = AWAITING.has(o.status) || ARRIVED.has(o.status);
                      return (
                        <tr key={o.id} className="bg-background hover:bg-muted/20 align-top">
                          <td className="p-3">
                            <p className="font-mono font-medium text-xs">{o.poNumber}</p>
                            <p className="text-[11px] text-muted-foreground">{o.source === "pos" ? "Till" : o.source === "online" ? "Online" : "Manual"} · {formatDate(o.createdAt)}</p>
                          </td>
                          <td className="p-3">
                            <p className="font-medium">{o.customerName}</p>
                            {o.customerPhone && <p className="text-xs text-muted-foreground">{o.customerPhone}</p>}
                          </td>
                          <td className="p-3" title={orderItems.map((it) => `${it.quantity}× ${it.productName}`).join(", ")}>
                            <p>{qty} × {label}</p>
                            {open && (o.allocatedQuantity ?? 0) > 0 && <p className="text-xs text-emerald-600">{o.allocatedQuantity} of {qty} set aside</p>}
                          </td>
                          <td className="p-3 text-xs">
                            {o.receiptNumber ? <span className="font-mono">{o.receiptNumber}</span> : <span className="text-muted-foreground">—</span>}
                            {o.collectedReceiptNumber && <p className="text-muted-foreground">Collected: <span className="font-mono">{o.collectedReceiptNumber}</span></p>}
                          </td>
                          <td className="p-3 text-xs">{o.expectedDate ? formatPreOrderDate(o.expectedDate) || o.expectedDate : "—"}</td>
                          <td className="p-3 text-right tabular-nums">
                            <p>{formatCurrency(o.depositAmount)}</p>
                            <p className={cn("text-xs", owing > 0 ? "text-amber-600 font-medium" : "text-muted-foreground")}>{owing > 0 ? `${formatCurrency(owing)} owing` : "Paid"}</p>
                          </td>
                          <td className="p-3">
                            <span className={cn("text-xs rounded-full px-2 py-0.5 font-medium whitespace-nowrap", STATUS_TONE[o.status] ?? "bg-muted")}>{o.status}</span>
                            {o.notifiedAt && <p className="text-[11px] text-muted-foreground mt-1">Customer told {formatDate(o.notifiedAt)}</p>}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-1 flex-wrap">
                              {open && owing > 0 && (
                                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => navigate(`/pos/sell?collectPreOrder=${o.id}`)}>
                                  <ShoppingCart className="w-3.5 h-3.5" /> Collect at till
                                </Button>
                              )}
                              {open && owing <= 0 && (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatus(o, "Collected")}><PackageCheck className="w-3.5 h-3.5" /> Collected</Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatus(o, "Shipped")}><Truck className="w-3.5 h-3.5" /> Shipped</Button>
                                </>
                              )}
                              {open && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Cancel pre-order" onClick={() => setStatus(o, "Cancelled")}><Ban className="w-3.5 h-3.5" /></Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                              {/* Only hand-typed pre-orders can be deleted: one made by a sale is that sale's record. */}
                              {(o.source ?? "manual") === "manual" && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => handleDelete(o.id, o.poNumber)}><Trash2 className="w-3.5 h-3.5" /></Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
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
              <Label>Products</Label>
              <ProductSearchInput
                key={addKey}
                value=""
                onChange={(id, p) => addProduct(id, p)}
                placeholder="Search product by name or SKU to add"
              />
              {items.length > 0 ? (
                <div className="rounded-lg border divide-y mt-2">
                  {items.map((it, idx) => (
                    <div key={`${it.productId}-${idx}`} className="flex items-center gap-3 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate" title={it.productName}>{it.productName}</p>
                        {it.unitPrice > 0 && (
                          <p className="text-xs text-muted-foreground">{formatCurrency(it.unitPrice)} each · {formatCurrency(it.unitPrice * it.quantity)}</p>
                        )}
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) => setItemQty(idx, parseInt(e.target.value))}
                        className="w-20 h-8"
                        aria-label={`Quantity for ${it.productName}`}
                      />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeItem(idx)} aria-label={`Remove ${it.productName}`}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">No products added yet.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Deposit ($)</Label>
              <Input type="number" step="0.01" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="0.00" />
            </div>

            {totalPrice > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total price</span>
                  <span className="font-medium">{formatCurrency(totalPrice)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Suggested deposit
                    {depositIsPercent
                      ? <span className="text-xs"> ({depositValue}% of total)</span>
                      : <span className="text-xs"> (fixed default)</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatCurrency(suggestedDeposit)}</span>
                    <Button type="button" size="sm" variant="outline" className="h-7" onClick={applySuggestedDeposit}>
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PreOrderStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[...new Set([...EDITABLE_STATUSES, form.status])].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ETA</Label>
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
