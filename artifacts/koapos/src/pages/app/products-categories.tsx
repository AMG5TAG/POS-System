import { useState, useMemo } from "react";
import { ColourPicker } from "@/components/ui/colour-picker";
import { ImageUploader } from "@/components/ui/image-uploader";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  useListProducts, getListCategoriesQueryKey, type Category,
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
  AlarmClock, Anchor, Antenna, Aperture, Apple, Archive, Armchair, Award, Baby, Backpack, BadgePercent, Banana, Banknote, Bath, Battery, BatteryCharging, Bed, Beef, Beer, Bike, Bird, Blocks, Bluetooth, Bone, Book, BookOpen, Box, Boxes, Briefcase, Brush, Bus, Cable, Calendar, Camera, Candy, Car, Carrot, Cat, Cctv, Cherry, ChevronDown, ChevronRight, Citrus, Clapperboard, Clock, Cloud, Coffee, Cog, Coins, Compass, Container, Cookie, CookingPot, Cpu, CreditCard, Croissant, Crown, CupSoda, Database, Diamond, Disc3, Dog, Drill, Droplet, Drum, Dumbbell, Egg, FileText, Film, Fish, Flame, Flashlight, Flower, Flower2, Folder, FolderOpen, Footprints, Fuel, Gamepad, Gamepad2, Gem, Gift, Glasses, Globe, GraduationCap, Grape, Grid3x3, Guitar, Hammer, HardDrive, Hash, Headphones, Headset, Heart, HeartPulse, Home, IceCreamCone, Image as ImageIcon, Joystick, Key, Keyboard, Lamp, Laptop, Layers, Leaf, Library, Lightbulb, Lock, Map as MapIcon, MapPin, Medal, MemoryStick, Mic, Microwave, Milk, Monitor, MonitorSmartphone, Moon, Mountain, Mouse, Music, Newspaper, Package, Paintbrush, Palette, PawPrint, PenTool, Pencil, Percent, PhoneCall, Piano, PiggyBank, Pill, Pizza, Plane, Plug, PlugZap, Plus, Popcorn, Printer, Projector, Puzzle, Rabbit, Radio, Receipt, Recycle, Refrigerator, Rocket, Router, Ruler, Salad, Sandwich, Satellite, Scissors, Search, Server, Settings, Shield, ShieldCheck, Ship, Shirt, ShoppingBag, ShoppingBasket, ShoppingCart, ShowerHead, Signal, Smartphone, Smile, Snowflake, Sofa, Soup, Sparkle, Sparkles, Speaker, Sprout, Stamp, Star, Stethoscope, Sticker, Store, Sun, Syringe, TabletSmartphone, Tag, Tags, Tent, Thermometer, Ticket, ToyBrick, Trash2, TreePine, Trees, Trophy, Truck, Tv, Tv2, Umbrella, Usb, User, Users, Utensils, Video, Volume2, Wallet, Wand2, WashingMachine, Watch, Waves, Webcam, Wifi, Wine, Wrench, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type CategoryNode = Category & { children: CategoryNode[]; depth: number };

type FormState = { name: string; color: string; icon: string; parentId: string; imageUrl: string };

/* ─── Constants ──────────────────────────────────────────────────────────── */

const COLORS = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16",
  "#22c55e","#10b981","#06b6d4","#3b82f6","#6366f1",
  "#a855f7","#ec4899","#6b7280","#0f172a",
];

/* Grouped for the picker; a saved category stores just the icon's name, so an
   icon may move between groups freely but must never be renamed or removed —
   categories already using it would fall back to the tag. */
