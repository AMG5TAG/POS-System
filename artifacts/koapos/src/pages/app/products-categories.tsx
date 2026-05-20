import { useState, useMemo } from "react";
import { ColourPicker } from "@/components/ui/colour-picker";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  useListProducts, type Category,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tag, Plus, Search, ChevronRight, ChevronDown, Pencil, Trash2,
  ShoppingCart, Coffee, Pizza, Apple, Shirt, Tv, Smartphone, Book,
  Music, Camera, Dumbbell, Heart, Star, Home, Briefcase, Gift, Zap,
  Leaf, Bike, Car, Scissors, Utensils, Wine, Candy, Gamepad2,
  Headphones, Watch, Diamond, Flower, Baby, Dog, Globe, Paintbrush, Package,
  Boxes, FolderOpen, Folder,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type CategoryNode = Category & { children: CategoryNode[]; depth: number };

type FormState = { name: string; color: string; icon: string; parentId: string };

/* ─── Constants ──────────────────────────────────────────────────────────── */

const COLORS = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16",
  "#22c55e","#10b981","#06b6d4","#3b82f6","#6366f1",
  "#a855f7","#ec4899","#6b7280","#0f172a",
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Tag, ShoppingCart, Coffee, Pizza, Apple, Shirt, Tv, Smartphone, Book,
  Music, Camera, Dumbbell, Heart, Star, Home, Briefcase, Gift, Zap,
  Leaf, Bike, Car, Scissors, Utensils, Wine, Candy, Gamepad2,
  Headphones, Watch, Diamond, Flower, Baby, Dog, Globe, Paintbrush, Package,
  Boxes, FolderOpen, Folder,
};

const ICON_NAMES = Object.keys(ICON_MAP);
const MAX_DEPTH = 4;
const EMPTY_FORM: FormState = { name: "", color: COLORS[0], icon: "Tag", parentId: "" };

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function buildTree(cats: Category[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>();
  cats.forEach((c) => map.set(c.id, { ...c, children: [], depth: 0 }));
  const roots: CategoryNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  function calcDepth(nodes: CategoryNode[], d: number) {
    nodes.forEach((n) => { n.depth = d; calcDepth(n.children, d + 1); });
  }
  calcDepth(roots, 0);
  return roots;
}

function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  function walk(list: CategoryNode[]) { list.forEach((n) => { out.push(n); walk(n.children); }); }
  walk(nodes);
  return out;
}

function getDepth(cats: Category[], id: number): number {
  let depth = 0;
  let currentId: number | null = id;
  const map = new Map(cats.map((c) => [c.id, c]));
  while (currentId !== null) {
    const cat = map.get(currentId);
    if (!cat || !cat.parentId) break;
    depth++;
    currentId = cat.parentId;
  }
  return depth;
}

function CategoryIcon({ name, className, color }: { name?: string | null; className?: string; color?: string }) {
  const Comp = (name && ICON_MAP[name]) ? ICON_MAP[name] : Tag;
  return <span style={color ? { color } : undefined}><Comp className={className} /></span>;
}

