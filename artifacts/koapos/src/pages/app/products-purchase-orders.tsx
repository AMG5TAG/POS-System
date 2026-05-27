import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListPurchaseOrders,
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useDeletePurchaseOrder,
  useListProducts,
  getListProductsQueryKey,
  getListPurchaseOrdersQueryKey,
  type PurchaseOrder,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, ShoppingCart, Pencil, Truck, Search, Trash2, PackageSearch, X, Package, Printer, Mail, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { loadCodePrefixes } from "@/pages/app/management-misc";

type POStatus = "Draft" | "Sent" | "Partial" | "Received" | "Cancelled";
type TaxMode  = "exclusive" | "inclusive";
type POItem   = { productName: string; quantity: number; unitCost: number; received: number; productId?: number };

interface SupplierOption { id: number; name: string }

const GST_RATE = 0.1; // Australia — 10%

const statusColors: Record<POStatus, string> = {
  Draft: "secondary", Sent: "outline", Partial: "outline", Received: "default", Cancelled: "destructive",
} as const;

const EMPTY_FORM = {
  supplierId:      null as number | null,
  supplierName:    "",
  orderNumber:     "",
  expectedDate:    "",
  notes:           "",
  status:          "Draft" as POStatus,
  deliveryCharge:  0,
  deliveryTaxMode: "exclusive" as TaxMode,
};
const EMPTY_ITEM: POItem = { productName: "", quantity: 1, unitCost: 0, received: 0 };

/* ── Delivery cost helpers ─────────────────────────────────────────────── */

function calcDelivery(charge: number, mode: TaxMode) {
  if (charge <= 0) return { exGst: 0, gst: 0, incGst: 0 };
  if (mode === "exclusive") {
    const gst   = charge * GST_RATE;
    return { exGst: charge, gst, incGst: charge + gst };
  } else {
    const gst   = charge - charge / (1 + GST_RATE);
    return { exGst: charge - gst, gst, incGst: charge };
  }
}

type PrintPO = Awaited<ReturnType<typeof import("@workspace/api-client-react").createPurchaseOrder>>;

