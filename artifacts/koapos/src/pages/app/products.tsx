import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProducts,
  useListCategories,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useCreateCategory,
  Product,
  Category,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { Search, Plus, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type ProductForm = {
  name: string;
  description: string;
  price: string;
  costPrice: string;
  sku: string;
  categoryId: string;
  stockQuantity: string;
  lowStockThreshold: string;
  taxRate: string;
  trackInventory: boolean;
  isActive: boolean;
};

const defaultForm: ProductForm = {
  name: "",
  description: "",
  price: "",
  costPrice: "",
  sku: "",
  categoryId: "",
  stockQuantity: "0",
  lowStockThreshold: "5",
  taxRate: "10",
  trackInventory: true,
  isActive: true,
};

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(defaultForm);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const { data: productsData, isLoading } = useListProducts(
    { search: search || undefined, categoryId: categoryFilter && categoryFilter !== "all" ? parseInt(categoryFilter) : undefined, limit: 100 },
    { query: { queryKey: ["products", search, categoryFilter] } }
  );

  const { data: categoriesData } = useListCategories({ query: { queryKey: ["categories"] } });

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();
  const createCategoryMutation = useCreateCategory();

  const products = productsData?.items || [];
  const categories = categoriesData?.items || [];

  const openCreate = () => {
    setEditingProduct(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      description: p.description || "",
      price: p.price.toString(),
      costPrice: p.costPrice?.toString() || "",
      sku: p.sku || "",
      categoryId: p.categoryId?.toString() || "",
      stockQuantity: p.stockQuantity.toString(),
      lowStockThreshold: p.lowStockThreshold?.toString() || "5",
      taxRate: p.taxRate?.toString() || "10",
      trackInventory: p.trackInventory,
      isActive: p.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.price) {
      toast.error("Name and price are required");
      return;
    }
    const payload = {
      name: form.name,
      description: form.description || undefined,
      price: parseFloat(form.price),
      costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
      sku: form.sku || undefined,
      categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      stockQuantity: parseInt(form.stockQuantity) || 0,
      lowStockThreshold: parseInt(form.lowStockThreshold) || 5,
      taxRate: parseFloat(form.taxRate) || 10,
      trackInventory: form.trackInventory,
      isActive: form.isActive,
    };

    if (editingProduct) {
      updateMutation.mutate(
        { id: editingProduct.id, data: payload },
        {
          onSuccess: () => {
            toast.success("Product updated");
            setDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ["products"] });
          },
          onError: () => toast.error("Failed to update product"),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast.success("Product created");
            setDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ["products"] });
          },
          onError: () => toast.error("Failed to create product"),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deletingProduct) return;
    deleteMutation.mutate(
      { id: deletingProduct.id },
      {
        onSuccess: () => {
          toast.success("Product deleted");
          setDeleteDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["products"] });
        },
        onError: () => toast.error("Failed to delete product"),
      }
    );
  };

  const handleCreateCategory = () => {
    if (!newCategoryName) return;
    createCategoryMutation.mutate(
      { data: { name: newCategoryName } },
      {
        onSuccess: () => {
          toast.success("Category created");
          setCategoryDialogOpen(false);
          setNewCategoryName("");
          queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
        onError: () => toast.error("Failed to create category"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Products</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
              Manage Categories
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Add Product
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading products...</div>
        ) : products.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Package className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No products yet</p>
                <p className="text-muted-foreground text-sm">Add your first product to start selling.</p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Add Product
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">Product</th>
                  <th className="text-left p-4 font-medium hidden md:table-cell">Category</th>
                  <th className="text-right p-4 font-medium">Price</th>
                  <th className="text-right p-4 font-medium hidden sm:table-cell">Stock</th>
                  <th className="text-center p-4 font-medium hidden lg:table-cell">Status</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((product) => (
                  <tr key={product.id} className="bg-background hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      {product.category ? (
                        <Badge variant="secondary">{product.category.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-medium">{formatCurrency(product.price)}</td>
                    <td className="p-4 text-right hidden sm:table-cell">
                      {product.trackInventory ? (
                        <span className={product.stockQuantity <= (product.lowStockThreshold || 5) ? "text-destructive font-medium" : ""}>
                          {product.stockQuantity}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">∞</span>
                      )}
                    </td>
                    <td className="p-4 text-center hidden lg:table-cell">
                      <Badge variant={product.isActive ? "default" : "secondary"}>
                        {product.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setDeletingProduct(product); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingProduct ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{deletingProduct?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="font-medium">{c.name}</span>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">No categories yet.</p>
              )}
            </div>
            <div className="border-t pt-4">
              <Label>New Category Name</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Beverages"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
                />
                <Button onClick={handleCreateCategory} disabled={!newCategoryName || createCategoryMutation.isPending}>
                  Add
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
