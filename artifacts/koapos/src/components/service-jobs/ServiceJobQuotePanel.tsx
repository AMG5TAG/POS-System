import { useEffect, useMemo, useState } from "react";
import {
  useListQuotes,
  useCreateQuote,
  useUpdateQuote,
  useApproveQuote,
  useListProducts,
  useGetSalesSettings,
  getListProductsQueryKey,
  getListQuotesQueryKey,
  getListServiceJobsQueryKey,
  type Quote,
  type QuoteLineItem,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Plus, Trash2, Loader2, Search, FileText, ExternalLink,
  CheckCircle2, ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";

/**
 * The quote a merchant offers the customer for this repair job.
 *
 * This is deliberately NOT the Parts & Labour panel. Parts & Labour records what
 * was actually consumed — it moves stock and drives job cost/profit. A quote is
 * the *offer*: what the customer agreed to pay, which may be a fixed price that
 * has nothing to do with what the parts cost. Keeping them apart is what lets a
 * shop quote "$370 screen repair" while the panel below tracks the $180 panel it
 * actually used.
 *
 * A saved quote is a normal `quotes` row carrying `serviceJobId`, so it appears
 * on the Quotes page, prints, emails and converts like any other. Nothing here
 * is job-local, and no new table was needed.
 *
 * The point of saving it is the till: when a cashier links this job to a sale,
 * the POS finds the open quote and offers to import it — see `pos.tsx`.
 */

type Line = QuoteLineItem;

/** A quote that could still be rung up. Converted/declined ones are history. */
const OPEN_STATUSES = new Set(["draft", "sent", "accepted"]);

export function ServiceJobQuotePanel({
  jobId,
  customerId,
  readOnly = false,
}: {
  jobId: number;
  customerId?: number | null;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();
  const approveQuote = useApproveQuote();

  const { data: salesSettings } = useGetSalesSettings();
  const defaultTaxRate = salesSettings?.quoteDefaultTaxRate ?? 10;

  const listParams = { serviceJobId: jobId };
  const { data: quoteList, isLoading } = useListQuotes(listParams, {
    query: { queryKey: getListQuotesQueryKey(listParams) },
  });
  const quotes = useMemo(() => quoteList?.items ?? [], [quoteList]);
  const openQuote = useMemo(
    () => quotes.find((q) => OPEN_STATUSES.has(q.status)) ?? null,
    [quotes],
  );

  // ── Draft ──
  const [editingId, setEditingId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);

  /* Load the job's open quote into the draft so the panel opens on what the
     customer was last offered rather than a blank slate. An edit in progress is
     never clobbered by a refetch — hence the `dirty` guard. */
  useEffect(() => {
    if (dirty || isLoading) return;
    if (openQuote) {
      setEditingId(openQuote.id);
      setLines(openQuote.items?.length ? openQuote.items.map((l) => ({ ...l })) : []);
      setNotes(openQuote.notes ?? "");
    } else {
      setEditingId(null);
      setLines([]);
      setNotes("");
    }
  }, [openQuote, isLoading, dirty]);

  // ── Catalogue search ──
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const productParams = { search: search.trim(), limit: 8 };
  const { data: productList } = useListProducts(productParams, {
    query: {
      queryKey: getListProductsQueryKey(productParams),
      enabled: search.trim().length >= 2,
    },
  });
  const products = productList?.items ?? [];

  // ── Custom line draft ──
  const [customDesc, setCustomDesc] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customPrice, setCustomPrice] = useState("");

  const edit = (fn: () => void) => { setDirty(true); fn(); };

  const addProduct = (p: { id: number; name: string; price: number }) => {
    edit(() => {
      setLines((prev) => [...prev, {
        description: p.name,
        quantity: 1,
        unitPrice: p.price,
        taxRate: defaultTaxRate,
        // Carrying the productId is what lets the POS ring the imported line up
        // against the real product and snapshot its cost price.
        productId: p.id,
        productName: p.name,
      }]);
      setSearch("");
      setShowResults(false);
    });
  };

  const addCustom = () => {
    const description = customDesc.trim();
    if (!description) { toast.error("Enter a description"); return; }
    edit(() => {
      setLines((prev) => [...prev, {
        description,
        quantity: parseFloat(customQty) || 1,
        unitPrice: parseFloat(customPrice) || 0,
        taxRate: defaultTaxRate,
      }]);
      setCustomDesc(""); setCustomQty("1"); setCustomPrice("");
    });
  };

  const patchLine = (i: number, patch: Partial<Line>) =>
    edit(() => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l))));

  const removeLine = (i: number) =>
    edit(() => setLines((prev) => prev.filter((_, idx) => idx !== i)));

  // GST-inclusive pricing, matching the Quotes page: unitPrice includes tax.
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxTotal = lines.reduce(
    (s, l) => s + l.quantity * l.unitPrice * (l.taxRate / (100 + l.taxRate)),
    0,
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey(listParams) });
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListServiceJobsQueryKey() });
  };

  const handleSave = async () => {
    const valid = lines.filter((l) => l.description.trim() && l.quantity > 0);
    if (valid.length === 0) { toast.error("Add at least one line to the quote"); return; }

    const items = valid.map((l) => ({
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      taxRate: Number(l.taxRate),
      ...(l.productId != null ? { productId: l.productId, productName: l.productName ?? l.description } : {}),
    }));

    try {
      if (editingId != null) {
        await updateQuote.mutateAsync({
          id: editingId,
          data: { items, notes: notes.trim() } as never,
        });
        toast.success("Quote updated");
      } else {
        const created = await createQuote.mutateAsync({
          data: {
            customerId: customerId ?? undefined,
            serviceJobId: jobId,
            items,
            notes: notes.trim() || undefined,
          } as never,
        });
        setEditingId((created as { id?: number })?.id ?? null);
        toast.success(`Quote ${(created as { quoteNumber?: string })?.quoteNumber ?? ""} saved`.trim());
      }
      setDirty(false);
      invalidate();
    } catch {
      toast.error("Couldn't save the quote");
    }
  };

  const handleApprove = async () => {
    if (editingId == null) return;
    try {
      await approveQuote.mutateAsync({ id: editingId });
      invalidate();
      toast.success("Estimate approved (in-store)");
    } catch {
      toast.error("Couldn't record approval");
    }
  };

  const startNew = () => edit(() => {
    setEditingId(null); setLines([]); setNotes("");
  });

  const saving = createQuote.isPending || updateQuote.isPending;
  const history = quotes.filter((q) => q.id !== editingId);

  if (isLoading) {
    return <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* What this is for — the whole point is the till pickup. */}
      <p className="text-xs text-muted-foreground">
        What you are offering the customer. Saved quotes are offered at the till when this
        job is linked to a sale.
      </p>

      {/* Draft lines */}
      {lines.length > 0 && (
        <div className="rounded-lg border divide-y">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <Input
                  className="h-7 text-xs border-0 px-0 shadow-none focus-visible:ring-0"
                  value={l.description}
                  disabled={readOnly}
                  onChange={(e) => patchLine(i, { description: e.target.value })}
                />
                {l.productId != null && (
                  <span className="text-[11px] text-muted-foreground">From catalogue</span>
                )}
              </div>
              <Input
                type="number" min={0} step={0.25}
                className="h-7 w-16 text-xs tabular-nums"
                value={l.quantity}
                disabled={readOnly}
                onChange={(e) => patchLine(i, { quantity: parseFloat(e.target.value) || 0 })}
              />
              <Input
                type="number" min={0} step={0.01}
                className="h-7 w-24 text-xs tabular-nums"
                value={l.unitPrice}
                disabled={readOnly}
                onChange={(e) => patchLine(i, { unitPrice: parseFloat(e.target.value) || 0 })}
              />
              <span className="w-20 text-right text-xs tabular-nums font-medium">
                {formatCurrency(l.quantity * l.unitPrice)}
              </span>
              {!readOnly && (
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                  onClick={() => removeLine(i)}>
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add a line: catalogue search, or a custom charge */}
      {!readOnly && (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs"
              placeholder="Search a product or service to quote..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
            />
            {showResults && products.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                {products.map((p) => (
                  <button key={p.id} type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left"
                    onClick={() => addProduct(p)}>
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatCurrency(p.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">or</span>
            <Input className="h-8 flex-1 text-xs" placeholder="Custom charge description"
              value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} />
            <Input type="number" min={0} step={0.25} className="h-8 w-16 text-xs"
              placeholder="Qty" value={customQty} onChange={(e) => setCustomQty(e.target.value)} />
            <Input type="number" min={0} step={0.01} className="h-8 w-24 text-xs"
              placeholder="Price" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
            <Button size="sm" className="h-8 gap-1.5" onClick={addCustom}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </div>
      )}

      {/* Notes travel with the quote — they print and email with it. */}
      <Textarea
        className="text-xs min-h-16"
        placeholder="Notes for this quote (printed and emailed with it)"
        value={notes}
        disabled={readOnly}
        onChange={(e) => edit(() => setNotes(e.target.value))}
      />

      {/* Totals + actions */}
      {lines.length > 0 && (
        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Includes GST</span><span className="tabular-nums">{formatCurrency(taxTotal)}</span>
          </div>
          <div className="flex justify-between font-semibold pt-1 border-t mt-1">
            <span>Quote total</span><span className="tabular-nums">{formatCurrency(total)}</span>
          </div>

          {!readOnly && (
            <div className="pt-2 mt-1 border-t flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {editingId != null ? "Save changes" : "Save quote"}
              </Button>

              {editingId != null && !dirty && (
                <>
                  {openQuote?.status === "accepted" ? (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                      onClick={handleApprove} disabled={approveQuote.isPending}>
                      {approveQuote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Approve in-store
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={startNew}>
                    <Plus className="w-3.5 h-3.5" /> New quote
                  </Button>
                </>
              )}
            </div>
          )}

          {editingId != null && !dirty && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
              <ShoppingCart className="w-3 h-3 shrink-0" />
              Offered at the till when this job is linked to a sale.
            </p>
          )}
        </div>
      )}

      {lines.length === 0 && !readOnly && (
        <p className="text-xs text-muted-foreground">No lines yet — search a product above or add a custom charge.</p>
      )}

      {/* Other quotes raised against this job, for context. */}
      {history.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Other quotes for this job
          </p>
          <div className="rounded-lg border divide-y">
            {history.map((q) => (
              <div key={q.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="font-medium">{q.quoteNumber}</span>
                <QuoteStatusBadge status={q.status} />
                <span className="ml-auto tabular-nums">{formatCurrency(q.total)}</span>
              </div>
            ))}
          </div>
          <Link href="/pos/quotes" className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> Open Quotes
          </Link>
        </div>
      )}
    </div>
  );
}

function QuoteStatusBadge({ status }: { status: Quote["status"] }) {
  const tone =
    status === "accepted" ? "text-emerald-600 border-emerald-200 bg-emerald-50"
    : status === "converted" ? "text-blue-600 border-blue-200 bg-blue-50"
    : status === "declined" || status === "expired" ? "text-muted-foreground"
    : "";
  return <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] capitalize", tone)}>{status}</Badge>;
}

export { OPEN_STATUSES as OPEN_QUOTE_STATUSES };
