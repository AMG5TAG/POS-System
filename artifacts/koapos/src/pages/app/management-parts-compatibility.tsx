import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  usePartsLookup,
  useListProducts,
  useGetProductCompatibility,
  useAddProductCompatibility,
  useDeleteProductCompatibility,
  getPartsLookupQueryKey,
  getListProductsQueryKey,
  getGetProductCompatibilityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import { Puzzle, Search, Loader2, Plus, X, Package } from "lucide-react";
import { toast } from "sonner";

export default function ManagementPartsCompatibilityPage() {
  const queryClient = useQueryClient();

  // ── Lookup by model ──
  const [model, setModel] = useState("");
  const lookupParams = { model: model.trim() };
  const { data: lookup, isFetching } = usePartsLookup(lookupParams, {
    query: { queryKey: getPartsLookupQueryKey(lookupParams), enabled: model.trim().length >= 2 },
  });
  const parts = lookup?.parts ?? [];

  // ── Tag a part with models ──
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const [newModel, setNewModel] = useState("");

  const prodParams = { search: search.trim(), limit: 8 };
  const { data: products } = useListProducts(prodParams, {
    query: { queryKey: getListProductsQueryKey(prodParams), enabled: search.trim().length >= 2 },
  });

  const { data: compat } = useGetProductCompatibility(selected?.id ?? 0, {
    query: { queryKey: getGetProductCompatibilityQueryKey(selected?.id ?? 0), enabled: !!selected },
  });
  const addModel = useAddProductCompatibility();
  const delModel = useDeleteProductCompatibility();
  const compatItems = compat?.items ?? [];

  const invalidateCompat = () => {
    if (selected) queryClient.invalidateQueries({ queryKey: getGetProductCompatibilityQueryKey(selected.id) });
  };

  const addOne = async () => {
    if (!selected || !newModel.trim()) return;
    try {
      await addModel.mutateAsync({ id: selected.id, data: { model: newModel.trim() } as never });
      invalidateCompat(); setNewModel("");
    } catch { toast.error("Couldn't add model"); }
  };
  const removeOne = async (rowId: number) => {
    if (!selected) return;
    try { await delModel.mutateAsync({ id: selected.id, rowId }); invalidateCompat(); }
    catch { toast.error("Couldn't remove model"); }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Puzzle className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Parts Compatibility</h1>
            <p className="text-sm text-muted-foreground">Find the right part for a device, and tag which models each part fits.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Lookup */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <p className="font-semibold">Find parts for a device</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="e.g. iPhone 13, Galaxy S21…" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            {model.trim().length < 2 ? (
              <p className="text-sm text-muted-foreground">Type a device model to see matching parts.</p>
            ) : isFetching ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : parts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parts tagged for "{model}".</p>
            ) : (
              <div className="rounded-lg border divide-y">
                {parts.map((p) => (
                  <div key={`${p.productId}-${p.matchedModel}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku ? `${p.sku} · ` : ""}fits {p.matchedModel}</p>
                    </div>
                    {p.stockQuantity != null && (
                      <Badge variant="outline" className={cn("text-xs", p.stockQuantity > 0 ? "" : "text-red-500 border-red-200")}>
                        {p.stockQuantity} in stock
                      </Badge>
                    )}
                    <span className="font-medium tabular-nums">{formatCurrency(p.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tag a part */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <p className="font-semibold">Tag a part with compatible models</p>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search a part…" value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowResults(true); }} onFocus={() => setShowResults(true)} />
              </div>
              {showResults && (products?.items?.length ?? 0) > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                  {(products?.items ?? []).map((p) => (
                    <button key={p.id} type="button" className="flex w-full px-3 py-1.5 text-sm hover:bg-muted text-left"
                      onClick={() => { setSelected({ id: p.id, name: p.name }); setSearch(p.name); setShowResults(false); }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected && (
              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {compatItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No models tagged yet.</p>
                  ) : compatItems.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2.5 pr-1 py-0.5 text-xs">
                      {m.model}
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => removeOne(m.id)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Label className="sr-only">Model</Label>
                  <Input className="h-9 flex-1" placeholder="Add a model (e.g. iPhone 13 Pro)" value={newModel}
                    onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addOne(); }} />
                  <Button className="h-9 gap-1.5" onClick={addOne} disabled={addModel.isPending || !newModel.trim()}>
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
