import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProducts,
  useListCategories,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useCreateCategory,
  Product,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import {
  Search, Plus, Pencil, Trash2, Package,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Tag, Barcode, Boxes, Settings2, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type SortKey = "name" | "price" | "stock" | "category";
type SortDir  = "asc" | "desc";
type DetailTab = "details" | "inventory" | "settings";

type ProductForm = {
  name: string; description: string; price: string; costPrice: string;
  sku: string; categoryId: string; stockQuantity: string;
  lowStockThreshold: string; taxRate: string;
  trackInventory: boolean; isActive: boolean; excludeFromLoyalty: boolean;
};

const defaultForm: ProductForm = {
  name: "", description: "", price: "", costPrice: "", sku: "",
  categoryId: "", stockQuantity: "0", lowStockThreshold: "5",
  taxRate: "10", trackInventory: true, isActive: true, excludeFromLoyalty: false,
};

/* ─── Sort header ────────────────────────────────────────────────────────── */

function SortTh({ label, sortKey, active, dir, onSort, className }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th className={cn("p-3 text-left font-medium whitespace-nowrap cursor-pointer select-none group", className)} onClick={() => onSort(sortKey)}>
      <span className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" /> : <ChevronsUpDown className="w-3 h-3" />}
        </span>
      </span>
    </th>
  );
}

/* ─── Detail row helper ──────────────────────────────────────────────────── */

