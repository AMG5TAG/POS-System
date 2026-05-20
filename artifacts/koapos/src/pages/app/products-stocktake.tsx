import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListProducts, useUpdateInventory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function ProductsStocktakePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const updateInventory = useUpdateInventory();

  const { data } = useListProducts({ search: search || undefined, limit: 200 });
  const products = (data?.items ?? []).filter((p) => p.trackInventory);

  const setCount = (id: number, val: string) => setCounts((prev) => ({ ...prev, [id]: val }));

  const saveCount = (id: number) => {
    const val = counts[id];
    if (val === undefined || val === "") return;
    const quantity = parseInt(val);
    if (isNaN(quantity) || quantity < 0) { toast.error("Enter a valid quantity"); return; }
    updateInventory.mutate(
      { productId: id, data: { stockQuantity: quantity } },
      {
        onSuccess: () => {
          setSaved((prev) => new Set(prev).add(id));
          queryClient.invalidateQueries({ queryKey: ["products"] });
          toast.success("Stock updated");
        },
        onError: () => toast.error("Failed to update stock"),
      }
    );
  };

  const saveAll = () => {
    const entries = Object.entries(counts).filter(([, v]) => v !== "");
    if (entries.length === 0) { toast.error("No counts entered"); return; }
    entries.forEach(([id]) => saveCount(parseInt(id)));
  };

  const variance = (id: number, current: number) => {
    const counted = parseInt(counts[id] ?? "");
    if (isNaN(counted)) return null;
    return counted - current;
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Stocktake</h1>
              <p className="text-sm text-muted-foreground">Enter physical counts to adjust stock levels</p>
            </div>
          </div>
          <Button onClick={saveAll} disabled={updateInventory.isPending}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Save All Counts
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tracked products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {products.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No inventory-tracked products found.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">SKU</th>
                  <th className="text-right p-3 font-medium">System Stock</th>
                  <th className="text-center p-3 font-medium w-36">Physical Count</th>
                  <th className="text-right p-3 font-medium hidden md:table-cell">Variance</th>
                  <th className="p-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((p) => {
                  const v = variance(p.id, p.stockQuantity ?? 0);
                  const isLow = (p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 5);
                  return (
                    <tr key={p.id} className={`bg-background hover:bg-muted/20 transition-colors ${saved.has(p.id) ? "opacity-60" : ""}`}>
                      <td className="p-3">
                        <p className="font-medium">{p.name}</p>
                        {isLow && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 mt-1">Low Stock</Badge>}
                      </td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground">{p.sku || "—"}</td>
                      <td className="p-3 text-right font-mono">{p.stockQuantity ?? 0}</td>
                      <td className="p-3">
                        <Input
                          type="number"
                          min={0}
                          value={counts[p.id] ?? ""}
                          onChange={(e) => setCount(p.id, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveCount(p.id)}
                          placeholder={String(p.stockQuantity ?? 0)}
                          className="text-center h-8"
                        />
                      </td>
                      <td className="p-3 text-right hidden md:table-cell font-mono">
                        {v === null ? "—" : (
                          <span className={v > 0 ? "text-green-600" : v < 0 ? "text-red-600" : "text-muted-foreground"}>
                            {v > 0 ? "+" : ""}{v}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveCount(p.id)} disabled={!counts[p.id]}>
                          {saved.has(p.id) ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : "Save"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
