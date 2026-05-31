import { useState, useEffect } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProductTypes,
  useCreateProductType,
  useUpdateProductType,
  useDeleteProductType,
  useReorderProductTypes,
  type ProductType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Layers, Search, Barcode, Package, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type FormState = {
  name: string;
  slug: string;
  description: string;
  trackStock: boolean;
  printCode: boolean;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  trackStock: true,
  printCode: false,
  isActive: true,
};

/* ─── Slug helper ─────────────────────────────────────────────────────────── */

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ─── Product Type Row ───────────────────────────────────────────────────── */

function ProductTypeRow({
  type,
  index,
  total,
  onEdit,
  onDelete,
  onToggleActive,
  onMoveUp,
  onMoveDown,
  isReordering,
}: {
  type: ProductType;
  index: number;
  total: number;
  onEdit: (t: ProductType) => void;
  onDelete: (t: ProductType) => void;
  onToggleActive: (t: ProductType) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  isReordering: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 border-b last:border-b-0 transition-colors group">
      <div className="flex flex-col gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={index === 0 || isReordering}
          onClick={() => onMoveUp(index)}
          title="Move up"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={index === total - 1 || isReordering}
          onClick={() => onMoveDown(index)}
          title="Move down"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
        <Package className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{type.name}</span>
          {type.slug && (
            <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
              {type.slug}
            </span>
          )}
          {!type.isActive && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Inactive
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {type.description && (
            <span className="text-xs text-muted-foreground truncate max-w-xs">{type.description}</span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {type.trackStock && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Package className="w-3 h-3" /> Track Stock
              </span>
            )}
            {type.printCode && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Barcode className="w-3 h-3" /> Print Code
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Switch
          checked={type.isActive}
          onCheckedChange={() => onToggleActive(type)}
          title={type.isActive ? "Deactivate" : "Activate"}
          className="scale-90"
        />
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Edit"
            onClick={() => onEdit(type)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            title="Delete"
            onClick={() => onDelete(type)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function SettingsProductTypesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formTouched, setFormTouched] = useState(false);
  const [editingType, setEditingType] = useState<ProductType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductType | null>(null);
  const [localOrder, setLocalOrder] = useState<ProductType[]>([]);

  const { ConfirmDialog: ProductTypeFormGuard } = useUnsavedChangesGuard(formTouched, {
    title: "Close product type form?",
    description: "The product type form has unsaved changes. If you leave now, your changes will be lost.",
    cancelLabel: "Stay on page",
    actionLabel: "Leave anyway",
  });

  const { data } = useListProductTypes();
  const createProductType = useCreateProductType();
  const updateProductType = useUpdateProductType();
  const deleteProductType = useDeleteProductType();
  const reorderProductTypes = useReorderProductTypes();

  const types: ProductType[] = data?.items ?? [];

  useEffect(() => {
    setLocalOrder(types);
  }, [data]);

  const isSearching = search.trim().length > 0;

  const filtered = isSearching
    ? localOrder.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.slug.toLowerCase().includes(search.toLowerCase()) ||
          (t.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : localOrder;

  const inv = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/product-types"] });
    queryClient.invalidateQueries({ queryKey: ["product-types"] });
    queryClient.invalidateQueries({ queryKey: ["product-types-pos"] });
  };

  const persistOrder = (ordered: ProductType[]) => {
    reorderProductTypes.mutate(
      { data: { ids: ordered.map((t) => t.id) } },
      {
        onError: () => {
          toast.error("Failed to save order");
          setLocalOrder(types);
        },
      }
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...localOrder];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setLocalOrder(next);
    persistOrder(next);
  };

  const handleMoveDown = (index: number) => {
    if (index === localOrder.length - 1) return;
    const next = [...localOrder];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setLocalOrder(next);
    persistOrder(next);
  };

  const openCreate = () => {
    setEditingType(null);
    setForm(EMPTY_FORM);
    setSlugManuallyEdited(false);
    setFormTouched(false);
    setDialogOpen(true);
  };

  const openEdit = (type: ProductType) => {
    setEditingType(type);
    setForm({
      name: type.name,
      slug: type.slug ?? "",
      description: type.description ?? "",
      trackStock: type.trackStock,
      printCode: type.printCode,
      isActive: type.isActive,
    });
    setSlugManuallyEdited(true);
    setFormTouched(false);
    setDialogOpen(true);
  };

  const handleNameChange = (name: string) => {
    setFormTouched(true);
    setForm((f) => ({
      ...f,
      name,
      slug: slugManuallyEdited ? f.slug : toSlug(name),
    }));
  };

  const handleSlugChange = (slug: string) => {
    setFormTouched(true);
    setSlugManuallyEdited(true);
    setForm((f) => ({ ...f, slug }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || toSlug(form.name.trim()),
      description: form.description.trim(),
      trackStock: form.trackStock,
      printCode: form.printCode,
      isActive: form.isActive,
    };

    if (editingType) {
      updateProductType.mutate(
        { id: editingType.id, data: payload },
        {
          onSuccess: () => {
            toast.success("Product type updated");
            setFormTouched(false);
            setDialogOpen(false);
            inv();
          },
          onError: () => toast.error("Failed to update product type"),
        }
      );
    } else {
      createProductType.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast.success("Product type created");
            setFormTouched(false);
            setDialogOpen(false);
            inv();
          },
          onError: () => toast.error("Failed to create product type"),
        }
      );
    }
  };

  const handleToggleActive = (type: ProductType) => {
    updateProductType.mutate(
      { id: type.id, data: { name: type.name, isActive: !type.isActive } },
      {
        onSuccess: () => {
          toast.success(type.isActive ? "Type deactivated" : "Type activated");
          inv();
        },
        onError: () => toast.error("Failed to update product type"),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteProductType.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success("Product type deleted");
          setDeleteTarget(null);
          inv();
        },
        onError: () => toast.error("Failed to delete product type"),
      }
    );
  };

  const isPending = createProductType.isPending || updateProductType.isPending;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Layers className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Product Types</h1>
              <p className="text-sm text-muted-foreground">
                Define the kinds of products you sell (e.g. Rental, Consignment, Standard)
              </p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add Type
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search product types..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {types.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4 rounded-lg border border-dashed">
            <Layers className="w-16 h-16 text-muted-foreground/20" />
            <div>
              <p className="font-medium text-lg">No product types yet</p>
              <p className="text-muted-foreground text-sm mt-1">
                Add types like "Standard", "Rental", or "Consignment" to categorise how products are handled.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Add Type
            </Button>
          </div>
        ) : (
          <>
            {!isSearching && localOrder.length > 1 && (
              <p className="text-xs text-muted-foreground -mt-2">
                Use the arrows to reorder how types appear in the product form.
              </p>
            )}
            <div className="rounded-lg border overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No product types match &ldquo;{search}&rdquo;
                </div>
              ) : (
                filtered.map((type, index) => (
                  <ProductTypeRow
                    key={type.id}
                    type={type}
                    index={isSearching ? index : localOrder.indexOf(type)}
                    total={localOrder.length}
                    onEdit={openEdit}
                    onDelete={(t) => setDeleteTarget(t)}
                    onToggleActive={handleToggleActive}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    isReordering={reorderProductTypes.isPending}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setFormTouched(false); setDialogOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit Product Type" : "New Product Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Rental"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="e.g. rental"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Used internally to identify this type. Auto-generated from name if left blank.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => { setFormTouched(true); setForm((f) => ({ ...f, description: e.target.value })); }}
                placeholder="Optional description of this product type"
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Track Stock</p>
                  <p className="text-xs text-muted-foreground">
                    Manage inventory quantities for this type
                  </p>
                </div>
                <Switch
                  checked={form.trackStock}
                  onCheckedChange={(v) => { setFormTouched(true); setForm((f) => ({ ...f, trackStock: v })); }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Print Code</p>
                  <p className="text-xs text-muted-foreground">
                    Print barcode / QR code label for products of this type
                  </p>
                </div>
                <Switch
                  checked={form.printCode}
                  onCheckedChange={(v) => { setFormTouched(true); setForm((f) => ({ ...f, printCode: v })); }}
                />
              </div>

              <div className={cn("flex items-center justify-between", !editingType && "hidden")}>
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">
                    Inactive types are hidden from product creation
                  </p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => { setFormTouched(true); setForm((f) => ({ ...f, isActive: v })); }}
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" onClick={() => { setFormTouched(false); setDialogOpen(false); }}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isPending}>
                {editingType ? "Save Changes" : "Add Type"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this product type. Products using it will lose their type
              assignment.
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

      <ProductTypeFormGuard />
    </AppLayout>
  );
}
