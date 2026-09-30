import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, FolderTree, Loader2, Package, Search } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import { onlineStoreFetch } from "./management-online-store-overview";

interface StoreProduct {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  imageUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  showOnline: boolean;
  /** False when the product's category, or one above it, is hidden. */
  categoryShown: boolean;
}

interface StoreCategory {
  id: number;
  name: string;
  parentId: number | null;
  color: string | null;
  showOnline: boolean;
  productCount: number;
}

type Filter = "all" | "listed" | "hidden";
const KEY = ["online-store", "products"];
const CAT_KEY = ["online-store", "categories"];

type CatNode = StoreCategory & { depth: number; hiddenBy: StoreCategory | null; children: CatNode[] };

/* The categories as the Categories page shows them: parents first, each
   followed by its subcategories, in the API's order. `hiddenBy` is the nearest
   hidden category above, which hides this one whatever its own switch says. */
function categoryTree(cats: StoreCategory[]): CatNode[] {
  const byId = new Map<number, CatNode>(cats.map((c) => [c.id, { ...c, depth: 0, hiddenBy: null, children: [] }]));
  const roots: CatNode[] = [];
  byId.forEach((n) => {
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n); else roots.push(n);
  });
  const out: CatNode[] = [];
  const walk = (list: CatNode[], depth: number, hiddenBy: StoreCategory | null) => list.forEach((n) => {
    n.depth = depth;
    n.hiddenBy = hiddenBy;
    out.push(n);
    walk(n.children, depth + 1, hiddenBy ?? (n.showOnline ? null : n));
  });
  walk(roots, 0, null);
  return out;
}

