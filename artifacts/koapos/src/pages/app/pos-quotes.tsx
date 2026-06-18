import { useState, useMemo } from "react";
import { useLocation } from "wouter";

import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProducts,
  useListQuotes, useCreateQuote, useUpdateQuote, useDeleteQuote,
  useSendQuoteEmail, useConvertQuote, useAddQuoteEvent,
  useGetSalesSettings, getGetSalesSettingsQueryKey,
  getListQuotesQueryKey, getQuotePdf,
  type Quote, type QuoteLineItem, type QuoteInput, type QuoteUpdate, type Transaction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { setPendingCart } from "@/lib/pending-cart";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { useDocumentTemplate } from "@/lib/use-document-template";
import { formatCurrency, formatDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, FileText, Search, Trash2, Download, Pencil, X,
  ShoppingCart, CheckCircle2, Loader2, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { SendButton } from "@/components/send/send-dialog";

type LineItem = QuoteLineItem;
type DiscountType = "fixed" | "percent";

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  accepted:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  expired:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  converted: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

const blankLine = (taxRate = 10): LineItem => ({ description: "", quantity: 1, unitPrice: 0, taxRate });

/* Map a quote to the Transaction shape the print template expects. Mirrors the
   invoice→transaction mapping: subtotal is passed GST-inclusive so the A4
   template round-trips the ex-GST figure correctly. */
function quoteToTransaction(q: Quote): Transaction {
  return {
    id: q.id,
    customer: q.customerId
      ? ({ id: q.customerId, firstName: q.customerName ?? "", lastName: "", email: q.customerEmail ?? "", phone: q.customerPhone ?? "" } as unknown as Transaction["customer"])
      : undefined,
    receiptNumber: q.quoteNumber,
    status: q.status as unknown as Transaction["status"],
    subtotal: q.subtotal + q.taxTotal,
    taxTotal: q.taxTotal,
    discountTotal: q.discountTotal ?? 0,
    total: q.total,
    paymentMethod: "" as unknown as Transaction["paymentMethod"],
    items: (q.items ?? []).map((l) => ({
      productId: 0,
      productName: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      totalPrice: l.quantity * l.unitPrice,
    })),
    createdAt: q.createdAt,
    discountLabel: q.discountTotal
      ? `Discount${q.discountType === "percent" && q.discountValue ? ` (${q.discountValue}%)` : ""}`
      : undefined,
  } as unknown as Transaction;
}

export default function POSQuotesPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"active" | "archive">("active");
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [custId, setCustId] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([blankLine()]);
  const [discount, setDiscount] = useState<{ enabled: boolean; type: DiscountType; value: string }>({ enabled: false, type: "fixed", value: "" });
  const [productPick, setProductPick] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);

  const { data: quotesData, isLoading } = useListQuotes(undefined, { query: { queryKey: getListQuotesQueryKey() } });
  const quotes = useMemo<Quote[]>(() => (quotesData?.items ?? []) as Quote[], [quotesData]);
  const { data: productsData } = useListProducts();
  const allProducts = useMemo(() => productsData?.items ?? [], [productsData]);

  // Quote defaults from Management → Sales Settings → Quotes.
  const { data: salesSettings } = useGetSalesSettings({ query: { queryKey: getGetSalesSettingsQueryKey() } });
  const defaultTaxRate = salesSettings?.quoteDefaultTaxRate ?? 10;
  const defaultExpiryDays = salesSettings?.quoteExpiryDays ?? 30;
  const quoteAutoEmail = salesSettings?.quoteAutoEmail === "true";
  const quotePrefix = salesSettings?.quotePrefix || undefined;
  const quoteDigits = salesSettings?.quoteDigits || undefined;

  const { printQuote } = useDocumentTemplate();

  const createMutation = useCreateQuote();
  const updateMutation = useUpdateQuote();
  const deleteMutation = useDeleteQuote();
  const emailMutation = useSendQuoteEmail();
  const convertMutation = useConvertQuote();
  const eventMutation = useAddQuoteEvent();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });

  /* ── Totals (GST-inclusive prices; tax extracted from the total) ── */
  const linesGross = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const rawTax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / (100 + l.taxRate)), 0);
  const discountAmt = (() => {
    if (!discount.enabled || !discount.value) return 0;
    const v = parseFloat(discount.value);
    if (isNaN(v) || v <= 0) return 0;
    return discount.type === "fixed" ? Math.min(v, linesGross) : (Math.min(v, 100) / 100) * linesGross;
  })();
  const grandTotal = Math.max(0, linesGross - discountAmt);
  const taxTotal = linesGross > 0 ? rawTax * (grandTotal / linesGross) : 0;

  const validLines = lines.filter((l) => l.description.trim() !== "");
  const canSave = validLines.length > 0 && lines.every((l) => l.quantity > 0 && l.unitPrice >= 0 && l.taxRate >= 0 && l.taxRate <= 100);

  /* ── Editor open/reset ── */
  const openCreate = () => {
    setEditingId(null);
    setCustId("");
    // Pre-fill expiry from the configured default validity period.
    const exp = new Date(); exp.setDate(exp.getDate() + defaultExpiryDays);
    setExpiry(exp.toISOString().slice(0, 10));
    setNotes(salesSettings?.quoteTerms ?? "");
    setLines([blankLine(defaultTaxRate)]);
    setDiscount({ enabled: false, type: "fixed", value: "" });
    setProductPick("");
    setEditorOpen(true);
  };
  const openEdit = (q: Quote) => {
    setEditingId(q.id);
    setCustId(q.customerId ? String(q.customerId) : "");
    setExpiry(q.expiryDate ? q.expiryDate.slice(0, 10) : "");
    setNotes(q.notes ?? "");
    setLines(q.items?.length ? q.items.map((l) => ({ ...l })) : [blankLine(defaultTaxRate)]);
    setDiscount(q.discountType && q.discountValue
      ? { enabled: true, type: q.discountType as DiscountType, value: String(q.discountValue) }
      : { enabled: false, type: "fixed", value: "" });
    setProductPick("");
    setEditorOpen(true);
  };

  const addLine = () => setLines((p) => [...p, blankLine(defaultTaxRate)]);
  const updateLine = (i: number, field: keyof LineItem, val: string | number) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));
  const removeLine = (i: number) => setLines((p) => (p.length === 1 ? [blankLine(defaultTaxRate)] : p.filter((_, idx) => idx !== i)));
  const addProductLine = (productId: string) => {
    const prod = allProducts.find((p) => String(p.id) === productId);
    if (!prod) return;
    const line: LineItem = {
      description: prod.name,
      quantity: 1,
      unitPrice: Number(prod.price ?? 0),
      taxRate: defaultTaxRate,
      // Carry the product linkage so a converted quote rings up as a real
      // product sale (cost price gets snapshotted at checkout).
      productId: prod.id,
      productName: prod.name,
      costPrice: prod.costPrice ?? null,
    };
    setLines((p) => {
      const first = p[0];
      // Replace a pristine first blank line, otherwise append.
      if (p.length === 1 && first.description.trim() === "" && first.unitPrice === 0) return [line];
      return [...p, line];
    });
    setProductPick("");
  };

  const buildDiscount = () =>
    discount.enabled && discount.value && parseFloat(discount.value) > 0
      ? { type: discount.type, value: parseFloat(discount.value) }
      : undefined;

  const handleSave = async () => {
    if (!canSave) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    try {
      const items = validLines.map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        taxRate: Number(l.taxRate),
        ...(l.productId != null ? { productId: l.productId, productName: l.productName ?? l.description.trim(), costPrice: l.costPrice ?? null } : {}),
      }));
      const common = {
        customerId: custId ? Number(custId) : undefined,
        expiryDate: expiry ? new Date(expiry).toISOString() : undefined,
        notes: notes.trim() || undefined,
        items,
        discount: buildDiscount(),
      };
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: common as QuoteUpdate });
        toast.success("Quote updated");
      } else {
        const created = await createMutation.mutateAsync({
          data: { ...common, quotePrefix, quoteDigits } as QuoteInput,
        }) as unknown as Quote;
        toast.success("Quote created");
        // Auto-email on creation when enabled in Sales Settings and the customer has an email.
        if (quoteAutoEmail && created?.id && created.customerEmail) {
          try {
            await emailMutation.mutateAsync({ id: created.id, data: { email: created.customerEmail } });
            toast.success(`Quote emailed to ${created.customerEmail}`);
          } catch { /* non-fatal — quote was still created */ }
        }
      }
      setEditorOpen(false);
      refresh();
    } catch {
      toast.error(editingId ? "Failed to update quote" : "Failed to create quote");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (q: Quote, status: string) => {
    try {
      await updateMutation.mutateAsync({ id: q.id, data: { status } as QuoteUpdate });
      toast.success(`Marked as ${status}`);
      refresh();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast.success("Quote deleted");
      setDeleteId(null);
      refresh();
    } catch {
      toast.error("Failed to delete quote");
    }
  };

  const downloadPdf = async (q: Quote) => {
    if (pdfBusyId !== null) return;
    setPdfBusyId(q.id);
    try {
      const blob = await getQuotePdf(q.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${q.quoteNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
      eventMutation.mutate({ id: q.id, data: { type: "download" } });
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfBusyId(null);
    }
  };

  const doPrint = (q: Quote) => {
    printQuote(quoteToTransaction(q));
    eventMutation.mutate({ id: q.id, data: { type: "print" } });
  };

  const sendQuoteEmail = async (q: Quote, email: string) => {
    try {
      await emailMutation.mutateAsync({ id: q.id, data: { email } });
    } catch {
      throw new Error("Failed to send quote");
    }
    toast.success(`Quote sent to ${email}`);
    refresh();
  };

  /* Convert → load the quote's lines into the POS cart (parked-sale handoff),
     mark the quote converted server-side, then go to the Sell screen. */
  const handleConvert = async (q: Quote) => {
    if (convertingId !== null) return;
    setConvertingId(q.id);
    try {
      setPendingCart({
        id: q.id,
        reference: q.quoteNumber,
        note: q.notes ?? null,
        customerId: q.customerId ?? null,
        items: (q.items ?? []).map((l) => ({
          // Use the real productId when the quote line carries one, so the sale
          // rings up against the product and snapshots its cost price.
          productId: l.productId ?? 0,
          name: l.productName ?? l.description,
          quantity: l.quantity,
          price: l.unitPrice,
        })),
        total: q.total,
        createdAt: q.createdAt,
      });
      await convertMutation.mutateAsync({ id: q.id, data: {} });
      toast.success("Quote loaded into POS");
      navigate("/pos/sell");
    } catch {
      toast.error("Failed to convert quote");
      setConvertingId(null);
    }
  };

  /* ── Derived list ── */
  const ARCHIVE = new Set(["converted", "expired"]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter((q) => {
      const inTab = activeTab === "archive" ? ARCHIVE.has(q.status) : !ARCHIVE.has(q.status);
      if (!inTab) return false;
      if (!term) return true;
      return q.quoteNumber.toLowerCase().includes(term) || (q.customerName ?? "").toLowerCase().includes(term);
    });
  }, [quotes, activeTab, search]);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" /> Quotes</h1>
            <p className="text-sm text-muted-foreground">Create priced quotes, send them to customers, and convert accepted quotes into a sale.</p>
          </div>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> New Quote</Button>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "archive")}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archive">Converted &amp; Expired</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quote # or customer" className="pl-8 h-9" />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No quotes here yet.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((q) => {
              const expired = q.status === "expired";
              return (
                <Card key={q.id} className="overflow-hidden">
                  <CardContent className="p-3 sm:p-4 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{q.quoteNumber}</span>
                        <Badge className={STATUS_STYLES[q.status] ?? STATUS_STYLES.draft} variant="secondary">{q.status}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {q.customerName || "No customer"}
                        {q.expiryDate && <> · {expired ? "expired" : "valid until"} {formatDateOnly(q.expiryDate)}</>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">{formatCurrency(q.total)}</div>
                      <div className="text-[11px] text-muted-foreground">incl. GST {formatCurrency(q.taxTotal)}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {q.status !== "converted" && (
                        <Button size="sm" className="gap-1 h-8" disabled={convertingId === q.id} onClick={() => handleConvert(q)}>
                          {convertingId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                          Convert
                        </Button>
                      )}
                      {q.status === "sent" && (
                        <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => setStatus(q, "accepted")}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Download PDF" disabled={pdfBusyId === q.id} onClick={() => downloadPdf(q)}>
                        {pdfBusyId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      </Button>
                      <SendButton
                        iconOnly
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        buttonTitle="Send quote"
                        title="Send Quote"
                        documentLabel={q.quoteNumber}
                        defaultEmail={q.customerEmail ?? ""}
                        reprintLabel="Print"
                        reprintSub="Print to printer"
                        reprintButtonLabel="Print Quote"
                        reprintHint={<>This will open a print preview for quote <strong>{q.quoteNumber}</strong>.</>}
                        onReprint={() => doPrint(q)}
                        emailHint={`Quote ${q.quoteNumber} will be emailed as a PDF.`}
                        onEmail={(email) => sendQuoteEmail(q, email)}
                      />
                      {q.status !== "converted" && (
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Edit" onClick={() => openEdit(q)}><Pencil className="w-3.5 h-3.5" /></Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive" title="Delete" onClick={() => setDeleteId(q.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit dialog ── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Quote" : "New Quote"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Customer</Label>
                <CustomerSearchInput value={custId} onChange={(id) => setCustId(id)} placeholder="Search customer (optional)" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valid until (expiry)</Label>
                <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-9" />
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Line items</Label>
                <div className="w-56">
                  <Select value={productPick} onValueChange={addProductLine}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="+ Add from products" /></SelectTrigger>
                    <SelectContent>
                      {allProducts.slice(0, 50).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <Input
                      value={l.description}
                      onChange={(e) => updateLine(i, "description", e.target.value)}
                      placeholder="Description"
                      className="h-8 text-sm flex-1"
                    />
                    <Input
                      type="number" min="0" step="0.01" value={l.quantity}
                      onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm w-16 text-center" title="Qty"
                    />
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
                      <Input
                        type="number" min="0" step="0.01" value={l.unitPrice}
                        onChange={(e) => updateLine(i, "unitPrice", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm pl-5 text-right" title="Unit price (incl. GST)"
                      />
                    </div>
                    <div className="relative w-16">
                      <Input
                        type="number" min="0" max="100" step="1" value={l.taxRate}
                        onChange={(e) => updateLine(i, "taxRate", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm pr-4 text-right" title="Tax %"
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => removeLine(i)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={addLine}><Plus className="w-3 h-3" /> Add line</Button>
            </div>

            {/* Discount + totals */}
            <div className="flex items-start justify-between gap-4 flex-wrap border-t pt-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="q-disc" checked={discount.enabled} onChange={(e) => setDiscount((d) => ({ ...d, enabled: e.target.checked }))} />
                  <Label htmlFor="q-disc" className="text-xs">Overall discount</Label>
                </div>
                {discount.enabled && (
                  <div className="flex items-center gap-1.5">
                    <Select value={discount.type} onValueChange={(v) => setDiscount((d) => ({ ...d, type: v as DiscountType }))}>
                      <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">$ fixed</SelectItem>
                        <SelectItem value="percent">% percent</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min="0" step="0.01" value={discount.value}
                      onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))}
                      className="h-8 w-24 text-sm" placeholder="0" />
                  </div>
                )}
              </div>
              <div className="text-sm text-right space-y-0.5 min-w-[160px]">
                <div className="flex justify-between gap-6 text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(grandTotal - taxTotal)}</span></div>
                <div className="flex justify-between gap-6 text-muted-foreground"><span>GST (incl)</span><span className="tabular-nums">{formatCurrency(taxTotal)}</span></div>
                {discountAmt > 0 && <div className="flex justify-between gap-6 text-amber-600"><span>Discount</span><span className="tabular-nums">−{formatCurrency(discountAmt)}</span></div>}
                <div className="flex justify-between gap-6 font-semibold text-base pt-0.5"><span>Total</span><span className="tabular-nums">{formatCurrency(grandTotal)}</span></div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes shown on the quote…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave || saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "Save changes" : "Create quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quote?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the quote. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
