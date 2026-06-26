import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProductReturnAuths,
  useCreateProductReturnAuth,
  useUpdateProductReturnAuth,
  useDeleteProductReturnAuth,
  getListProductReturnAuthsQueryKey,
  useListSuppliers,
  useListPurchaseOrders,
  type Product,
  type ReturnAuthItem,
  type ReturnAuthAttachment,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ProductSearchInput } from "@/components/products/ProductSearchInput";
import { formatDate } from "@/lib/utils";
import { useStickerPrinter } from "@/lib/sticker-config";
import { Plus, RotateCcw, Search, Pencil, Trash2, Printer, Paperclip, Upload, X, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

/* Build the legacy `items` text summary + total quantity from the structured list. */
function summariseItems(list: ReturnAuthItem[]): { items: string; quantity: number } {
  const items = list.map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)).join(", ");
  const quantity = list.reduce((sum, i) => sum + (i.quantity || 0), 0);
  return { items, quantity: Math.max(1, quantity) };
}

type RAStatus = "Draft" | "Submitted" | "Approved" | "Rejected" | "Resolved";

const STATUSES: RAStatus[] = ["Draft", "Submitted", "Approved", "Rejected", "Resolved"];
const STATUS_COLORS: Record<RAStatus, string> = {
  Draft: "secondary",
  Submitted: "default",
  Approved: "default",
  Rejected: "destructive",
  Resolved: "outline",
};

/* Why the goods are going back to the supplier. */
const REASONS = ["Faulty / DOA", "Warranty claim", "Damaged", "Defective", "Wrong item", "Recall", "Other"];
/* What the merchant wants the supplier to do about it. */
const RETURN_TYPES = ["Warranty", "Replacement", "Repair", "Credit", "Refund"];

const emptyForm = () => ({
  supplierId: "",
  supplierName: "",
  purchaseOrderId: "",
  returnItems: [] as ReturnAuthItem[],
  attachments: [] as ReturnAuthAttachment[],
  reason: "",
  returnType: "",
  supplierRmaNumber: "",
  trackingNumber: "",
  notes: "",
  status: "Draft" as RAStatus,
});

