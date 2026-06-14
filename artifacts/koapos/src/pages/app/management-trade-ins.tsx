import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListTradeIns,
  useCreateTradeIn,
  useAcceptTradeIn,
  useListTradeInAsStock,
  useDeleteTradeIn,
  getListTradeInsQueryKey,
  type TradeIn,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { formatCurrency, cn } from "@/lib/utils";
import { Recycle, Plus, Loader2, Trash2, Banknote, Wallet, Package } from "lucide-react";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  quoted:   { label: "Quoted",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  accepted: { label: "Accepted", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  listed:   { label: "Listed",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function ManagementTradeInsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useListTradeIns({ query: { queryKey: getListTradeInsQueryKey() } });
  const create = useCreateTradeIn();
  const accept = useAcceptTradeIn();
  const listStock = useListTradeInAsStock();
  const remove = useDeleteTradeIn();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTradeInsQueryKey() });

  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [grade, setGrade] = useState("B");
  const [valuation, setValuation] = useState("");
  const [notes, setNotes] = useState("");

  const [listing, setListing] = useState<TradeIn | null>(null);
  const [sellPrice, setSellPrice] = useState("");

  const items = data?.items ?? [];

  const resetForm = () => { setCustomerId(""); setDeviceName(""); setIdentifier(""); setGrade("B"); setValuation(""); setNotes(""); };

  const submit = async () => {
    if (!deviceName.trim()) { toast.error("Enter a device name"); return; }
    try {
      await create.mutateAsync({ data: {
        customerId: customerId ? Number(customerId) : undefined,
        deviceName: deviceName.trim(),
        identifier: identifier.trim() || undefined,
        conditionGrade: grade,
        valuationAmount: parseFloat(valuation) || 0,
        notes: notes.trim() || undefined,
      } as never });
      invalidate(); resetForm(); setOpen(false); toast.success("Trade-in recorded");
    } catch { toast.error("Couldn't record trade-in"); }
  };

  const doAccept = async (t: TradeIn, payoutMethod: "cash" | "store_credit") => {
    if (payoutMethod === "store_credit" && !t.customerId) { toast.error("Store credit needs a customer on the trade-in"); return; }
    try { await accept.mutateAsync({ id: t.id, data: { payoutMethod } as never }); invalidate(); toast.success(`Paid out as ${payoutMethod === "cash" ? "cash" : "store credit"}`); }
    catch { toast.error("Couldn't accept trade-in"); }
  };

  const doListStock = async () => {
    if (!listing) return;
    const price = parseFloat(sellPrice);
    if (!Number.isFinite(price) || price <= 0) { toast.error("Enter a sell price"); return; }
    try {
      await listStock.mutateAsync({ id: listing.id, data: { price } as never });
      invalidate(); setListing(null); setSellPrice(""); toast.success("Listed as refurbished stock");
    } catch { toast.error("Couldn't list as stock"); }
  };

  const del = async (t: TradeIn) => {
    if (!confirm(`Delete trade-in "${t.deviceName}"?`)) return;
    try { await remove.mutateAsync({ id: t.id }); invalidate(); }
    catch { toast.error("Couldn't delete"); }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Recycle className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Trade-Ins &amp; Buy-Backs</h1>
              <p className="text-sm text-muted-foreground">Intake used devices, pay out, and re-list as refurbished stock.</p>
            </div>
          </div>
          <Button className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> New trade-in</Button>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          {isLoading ? (
            <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="py-14 text-center text-sm text-muted-foreground">Couldn't load trade-ins. <button className="text-primary underline" onClick={() => refetch()}>Retry</button></div>
          ) : items.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">No trade-ins yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Device</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-center px-5 py-3 font-medium text-muted-foreground">Grade</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Valuation</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const meta = STATUS_META[t.status] ?? STATUS_META.quoted;
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <p className="font-medium">{t.deviceName}</p>
                        {t.identifier && <p className="text-xs text-muted-foreground font-mono">{t.identifier}</p>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{t.customerName ?? "—"}</td>
                      <td className="px-5 py-3 text-center"><Badge variant="outline" className="text-xs">{t.conditionGrade}</Badge></td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(t.valuationAmount)}</td>
                      <td className="px-5 py-3">
                        <Badge variant="outline" className={cn("text-xs", meta.cls)}>{meta.label}</Badge>
                        {t.payoutMethod && <span className="text-xs text-muted-foreground ml-2">{t.payoutMethod === "cash" ? "cash" : "store credit"}</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {t.status === "quoted" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => doAccept(t, "cash")} disabled={accept.isPending}>
                                <Banknote className="w-3.5 h-3.5" /> Cash
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => doAccept(t, "store_credit")} disabled={accept.isPending}>
                                <Wallet className="w-3.5 h-3.5" /> Credit
                              </Button>
                            </>
                          )}
                          {t.status === "accepted" && !t.createdProductId && (
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => { setListing(t); setSellPrice(""); }}>
                              <Package className="w-3.5 h-3.5" /> List stock
                            </Button>
                          )}
                          {t.status === "listed" && <span className="text-xs text-muted-foreground">Product #{t.createdProductId}</span>}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => del(t)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New trade-in */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New trade-in</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5"><Label className="text-xs">Customer (required for store-credit payout)</Label>
              <CustomerSearchInput value={customerId} onChange={setCustomerId} placeholder="Search customer..." /></div>
            <div className="space-y-1.5"><Label className="text-xs">Device</Label>
              <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="e.g. iPhone 12 128GB Black" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">IMEI / serial</Label>
                <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Condition grade</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A — Excellent</SelectItem>
                    <SelectItem value="B">B — Good</SelectItem>
                    <SelectItem value="C">C — Fair</SelectItem>
                    <SelectItem value="D">D — Poor / parts</SelectItem>
                  </SelectContent>
                </Select></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Valuation (payout amount)</Label>
              <Input type="number" min={0} step={0.01} value={valuation} onChange={(e) => setValuation(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. cracked back, battery 82%" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List as stock */}
      <Dialog open={!!listing} onOpenChange={(v) => { if (!v) setListing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>List "{listing?.deviceName}" as refurbished stock</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">Cost will be set to the {formatCurrency(listing?.valuationAmount ?? 0)} valuation. Set the sell price:</p>
            <div className="space-y-1.5"><Label className="text-xs">Sell price</Label>
              <Input type="number" min={0} step={0.01} value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} autoFocus /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListing(null)}>Cancel</Button>
            <Button onClick={doListStock} disabled={listStock.isPending}>{listStock.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Create product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
