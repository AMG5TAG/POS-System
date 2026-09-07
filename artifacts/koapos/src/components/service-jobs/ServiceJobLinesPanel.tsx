import { useState } from "react";
import {
  useListServiceJobLines,
  useAddServiceJobLine,
  useUpdateServiceJobLine,
  useDeleteServiceJobLine,
  useListProducts,
  useCreateQuote,
  useApproveQuote,
  useCreateInvoice,
  useGetInvoiceSettings,
  getListProductsQueryKey,
  getListServiceJobLinesQueryKey,
  getListServiceJobsQueryKey,
  getListInvoicesQueryKey,
  type ServiceJobLine,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import { setPendingCart } from "@/lib/pending-cart";
import { useStaffSession } from "@/lib/staff-day-session";
import { Package, Wrench, Tag, Trash2, Plus, Loader2, Search, FileText, ExternalLink, CheckCircle2, ShoppingCart, ReceiptText } from "lucide-react";
import { toast } from "sonner";

type Kind = "part" | "labour" | "misc";

const KIND_META: Record<Kind, { label: string; icon: typeof Package; color: string }> = {
  part:   { label: "Part",   icon: Package, color: "text-indigo-500" },
  labour: { label: "Labour", icon: Wrench,  color: "text-emerald-500" },
  misc:   { label: "Misc",   icon: Tag,     color: "text-amber-500" },
};

/** Parts, labour and misc charges billed against a repair job, with live totals. */
export function ServiceJobLinesPanel({ jobId, jobNumber, customerId, readOnly = false }: { jobId: number; jobNumber?: string | null; customerId?: number | null; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { dayStaff } = useStaffSession();
  const createQuote = useCreateQuote();
  const approveQuote = useApproveQuote();
  const createInvoice = useCreateInvoice();
  const { data: invoiceSettings } = useGetInvoiceSettings();
  const [createdQuoteNumber, setCreatedQuoteNumber] = useState<string | null>(null);
  const [createdQuoteId, setCreatedQuoteId] = useState<number | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<{ id: number; invoiceNumber: string } | null>(null);
  const [approvedInStore, setApprovedInStore] = useState(false);
  const { data, isLoading, isError, refetch } = useListServiceJobLines(jobId, {
    query: { queryKey: getListServiceJobLinesQueryKey(jobId) },
  });
  const add    = useAddServiceJobLine();
  const update = useUpdateServiceJobLine();
  const remove = useDeleteServiceJobLine();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListServiceJobLinesQueryKey(jobId) });
    // Consuming/returning a part moves stock server-side, so refresh products
    // (prefix match) to keep the part-picker and stock figures current.
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
  };

  // ── New-line draft ──
  const [kind, setKind]               = useState<Kind>("part");
  const [productId, setProductId]     = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [qty, setQty]                 = useState("1");
  const [unitPrice, setUnitPrice]     = useState("");
  const [search, setSearch]           = useState("");
  const [showResults, setShowResults] = useState(false);

  const productParams = { search: search.trim(), limit: 8 };
  const { data: productList } = useListProducts(
    productParams,
    { query: { queryKey: getListProductsQueryKey(productParams), enabled: kind === "part" && search.trim().length >= 2 } },
  );
  const products = productList?.items ?? [];

  const lines  = data?.lines ?? [];
  const totals = data?.totals;

  const resetDraft = () => { setProductId(null); setDescription(""); setQty(kind === "labour" ? "1" : "1"); setUnitPrice(""); setSearch(""); setShowResults(false); };

  const pickProduct = (p: { id: number; name: string }) => {
    setProductId(p.id);
    setDescription(p.name);
    setSearch(p.name);
    setShowResults(false);
    // Price/cost are auto-filled server-side from the product when unitPrice is omitted.
  };

  const handleAdd = async () => {
    if (kind !== "part" && !description.trim()) { toast.error("Enter a description"); return; }
    if (kind === "part" && !description.trim() && productId == null) { toast.error("Pick a part or enter a description"); return; }
    const body: Record<string, unknown> = {
      kind,
      description: description.trim(),
      quantity: parseFloat(qty) || (kind === "labour" ? 1 : 1),
    };
    if (kind === "part" && productId != null) body.productId = productId;
    if (unitPrice.trim() !== "") body.unitPrice = parseFloat(unitPrice) || 0;
    try {
      await add.mutateAsync({ jobId, data: body as never });
      invalidate();
      resetDraft();
    } catch { toast.error("Couldn't add line"); }
  };

  const handleQtyPrice = async (line: ServiceJobLine, patch: { quantity?: number; unitPrice?: number }) => {
    try {
      await update.mutateAsync({ jobId, lineId: line.id, data: patch as never });
      invalidate();
    } catch { toast.error("Couldn't update line"); }
  };

  const handleDelete = async (lineId: number) => {
    try { await remove.mutateAsync({ jobId, lineId }); invalidate(); }
    catch { toast.error("Couldn't remove line"); }
  };

  const handleCreateQuote = async () => {
    if (lines.length === 0) { toast.error("Add parts or labour first"); return; }
    try {
      const quote = await createQuote.mutateAsync({ data: {
        customerId: customerId ?? undefined,
        serviceJobId: jobId,
        items: lines.map((l) => ({
          description: billingDescription(l),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
        })),
      } as never });
      setCreatedQuoteNumber((quote as { quoteNumber?: string })?.quoteNumber ?? "");
      setCreatedQuoteId((quote as { id?: number })?.id ?? null);
      toast.success("Quote created from this job");
    } catch { toast.error("Couldn't create quote"); }
  };

  // Record an in-store/verbal go-ahead on the just-created quote, which drives
  // the linked job to in-progress and carries the deposit across.
  const handleApproveInStore = async () => {
    if (createdQuoteId == null) return;
    try {
      await approveQuote.mutateAsync({ id: createdQuoteId });
      setApprovedInStore(true);
      queryClient.invalidateQueries({ queryKey: getListServiceJobsQueryKey() });
      toast.success("Estimate approved (in-store)");
    } catch { toast.error("Couldn't record approval"); }
  };

  /* Bill the job's lines straight through the till: hand them to the POS cart
     the way a converted quote does, linked to this job so taking the payment
     completes the job like any other linked sale.

     Every line goes over as a custom item (productId 0). A part's stock was
     already consumed when the line was added to the job, so ringing it up
     against the product would deduct the same unit a second time. */
  const handleCreateSale = () => {
    if (lines.length === 0) { toast.error("Add parts or labour first"); return; }
    setPendingCart({
      id: jobId,
      reference: jobNumber ? `Service ${jobNumber}` : `Service job #${jobId}`,
      note: null,
      customerId: customerId ?? null,
      items: lines.map((l) => ({
        productId: 0,
        name: billingDescription(l),
        quantity: l.quantity,
        price: l.unitPrice,
      })),
      total: totals?.total ?? 0,
      createdAt: new Date().toISOString(),
      serviceJobId: jobId,
    });
    navigate("/pos/sell");
  };

  /* Invoice the job's lines instead of taking payment now. Lines are financial
     only (no productId) for the same double-deduction reason as the sale above;
     the cost still rides along so invoice COGS/profit stays right. */
  const handleCreateInvoice = async () => {
    if (lines.length === 0) { toast.error("Add parts or labour first"); return; }
    if (customerId == null) { toast.error("Add a customer to this job before invoicing"); return; }
    try {
      const invoice = await createInvoice.mutateAsync({ data: {
        customerId,
        staffId: dayStaff?.staffId ?? null,
        serviceJobId: jobId,
        dueDate: invoiceSettings ? dueDateFromToday(invoiceSettings.defaultDueDays) : undefined,
        notes: invoiceSettings?.defaultNotes || undefined,
        items: lines.map((l) => ({
          description: billingDescription(l),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
          costPrice: l.unitCost,
        })),
      } as never }) as unknown as { id: number; invoiceNumber: string };
      setCreatedInvoice({ id: invoice.id, invoiceNumber: invoice.invoiceNumber });
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListServiceJobsQueryKey() });
      toast.success(`Invoice ${invoice.invoiceNumber} created from this job`);
    } catch { toast.error("Couldn't create invoice"); }
  };

  if (isLoading) {
    return <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }
  if (isError) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Couldn't load parts &amp; labour.{" "}
        <button className="text-primary underline" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Lines */}
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No parts or labour added yet.</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {lines.map((line) => {
            const meta = KIND_META[(line.kind as Kind)] ?? KIND_META.part;
            const Icon = meta.icon;
            const qtyLabel = line.kind === "labour" ? "hrs" : "×";
            return (
              <div key={line.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Icon className={cn("w-4 h-4 shrink-0", meta.color)} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{line.description || meta.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.quantity}{line.kind === "labour" ? " hrs" : ` ${qtyLabel}`} @ {formatCurrency(line.unitPrice)}
                  </p>
                </div>
                {!readOnly && (
                  <Input
                    type="number" min={0} step={line.kind === "labour" ? 0.25 : 1}
                    defaultValue={line.quantity}
                    className="h-7 w-16 text-right text-xs"
                    onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== line.quantity) handleQtyPrice(line, { quantity: v }); }}
                  />
                )}
                <span className="w-20 text-right font-medium tabular-nums">{formatCurrency(line.lineTotal)}</span>
                {!readOnly && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(line.id)} disabled={remove.isPending}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Totals */}
      {totals && (
        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm space-y-1">
          <Row label="Parts"  value={formatCurrency(totals.partsTotal)} />
          <Row label="Labour" value={formatCurrency(totals.labourTotal)} />
          {totals.miscTotal > 0 && <Row label="Misc" value={formatCurrency(totals.miscTotal)} />}
          <Row label="Subtotal (ex GST)" value={formatCurrency(totals.subtotal)} muted />
          <Row label="GST" value={formatCurrency(totals.taxTotal)} muted />
          <div className="flex justify-between font-semibold pt-1 border-t mt-1">
            <span>Total</span><span className="tabular-nums">{formatCurrency(totals.total)}</span>
          </div>
          {totals.costTotal > 0 && (
            <p className="text-[11px] text-muted-foreground pt-0.5">
              Cost {formatCurrency(totals.costTotal)} · Profit {formatCurrency(totals.profit)}
            </p>
          )}
          {!readOnly && totals.total > 0 && (
            <div className="pt-2 mt-1 border-t flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleCreateSale}>
                <ShoppingCart className="w-3.5 h-3.5" /> Create sale
              </Button>

              {createdInvoice !== null ? (
                <Link href="/pos/invoices" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> Invoice {createdInvoice.invoiceNumber} created — open Invoices
                </Link>
              ) : (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleCreateInvoice} disabled={createInvoice.isPending}>
                  {createInvoice.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ReceiptText className="w-3.5 h-3.5" />}
                  Create invoice
                </Button>
              )}

              {createdQuoteNumber !== null ? (
                <>
                  <Link href="/pos/quotes" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" /> Quote {createdQuoteNumber} created — open Quotes
                  </Link>
                  {createdQuoteId != null && (approvedInStore ? (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved in-store
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleApproveInStore} disabled={approveQuote.isPending}>
                      {approveQuote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Approve in-store
                    </Button>
                  ))}
                </>
              ) : (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleCreateQuote} disabled={createQuote.isPending}>
                  {createQuote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  Create quote from these
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add line */}
      {!readOnly && (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="flex gap-2">
            <Select value={kind} onValueChange={(v) => { setKind(v as Kind); resetDraft(); }}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="part">Part</SelectItem>
                <SelectItem value="labour">Labour</SelectItem>
                <SelectItem value="misc">Misc</SelectItem>
              </SelectContent>
            </Select>

            {kind === "part" ? (
              <div className="relative flex-1">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-7 text-xs"
                    placeholder="Search a part, or type a description"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setDescription(e.target.value); setProductId(null); setShowResults(true); }}
                    onFocus={() => setShowResults(true)}
                  />
                </div>
                {showResults && products.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                    {products.map((p) => (
                      <button key={p.id} type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left"
                        onClick={() => pickProduct(p)}>
                        <span className="truncate">{p.name}</span>
                        <span className="text-muted-foreground shrink-0">{formatCurrency(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Input className="h-8 flex-1 text-xs" placeholder={kind === "labour" ? "Labour description" : "Charge description"}
                value={description} onChange={(e) => setDescription(e.target.value)} />
            )}
          </div>

          <div className="flex gap-2">
            <Input type="number" min={0} step={kind === "labour" ? 0.25 : 1} className="h-8 w-24 text-xs"
              placeholder={kind === "labour" ? "Hours" : "Qty"} value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input type="number" min={0} step={0.01} className="h-8 flex-1 text-xs"
              placeholder={kind === "part" ? "Unit price (auto from part)" : kind === "labour" ? "Rate / hr" : "Amount"}
              value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            <Button size="sm" className="h-8 gap-1.5" onClick={handleAdd} disabled={add.isPending}>
              {add.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** What a job line is called on a sale, invoice or quote — never blank. */
function billingDescription(line: ServiceJobLine): string {
  return line.description?.trim() || (KIND_META[line.kind as Kind] ?? KIND_META.part).label;
}

/** ISO yyyy-mm-dd for `days` from today — mirrors the invoice page's default
 *  due-date rule so a job-raised invoice falls due like any other. */
function dueDateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground text-xs")}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}
