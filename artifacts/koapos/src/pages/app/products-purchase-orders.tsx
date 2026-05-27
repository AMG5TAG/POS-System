import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListPurchaseOrders,
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useDeletePurchaseOrder,
  useListProducts,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, ShoppingCart, Pencil, Truck, Search, Trash2, PackageSearch, X } from "lucide-react";
import { toast } from "sonner";

type POStatus = "Draft" | "Sent" | "Partial" | "Received" | "Cancelled";
type POItem = { productName: string; quantity: number; unitCost: number; received: number; productId?: number };

interface SupplierOption { id: number; name: string }

const statusColors: Record<POStatus, string> = {
  Draft: "secondary", Sent: "outline", Partial: "outline", Received: "default", Cancelled: "destructive",
} as const;

const EMPTY_FORM = {
  supplierId: null as number | null,
  supplierName: "",
  orderNumber: "",
  expectedDate: "",
  notes: "",
  status: "Draft" as POStatus,
};
const EMPTY_ITEM: POItem = { productName: "", quantity: 1, unitCost: 0, received: 0 };

export default function ProductsPurchaseOrdersPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<POItem[]>([{ ...EMPTY_ITEM }]);

  /* Supplier dropdown */
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  useEffect(() => {
    if (!dialogOpen) return;
    fetch("/api/suppliers", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const list: SupplierOption[] = d.items ?? [];
        setSuppliers([...list].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, [dialogOpen]);

  /* Product search */
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [showProductResults, setShowProductResults] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);
  const productParams = { search: productSearchQuery, limit: 8 };
  const { data: productResults } = useListProducts(
    productParams,
    { query: { enabled: productSearchQuery.trim().length >= 1, queryKey: getListProductsQueryKey(productParams) } }
  );

  /* Close product dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setShowProductResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: orders = [], isLoading } = useListPurchaseOrders({});
  const createPO = useCreatePurchaseOrder();
  const updatePO = useUpdatePurchaseOrder();
  const deletePO = useDeletePurchaseOrder();

  const filtered = orders.filter((o) =>
    o.poNumber.toLowerCase().includes(search.toLowerCase()) ||
    (o.supplierName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (o.orderNumber ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const addItem = () => setItems((p) => [...p, { ...EMPTY_ITEM }]);
  const updateItem = (i: number, field: keyof POItem, value: string | number) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const addProductFromSearch = (product: { id: number; name: string; price: number; costPrice?: number | null }) => {
    setItems((prev) => [
      ...prev.filter((it) => it.productName),
      { productName: product.name, quantity: 1, unitCost: product.costPrice ?? 0, received: 0, productId: product.id },
    ]);
    setProductSearchQuery("");
    setShowProductResults(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setItems([{ ...EMPTY_ITEM }]);
    setProductSearchQuery("");
    setDialogOpen(true);
  };

  const openEdit = (po: (typeof orders)[0]) => {
    setEditingId(po.id);
    setForm({
      supplierId: po.supplierId ?? null,
      supplierName: po.supplierName ?? "",
      orderNumber: (po as { orderNumber?: string | null }).orderNumber ?? "",
      expectedDate: po.expectedDate ?? "",
      notes: po.notes ?? "",
      status: po.status as POStatus,
    });
    setItems((po.items ?? []).map((i) => ({
      productName: i.productName ?? "",
      quantity: i.quantity ?? 1,
      unitCost: i.unitCost ?? 0,
      received: i.received ?? 0,
      productId: i.productId ?? undefined,
    })));
    setProductSearchQuery("");
    setDialogOpen(true);
  };

  const handleSave = () => {
    const validItems = items.filter((i) => i.productName);
    if (!validItems.length) { toast.error("Add at least one item"); return; }
    const payload = {
      supplierId: form.supplierId ?? undefined,
      orderNumber: form.orderNumber || undefined,
      status: form.status,
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDate: form.expectedDate || undefined,
      notes: form.notes || undefined,
      items: validItems,
    };
    if (editingId !== null) {
      updatePO.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => { toast.success("Purchase order updated"); setDialogOpen(false); },
          onError: () => toast.error("Failed to update"),
        }
      );
    } else {
      createPO.mutate({ data: payload }, {
        onSuccess: (data) => { toast.success(`${data.poNumber} created`); setDialogOpen(false); },
        onError: () => toast.error("Failed to create"),
      });
    }
  };

  const handleDelete = (id: number) => {
    deletePO.mutate({ id }, {
      onSuccess: () => toast.success("Purchase order deleted"),
      onError: () => toast.error("Failed to delete"),
    });
  };

  const productList = Array.isArray(productResults)
    ? productResults
    : (productResults as { items?: { id: number; name: string; price: number; costPrice?: number | null }[] } | undefined)?.items ?? [];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Purchase Orders</h1>
            <p className="text-sm text-muted-foreground">Create and track purchase orders to suppliers for stock replenishment.</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New PO</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by PO number, supplier or order number..." className="pl-9"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <ShoppingCart className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No purchase orders yet</p>
                <p className="text-muted-foreground text-sm">Create purchase orders to track stock ordered from suppliers.</p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New PO</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">PO Number</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Supplier</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Order #</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Order Date</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Expected</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((po) => (
                  <tr key={po.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium">{po.poNumber}</td>
                    <td className="p-3 hidden sm:table-cell">
                      <span className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                        {po.supplierName ?? "—"}
                      </span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground font-mono text-xs">
                      {(po as { orderNumber?: string | null }).orderNumber || "—"}
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{formatDate(po.createdAt)}</td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground">{po.expectedDate || "—"}</td>
                    <td className="p-3">
                      <Badge variant={statusColors[po.status as POStatus] as "default" | "secondary" | "outline" | "destructive"}>
                        {po.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-medium">{formatCurrency(po.totalCost ?? 0)}</td>
                    <td className="p-3 flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(po)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(po.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle></DialogHeader>
          <div className="space-y-4">

            {/* Row 1: Supplier dropdown + Order Number */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select
                  value={form.supplierId ? String(form.supplierId) : "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") {
                      setForm({ ...form, supplierId: null, supplierName: "" });
                    } else {
                      const s = suppliers.find((x) => String(x.id) === v);
                      setForm({ ...form, supplierId: Number(v), supplierName: s?.name ?? "" });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">— No supplier —</span>
                    </SelectItem>
                    {suppliers.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No suppliers found</div>
                    )}
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Order Number</Label>
                <Input
                  value={form.orderNumber}
                  onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
                  placeholder="Supplier's order / ref number"
                />
              </div>
            </div>

            {/* Row 2: Status + Expected Delivery */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as POStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Draft","Sent","Partial","Received","Cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expected Delivery</Label>
                <Input type="date" value={form.expectedDate}
                  onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
              </div>
            </div>

            {/* Product search */}
            <div className="space-y-1.5">
              <Label>Add Product from Database</Label>
              <div className="relative" ref={productSearchRef}>
                <PackageSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9"
                  placeholder="Search products to add…"
                  value={productSearchQuery}
                  onChange={(e) => { setProductSearchQuery(e.target.value); setShowProductResults(true); }}
                  onFocus={() => { if (productSearchQuery.trim()) setShowProductResults(true); }}
                />
                {productSearchQuery && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => { setProductSearchQuery(""); setShowProductResults(false); }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {showProductResults && productSearchQuery.trim().length >= 1 && (
                  <div className={cn(
                    "absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover shadow-md",
                    "max-h-48 overflow-y-auto"
                  )}>
                    {productList.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground text-center">No products found</p>
                    ) : (
                      productList.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
                          onMouseDown={(e) => { e.preventDefault(); addProductFromSearch(p); }}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-muted-foreground ml-2 shrink-0">{formatCurrency(p.price)}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                </Button>
              </div>
              <div className="grid grid-cols-12 gap-2 px-1 mb-1">
                <p className="col-span-5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Product Name</p>
                <p className="col-span-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Qty</p>
                <p className="col-span-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unit Cost</p>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-5" placeholder="Item name" value={item.productName}
                    onChange={(e) => updateItem(i, "productName", e.target.value)} />
                  <Input className="col-span-2 text-center" type="number" min={1} placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)} />
                  <Input className="col-span-3" type="number" step="0.01" placeholder="Unit cost"
                    value={item.unitCost || ""}
                    onChange={(e) => updateItem(i, "unitCost", parseFloat(e.target.value) || 0)} />
                  <Button variant="ghost" size="icon" className="col-span-2 h-8 text-destructive hover:text-destructive"
                    onClick={() => removeItem(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes..." rows={2} />
            </div>

            <div className="flex justify-between items-center pt-2 border-t">
              <p className="font-medium">
                Total: {formatCurrency(items.reduce((s, i) => s + i.quantity * i.unitCost, 0))}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={createPO.isPending || updatePO.isPending}>
                  {editingId ? "Save Changes" : "Create PO"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
