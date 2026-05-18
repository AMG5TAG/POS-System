import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListParkedSales,
  useCreateParkedSale,
  useDeleteParkedSale,
  useRestoreParkedSale,
  useListProducts,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ParkingCircle, Plus, Trash2, ShoppingCart, Clock } from "lucide-react";
import { toast } from "sonner";

type ParkedItem = { productId: number; name: string; quantity: number; price: number };

export default function POSParkedPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [note, setNote] = useState("");
  const [selectedItems, setSelectedItems] = useState<ParkedItem[]>([]);

  const { data: sales = [], isLoading } = useListParkedSales();
  const { data: productsData } = useListProducts({ limit: 500 });
  const createSale = useCreateParkedSale();
  const deleteSale = useDeleteParkedSale();
  const restoreSale = useRestoreParkedSale();

  const products = (productsData?.items ?? []).filter(
    (p) => p.name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addProduct = (p: { id: number; name?: string | null; price?: number | null }) => {
    const existing = selectedItems.find((i) => i.productId === p.id);
    if (existing) {
      setSelectedItems((prev) => prev.map((i) =>
        i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setSelectedItems((prev) => [...prev, { productId: p.id, name: p.name ?? "", quantity: 1, price: p.price ?? 0 }]);
    }
  };

  const updateQty = (id: number, qty: number) =>
    setSelectedItems((prev) => prev.map((i) => i.productId === id ? { ...i, quantity: Math.max(1, qty) } : i));

  const removeItem = (id: number) => setSelectedItems((prev) => prev.filter((i) => i.productId !== id));

  const total = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);

  const handlePark = () => {
    if (!selectedItems.length) { toast.error("Add at least one item"); return; }
    createSale.mutate(
      { data: { items: selectedItems, total, note: note || undefined } },
      {
        onSuccess: (data) => {
          toast.success(`Sale ${data.reference} parked`);
          setDialogOpen(false);
          setNote("");
          setSelectedItems([]);
          setProductSearch("");
        },
        onError: () => toast.error("Failed to park sale"),
      }
    );
  };

  const handleResume = (id: number, reference: string) => {
    restoreSale.mutate({ id }, {
      onSuccess: () => toast.success(`${reference} restored — head to POS to complete`),
      onError: () => toast.error("Failed to restore sale"),
    });
  };

  const handleDelete = (id: number) => {
    deleteSale.mutate({ id }, {
      onSuccess: () => toast.success("Parked sale discarded"),
      onError: () => toast.error("Failed to discard sale"),
    });
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ParkingCircle className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Parked Sales</h1>
              <p className="text-sm text-muted-foreground">Hold a sale and resume it later</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Park a Sale
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : sales.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <ParkingCircle className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No parked sales</p>
                <p className="text-muted-foreground text-sm">Park a sale to hold it while you assist another customer.</p>
              </div>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Park a Sale
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sales.map((s) => (
              <Card key={s.id} className="border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{s.reference}</p>
                      {s.note && <p className="font-medium text-sm">{s.note}</p>}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />{formatDate(s.createdAt)}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-sm text-muted-foreground">
                    {(s.items as ParkedItem[]).map((i) => (
                      <p key={i.productId}>× {i.quantity} {i.name}</p>
                    ))}
                  </div>
                  <p className="font-bold text-lg">{formatCurrency(s.total ?? 0)}</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => handleResume(s.id, s.reference)}
                      disabled={restoreSale.isPending}>
                      <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Resume
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="text-destructive hover:text-destructive px-2"
                      onClick={() => handleDelete(s.id)}
                      disabled={deleteSale.isPending}>
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Park a Sale</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Table 5, Mrs Johnson" />
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <Label>Add Products</Label>
              <Input placeholder="Search products..." value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)} />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {products.slice(0, 10).map((p) => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-1.5 rounded hover:bg-muted text-sm flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(p.price ?? 0)}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedItems.length > 0 && (
              <div className="border rounded-lg divide-y">
                {selectedItems.map((i) => (
                  <div key={i.productId} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm">{i.name}</span>
                    <Input type="number" min={1} value={i.quantity}
                      onChange={(e) => updateQty(i.productId, parseInt(e.target.value) || 1)}
                      className="w-16 h-7 text-center" />
                    <span className="w-20 text-right text-sm">{formatCurrency(i.price * i.quantity)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                      onClick={() => removeItem(i.productId)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 font-semibold text-sm bg-muted/30">
                  <span>Total</span><span>{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handlePark} disabled={createSale.isPending}>
                <ParkingCircle className="w-4 h-4 mr-2" /> Park Sale
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