function CategoriesSection() {
  const qc = useQueryClient();
  const { data: cats = [], isLoading } = useQuery({ queryKey: CAT_KEY, queryFn: () => onlineStoreFetch<StoreCategory[]>("/categories") });
  const tree = useMemo(() => categoryTree(cats), [cats]);

  const setCat = useMutation({
    mutationFn: (v: { ids: number[]; showOnline: boolean }) =>
      onlineStoreFetch<{ updated: number }>("/categories", { method: "PATCH", body: JSON.stringify(v) }),
    onMutate: async ({ ids, showOnline }) => {
      await qc.cancelQueries({ queryKey: CAT_KEY });
      const prev = qc.getQueryData<StoreCategory[]>(CAT_KEY);
      const set = new Set(ids);
      qc.setQueryData<StoreCategory[]>(CAT_KEY, (old) => old?.map((c) => (set.has(c.id) ? { ...c, showOnline } : c)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(CAT_KEY, ctx.prev);
      toast.error((e as Error).message);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["online-store"] });
    },
  });

  const hiddenCount = tree.filter((n) => !n.showOnline).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><FolderTree className="w-4 h-4" /> Categories</CardTitle>
        <CardDescription>
          Hide a whole category from the shop. Its subcategories and every product in them are hidden too — including products added later.
          {hiddenCount > 0 && <> {hiddenCount} hidden.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : tree.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No categories yet.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto border-t">
            {tree.map((n) => (
              <div key={n.id} className={cn("flex items-center gap-3 px-6 py-2 border-b last:border-b-0", n.hiddenBy && "opacity-50")}>
                <div className="flex items-center gap-2 min-w-0 flex-1" style={{ paddingLeft: `${n.depth * 1.25}rem` }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: n.color ?? "#94a3b8" }} />
                  <span className={cn("truncate", n.depth === 0 && "font-medium")}>{n.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{n.productCount} product{n.productCount === 1 ? "" : "s"}</span>
                </div>
                {n.hiddenBy && <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">Hidden with {n.hiddenBy.name}</span>}
                <Switch
                  checked={n.showOnline}
                  onCheckedChange={(v) => setCat.mutate({ ids: [n.id], showOnline: v }, {
                    onSuccess: () => toast.success(`${n.name} ${v ? "shown on" : "hidden from"} the shop`),
                  })}
                  aria-label={`Show ${n.name} on the shop`}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* Management › Online Store › Products — which active products the shop lists
   (products.show_online). An inactive product is never listed, so only active
   products appear here. */
export default function ManagementOnlineStoreProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: products = [], isLoading } = useQuery({ queryKey: KEY, queryFn: () => onlineStoreFetch<StoreProduct[]>("/products") });

  const setVisibility = useMutation({
    mutationFn: (v: { ids: number[]; showOnline: boolean }) =>
      onlineStoreFetch<{ updated: number }>("/products", { method: "PATCH", body: JSON.stringify(v) }),
    onMutate: async ({ ids, showOnline }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<StoreProduct[]>(KEY);
      const set = new Set(ids);
      qc.setQueryData<StoreProduct[]>(KEY, (old) => old?.map((p) => (set.has(p.id) ? { ...p, showOnline } : p)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast.error((e as Error).message);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["online-store", "summary"] });
    },
  });

  const categories = useMemo(() => {
    const m = new Map<number, string>();
    products.forEach((p) => { if (p.categoryId != null) m.set(p.categoryId, p.categoryName ?? "—"); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) =>
      (filter === "all" || (filter === "listed") === (p.showOnline && p.categoryShown)) &&
      (category === "all" || (category === "none" ? p.categoryId == null : String(p.categoryId) === category)) &&
      (!q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)),
    );
  }, [products, search, filter, category]);

  const listedCount = products.filter((p) => p.showOnline && p.categoryShown).length;
  const selectedShown = shown.filter((p) => selected.has(p.id));
  const allShownSelected = shown.length > 0 && selectedShown.length === shown.length;

  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((p) => p.id)));
  const toggleOne = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulk = (showOnline: boolean) => {
    const ids = selectedShown.map((p) => p.id);
    setVisibility.mutate({ ids, showOnline }, {
      onSuccess: () => { toast.success(`${ids.length} product${ids.length === 1 ? "" : "s"} ${showOnline ? "listed on" : "hidden from"} the shop`); setSelected(new Set()); },
    });
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Online Store Products</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose which products the online shop lists. {products.length > 0 && <>{listedCount} of {products.length} active products are listed.</>}
          </p>
        </div>

        <CategoriesSection />

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or SKU…" className="pl-9" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="none">No category</SelectItem>
              {categories.map(([id, name]) => <SelectItem key={id} value={String(id)}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Listed and hidden</SelectItem>
              <SelectItem value="listed">Listed only</SelectItem>
              <SelectItem value="hidden">Hidden only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedShown.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5">
            <span className="text-sm font-medium">{selectedShown.length} selected</span>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => bulk(true)} disabled={setVisibility.isPending}><Eye className="w-4 h-4" /> List on shop</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => bulk(false)} disabled={setVisibility.isPending}><EyeOff className="w-4 h-4" /> Hide from shop</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : shown.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No products match.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-10 px-4 py-2.5"><Checkbox checked={allShownSelected} onCheckedChange={toggleAll} aria-label="Select all" /></th>
                      <th className="px-2 py-2.5 font-medium">Product</th>
                      <th className="px-2 py-2.5 font-medium hidden md:table-cell">Category</th>
                      <th className="px-2 py-2.5 font-medium text-right">Price</th>
                      <th className="px-4 py-2.5 font-medium text-right">On shop</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="px-4 py-2"><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} aria-label={`Select ${p.name}`} /></td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-3">
                            {p.imageUrl
                              ? <img src={p.imageUrl} alt="" className="w-9 h-9 rounded object-cover border shrink-0" />
                              : <div className="w-9 h-9 rounded border bg-muted flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                            <div className="min-w-0">
                              <p className="font-medium truncate">{p.name}</p>
                              {p.sku && <p className="text-xs text-muted-foreground">{p.sku}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 hidden md:table-cell text-muted-foreground">{p.categoryName ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(p.price)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          {!p.categoryShown && <span className="mr-2 text-xs text-muted-foreground">Category hidden</span>}
                          <Switch checked={p.showOnline} className={cn(!p.categoryShown && "opacity-50")} onCheckedChange={(v) => setVisibility.mutate({ ids: [p.id], showOnline: v })} aria-label={`Show ${p.name} on the shop`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