export default function ProductsPurchaseOrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<POItem[]>([{ ...EMPTY_ITEM }]);
  const [printPO, setPrintPO] = useState<PrintPO | null>(null);
  const [viewingPO, setViewingPO] = useState<PurchaseOrder | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [manualEmail, setManualEmail] = useState("");

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
      supplierId:      po.supplierId ?? null,
      supplierName:    po.supplierName ?? "",
      orderNumber:     (po as { orderNumber?: string | null }).orderNumber ?? "",
      expectedDate:    po.expectedDate ?? "",
      notes:           po.notes ?? "",
      status:          po.status as POStatus,
      deliveryCharge:  (po as { deliveryCharge?: number }).deliveryCharge ?? 0,
      deliveryTaxMode: ((po as { deliveryTaxMode?: string }).deliveryTaxMode ?? "exclusive") as TaxMode,
    });
    setItems((po.items ?? []).map((i) => ({
      productName: i.productName ?? "",
      quantity:    i.quantity ?? 1,
      unitCost:    i.unitCost ?? 0,
      received:    i.received ?? 0,
      productId:   i.productId ?? undefined,
    })));
    setProductSearchQuery("");
    setDialogOpen(true);
  };

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });

  const handleSave = () => {
    const validItems = items.filter((i) => i.productName);
    if (!validItems.length) { toast.error("Add at least one item"); return; }
    const payload = {
      supplierId:      form.supplierId ?? undefined,
      orderNumber:     form.orderNumber || undefined,
      status:          form.status,
      orderDate:       new Date().toISOString().slice(0, 10),
      expectedDate:    form.expectedDate || undefined,
      notes:           form.notes || undefined,
      deliveryCharge:  form.deliveryCharge,
      deliveryTaxMode: form.deliveryTaxMode,
      items:           validItems,
    };
    if (editingId !== null) {
      updatePO.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            invalidateList();
            toast.success("Purchase order updated");
            setDialogOpen(false);
          },
          onError: () => toast.error("Failed to update"),
        }
      );
    } else {
      const prefixes = loadCodePrefixes();
      createPO.mutate({ data: { ...payload, poNumberPrefix: prefixes.poPrefix, poNumberDigits: prefixes.poDigits } }, {
        onSuccess: (data) => {
          invalidateList();
          toast.success(`${data.poNumber} created`);
          setDialogOpen(false);
          setTimeout(() => setPrintPO(data), 100);
        },
        onError: () => toast.error("Failed to create purchase order"),
      });
    }
  };

  const handleDelete = (id: number) => {
    deletePO.mutate({ id }, {
      onSuccess: () => { invalidateList(); toast.success("Purchase order deleted"); },
      onError: () => toast.error("Failed to delete"),
    });
  };

  const productList = Array.isArray(productResults)
    ? productResults
    : (productResults as { items?: { id: number; name: string; price: number; costPrice?: number | null }[] } | undefined)?.items ?? [];

  /* ── Totals ─────────────────────────────────────────────────────────── */
  const itemsSubtotal    = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const itemsGst         = itemsSubtotal * GST_RATE;
  const itemsIncGst      = itemsSubtotal * (1 + GST_RATE);
  const delivery         = calcDelivery(form.deliveryCharge, form.deliveryTaxMode);
  const grandTotal       = itemsIncGst + delivery.incGst;

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
                  <tr key={po.id} className="bg-background hover:bg-muted/20 cursor-pointer">
                    <td className="p-3 font-mono font-medium" onClick={() => setViewingPO(po)}>{po.poNumber}</td>
                    <td className="p-3 hidden sm:table-cell" onClick={() => setViewingPO(po)}>
                      <span className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                        {po.supplierName ?? "—"}
                      </span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground font-mono text-xs" onClick={() => setViewingPO(po)}>
                      {(po as { orderNumber?: string | null }).orderNumber || "—"}
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground" onClick={() => setViewingPO(po)}>{formatDate(po.createdAt)}</td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground" onClick={() => setViewingPO(po)}>{po.expectedDate || "—"}</td>
                    <td className="p-3" onClick={() => setViewingPO(po)}>
                      <Badge variant={statusColors[po.status as POStatus] as "default" | "secondary" | "outline" | "destructive"}>
                        {po.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-medium" onClick={() => setViewingPO(po)}>{formatCurrency(po.totalCost ?? 0)}</td>
                    <td className="p-3 flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="View details" onClick={() => setViewingPO(po)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(po); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(po.id); }}>
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

      {/* ── Purchase Order Detail Dialog ────────────────────────────────── */}
      {viewingPO && (() => {
        const po = viewingPO;
        const deliveryCharge = (po as { deliveryCharge?: number }).deliveryCharge ?? 0;
        const deliveryTaxMode = ((po as { deliveryTaxMode?: string }).deliveryTaxMode ?? "exclusive") as TaxMode;
        const delivery = calcDelivery(deliveryCharge, deliveryTaxMode);
        const itemsSubtotal = (po.items ?? []).reduce((s, i) => s + (i.quantity ?? 1) * (i.unitCost ?? 0), 0);
        const itemsGst = itemsSubtotal * GST_RATE;
        const grandTotal = itemsSubtotal * (1 + GST_RATE) + delivery.incGst;
        const fmtDate = (d: string | null | undefined) => {
          if (!d) return "—";
          const [y, m, day] = d.split("-");
          return `${day}/${m}/${y}`;
        };

        const handleSendEmail = async (overrideTo?: string) => {
          setEmailLoading(true);
          try {
            const res = await fetch(`/api/purchase-orders/${po.id}/email`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(overrideTo ? { to: overrideTo } : {}),
            });
            const json = await res.json();
            if (!res.ok) {
              if (json.error === "no_email") {
                setManualEmail("");
                setEmailModalOpen(true);
              } else {
                toast.error(json.message ?? "Failed to send email");
              }
            } else if (json.error) {
              toast.error(`Email sent but provider reported: ${json.error}`);
            } else {
              toast.success("Email sent to supplier");
            }
          } catch {
            toast.error("Network error sending email");
          } finally {
            setEmailLoading(false);
          }
        };

        return (
          <Dialog open={!!viewingPO} onOpenChange={(o) => { if (!o) setViewingPO(null); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <DialogTitle className="font-mono text-xl">#{po.poNumber}</DialogTitle>
                  <Badge variant={statusColors[po.status as POStatus] as "default" | "secondary" | "outline" | "destructive"}>
                    {po.status}
                  </Badge>
                </div>
              </DialogHeader>

              {/* Info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Supplier</p>
                  <p className="font-medium mt-0.5">{po.supplierName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Order Date</p>
                  <p className="font-medium mt-0.5">{fmtDate(po.orderDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Expected</p>
                  <p className="font-medium mt-0.5">{po.expectedDate ? fmtDate(po.expectedDate) : "—"}</p>
                </div>
                {(po as { orderNumber?: string | null }).orderNumber && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Order #</p>
                    <p className="font-medium mt-0.5 font-mono text-xs">{(po as { orderNumber?: string | null }).orderNumber}</p>
                  </div>
                )}
                {po.receivedDate && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Received</p>
                    <p className="font-medium mt-0.5">{fmtDate(po.receivedDate)}</p>
                  </div>
                )}
              </div>

              {/* Items table */}
              <div className="rounded-lg border overflow-hidden mt-2">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2.5 font-medium text-muted-foreground">Product</th>
                      <th className="text-center p-2.5 font-medium text-muted-foreground w-16">Qty</th>
                      <th className="text-right p-2.5 font-medium text-muted-foreground w-28">Unit Cost</th>
                      <th className="text-right p-2.5 font-medium text-muted-foreground w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(po.items ?? []).map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5">{item.productName}</td>
                        <td className="p-2.5 text-center">{item.quantity}</td>
                        <td className="p-2.5 text-right">{formatCurrency(item.unitCost ?? 0)}</td>
                        <td className="p-2.5 text-right">{formatCurrency((item.quantity ?? 1) * (item.unitCost ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals summary */}
              <div className="flex justify-end">
                <div className="text-sm space-y-1 min-w-[220px]">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Items subtotal (ex GST)</span>
                    <span>{formatCurrency(itemsSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>GST (10%)</span>
                    <span>+ {formatCurrency(itemsGst)}</span>
                  </div>
                  {deliveryCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Delivery (inc GST)</span>
                      <span>+ {formatCurrency(delivery.incGst)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-base border-t pt-1.5 mt-1.5">
                    <span>Total (inc GST)</span>
                    <span>{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {po.notes && (
                <div className="rounded-lg border p-3 bg-muted/30 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                  <p className="whitespace-pre-wrap">{po.notes}</p>
                </div>
              )}

              <DialogFooter className="flex gap-2 pt-2 sm:justify-between">
                <Button variant="outline" onClick={() => { setViewingPO(null); openEdit(po); }}>
                  <Pencil className="w-4 h-4 mr-1.5" /> Edit
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={emailLoading} onClick={() => handleSendEmail()}>
                    {emailLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />}
                    Email to Supplier
                  </Button>
                  <Button variant="outline" onClick={() => setPrintPO(po as unknown as PrintPO)}>
                    <Printer className="w-4 h-4 mr-1.5" /> Print
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Manual Email Fallback Modal ──────────────────────────────────── */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Supplier Email</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This supplier has no email address on file. Enter one below to send the purchase order.
          </p>
          <div className="space-y-1.5">
            <Label>Email address</Label>
            <Input
              type="email"
              placeholder="supplier@example.com"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualEmail) {
                  setEmailModalOpen(false);
                  // Re-trigger with manual email using the current viewingPO
                  if (viewingPO) {
                    setEmailLoading(true);
                    fetch(`/api/purchase-orders/${viewingPO.id}/email`, {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ to: manualEmail }),
                    })
                      .then((r) => r.json())
                      .then((j) => {
                        if (j.error) toast.error(`Email failed: ${j.error}`);
                        else toast.success("Email sent to supplier");
                      })
                      .catch(() => toast.error("Network error"))
                      .finally(() => setEmailLoading(false));
                  }
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailModalOpen(false)}>Cancel</Button>
            <Button
              disabled={!manualEmail || emailLoading}
              onClick={() => {
                setEmailModalOpen(false);
                if (viewingPO) {
                  setEmailLoading(true);
                  fetch(`/api/purchase-orders/${viewingPO.id}/email`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ to: manualEmail }),
                  })
                    .then((r) => r.json())
                    .then((j) => {
                      if (j.error) toast.error(`Email failed: ${j.error}`);
                      else toast.success("Email sent to supplier");
                    })
                    .catch(() => toast.error("Network error"))
                    .finally(() => setEmailLoading(false));
                }
              }}
            >
              {emailLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <div className="col-span-3 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                    <Input className="pl-6" type="number" step="0.01" placeholder="0.00"
                      value={item.unitCost || ""}
                      onChange={(e) => updateItem(i, "unitCost", parseFloat(e.target.value) || 0)} />
                  </div>
                  <Button variant="ghost" size="icon" className="col-span-2 h-8 text-destructive hover:text-destructive"
                    onClick={() => removeItem(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* ── Delivery Charge ─────────────────────────────────────────── */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Delivery Charge</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="pl-6"
                      value={form.deliveryCharge || ""}
                      onChange={(e) => setForm({ ...form, deliveryCharge: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tax</Label>
                  <div className="flex rounded-md border overflow-hidden h-9">
                    {(["exclusive", "inclusive"] as TaxMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm({ ...form, deliveryTaxMode: mode })}
                        className={cn(
                          "flex-1 text-xs font-medium transition-colors",
                          form.deliveryTaxMode === mode
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted/60 text-muted-foreground"
                        )}
                      >
                        {mode === "exclusive" ? "Ex GST" : "Inc GST"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tax breakdown — only shown when there's a non-zero charge */}
              {form.deliveryCharge > 0 && (
                <div className="rounded-md bg-background border px-3 py-2 space-y-1 text-xs">
                  {form.deliveryTaxMode === "exclusive" ? (
                    <>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Delivery (ex GST)</span>
                        <span>{formatCurrency(delivery.exGst)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>GST (10%)</span>
                        <span>+ {formatCurrency(delivery.gst)}</span>
                      </div>
                      <div className="flex justify-between font-medium border-t pt-1 mt-1">
                        <span>Delivery (inc GST)</span>
                        <span>{formatCurrency(delivery.incGst)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Delivery (inc GST)</span>
                        <span>{formatCurrency(delivery.incGst)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>GST component (10%)</span>
                        <span>{formatCurrency(delivery.gst)}</span>
                      </div>
                      <div className="flex justify-between font-medium border-t pt-1 mt-1">
                        <span>Delivery (ex GST)</span>
                        <span>{formatCurrency(delivery.exGst)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes..." rows={2} />
            </div>

            {/* ── Summary footer ───────────────────────────────────────── */}
            <div className="rounded-lg border bg-muted/10 px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Items subtotal (ex GST)</span>
                <span>{formatCurrency(itemsSubtotal)}</span>
              </div>
              {itemsSubtotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>GST on items (10%)</span>
                  <span>+ {formatCurrency(itemsGst)}</span>
                </div>
              )}
              {itemsSubtotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Items (inc GST)</span>
                  <span>{formatCurrency(itemsIncGst)}</span>
                </div>
              )}
              {form.deliveryCharge > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery (inc GST)</span>
                  <span>+ {formatCurrency(delivery.incGst)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1.5 mt-0.5">
                <span>Total (inc GST)</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createPO.isPending || updatePO.isPending}>
                {editingId ? "Save Changes" : "Create PO"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Auto-print after PO creation ─────────────────────────────── */}
      {printPO && <POPrintArea po={printPO} onDone={() => setPrintPO(null)} />}
    </AppLayout>
  );
}

/* ── Print area component ─────────────────────────────────────────────── */

type POData = NonNullable<PrintPO>;

function POPrintArea({ po, onDone }: { po: POData; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      document.body.setAttribute("data-print", "po");
      const cleanup = () => {
        document.body.removeAttribute("data-print");
        onDone();
      };
      window.addEventListener("afterprint", cleanup, { once: true });
      window.print();
      const fallback = window.setTimeout(cleanup, 30_000);
      window.addEventListener("afterprint", () => window.clearTimeout(fallback), { once: true });
    }, 150);
    return () => clearTimeout(t);
  }, [onDone]);

  const deliveryCharge = (po as { deliveryCharge?: number }).deliveryCharge ?? 0;
  const deliveryTaxMode = ((po as { deliveryTaxMode?: string }).deliveryTaxMode ?? "exclusive") as TaxMode;
  const delivery = calcDelivery(deliveryCharge, deliveryTaxMode);
  const itemsSubtotal = (po.items ?? []).reduce((s, i) => s + (i.quantity ?? 1) * (i.unitCost ?? 0), 0);
  const itemsIncGst = itemsSubtotal * (1 + GST_RATE);
  const grandTotal = itemsIncGst + delivery.incGst;

  const today = new Date();
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  return (
    <>
      <style>{`
        @media screen {
          #po-print-area { display: none !important; }
        }
        @media print {
          body * { visibility: hidden !important; }
          body[data-print="po"] #po-print-area,
          body[data-print="po"] #po-print-area * { visibility: visible !important; }
          body[data-print="po"] #po-print-area {
            position: fixed !important;
            inset: 0 !important;
            display: block !important;
            padding: 32px !important;
            background: white !important;
          }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
      <div id="po-print-area" style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: "#222", lineHeight: 1.5 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #f0c040", paddingBottom: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>PURCHASE ORDER</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>#{po.poNumber}</p>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "#555" }}>
            <p style={{ margin: 0 }}>Date: {fmtDate(today.toISOString().slice(0, 10))}</p>
            <p style={{ margin: "2px 0 0" }}>Status: <strong>{po.status}</strong></p>
            {po.orderNumber && <p style={{ margin: "2px 0 0" }}>Order #: {po.orderNumber}</p>}
            {po.expectedDate && <p style={{ margin: "2px 0 0" }}>Expected: {fmtDate(po.expectedDate)}</p>}
          </div>
        </div>

        {/* Supplier */}
        {po.supplierName && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#888" }}>Supplier</p>
            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: 14 }}>{po.supplierName}</p>
          </div>
        )}

        {/* Items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #ddd" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Product</th>
              <th style={{ textAlign: "center", padding: "8px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, width: 60 }}>Qty</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, width: 100 }}>Unit Cost</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, width: 100 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(po.items ?? []).map((item, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "7px 10px" }}>{item.productName}</td>
                <td style={{ padding: "7px 10px", textAlign: "center" }}>{item.quantity}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{formatCurrency(item.unitCost ?? 0)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{formatCurrency((item.quantity ?? 1) * (item.unitCost ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 260 }}>
            <tbody>
              <tr>
                <td style={{ padding: "3px 10px", color: "#666", fontSize: 12 }}>Items subtotal (ex GST)</td>
                <td style={{ padding: "3px 10px", textAlign: "right", fontSize: 12 }}>{formatCurrency(itemsSubtotal)}</td>
              </tr>
              <tr>
                <td style={{ padding: "3px 10px", color: "#666", fontSize: 12 }}>GST on items (10%)</td>
                <td style={{ padding: "3px 10px", textAlign: "right", fontSize: 12 }}>+ {formatCurrency(itemsSubtotal * GST_RATE)}</td>
              </tr>
              {deliveryCharge > 0 && (
                <tr>
                  <td style={{ padding: "3px 10px", color: "#666", fontSize: 12 }}>Delivery (inc GST)</td>
                  <td style={{ padding: "3px 10px", textAlign: "right", fontSize: 12 }}>+ {formatCurrency(delivery.incGst)}</td>
                </tr>
              )}
              <tr style={{ borderTop: "2px solid #222" }}>
                <td style={{ padding: "6px 10px", fontWeight: 700, fontSize: 14 }}>Total (inc GST)</td>
                <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, fontSize: 14 }}>{formatCurrency(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes */}
        {po.notes && (
          <div style={{ marginTop: 24, borderTop: "1px solid #eee", paddingTop: 12 }}>
            <p style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#888" }}>Notes</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{po.notes}</p>
          </div>
        )}

        <p style={{ marginTop: 32, fontSize: 11, color: "#aaa", borderTop: "1px solid #eee", paddingTop: 8 }}>
          Generated by KoaPOS — {today.toLocaleDateString("en-AU")}
        </p>
      </div>
    </>
  );
}