function InfoRow({ icon: Icon, label, value, valueClass }: {
  icon: React.ComponentType<{ className?: string }>; label: string;
  value?: string | number | null; valueClass?: string;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="text-sm min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("font-medium", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

/* ─── Product detail dialog ──────────────────────────────────────────────── */

function ProductDetailDialog({
  product, onClose, onEdit, onDelete, deleteIsPending,
}: {
  product: Product | null;
  onClose: () => void;
  onEdit: (p: Product) => void;
  onDelete: (id: number) => void;
  deleteIsPending: boolean;
}) {
  const [tab, setTab] = useState<DetailTab>("details");
  if (!product) return null;

  const margin = product.costPrice && product.price > 0
    ? Math.round(((product.price - product.costPrice) / product.price) * 100)
    : null;

  const isLowStock = product.trackInventory &&
    (product.stockQuantity ?? 0) <= (product.lowStockThreshold ?? 5);

  const TABS: { key: DetailTab; label: string }[] = [
    { key: "details",   label: "Details"   },
    { key: "inventory", label: "Inventory" },
    { key: "settings",  label: "Settings"  },
  ];

  return (
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-base leading-tight truncate">{product.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <Badge variant={product.isActive ? "default" : "secondary"} className="text-xs px-2 py-0 h-5">
                    {product.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {product.category && (
                    <Badge variant="outline" className="text-xs px-2 py-0 h-5">{product.category.name}</Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex border-b -mx-6 px-6 gap-0">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}>
              {label}
            </button>
          ))}
        </div>

        {tab === "details" && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/20 divide-y">
              <InfoRow icon={DollarSign} label="Sell Price"  value={formatCurrency(product.price)} />
              {product.costPrice != null && (
                <InfoRow icon={DollarSign} label="Cost Price" value={formatCurrency(product.costPrice)} />
              )}
              {margin !== null && (
                <InfoRow icon={DollarSign} label="Margin" value={`${margin}%`} valueClass={margin < 20 ? "text-destructive" : "text-emerald-600"} />
              )}
            </div>
            {(product.sku || product.barcode) && (
              <div className="rounded-xl border bg-muted/20 divide-y">
                <InfoRow icon={Tag}     label="SKU"     value={product.sku} />
                <InfoRow icon={Barcode} label="Barcode" value={product.barcode} />
              </div>
            )}
            {product.description && (
              <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Description</p>
                <p>{product.description}</p>
              </div>
            )}
          </div>
        )}

        {tab === "inventory" && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/20 divide-y">
              <div className="flex items-center gap-3 px-4 py-3">
                <Boxes className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Track Inventory</p>
                  <p className="font-medium">{product.trackInventory ? "Enabled" : "Disabled"}</p>
                </div>
              </div>
              {product.trackInventory && (
                <>
                  <InfoRow icon={Boxes} label="In Stock" value={product.stockQuantity}
                    valueClass={isLowStock ? "text-destructive" : undefined} />
                  <InfoRow icon={Boxes} label="Low Stock Alert" value={product.lowStockThreshold ?? 5} />
                </>
              )}
            </div>
            {isLowStock && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                ⚠ Stock is below the low stock threshold
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/20 divide-y">
              <div className="flex items-center gap-3 px-4 py-3">
                <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium">{product.isActive ? "Active — visible in POS" : "Inactive — hidden from POS"}</p>
                </div>
              </div>
              <InfoRow icon={Settings2} label="GST Rate" value={`${product.taxRate ?? 10}%`} />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button variant="destructive" size="sm" className="gap-1.5"
            onClick={() => { onDelete(product.id); onClose(); }} disabled={deleteIsPending}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" className="gap-1.5" onClick={() => { onClose(); onEdit(product); }}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch]             = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editingProduct, setEditingProduct]   = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm]                 = useState<ProductForm>(defaultForm);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [sortKey, setSortKey]           = useState<SortKey>("name");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [checked, setChecked]           = useState<Set<number>>(new Set());

  const { data: productsData, isLoading } = useListProducts(
    { search: search || undefined, categoryId: categoryFilter && categoryFilter !== "all" ? parseInt(categoryFilter) : undefined, limit: 1000 },
    { query: { queryKey: ["products", search, categoryFilter] } }
  );
  const { data: categoriesData } = useListCategories({ query: { queryKey: ["categories"] } });
  const createMutation   = useCreateProduct();
  const updateMutation   = useUpdateProduct();
  const deleteMutation   = useDeleteProduct();
  const createCategoryMutation = useCreateCategory();

  const products   = productsData?.items || [];
  const categories = (categoriesData as unknown as { id: number; name: string }[]) || [];

  /* Sort */
  const sorted = [...products].sort((a, b) => {
    let av: string | number = "", bv: string | number = "";
    switch (sortKey) {
      case "name":     av = a.name.toLowerCase();              bv = b.name.toLowerCase();              break;
      case "price":    av = a.price;                           bv = b.price;                           break;
      case "stock":    av = a.trackInventory ? (a.stockQuantity ?? 0) : Infinity; bv = b.trackInventory ? (b.stockQuantity ?? 0) : Infinity; break;
      case "category": av = (a.category?.name ?? "").toLowerCase(); bv = (b.category?.name ?? "").toLowerCase(); break;
    }
    const r = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? r : -r;
  });

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => { if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; } setSortDir("asc"); return key; });
  }, []);

  const allChecked = sorted.length > 0 && sorted.every((p) => checked.has(p.id));
  const toggleAll  = () => setChecked(allChecked ? new Set() : new Set(sorted.map((p) => p.id)));
  const toggleOne  = (id: number) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openCreate = () => { setEditingProduct(null); setForm(defaultForm); setDialogOpen(true); };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name, description: p.description || "",
      price: p.price.toString(), costPrice: p.costPrice?.toString() || "",
      sku: p.sku || "", categoryId: p.categoryId?.toString() || "",
      stockQuantity: (p.stockQuantity ?? 0).toString(),
      lowStockThreshold: p.lowStockThreshold?.toString() || "5",
      taxRate: p.taxRate?.toString() || "10",
      trackInventory: p.trackInventory ?? true,
      isActive: p.isActive ?? true,
      excludeFromLoyalty: p.excludeFromLoyalty ?? false,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.price) { toast.error("Name and price are required"); return; }
    const payload = {
      name: form.name, description: form.description || undefined,
      price: parseFloat(form.price),
      costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
      sku: form.sku || undefined,
      categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      stockQuantity: parseInt(form.stockQuantity) || 0,
      lowStockThreshold: parseInt(form.lowStockThreshold) || 5,
      taxRate: parseFloat(form.taxRate) || 10,
      trackInventory: form.trackInventory, isActive: form.isActive,
      excludeFromLoyalty: form.excludeFromLoyalty,
    };
    const inv = () => queryClient.invalidateQueries({ queryKey: ["products"] });
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload }, {
        onSuccess: () => { toast.success("Product updated"); setDialogOpen(false); inv(); },
        onError: () => toast.error("Failed to update product"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { toast.success("Product created"); setDialogOpen(false); inv(); },
        onError: () => toast.error("Failed to create product"),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast.success("Product deleted"); queryClient.invalidateQueries({ queryKey: ["products"] }); },
      onError: () => toast.error("Failed to delete product"),
    });
  };

  const handleCreateCategory = () => {
    if (!newCategoryName) return;
    createCategoryMutation.mutate({ data: { name: newCategoryName } }, {
      onSuccess: () => { toast.success("Category created"); setCategoryDialogOpen(false); setNewCategoryName(""); queryClient.invalidateQueries({ queryKey: ["categories"] }); },
      onError: () => toast.error("Failed to create category"),
    });
  };

  const sh = (label: string, key: SortKey, className?: string) => ({
    label, sortKey: key, active: sortKey, dir: sortDir, onSort: handleSort, className,
  });

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Products</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>Manage Categories</Button>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Product</Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="rounded-lg border">
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Package className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No products yet</p>
                <p className="text-muted-foreground text-sm">Add your first product to start selling.</p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Product</Button>
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
                  <SortTh {...sh("Category", "category", "hidden md:table-cell")} />
                  <SortTh {...sh("Price", "price")} />
                  <SortTh {...sh("Stock", "stock", "hidden sm:table-cell")} />
                  <th className="p-3 text-left font-medium whitespace-nowrap hidden lg:table-cell">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((product) => {
                  const isChecked  = checked.has(product.id);
                  const isLowStock = product.trackInventory && (product.stockQuantity ?? 0) <= (product.lowStockThreshold ?? 5);
                  return (
                    <tr key={product.id}
                      className={cn("bg-background hover:bg-muted/30 transition-colors cursor-pointer", isChecked && "bg-primary/5")}
                      onClick={() => setSelectedProduct(product)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleOne(product.id)}
                          className="rounded border-muted-foreground/40 accent-primary" />
                      </td>
                      <td className="p-3">
                        <p className="font-medium">{product.name}</p>
                        {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        {product.category
                          ? <Badge variant="secondary">{product.category.name}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 font-medium">{formatCurrency(product.price)}</td>
                      <td className="p-3 hidden sm:table-cell">
                        {product.trackInventory
                          ? <span className={isLowStock ? "text-destructive font-medium" : ""}>{product.stockQuantity}</span>
                          : <span className="text-muted-foreground">∞</span>}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <Badge variant={product.isActive ? "default" : "secondary"}>
                          {product.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProductDetailDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="md:col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
            <div>
              <Label>Price (AUD) *</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <Label>Cost Price (AUD)</Label>
              <Input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="ABC-001" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.categoryId || "none"} onValueChange={(v) => setForm({ ...form, categoryId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>GST Rate (%)</Label>
              <Input type="number" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={form.trackInventory} onCheckedChange={(v) => setForm({ ...form, trackInventory: v })} />
              <Label>Track Inventory</Label>
            </div>
            {form.trackInventory && (
              <>
                <div>
                  <Label>Stock Quantity</Label>
                  <Input type="number" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} />
                </div>
                <div>
                  <Label>Low Stock Threshold</Label>
                  <Input type="number" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
                </div>
              </>
            )}
            <div className="flex items-center gap-3 md:col-span-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label>Active (available in POS)</Label>
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <Switch checked={form.excludeFromLoyalty} onCheckedChange={(v) => setForm({ ...form, excludeFromLoyalty: v })} />
              <div>
                <Label>Exclude from Loyalty</Label>
                <p className="text-xs text-muted-foreground">Customers won't earn rewards when purchasing this product.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingProduct ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Categories</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="font-medium">{c.name}</span>
                </div>
              ))}
              {categories.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">No categories yet.</p>}
            </div>
            <div className="border-t pt-4">
              <Label>New Category Name</Label>
              <div className="flex gap-2 mt-2">
                <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Beverages" onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()} />
                <Button onClick={handleCreateCategory} disabled={!newCategoryName || createCategoryMutation.isPending}>Add</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
