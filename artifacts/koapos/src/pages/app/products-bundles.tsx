import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProductBundles,
  useCreateProductBundle,
  useUpdateProductBundle,
  useDeleteProductBundle,
  useListProducts,
  type Product,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { Plus, Layers, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";

type BundleItem = { productId: number; productName: string; quantity: number; price: number };

export default function ProductsBundlesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "" });
  const [selectedItems, setSelectedItems] = useState<BundleItem[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const { data: bundles = [], isLoading } = useListProductBundles();
  const { data: productsData } = useListProducts({ limit: 500 });
  const createBundle = useCreateProductBundle();
  const updateBundle = useUpdateProductBundle();
  const deleteBundle = useDeleteProductBundle();

  const products = (productsData?.items ?? []).filter(
    (p) => p.name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", description: "", price: "" });
    setSelectedItems([]);
    setProductSearch("");
    setDialogOpen(true);
  };

  const openEdit = (b: (typeof bundles)[0]) => {
    setEditingId(b.id);
    setForm({ name: b.name, description: b.description ?? "", price: String(b.price ?? 0) });
    setSelectedItems((b.items ?? []).map((i) => ({
      productId: i.productId ?? 0,
      productName: i.productName ?? "",
      quantity: i.quantity ?? 1,
      price: 0,
    })));
    setProductSearch("");
    setDialogOpen(true);
  };

  const addProduct = (p: Product) => {
    if (selectedItems.find((i) => i.productId === p.id)) return;
    setSelectedItems((prev) => [...prev, {
      productId: p.id,
      productName: p.name ?? "",
      quantity: 1,
      price: p.price ?? 0,
    }]);
  };

  const updateQty = (productId: number, qty: number) =>
    setSelectedItems((prev) => prev.map((i) =>
      i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i
    ));

  const removeItem = (productId: number) =>
    setSelectedItems((prev) => prev.filter((i) => i.productId !== productId));

  const handleSave = () => {
    if (!form.name) { toast.error("Bundle name is required"); return; }
    if (!selectedItems.length) { toast.error("Add at least one product"); return; }
    const payload = {
      name: form.name,
      description: form.description || undefined,
      price: parseFloat(form.price) || 0,
      items: selectedItems.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
      })),
    };
    if (editingId !== null) {
      updateBundle.mutate({ id: editingId, data: payload }, {
        onSuccess: () => { toast.success("Bundle updated"); setDialogOpen(false); },
        onError: () => toast.error("Failed to update bundle"),
      });
    } else {
      createBundle.mutate({ data: payload }, {
        onSuccess: () => { toast.success("Bundle created"); setDialogOpen(false); },
        onError: () => toast.error("Failed to create bundle"),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteBundle.mutate({ id }, {
      onSuccess: () => toast.success("Bundle deleted"),
      onError: () => toast.error("Failed to delete"),
    });
  };

  const suggestedPrice = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Bundles</h1>
            <p className="text-sm text-muted-foreground">Create product bundles and combo deals with combined pricing.</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Bundle</Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : bundles.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Layers className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No bundles yet</p>
                <p className="text-muted-foreground text-sm">Create bundles to sell multiple products together at a special price.</p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Bundle</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bundles.map((b) => (
              <Card key={b.id} className="relative">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{b.name}</p>
                      {b.description && <p className="text-xs text-muted-foreground">{b.description}</p>}
                    </div>
                    <Badge variant={b.isActive === "true" ? "default" : "secondary"}>
                      {b.isActive === "true" ? "Active" : "Draft"}
                    </Badge>
                  </div>
                  <p className="text-xl font-bold text-primary">{formatCurrency(b.price ?? 0)}</p>
                  <div className="space-y-1">
                    {(b.items ?? []).map((i) => (
                      <div key={i.productId} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">× {i.quantity} {i.productName}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(b.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Bundle" : "New Bundle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Bundle Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Starter Pack" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Bundle Price</Label>
                <Input type="number" step="0.01" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder={`Suggested: ${formatCurrency(suggestedPrice)}`} />
              </div>
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <Label>Products in Bundle</Label>
              <Input placeholder="Search products..." value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)} />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {products.slice(0, 10).map((p) => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-1.5 rounded hover:bg-muted text-sm flex justify-between">
                    <span className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-muted-foreground" />{p.name}
                    </span>
                    <span className="text-muted-foreground">{formatCurrency(p.price ?? 0)}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedItems.length > 0 && (
              <div className="border rounded-lg divide-y">
                {selectedItems.map((i) => (
                  <div key={i.productId} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm">{i.productName}</span>
                    <Input type="number" min={1} value={i.quantity}
                      onChange={(e) => updateQty(i.productId, parseInt(e.target.value) || 1)}
                      className="w-16 h-7 text-center" />
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => removeItem(i.productId)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createBundle.isPending || updateBundle.isPending}>
                {editingId ? "Save Changes" : "Create Bundle"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
