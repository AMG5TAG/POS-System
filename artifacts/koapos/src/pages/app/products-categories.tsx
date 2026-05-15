import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListCategories, useCreateCategory, useListProducts, Category } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Tag, Search } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#6366f1","#a855f7","#ec4899","#6b7280"];

export default function ProductsCategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", color: COLORS[0] });

  const { data: categories } = useListCategories();
  const { data: productsData } = useListProducts({ limit: 500 });
  const createCategory = useCreateCategory();

  const cats: Category[] = categories ?? [];
  const products = productsData?.items ?? [];

  const productCount = (catId: number) => products.filter((p) => p.categoryId === catId).length;

  const filtered = cats.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const handleSave = () => {
    if (!form.name) { toast.error("Name is required"); return; }
    createCategory.mutate(
      { data: { name: form.name, color: form.color } },
      {
        onSuccess: () => {
          toast.success("Category created");
          setDialogOpen(false);
          setForm({ name: "", color: COLORS[0] });
          queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
        onError: () => toast.error("Failed to create category"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> Add Category</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search categories..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Tag className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No categories yet</p><p className="text-muted-foreground text-sm">Organise your products with categories.</p></div>
            <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> Add Category</Button>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((c) => (
              <Card key={c.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: (c.color ?? "#6366f1") + "22" }}>
                    <Tag className="w-5 h-5" style={{ color: c.color ?? "#6366f1" }} />
                  </div>
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{productCount(c.id)} product{productCount(c.id) !== 1 ? "s" : ""}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Electronics" />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })} className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createCategory.isPending}>Add Category</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
