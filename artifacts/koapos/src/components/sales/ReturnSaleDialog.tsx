import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useGetSaleReturnable, useReturnSale, useListProducts, getGetSaleReturnableQueryKey,
  type Transaction, type Product,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, Loader2, Minus, Plus, RotateCcw, Search, Trash2, AlertTriangle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

/* Customer › History › Return / swap. Pick what comes back (and whether each
   goes back on the shelf), optionally add products the customer is taking
   instead, and settle the difference. The server works out every amount
   (POST /transactions/:id/return, rules in api-server lib/sale-returns.ts);
   this screen only previews them. Needs a manager or manager PIN — the till's
   approval prompt answers the server's 403 by itself. */

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  eftpos: "EFTPOS / card",
  card: "Card",
  store_credit: "Store credit",
};
const methodLabel = (m: string) => METHOD_LABEL[m] ?? m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

interface SwapLine { productId: number; name: string; price: number; quantity: number }

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ReturnSaleDialog({ sale, hasCustomer, onClose, onDone }: {
  sale: Transaction | null;
  /** Store credit needs a customer on the sale. */
  hasCustomer: boolean;
  onClose: () => void;
  onDone?: (returnTx: Transaction) => void;
}) {
  const queryClient = useQueryClient();
  const open = !!sale;
  const { data, isLoading } = useGetSaleReturnable(sale?.id ?? 0, {
    query: { enabled: open, queryKey: getGetSaleReturnableQueryKey(sale?.id ?? 0) },
  });
  const returnMutation = useReturnSale();
  const { data: productsData } = useListProducts({ limit: 100000 }, { query: { enabled: open, queryKey: ["products", "return-swap"] } });

  const [qty, setQty] = useState<Record<number, number>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  const [swaps, setSwaps] = useState<SwapLine[]>([]);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newKey()); // one per attempt: a retry after a timeout can't return twice

  useEffect(() => {
    if (!open) return;
    setQty({}); setRestock({}); setSwaps([]); setSearch(""); setReason(""); setError(null); keyRef.current = newKey();
  }, [open, sale?.id]);
  useEffect(() => { if (data) setMethod(data.defaultRefundMethod); }, [data]);

  const lines = data?.lines ?? [];
  const returning = lines.filter((l) => (qty[l.index] ?? 0) > 0);
  // Preview only — the server's numbers are the ones recorded (the last unit
  // of a line takes its remainder, so this can differ by a cent).
  const refundPreview = returning.reduce((s, l) => s + (qty[l.index] ?? 0) * l.unitRefund, 0);
  const swapTotal = swaps.reduce((s, w) => s + w.price * w.quantity, 0);
  const net = Math.round((swapTotal - refundPreview) * 100) / 100;

  const methods = useMemo(() => {
    const base = ["cash", "eftpos", ...(hasCustomer ? ["store_credit"] : [])];
    const first = data?.defaultRefundMethod;
    return first && !base.includes(first) && (first !== "store_credit" || hasCustomer) ? [first, ...base] : base;
  }, [data?.defaultRefundMethod, hasCustomer]);
  useEffect(() => { if (method && !methods.includes(method)) setMethod(methods[0] ?? "cash"); }, [methods, method]);

  const products = (productsData?.items ?? []) as Product[];
  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.isActive !== false && (p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q))).slice(0, 8);
  }, [products, search]);

  const addSwap = (p: Product) => {
    setSwaps((s) => {
      const i = s.findIndex((w) => w.productId === p.id);
      if (i >= 0) return s.map((w, k) => (k === i ? { ...w, quantity: w.quantity + 1 } : w));
      return [...s, { productId: p.id, name: p.name, price: Number(p.price) || 0, quantity: 1 }];
    });
    setSearch("");
  };

  const submit = () => {
    if (!sale || !returning.length) { setError("Choose at least one item coming back."); return; }
    setError(null);
    returnMutation.mutate({
      id: sale.id,
      data: {
        lines: returning.map((l) => ({ index: l.index, quantity: qty[l.index]!, restock: restock[l.index] ?? true })),
        newItems: swaps.map((w) => ({ productId: w.productId, quantity: w.quantity })),
        method,
        reason: reason.trim() || undefined,
        idempotencyKey: keyRef.current,
      },
    }, {
      onSuccess: (tx) => {
        const total = Number(tx.total);
        toast.success(total < 0
          ? `Return ${tx.receiptNumber}: refund ${formatCurrency(-total)} by ${methodLabel(tx.paymentMethod)}`
          : total > 0
            ? `Swap ${tx.receiptNumber}: customer pays ${formatCurrency(total)} by ${methodLabel(tx.paymentMethod)}`
            : `Swap ${tx.receiptNumber}: even exchange, nothing to pay`);
        void queryClient.invalidateQueries({ queryKey: getGetSaleReturnableQueryKey(sale.id) });
        void queryClient.invalidateQueries({ queryKey: ["transactions"] });
        void queryClient.invalidateQueries({ queryKey: ["products"] });
        onDone?.(tx);
        onClose();
      },
      onError: (e) => {
        setError((e as { data?: { error?: string } })?.data?.error ?? (e instanceof Error ? e.message : "Couldn't record the return"));
        keyRef.current = newKey();
      },
    });
  };

  const blockedAll = !isLoading && data && !lines.some((l) => !l.blockedReason);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !returnMutation.isPending) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5 text-primary" />Return / swap — {sale?.receiptNumber}</DialogTitle>
          <DialogDescription>Choose what's coming back. Add products below if the customer is swapping; the difference is refunded or paid.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
          {isLoading && <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading the sale…</div>}
          {data && data.status !== "completed" && (
            <p className="text-sm text-destructive">This sale is {data.status} — only completed sales can have returns.</p>
          )}
          {data?.returns.length ? (
            <p className="text-xs text-muted-foreground">Earlier returns on this sale: {data.returns.map((r) => `${r.receiptNumber} (${formatCurrency(r.total)})`).join(", ")}</p>
          ) : null}

          {/* Items coming back */}
          {data && data.status === "completed" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Coming back</h3>
              <div className="rounded-xl border divide-y">
                {lines.map((l) => {
                  const q = qty[l.index] ?? 0;
                  return (
                    <div key={l.index} className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", l.blockedReason && "opacity-60")}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{l.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.blockedReason ?? `${formatCurrency(l.unitRefund)} each · ${l.remaining} of ${l.quantity} can come back`}
                          {!l.blockedReason && l.returned > 0 && ` (${l.returned} already returned)`}
                        </p>
                      </div>
                      {!l.blockedReason && (
                        <>
                          <div className="flex items-center gap-1">
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={q <= 0} onClick={() => setQty((m) => ({ ...m, [l.index]: q - 1 }))}><Minus className="w-3 h-3" /></Button>
                            <span className="w-8 text-center tabular-nums text-sm">{q}</span>
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={q >= l.remaining} onClick={() => setQty((m) => ({ ...m, [l.index]: q + 1 }))}><Plus className="w-3 h-3" /></Button>
                          </div>
                          <label className={cn("flex items-center gap-1.5 text-xs", q === 0 && "invisible")}>
                            <Checkbox checked={restock[l.index] ?? true} onCheckedChange={(v) => setRestock((m) => ({ ...m, [l.index]: v === true }))} />
                            Put back in stock
                          </label>
                          <span className="w-20 text-right tabular-nums text-sm">{q ? `−${formatCurrency(q * l.unitRefund)}` : ""}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {blockedAll && <p className="text-xs text-muted-foreground">Nothing on this sale can be returned here.</p>}
              <p className="text-[11px] text-muted-foreground">Untick "Put back in stock" for faulty or damaged items.</p>
            </section>
          )}

          {/* Swap */}
          {data && data.status === "completed" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><ArrowLeftRight className="w-4 h-4" />Swapping for <span className="font-normal text-muted-foreground">(optional)</span></h3>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Add a product by name, SKU or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {hits.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-64 overflow-y-auto">
                    {hits.map((p) => (
                      <button key={p.id} type="button" onClick={() => addSwap(p)} className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between gap-3">
                        <span className="truncate">{p.name}{p.sku ? <span className="text-muted-foreground"> · {p.sku}</span> : null}</span>
                        <span className="tabular-nums shrink-0">{formatCurrency(Number(p.price) || 0)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {swaps.length > 0 && (
                <div className="rounded-xl border divide-y">
                  {swaps.map((w, i) => (
                    <div key={w.productId} className="flex items-center gap-3 px-3 py-2">
                      <p className="text-sm flex-1 truncate">{w.name}</p>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={w.quantity <= 1} onClick={() => setSwaps((s) => s.map((x, k) => (k === i ? { ...x, quantity: x.quantity - 1 } : x)))}><Minus className="w-3 h-3" /></Button>
                        <span className="w-8 text-center tabular-nums text-sm">{w.quantity}</span>
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setSwaps((s) => s.map((x, k) => (k === i ? { ...x, quantity: x.quantity + 1 } : x)))}><Plus className="w-3 h-3" /></Button>
                      </div>
                      <span className="w-20 text-right tabular-nums text-sm">{formatCurrency(w.price * w.quantity)}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSwaps((s) => s.filter((_, k) => k !== i))}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
              {swaps.length > 0 && <p className="text-[11px] text-muted-foreground">Charged at today's price (the customer's group price if they have one).</p>}
            </section>
          )}

          {/* Settle */}
          {data && data.status === "completed" && returning.length > 0 && (
            <section className="rounded-xl border p-4 space-y-3 bg-muted/20">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>Returned <strong className="tabular-nums">{formatCurrency(refundPreview)}</strong>{swaps.length > 0 && <> · Swapped in <strong className="tabular-nums">{formatCurrency(swapTotal)}</strong></>}</span>
                <span className={cn("text-base font-semibold", net < 0 ? "text-emerald-700 dark:text-emerald-400" : net > 0 ? "text-amber-700 dark:text-amber-400" : "")}>
                  {net < 0 ? `Refund ${formatCurrency(-net)}` : net > 0 ? `Customer pays ${formatCurrency(net)}` : "Even swap"}
                </span>
              </div>
              {net !== 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 items-center">
                  <Label className="text-xs">{net < 0 ? "Refund by" : "Paid by"}</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => (
                        <SelectItem key={m} value={m}>{methodLabel(m)}{m === data.defaultRefundMethod ? " — as the sale was paid" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {net < 0 && method !== "store_credit" && (
                <p className="text-xs text-muted-foreground">
                  {method === "cash" ? "Hand the cash back from the till." : "Refund the card on the EFTPOS terminal — KoaPOS records it, it doesn't move the money."}
                </p>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong size — swapped for the 128GB" />
              </div>
            </section>
          )}

          {error && <p className="text-sm text-destructive flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} disabled={returnMutation.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={returnMutation.isPending || !returning.length || data?.status !== "completed"}>
            {returnMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
            {swaps.length ? "Record swap" : "Record return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
