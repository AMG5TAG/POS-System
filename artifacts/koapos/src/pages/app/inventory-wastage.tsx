import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListWastage,
  useCreateWastageEntry,
  useDeleteWastageEntry,
  useListProducts,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2, Plus, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";

type WastageReason = "damaged" | "expired" | "theft" | "spoiled" | "other";

const REASON_LABELS: Record<WastageReason, string> = {
  damaged: "Damaged",
  expired: "Expired",
  theft: "Theft / Missing",
  spoiled: "Spoiled",
  other: "Other",
};

const REASON_COLORS: Record<WastageReason, string> = {
  damaged: "bg-orange-100 text-orange-700",
  expired: "bg-red-100 text-red-700",
  theft: "bg-purple-100 text-purple-700",
  spoiled: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

const EMPTY_FORM = {
  productId: "" as string,
  productName: "",
  quantity: "1",
  reason: "damaged" as WastageReason,
  cost: "",
  notes: "",
};

export default function InventoryWastagePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [productSearch, setProductSearch] = useState("");

  const { data: entries = [], isLoading } = useListWastage({});
  const { data: productsData } = useListProducts({ limit: 500 });
  const createEntry = useCreateWastageEntry();
  const deleteEntry = useDeleteWastageEntry();

  const products = (productsData?.items ?? []).filter(
    (p) => p.name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const totalCost = entries.reduce((s, e) => s + (e.cost ?? 0), 0);

  const selectProduct = (p: { id: number; name?: string | null }) => {
    setForm({ ...form, productId: String(p.id), productName: p.name ?? "" });
    setProductSearch(p.name ?? "");
  };

  const handleSave = () => {
    if (!form.productName) { toast.error("Product name is required"); return; }
    if (!form.quantity || parseFloat(form.quantity) <= 0) { toast.error("Enter a valid quantity"); return; }
    createEntry.mutate(
      { data: {
        productId: form.productId ? parseInt(form.productId) : undefined,
        productName: form.productName,
        quantity: parseFloat(form.quantity),
        reason: form.reason,
        cost: form.cost ? parseFloat(form.cost) : undefined,
        notes: form.notes || undefined,
      } },
      {
        onSuccess: () => {
          toast.success("Wastage recorded");
          setDialogOpen(false);
          setForm(EMPTY_FORM);
          setProductSearch("");
        },
        onError: () => toast.error("Failed to record wastage"),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteEntry.mutate({ id }, {
      onSuccess: () => toast.success("Record deleted"),
      onError: () => toast.error("Failed to delete"),
    });
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Wastage / Write-off</h1>
              <p className="text-sm text-muted-foreground">Track damaged, expired, or lost inventory</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> Record Wastage</Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(REASON_LABELS).map(([reason, label]) => {
            const count = entries.filter((e) => e.reason === reason).length;
            return (
              <Card key={reason}>
                <CardContent className="p-4">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {totalCost > 0 && (
          <div className="flex items-center gap-2 p-3 border border-red-200 bg-red-50 rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-red-700">Total cost of wastage recorded: <strong>{formatCurrency(totalCost)}</strong></span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <AlertTriangle className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No wastage recorded</p>
                <p className="text-muted-foreground text-sm">Record damaged, expired, or stolen inventory items.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium">Reason</th>
                  <th className="text-right p-3 font-medium">Qty</th>
                  <th className="text-right p-3 font-medium hidden sm:table-cell">Cost</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Date</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((e) => (
                  <tr key={e.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium">{e.productName}</p>
                          {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${REASON_COLORS[e.reason as WastageReason] ?? ""}`}>
                        {REASON_LABELS[e.reason as WastageReason] ?? e.reason}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{e.quantity}</td>
                    <td className="p-3 text-right text-muted-foreground hidden sm:table-cell">
                      {e.cost ? formatCurrency(e.cost) : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs hidden md:table-cell">{formatDate(e.createdAt)}</td>
                    <td className="p-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(e.id)}>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Wastage</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <div className="relative">
                <Input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setForm({ ...form, productName: e.target.value, productId: "" }); }}
                  placeholder="Search or type product name..."
                />
                {productSearch && products.length > 0 && !form.productId && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-lg shadow-lg mt-1 max-h-[min(200px,50dvh)] overflow-y-auto">
                    {products.slice(0, 8).map((p) => (
                      <button key={p.id} onClick={() => selectProduct(p)}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" step="0.01" value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} min="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v as WastageReason })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Estimated Cost ($) <span className="text-muted-foreground text-xs">optional</span></Label>
              <Input type="number" step="0.01" value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0.00" />
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">optional</span></Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Additional details..." rows={2} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createEntry.isPending}>Record Wastage</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
