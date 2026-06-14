import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  useSetActiveLocation,
  useListProducts,
  useGetStockByLocation,
  useCreateStockTransfer,
  getListLocationsQueryKey,
  getListProductsQueryKey,
  getGetStockByLocationQueryKey,
  type Location,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MapPin, Plus, Loader2, Trash2, Star, Check, Search, ArrowRight, Package } from "lucide-react";
import { toast } from "sonner";

export default function ManagementLocationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useListLocations({ query: { queryKey: getListLocationsQueryKey() } });
  const create = useCreateLocation();
  const update = useUpdateLocation();
  const remove = useDeleteLocation();
  const setActive = useSetActiveLocation();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const items = data?.items ?? [];
  const activeId = data?.activeLocationId;

  const reset = () => { setName(""); setCode(""); setAddress(""); setPhone(""); };

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a location name"); return; }
    try {
      await create.mutateAsync({ data: { name: name.trim(), code: code.trim() || undefined, address: address.trim() || undefined, phone: phone.trim() || undefined } as never });
      invalidate(); reset(); setOpen(false); toast.success("Location added");
    } catch { toast.error("Couldn't add location"); }
  };

  const makeDefault = async (l: Location) => {
    try { await update.mutateAsync({ id: l.id, data: { isDefault: true } as never }); invalidate(); toast.success(`${l.name} is now the default`); }
    catch { toast.error("Couldn't set default"); }
  };

  const switchTo = async (l: Location) => {
    try { await setActive.mutateAsync({ data: { locationId: l.id } as never }); invalidate(); toast.success(`Switched to ${l.name}`); }
    catch { toast.error("Couldn't switch location"); }
  };

  const del = async (l: Location) => {
    if (!confirm(`Delete location "${l.name}"?`)) return;
    try { await remove.mutateAsync({ id: l.id }); invalidate(); }
    catch (e) { toast.error((e as { data?: { error?: string } })?.data?.error || "Couldn't delete location"); }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MapPin className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Locations</h1>
              <p className="text-sm text-muted-foreground">Manage your stores / branches. The active location is used across the app.</p>
            </div>
          </div>
          <Button className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Add location</Button>
        </div>

        <div className="rounded-xl border bg-amber-50 dark:bg-amber-900/10 border-amber-200 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Foundation phase: locations and the active-store switcher are live. Per-location inventory, registers and reporting roll out in later phases.
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          {isLoading ? (
            <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="py-14 text-center text-sm text-muted-foreground">Couldn't load locations. <button className="text-primary underline" onClick={() => refetch()}>Retry</button></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Location</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Address</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Phone</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.name}</span>
                        {l.code && <span className="text-xs text-muted-foreground font-mono">{l.code}</span>}
                        {l.isDefault && <Badge variant="outline" className="text-[10px] gap-1"><Star className="w-3 h-3" /> Default</Badge>}
                        {l.id === activeId && <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 border-emerald-200"><Check className="w-3 h-3" /> Active</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{l.address ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{l.phone ?? "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {l.id !== activeId && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => switchTo(l)}>Switch to</Button>
                        )}
                        {!l.isDefault && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => makeDefault(l)}>Make default</Button>
                        )}
                        {!l.isDefault && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => del(l)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {items.length >= 2 && <StockTransferTool locations={items} />}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); reset(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add location</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5"><Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Westfield Store" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Short code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. WSF" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

/* ─── Per-location stock + transfer tool ──────────────────────────────────── */
function StockTransferTool({ locations }: { locations: Location[] }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [product, setProduct] = useState<{ id: number; name: string } | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("");

  const prodParams = { search: search.trim(), limit: 8 };
  const { data: products } = useListProducts(prodParams, {
    query: { queryKey: getListProductsQueryKey(prodParams), enabled: search.trim().length >= 2 },
  });
  const { data: breakdown } = useGetStockByLocation(product?.id ?? 0, {
    query: { queryKey: getGetStockByLocationQueryKey(product?.id ?? 0), enabled: !!product },
  });
  const transfer = useCreateStockTransfer();

  const doTransfer = async () => {
    if (!product) return;
    const n = parseInt(qty, 10);
    if (!fromId || !toId) { toast.error("Pick both locations"); return; }
    if (!Number.isFinite(n) || n <= 0) { toast.error("Enter a quantity"); return; }
    try {
      await transfer.mutateAsync({ data: { productId: product.id, fromLocationId: Number(fromId), toLocationId: Number(toId), quantity: n } as never });
      queryClient.invalidateQueries({ queryKey: getGetStockByLocationQueryKey(product.id) });
      setQty("");
      toast.success("Stock transferred");
    } catch (e) {
      toast.error((e as { data?: { error?: string } })?.data?.error || "Transfer failed");
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div>
        <p className="font-semibold">Stock by location & transfers</p>
        <p className="text-sm text-muted-foreground">Find a product to see its stock per branch and move units between them.</p>
      </div>

      <div className="relative max-w-md">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search a product…" value={search}
            onChange={(e) => { setSearch(e.target.value); setShowResults(true); }} onFocus={() => setShowResults(true)} />
        </div>
        {showResults && (products?.items?.length ?? 0) > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
            {(products?.items ?? []).map((p) => (
              <button key={p.id} type="button" className="flex w-full px-3 py-1.5 text-sm hover:bg-muted text-left"
                onClick={() => { setProduct({ id: p.id, name: p.name }); setSearch(p.name); setShowResults(false); }}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {product && breakdown && (
        <div className="space-y-3">
          <div className="rounded-lg border divide-y">
            {breakdown.locations.map((l) => (
              <div key={l.locationId} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{l.name}{l.isDefault ? " (default)" : ""}</span>
                <span className="font-medium tabular-nums">{l.quantity}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 px-3 py-2 text-sm bg-muted/30">
              <span className="flex-1 font-medium">Total</span>
              <span className="font-semibold tabular-nums">{breakdown.total}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="From" /></SelectTrigger>
                <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground mb-2.5" />
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="To" /></SelectTrigger>
                <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Qty</Label>
              <Input type="number" min={1} className="h-9 w-24" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <Button className="h-9 gap-1.5" onClick={doTransfer} disabled={transfer.isPending}>
              {transfer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Transfer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
