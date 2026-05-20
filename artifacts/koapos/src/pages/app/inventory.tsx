import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListInventory, useUpdateInventory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Boxes, AlertTriangle,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type SortKey = "name" | "stock" | "threshold" | "status";
type SortDir  = "asc" | "desc";

interface InventoryItem {
  productId: number;
  productName: string;
  sku?: string | null;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number | null;
  isLowStock: boolean;
}

/* ─── Sort header ────────────────────────────────────────────────────────── */

function SortTh({ label, sortKey, active, dir, onSort, className, align = "left" }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string; align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th className={cn("p-3 font-medium whitespace-nowrap cursor-pointer select-none group", align === "right" ? "text-right" : "text-left", className)}
      onClick={() => onSort(sortKey)}>
      <span className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", align === "right" && "flex-row-reverse")}>
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" /> : <ChevronsUpDown className="w-3 h-3" />}
        </span>
      </span>
    </th>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [showLowStock, setShowLowStock] = useState(false);
  const [editingItem, setEditingItem]   = useState<InventoryItem | null>(null);
  const [editForm, setEditForm]         = useState({ stockQuantity: "", lowStockThreshold: "" });
  const [sortKey, setSortKey]           = useState<SortKey>("name");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [checked, setChecked]           = useState<Set<number>>(new Set());

  const { data: inventory, isLoading } = useListInventory(
    { lowStock: showLowStock || undefined },
    { query: { queryKey: ["inventory", showLowStock] } }
  );
  const updateMutation = useUpdateInventory();

  const openEdit = (item: InventoryItem) => {
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

  const items = (inventory || []) as InventoryItem[];
  const lowStockCount = items.filter((i) => i.isLowStock).length;

  /* Sort */
  const sorted = [...items].sort((a, b) => {
    let av: string | number = "", bv: string | number = "";
    switch (sortKey) {
      case "name":      av = a.productName.toLowerCase(); bv = b.productName.toLowerCase(); break;
      case "stock":     av = a.stockQuantity;             bv = b.stockQuantity;             break;
      case "threshold": av = a.lowStockThreshold ?? 0;   bv = b.lowStockThreshold ?? 0;   break;
      case "status":    av = a.isLowStock ? 0 : 1;       bv = b.isLowStock ? 0 : 1;       break;
    }
    const r = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? r : -r;
  });

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => { if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; } setSortDir("asc"); return key; });
  }, []);

  const allChecked = sorted.length > 0 && sorted.every((i) => checked.has(i.productId));
  const toggleAll  = () => setChecked(allChecked ? new Set() : new Set(sorted.map((i) => i.productId)));
  const toggleOne  = (id: number) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sh = (label: string, key: SortKey, className?: string, align?: "left" | "right") => ({
    label, sortKey: key, active: sortKey, dir: sortDir, onSort: handleSort, className, align,
  });

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
          <div className="rounded-lg border">
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Boxes className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">
                  {showLowStock ? "No low stock items" : "No inventory tracked"}
                </p>
                <p className="text-muted-foreground text-sm">
                  {showLowStock
                    ? "All products are sufficiently stocked."
                    : "Enable inventory tracking on your products to manage stock here."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-3 w-10">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      className="rounded border-muted-foreground/40 accent-primary" />
                  </th>
                  <SortTh {...sh("Product", "name")} />
                  <th className="p-3 text-left font-medium whitespace-nowrap hidden md:table-cell">SKU</th>
                  <SortTh {...sh("In Stock", "stock", undefined, "right")} />
                  <SortTh {...sh("Alert At", "threshold", "hidden sm:table-cell", "right")} />
                  <SortTh {...sh("Status", "status", "hidden lg:table-cell")} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((item) => {
                  const isChecked = checked.has(item.productId);
                  return (
                    <tr
                      key={item.productId}
                      className={cn(
                        "bg-background hover:bg-muted/30 transition-colors cursor-pointer",
                        isChecked && "bg-primary/5",
                        item.isLowStock && "bg-destructive/5",
                      )}
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleOne(item.productId)}
                          className="rounded border-muted-foreground/40 accent-primary" />
                      </td>
                      <td className="p-3">
                        <p className="font-medium">{item.productName}</p>
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground font-mono text-xs">
                        {item.sku || "—"}
                      </td>
                      <td className={cn("p-3 text-right font-bold", item.isLowStock && "text-destructive")}>
                        {item.trackInventory
                          ? item.stockQuantity
                          : <span className="text-muted-foreground font-normal">∞</span>}
                      </td>
                      <td className="p-3 text-right hidden sm:table-cell text-muted-foreground">
                        {item.lowStockThreshold ?? 5}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        {item.isLowStock ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" /> Low Stock
                          </Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-primary" />
              Update Stock: {editingItem?.productName}
            </DialogTitle>
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
            <Button onClick={handleSave} disabled={updateMutation.isPending}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