export default function ProductsReturnAuthPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());

  const { data, isLoading } = useListProductReturnAuths({ search: search || undefined });
  const returns = data?.items ?? [];

  const { data: suppliersData } = useListSuppliers();
  const suppliers = suppliersData?.items ?? [];

  const { data: poData } = useListPurchaseOrders();
  const purchaseOrders = poData ?? [];

  const [uploading, setUploading] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProductReturnAuthsQueryKey() });

  const createMutation = useCreateProductReturnAuth({ mutation: { onSuccess: () => { invalidate(); } } });
  const updateMutation = useUpdateProductReturnAuth({ mutation: { onSuccess: () => { invalidate(); } } });
  const deleteMutation = useDeleteProductReturnAuth({ mutation: { onSuccess: () => { invalidate(); } } });

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (r: (typeof returns)[0]) => {
    setEditingId(r.id);
    // Old records have no structured list — seed one custom row from the text.
    const returnItems: ReturnAuthItem[] = (r.returnItems && r.returnItems.length > 0)
      ? r.returnItems
      : (r.items ? [{ productId: null, name: r.items, quantity: r.quantity || 1 }] : []);
    setForm({
      supplierId: r.supplierId ? String(r.supplierId) : "",
      supplierName: r.supplierName,
      purchaseOrderId: r.purchaseOrderId ? String(r.purchaseOrderId) : "",
      returnItems,
      attachments: r.attachments ?? [],
      reason: r.reason ?? "",
      returnType: r.returnType ?? "",
      supplierRmaNumber: r.supplierRmaNumber ?? "",
      trackingNumber: r.trackingNumber ?? "",
      notes: r.notes ?? "",
      status: r.status as RAStatus,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.supplierId && !form.supplierName) { toast.error("Supplier is required"); return; }
    if (form.returnItems.length === 0) { toast.error("Add at least one product being returned"); return; }

    const { items, quantity } = summariseItems(form.returnItems);
    const payload = {
      supplierId: form.supplierId ? parseInt(form.supplierId) : undefined,
      supplierName: form.supplierName,
      purchaseOrderId: form.purchaseOrderId ? parseInt(form.purchaseOrderId) : null,
      items,
      quantity,
      returnItems: form.returnItems,
      attachments: form.attachments,
      reason: form.reason || undefined,
      returnType: form.returnType || undefined,
      supplierRmaNumber: form.supplierRmaNumber || undefined,
      trackingNumber: form.trackingNumber || undefined,
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

  const selectedPO = purchaseOrders.find((p) => String(p.id) === form.purchaseOrderId);

  /* Selecting a PO pre-fills the supplier; its line items can then be added below. */
  const onSelectPO = (poId: string) => {
    const po = purchaseOrders.find((p) => String(p.id) === poId);
    setForm((f) => ({
      ...f,
      purchaseOrderId: poId,
      supplierId: po?.supplierId ? String(po.supplierId) : f.supplierId,
      supplierName: po?.supplierName ?? f.supplierName,
    }));
  };

  /* Add a product to the return list, bumping the quantity if already present. */
  const addReturnItem = (productId: number | null, name: string, qty = 1) => {
    if (!name.trim()) return;
    setForm((f) => {
      const idx = f.returnItems.findIndex((i) => i.productId === productId && i.name === name);
      const returnItems = [...f.returnItems];
      if (idx >= 0) returnItems[idx] = { ...returnItems[idx], quantity: returnItems[idx].quantity + qty };
      else returnItems.push({ productId, name: name.trim(), quantity: qty });
      return { ...f, returnItems };
    });
  };

  const setItemQty = (index: number, qty: number) => {
    setForm((f) => {
      const returnItems = [...f.returnItems];
      returnItems[index] = { ...returnItems[index], quantity: Math.max(1, qty || 1) };
      return { ...f, returnItems };
    });
  };

  const removeReturnItem = (index: number) =>
    setForm((f) => ({ ...f, returnItems: f.returnItems.filter((_, i) => i !== index) }));

  /* Upload files via the presigned-URL flow, then store their object keys. */
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const urlRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        if (!urlRes.ok) throw new Error("request-url failed");
        const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
        const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!putRes.ok) throw new Error("upload failed");
        await fetch("/api/storage/uploads/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ objectPath }),
        });
        setForm((f) => ({
          ...f,
          attachments: [...f.attachments, { fileKey: objectPath, filename: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size }],
        }));
      }
      toast.success("File uploaded");
    } catch {
      toast.error("Couldn't upload the file");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index: number) =>
    setForm((f) => ({ ...f, attachments: f.attachments.filter((_, i) => i !== index) }));

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const { printStickers } = useStickerPrinter();
  /* Print a supplier RMA label using the saved "return" sticker template. */
  const printReturnLabel = (r: (typeof returns)[0]) => {
    const ok = printStickers({
      typeId: "return",
      context: { customer: { name: r.supplierName ?? "" } },
      fieldsOverride: {
        returnNo: r.raNumber ?? "",
        item: `${r.items ?? ""}${r.quantity ? ` × ${r.quantity}` : ""}`,
        reason: r.reason ?? "",
        status: r.status ?? "",
        date: formatDate(r.createdAt),
        customer: r.supplierName ?? "",
        ...(r.reason ? {} : { showReason: "false" }),
        ...(r.supplierName ? {} : { showCustomer: "false" }),
      },
    });
    if (!ok) toast.error("Couldn't open the print dialog — please try again");
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <RotateCcw className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Return Authorisations</h1>
              <p className="text-sm text-muted-foreground">Track returns sent back to suppliers for warranty, replacement, repair or credit.</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New RMA</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by RMA #, supplier or item..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <Card><CardContent className="flex items-center justify-center py-16">
            <p className="text-muted-foreground text-sm">Loading return authorisations…</p>
          </CardContent></Card>
        ) : returns.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <RotateCcw className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No return authorisations yet</p><p className="text-muted-foreground text-sm">Create an RMA to track stock you send back to a supplier.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New RMA</Button>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">RMA Number</th>
                  <th className="text-left p-3 font-medium">Supplier</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Items</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Reason</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Return Type</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Date</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {returns.map((r) => (
                  <tr key={r.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-xs">{r.raNumber}</td>
                    <td className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {r.supplierName}
                        {(r.attachments?.length ?? 0) > 0 && (
                          <span title={`${r.attachments!.length} attachment(s)`} className="text-muted-foreground"><Paperclip className="w-3 h-3" /></span>
                        )}
                      </span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground max-w-[180px] truncate">{r.items}{r.quantity ? ` × ${r.quantity}` : ""}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{r.reason || "—"}</td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground">{r.returnType || "—"}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_COLORS[r.status as RAStatus] as "default" | "secondary" | "outline" | "destructive"}>{r.status}</Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(r.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Print label" onClick={() => printReturnLabel(r)}><Printer className="w-3.5 h-3.5" /></Button>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId !== null ? "Edit Return Authorisation" : "New Return Authorisation"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Purchase order — selecting one pre-fills the supplier and lists its products. */}
            <div className="space-y-1.5">
              <Label>Purchase Order <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={form.purchaseOrderId} onValueChange={onSelectPO}>
                <SelectTrigger><SelectValue placeholder="Link a purchase order" /></SelectTrigger>
                <SelectContent>
                  {purchaseOrders.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No purchase orders</div>
                  ) : (
                    purchaseOrders.map((po) => (
                      <SelectItem key={po.id} value={String(po.id)}>
                        {po.poNumber}{po.supplierName ? ` · ${po.supplierName}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedPO && (selectedPO.items?.length ?? 0) > 0 && (
                <div className="mt-1.5 rounded-md border bg-muted/20 p-2 space-y-1">
                  <p className="text-xs text-muted-foreground px-0.5">Tap a product from this PO to add it to the return:</p>
                  {selectedPO.items!.map((it, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => addReturnItem(it.productId ?? null, it.productName ?? "Item", it.quantity ?? 1)}
                      className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded hover:bg-background transition-colors text-sm"
                    >
                      <span className="truncate">{it.productName ?? "Item"}</span>
                      <span className="text-xs text-muted-foreground shrink-0">qty {it.quantity ?? 1} <Plus className="w-3 h-3 inline -mt-0.5" /></span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select
                value={form.supplierId}
                onValueChange={(v) => {
                  const s = suppliers.find((x) => String(x.id) === v);
                  setForm({ ...form, supplierId: v, supplierName: s?.name ?? form.supplierName });
                }}
              >
                <SelectTrigger><SelectValue placeholder={form.supplierName || "Select supplier"} /></SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No suppliers yet</div>
                  ) : (
                    suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Products being returned — search the catalogue or add a custom line. */}
            <div className="space-y-1.5">
              <Label>Products Being Returned</Label>
              <ProductSearchInput
                value=""
                onChange={(_id, p: Product | null) => { if (p) addReturnItem(p.id, p.name, 1); }}
                placeholder="Search products to add…"
              />
              {form.returnItems.length > 0 && (
                <div className="rounded-md border divide-y mt-1.5">
                  {form.returnItems.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-1.5">
                      <span className="flex-1 min-w-0 truncate text-sm">{it.name}</span>
                      <Input
                        type="number" min="1" step="1" value={it.quantity}
                        onChange={(e) => setItemQty(i, parseInt(e.target.value))}
                        className="w-16 h-8"
                      />
                      <button type="button" onClick={() => removeReturnItem(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Attachments — invoices, fault photos, supplier emails. */}
            <div className="space-y-1.5">
              <Label>Attachments</Label>
              {form.attachments.length > 0 && (
                <div className="rounded-md border divide-y mb-1.5">
                  {form.attachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-1.5">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <a href={`/api/storage${a.fileKey}`} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-sm hover:underline">{a.filename}</a>
                      <button type="button" onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-2 rounded-md border border-dashed py-2.5 text-sm text-muted-foreground hover:bg-muted/30 cursor-pointer transition-colors">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Uploading…" : "Upload file"}
                <input type="file" multiple className="hidden" disabled={uploading} onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Return Type</Label>
                <Select value={form.returnType} onValueChange={(v) => setForm({ ...form, returnType: v })}>
                  <SelectTrigger><SelectValue placeholder="Requested outcome" /></SelectTrigger>
                  <SelectContent>
                    {RETURN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier RMA Reference</Label>
                <Input value={form.supplierRmaNumber} onChange={(e) => setForm({ ...form, supplierRmaNumber: e.target.value })} placeholder="Supplier's RMA #" />
              </div>
              <div className="space-y-1.5">
                <Label>Tracking Number</Label>
                <Input value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} placeholder="Return shipment tracking" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as RAStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving…" : editingId !== null ? "Save Changes" : "Create RMA"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
