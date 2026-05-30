import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListInventory, useUpdateInventory, useListSuppliers,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Boxes, AlertTriangle, ShoppingCart,
  ChevronUp, ChevronDown, ChevronsUpDown, Plus, Minus,
  ChevronLeft, ChevronRight, Search, X,
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

const PAGE_SIZE = 50;

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

/* ─── Reorder quantities state ──────────────────────────────────────────── */

type ReorderLines = Record<number, { qty: number; unitCost: string; selected: boolean }>;

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [showLowStock, setShowLowStock] = useState(false);
  const [search, setSearch]             = useState("");
  const [page, setPage]                 = useState(1);
  const [editingItem, setEditingItem]   = useState<InventoryItem | null>(null);
  const [editForm, setEditForm]         = useState({ stockQuantity: "", lowStockThreshold: "" });
  const [sortKey, setSortKey]           = useState<SortKey>("name");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [checked, setChecked]           = useState<Set<number>>(new Set());

  /* ── Reorder dialog state ── */
  const [reorderDlg, setReorderDlg]     = useState(false);
  const [reorderLines, setReorderLines] = useState<ReorderLines>({});
  const [reorderSupplier, setReorderSupplier] = useState("");
  const [reorderNotes, setReorderNotes] = useState("");
  const [poSaving, setPoSaving]         = useState(false);

  /* Reset to page 1 when filter/search changes */
  useEffect(() => { setPage(1); }, [showLowStock, search]);

  /* ── Main paginated list for the table ── */
  const { data: inventoryData, isLoading } = useListInventory(
    { lowStock: showLowStock || undefined, search: search || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    { query: { queryKey: ["inventory", showLowStock, search, page] } }
  );

  /* ── Always-fetched low-stock list for count badge + reorder dialog ── */
  const { data: lowStockData } = useListInventory(
    { lowStock: true, limit: 500 },
    { query: { queryKey: ["inventory-low-stock"] } }
  );

  const updateMutation = useUpdateInventory();

  const { data: suppliersData } = useListSuppliers(
    {},
    { query: { queryKey: ["suppliers-reorder"] } }
  );
  const suppliers = (suppliersData as { items?: { id: number; name: string }[] })?.items ?? [];

  const items = ((inventoryData as { items?: InventoryItem[] })?.items ?? []) as InventoryItem[];
  const total = (inventoryData as { total?: number })?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const lowStockItems = ((lowStockData as { items?: InventoryItem[] })?.items ?? []) as InventoryItem[];
  const lowStockCount = (lowStockData as { total?: number })?.total ?? 0;

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
          queryClient.invalidateQueries({ queryKey: ["inventory-low-stock"] });
        },
        onError: () => toast.error("Failed to update inventory"),
      }
    );
  };

  /* Sort within the current page */
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

  /* ── Open reorder dialog ── */
  function openReorderDialog() {
    const initial: ReorderLines = {};
    lowStockItems.forEach(i => {
      const suggestedQty = Math.max(1, (i.lowStockThreshold ?? 5) * 3 - i.stockQuantity);
      initial[i.productId] = { qty: suggestedQty, unitCost: "0.00", selected: true };
    });
    setReorderLines(initial);
    setReorderSupplier("");
    setReorderNotes("");
    setReorderDlg(true);
  }

  function setLineQty(productId: number, qty: number) {
    setReorderLines(prev => ({ ...prev, [productId]: { ...prev[productId], qty: Math.max(1, qty) } }));
  }

  function toggleLine(productId: number) {
    setReorderLines(prev => ({ ...prev, [productId]: { ...prev[productId], selected: !prev[productId].selected } }));
  }

  const selectedLines = Object.entries(reorderLines)
    .filter(([, v]) => v.selected)
    .map(([k, v]) => ({ productId: Number(k), quantity: v.qty, unitCost: parseFloat(v.unitCost) || 0 }));

  async function handleCreatePO() {
    if (selectedLines.length === 0) {
      toast.error("Select at least one product");
      return;
    }
    setPoSaving(true);
    try {
      const r = await fetch("/api/purchase-orders", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: reorderSupplier ? parseInt(reorderSupplier) : null,
          status: "draft",
          notes: reorderNotes || `Auto-reorder: ${selectedLines.length} low-stock item(s)`,
          items: selectedLines,
        }),
      });
      if (!r.ok) throw new Error();
      toast.success("Draft purchase order created — visit Purchase Orders to review");
      setReorderDlg(false);
    } catch {
      toast.error("Failed to create purchase order");
    } finally {
      setPoSaving(false);
    }
  }

  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd   = Math.min(page * PAGE_SIZE, total);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Inventory</h1>
            <p className="text-sm text-muted-foreground">Track stock levels, manage replenishment, and monitor low-stock items.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {lowStockCount > 0 && (
              <Button variant="outline" size="sm"
                className="gap-1.5 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                onClick={openReorderDialog}>
                <ShoppingCart className="w-3.5 h-3.5" />
                Reorder {lowStockCount} low-stock item{lowStockCount !== 1 ? "s" : ""}
              </Button>
            )}
            {lowStockCount > 0 && !showLowStock && (
              <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 bg-amber-50">
                <AlertTriangle className="w-3 h-3" /> {lowStockCount} low stock
              </Badge>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={showLowStock} onCheckedChange={setShowLowStock} />
              <Label>Low stock only</Label>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading inventory...</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border">
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Boxes className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">
                  {search ? "No products match your search" : showLowStock ? "No low stock items" : "No inventory tracked"}
                </p>
                <p className="text-muted-foreground text-sm">
                  {search
                    ? `No products found for "${search}".`
                    : showLowStock
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
                        item.isLowStock && "bg-amber-50/50",
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
                      <td className={cn("p-3 text-right font-bold", item.isLowStock && "text-amber-600")}>
                        {item.trackInventory
                          ? item.stockQuantity
                          : <span className="text-muted-foreground font-normal">∞</span>}
                      </td>
                      <td className="p-3 text-right hidden sm:table-cell text-muted-foreground">
                        {item.lowStockThreshold ?? 5}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        {item.isLowStock ? (
                          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 bg-amber-50">
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

            {/* ── Pagination footer ── */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm">
                <span className="text-muted-foreground">
                  {pageStart}–{pageEnd} of {total} items
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const p = start + i;
                    return p <= totalPages ? (
                      <Button
                        key={p} size="icon" className="h-8 w-8"
                        variant={p === page ? "default" : "outline"}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    ) : null;
                  })}
                  <Button
                    variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Edit stock dialog ── */}
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

      {/* ── Reorder PO dialog ── */}
      <Dialog open={reorderDlg} onOpenChange={setReorderDlg}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" /> Create Reorder Purchase Order
            </DialogTitle>
            <DialogDescription>
              A draft PO will be created for the selected low-stock items. Review and confirm it on the Purchase Orders page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Supplier */}
            <div>
              <Label>Supplier (optional)</Label>
              <Select value={reorderSupplier} onValueChange={setReorderSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="No supplier selected" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No supplier</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lines */}
            <div>
              <Label className="mb-2 block">Items to reorder</Label>
              <div className="rounded-lg border overflow-hidden divide-y max-h-64 overflow-y-auto">
                {lowStockItems.map(item => {
                  const line = reorderLines[item.productId];
                  if (!line) return null;
                  return (
                    <div key={item.productId}
                      className={cn("flex items-center gap-3 p-3 text-sm", !line.selected && "opacity-50")}>
                      <input type="checkbox" checked={line.selected}
                        onChange={() => toggleLine(item.productId)}
                        className="rounded border-muted-foreground/40 accent-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-amber-600">In stock: {item.stockQuantity}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => setLineQty(item.productId, line.qty - 1)}
                          disabled={!line.selected}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <Input
                          type="number" min="1"
                          className="w-16 h-7 text-center text-sm p-1"
                          value={line.qty}
                          disabled={!line.selected}
                          onChange={e => setLineQty(item.productId, parseInt(e.target.value) || 1)} />
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => setLineQty(item.productId, line.qty + 1)}
                          disabled={!line.selected}>
                          <Plus className="w-3 h-3" />
                        </Button>
                        <span className="text-xs text-muted-foreground w-6">units</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedLines.length} of {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} selected
              </p>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} placeholder="Any notes for the supplier…"
                value={reorderNotes} onChange={e => setReorderNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReorderDlg(false)}>Cancel</Button>
            <Button onClick={handleCreatePO} disabled={poSaving || selectedLines.length === 0}>
              <ShoppingCart className="w-4 h-4" />
              Create Draft PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