const ICON_GROUPS: { title: string; icons: Record<string, React.ComponentType<{ className?: string }>> }[] = [
  { title: "Tech & repairs", icons: { Smartphone, PhoneCall, MonitorSmartphone, TabletSmartphone, Laptop, Monitor, Tv, Tv2, Keyboard, Mouse, Printer, Cpu, HardDrive, MemoryStick, Server, Database, Usb, Cable, Plug, PlugZap, BatteryCharging, Battery, Wifi, Router, Bluetooth, Signal, Antenna, Satellite, Cctv, Webcam, Projector, Disc3, Headphones, Headset, Speaker, Radio, Mic, Camera, Aperture, Watch, Gamepad2, Gamepad, Joystick, Wrench, Hammer, Drill, Cog, Settings, Wand2, Shield, ShieldCheck, Lock, Key } },
  { title: "Shopping", icons: { Tag, Tags, ShoppingCart, ShoppingBag, ShoppingBasket, Store, Receipt, CreditCard, Wallet, Banknote, Coins, PiggyBank, Percent, BadgePercent, Gift, Package, Box, Boxes, Archive, Container, Layers, Sparkles, Sparkle, Star, Crown, Trophy, Medal, Award, Ticket, Diamond, Gem } },
  { title: "Home & living", icons: { Home, Lamp, Lightbulb, Flashlight, Sofa, Armchair, Bed, Bath, ShowerHead, Refrigerator, WashingMachine, Microwave, CookingPot, Utensils, Recycle, Trash2, Umbrella, Clock, AlarmClock, Calendar } },
  { title: "Food & drink", icons: { Coffee, Pizza, Apple, Cherry, Citrus, Grape, Banana, Carrot, Beef, Sandwich, Soup, Salad, Egg, Milk, Croissant, Cookie, Candy, IceCreamCone, Popcorn, CupSoda, Beer, Wine } },
  { title: "Fashion & beauty", icons: { Shirt, Glasses, Footprints, Backpack, Briefcase, Scissors, Droplet, Flower, Flower2, Heart, Smile } },
  { title: "Health", icons: { HeartPulse, Pill, Stethoscope, Syringe, Thermometer, Dumbbell, Baby } },
  { title: "Creative & learning", icons: { Book, BookOpen, Library, GraduationCap, FileText, Newspaper, Palette, Paintbrush, Brush, PenTool, Pencil, Ruler, Sticker, Stamp, Image: ImageIcon, Film, Clapperboard, Video, Music, Guitar, Piano, Drum, Volume2, Puzzle, Blocks, ToyBrick } },
  { title: "Travel & outdoors", icons: { Car, Bike, Bus, Truck, Plane, Ship, Anchor, Rocket, Fuel, Map: MapIcon, MapPin, Compass, Globe, Mountain, TreePine, Trees, Leaf, Sprout, Tent, Waves, Sun, Moon, Cloud, Snowflake, Flame, Zap } },
  { title: "Animals", icons: { Dog, Cat, Rabbit, Bird, Fish, PawPrint, Bone } },
  { title: "General", icons: { Folder, FolderOpen, Hash, Grid3x3, Users, User } },
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> =
  Object.assign({}, ...ICON_GROUPS.map((g) => g.icons));
const MAX_DEPTH = 4;
const EMPTY_FORM: FormState = { name: "", color: COLORS[0], icon: "Tag", parentId: "", imageUrl: "" };

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

function CategoryIcon({ name, className, color }: { name?: string | null; className?: string; color?: string }) {
  const Comp = (name && ICON_MAP[name]) ? ICON_MAP[name] : Tag;
  return <span style={color ? { color } : undefined}><Comp className={className} /></span>;
}

/* ─── Icon Picker ────────────────────────────────────────────────────────── */

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // Icon names are PascalCase ("BatteryCharging"); match "battery charging" too.
  const matches = (name: string) => !q || name.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase().includes(q) || name.toLowerCase().includes(q.replace(/\s+/g, ""));
  const groups = ICON_GROUPS
    .map((g) => ({ title: g.title, names: Object.keys(g.icons).filter(matches) }))
    .filter((g) => g.names.length > 0);
  return (
    <div className="rounded border bg-muted/20">
      <div className="p-1.5 border-b">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search icons (e.g. phone, battery, food)" className="h-8 text-xs" noPhoneFormat />
      </div>
      <div className="max-h-56 overflow-y-auto p-1 space-y-2">
        {groups.length === 0 && <p className="text-xs text-muted-foreground px-1 py-2">No icons match “{query}”.</p>}
        {groups.map((g) => (
          <div key={g.title}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pb-1">{g.title}</p>
            <div className="grid grid-cols-8 gap-1">
              {g.names.map((name) => {
                const Comp = ICON_MAP[name];
                return (
                  <button
                    key={name}
                    type="button"
                    title={name.replace(/([a-z])([A-Z0-9])/g, "$1 $2")}
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
          </div>
        ))}
      </div>
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
      {node.imageUrl ? (
        <img src={node.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 border" />
      ) : (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: (node.color ?? "#6366f1") + "22" }}
        >
          <CategoryIcon name={node.icon} className="w-4 h-4" color={node.color ?? "#6366f1"} />
        </div>
      )}

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

  // Categories are cached under two different query keys across the app: this
  // page (and dashboards) read the default key, while the product form and POS
  // read ["categories"]. The previous code only invalidated ["categories"],
  // which never matched this page's list — so a new category didn't appear
  // until a manual refresh. Invalidate both keys so it shows up instantly
  // everywhere.
  const invalidateCategories = () => {
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

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
    const parent = parentId ? cats.find((c) => c.id === parentId) : null;
    setForm({
      name: "",
      color: parent?.color ?? COLORS[0],
      icon: parent?.icon ?? "Tag",
      parentId: parentId?.toString() ?? "",
      imageUrl: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCat(cat);
    setForm({
      name: cat.name,
      color: cat.color ?? COLORS[0],
      icon: cat.icon ?? "Tag",
      parentId: cat.parentId?.toString() ?? "",
      imageUrl: cat.imageUrl ?? "",
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
    const inv = invalidateCategories;

    if (editingCat) {
      updateCategory.mutate(
        // null clears an image that was removed in the dialog.
        { id: editingCat.id, data: { ...data, imageUrl: form.imageUrl || null } },
        {
          onSuccess: () => {
            toast.success("Category updated");
            if (andAddAnother) {
              setEditingCat(null);
              setForm((f) => ({ ...f, name: "", imageUrl: "" }));
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
        { data: { ...data, imageUrl: form.imageUrl || undefined } },
        {
          onSuccess: (newCat) => {
            toast.success("Category created");
            if (andAddAnother) {
              setForm((f) => ({ ...f, name: "", imageUrl: "" }));
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
          invalidateCategories();
        },
        onError: () => toast.error("Failed to delete category"),
      }
    );
  };

  const isPending = createCategory.isPending || updateCategory.isPending;

  // Parent choices in the same order and nesting as the tree on the page. The
  // category being edited and everything beneath it are left out (a category
  // cannot sit under its own descendant), as is any parent too deep to take the
  // moved branch without it passing MAX_DEPTH levels.
  const parentOptions = useMemo(() => {
    let branchHeight = 0;
    const excluded = new Set<number>();
    if (editingCat) {
      const self = flat.find((n) => n.id === editingCat.id);
      const walk = (n: CategoryNode) => {
        excluded.add(n.id);
        branchHeight = Math.max(branchHeight, n.depth - (self?.depth ?? 0));
        n.children.forEach(walk);
      };
      if (self) walk(self);
    }
    return flat.filter((n) => !excluded.has(n.id) && n.depth + 1 + branchHeight < MAX_DEPTH);
  }, [flat, editingCat]);

  const selectedParent = form.parentId ? cats.find((c) => c.id.toString() === form.parentId) : undefined;

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
                  <SelectValue placeholder="None (top-level)">
                    {selectedParent ? selectedParent.name : "None (top-level)"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (top-level)</SelectItem>
                  {parentOptions.map((n) => (
                    <SelectItem key={n.id} value={n.id.toString()}>
                      <span className="flex items-center gap-2" style={{ paddingLeft: `${n.depth * 1.25}rem` }}>
                        <CategoryIcon name={n.icon} className="w-3.5 h-3.5 shrink-0" color={n.color ?? undefined} />
                        <span className={n.depth === 0 ? "font-medium" : undefined}>{n.name}</span>
                      </span>
                    </SelectItem>
                  ))}
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

            <div className="space-y-1.5">
              <Label>Category Image</Label>
              <p className="text-xs text-muted-foreground">Shown on the online shop's category tiles. Square images look best.</p>
              <ImageUploader
                value={form.imageUrl}
                onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
                aspectRatio="square"
                className="w-40"
              />
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