/* ─── Icon Picker ────────────────────────────────────────────────────────── */

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto p-1 rounded border bg-muted/20">
      {ICON_NAMES.map((name) => {
        const Comp = ICON_MAP[name];
        return (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => onChange(name)}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded transition-all",
              value === name
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Comp className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}

/* ─── Category Row ───────────────────────────────────────────────────────── */

function CategoryRow({
  node, productCount, expanded, onToggle, onEdit, onAddChild, onDelete,
}: {
  node: CategoryNode;
  productCount: number;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (c: Category) => void;
  onAddChild: (parentId: number) => void;
  onDelete: (c: Category) => void;
}) {
  const hasChildren = node.children.length > 0;
  const indent = node.depth * 20;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 border-b last:border-b-0 transition-colors group"
      style={{ paddingLeft: `${12 + indent}px` }}
    >
      {/* expand / collapse */}
      <button
        type="button"
        onClick={hasChildren ? onToggle : undefined}
        className={cn(
          "w-5 h-5 flex items-center justify-center rounded transition-colors shrink-0",
          hasChildren ? "hover:bg-muted cursor-pointer text-muted-foreground" : "cursor-default text-transparent"
        )}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <span className="w-3.5 h-3.5" />
        )}
      </button>

      {/* color + icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: (node.color ?? "#6366f1") + "22" }}
      >
        <CategoryIcon name={node.icon} className="w-4 h-4" color={node.color ?? "#6366f1"} />
      </div>

      {/* name + meta */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{node.name}</span>
        <div className="flex items-center gap-2 mt-0.5">
          {productCount > 0 && (
            <span className="text-xs text-muted-foreground">{productCount} product{productCount !== 1 ? "s" : ""}</span>
          )}
          {node.children.length > 0 && (
            <span className="text-xs text-muted-foreground">{node.children.length} sub-categor{node.children.length !== 1 ? "ies" : "y"}</span>
          )}
          {node.depth === 0 && node.children.length === 0 && productCount === 0 && (
            <span className="text-xs text-muted-foreground/50">Empty</span>
          )}
        </div>
      </div>

      {/* depth badge */}
      {node.depth > 0 && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal hidden sm:flex">
          L{node.depth + 1}
        </Badge>
      )}

      {/* actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {node.depth < MAX_DEPTH - 1 && (
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            title="Add sub-category"
            onClick={() => onAddChild(node.id)}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          title="Edit"
          onClick={() => onEdit(node)}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
          title="Delete"
          onClick={() => onDelete(node)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ProductsCategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const { data: categories } = useListCategories();
  const { data: productsData } = useListProducts({ limit: 2000 });
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const cats: Category[] = categories ?? [];
  const products = productsData?.items ?? [];

  const productCount = (catId: number) => products.filter((p) => p.categoryId === catId).length;

  const tree = useMemo(() => buildTree(cats), [cats]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const visibleNodes = useMemo(() => {
    if (search.trim()) {
      return flat.filter((n) => n.name.toLowerCase().includes(search.toLowerCase()));
    }
    return flat.filter((n) => {
      if (n.depth === 0) return true;
      let p: number | null = n.parentId ?? null;
      while (p !== null) {
        if (!expanded.has(p)) return false;
        const parent = cats.find((c) => c.id === p);
        p = parent?.parentId ?? null;
      }
      return true;
    });
  }, [flat, search, expanded, cats]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const openCreate = (parentId?: number) => {
    setEditingCat(null);
    setForm({ ...EMPTY_FORM, parentId: parentId?.toString() ?? "" });
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCat(cat);
    setForm({
      name: cat.name,
      color: cat.color ?? COLORS[0],
      icon: cat.icon ?? "Tag",
      parentId: cat.parentId?.toString() ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = (andAddAnother = false) => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const data = {
      name: form.name.trim(),
      color: form.color || undefined,
      icon: form.icon || undefined,
      parentId: form.parentId ? parseInt(form.parentId) : undefined,
    };
    const inv = () => queryClient.invalidateQueries({ queryKey: ["categories"] });

    if (editingCat) {
      updateCategory.mutate(
        { id: editingCat.id, data },
        {
          onSuccess: () => {
            toast.success("Category updated");
            if (andAddAnother) {
              setEditingCat(null);
              setForm((f) => ({ ...f, name: "" }));
            } else {
              setDialogOpen(false);
            }
            inv();
          },
          onError: () => toast.error("Failed to update category"),
        }
      );
    } else {
      createCategory.mutate(
        { data },
        {
          onSuccess: (newCat) => {
            toast.success("Category created");
            if (andAddAnother) {
              setForm((f) => ({ ...f, name: "" }));
              if (typeof newCat.parentId === "number") setExpanded((prev) => new Set([...prev, newCat.parentId as number]));
            } else {
              setDialogOpen(false);
            }
            inv();
          },
          onError: () => toast.error("Failed to create category"),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteCategory.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success("Category deleted");
          setDeleteTarget(null);
          queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
        onError: () => toast.error("Failed to delete category"),
      }
    );
  };

  const isPending = createCategory.isPending || updateCategory.isPending;

  const parentOptions = useMemo(() => {
    return cats.filter((c) => {
      if (editingCat && c.id === editingCat.id) return false;
      const depth = getDepth(cats, c.id);
      return depth < MAX_DEPTH - 1;
    });
  }, [cats, editingCat]);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Categories</h1>
              <p className="text-sm text-muted-foreground">Up to 4 levels deep</p>
            </div>
          </div>
          <Button onClick={() => openCreate()}>
            <Plus className="w-4 h-4 mr-2" /> Add Category
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {cats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4 rounded-lg border border-dashed">
            <Tag className="w-16 h-16 text-muted-foreground/20" />
            <div>
              <p className="font-medium text-lg">No categories yet</p>
              <p className="text-muted-foreground text-sm mt-1">Organise your products with hierarchical categories.</p>
            </div>
            <Button onClick={() => openCreate()}>
              <Plus className="w-4 h-4 mr-2" /> Add Category
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            {visibleNodes.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No categories match "{search}"</div>
            ) : (
              visibleNodes.map((node) => (
                <CategoryRow
                  key={node.id}
                  node={node}
                  productCount={productCount(node.id)}
                  expanded={expanded.has(node.id)}
                  onToggle={() => toggleExpand(node.id)}
                  onEdit={openEdit}
                  onAddChild={(parentId) => openCreate(parentId)}
                  onDelete={(c) => setDeleteTarget(c)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCat ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Beverages"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Parent Category</Label>
              <Select
                value={form.parentId || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, parentId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (top-level)</SelectItem>
                  {parentOptions.map((c) => {
                    const d = getDepth(cats, c.id);
                    return (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {"  ".repeat(d)}{d > 0 ? "↳ " : ""}{c.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c} type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-all",
                      form.color === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <ColourPicker value={form.color} onChange={(v) => setForm((f) => ({ ...f, color: v }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Icon</Label>
              <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} />
            </div>

            <div className="flex justify-between items-center pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <div className="flex gap-2">
                {!editingCat && (
                  <Button variant="outline" onClick={() => handleSave(true)} disabled={isPending}>
                    Save &amp; Add Another
                  </Button>
                )}
                <Button onClick={() => handleSave(false)} disabled={isPending}>
                  {editingCat ? "Save Changes" : "Add Category"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the category. Products assigned to it will be uncategorised.
              Sub-categories will become top-level categories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
