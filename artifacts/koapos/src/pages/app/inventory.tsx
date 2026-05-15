import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListInventory, useUpdateInventory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Boxes, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [showLowStock, setShowLowStock] = useState(false);
  const [editingItem, setEditingItem] = useState<{ productId: number; productName: string; stockQuantity: number; lowStockThreshold: number | null } | null>(null);
  const [editForm, setEditForm] = useState({ stockQuantity: "", lowStockThreshold: "" });

  const { data: inventory, isLoading } = useListInventory(
    { lowStock: showLowStock || undefined },
    { query: { queryKey: ["inventory", showLowStock] } }
  );

  const updateMutation = useUpdateInventory();

  const openEdit = (item: any) => {
    setEditingItem(item);
    setEditForm({
      stockQuantity: item.stockQuantity.toString(),
      lowStockThreshold: item.lowStockThreshold?.toString() || "5",
    });
  };

  const handleSave = () => {
    if (!editingItem) return;
    updateMutation.mutate(
      {
        productId: editingItem.productId,
        data: {
          stockQuantity: parseInt(editForm.stockQuantity) || 0,
          lowStockThreshold: parseInt(editForm.lowStockThreshold) || 5,
        },
      },
      {
        onSuccess: () => {
          toast.success("Inventory updated");
          setEditingItem(null);
          queryClient.invalidateQueries({ queryKey: ["inventory"] });
        },
        onError: () => toast.error("Failed to update inventory"),
      }
    );
  };

  const items = inventory || [];
  const lowStockCount = items.filter((i) => i.isLowStock).length;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Inventory</h1>
          <div className="flex items-center gap-3">
            {lowStockCount > 0 && !showLowStock && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" /> {lowStockCount} low stock
              </Badge>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={showLowStock} onCheckedChange={setShowLowStock} />
              <Label>Low stock only</Label>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading inventory...</div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Boxes className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">{showLowStock ? "No low stock items" : "No inventory tracked"}</p>
                <p className="text-muted-foreground text-sm">
                  {showLowStock
                    ? "All products are sufficiently stocked."
                    : "Enable inventory tracking on your products to manage stock here."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">Product</th>
                  <th className="text-left p-4 font-medium hidden md:table-cell">SKU</th>
                  <th className="text-right p-4 font-medium">In Stock</th>
                  <th className="text-right p-4 font-medium hidden sm:table-cell">Threshold</th>
                  <th className="text-center p-4 font-medium hidden lg:table-cell">Status</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.productId} className={`bg-background hover:bg-muted/30 transition-colors ${item.isLowStock ? "bg-destructive/5" : ""}`}>
                    <td className="p-4">
                      <p className="font-medium">{item.productName}</p>
                    </td>
                    <td className="p-4 hidden md:table-cell text-muted-foreground font-mono text-xs">
                      {item.sku || "—"}
                    </td>
                    <td className={`p-4 text-right font-bold ${item.isLowStock ? "text-destructive" : ""}`}>
                      {item.stockQuantity}
                    </td>
                    <td className="p-4 text-right hidden sm:table-cell text-muted-foreground">
                      {item.lowStockThreshold ?? 5}
                    </td>
                    <td className="p-4 text-center hidden lg:table-cell">
                      {item.isLowStock ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="w-3 h-3" /> Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Stock: {editingItem?.productName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Stock Quantity</Label>
              <Input
                type="number"
                value={editForm.stockQuantity}
                onChange={(e) => setEditForm({ ...editForm, stockQuantity: e.target.value })}
                min={0}
              />
            </div>
            <div>
              <Label>Low Stock Alert Threshold</Label>
              <Input
                type="number"
                value={editForm.lowStockThreshold}
                onChange={(e) => setEditForm({ ...editForm, lowStockThreshold: e.target.value })}
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">Alert when stock falls to or below this number.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
