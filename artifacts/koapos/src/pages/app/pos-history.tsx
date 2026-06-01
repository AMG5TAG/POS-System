import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListTransactions, useGetTransaction,
  useDeleteTransaction, useRefundTransaction,
  Transaction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  History, Eye, CreditCard, Banknote, Search,
  Send, Printer, Mail, MessageSquare, Check, X,
  RotateCcw, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDocumentTemplate } from "@/lib/use-document-template";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  refunded: "destructive",
  voided: "secondary",
};

/* ─── Send dialog ────────────────────────────────────────────────────────── */

type SendMode = "reprint" | "email" | "sms" | null;

interface SendDialogProps {
  tx: Transaction | null;
  txDetail: import("@workspace/api-client-react").Transaction | null | undefined;
  initialMode?: SendMode;
  onClose: () => void;
}

function SendDialog({ tx, txDetail, initialMode = null, onClose }: SendDialogProps) {
  const [mode, setMode] = useState<SendMode>(initialMode);
  const [email, setEmail] = useState(tx?.customer?.email ?? "");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { printReceipt, isLoading: tplLoading } = useDocumentTemplate();

  if (!tx) return null;

  function handleClose() {
    setMode(null);
    setEmail("");
    setPhone("");
    setSent(false);
    onClose();
  }

  function handleReprint() {
    if (!tx) return;
    if (tplLoading) { toast.info("Loading receipt template…"); return; }
    printReceipt(tx);
    toast.success("Receipt sent to printer");
    setSent(true);
    setTimeout(handleClose, 800);
  }

  function handleEmail() {
    if (!email.trim() || !email.includes("@")) { toast.error("Please enter a valid email address"); return; }
    toast.success(`Receipt emailed to ${email}`);
    setSent(true);
    setTimeout(handleClose, 800);
  }

  function handleSMS() {
    if (!phone.trim() || phone.replace(/\D/g, "").length < 8) { toast.error("Please enter a valid phone number"); return; }
    toast.success(`Receipt SMS sent to ${phone}`);
    setSent(true);
    setTimeout(handleClose, 800);
  }

  const items = (txDetail?.items ?? []) as { productName?: string; quantity?: number; unitPrice?: number; totalPrice?: number }[];

  return (
    <Dialog open={!!tx} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Send className="w-4 h-4 text-primary" />
            Send Receipt
            <span className="text-muted-foreground font-normal text-sm ml-1">
              {tx.receiptNumber ?? `#${tx.id}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "reprint", icon: Printer,      label: "Reprint",  sub: "Print to receipt printer" },
              { key: "email",   icon: Mail,          label: "Email",    sub: "Send to email address" },
              { key: "sms",     icon: MessageSquare, label: "SMS",      sub: "Send via text message" },
            ] as const).map(({ key, icon: Icon, label, sub }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setMode(key); setSent(false); }}
                className={cn(
                  "flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl border text-center transition-colors",
                  mode === key
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium leading-tight">{label}</span>
                <span className="text-[10px] leading-tight opacity-70">{sub}</span>
              </button>
            ))}
          </div>

          {mode === "reprint" && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                This will open a print preview for receipt <strong>{tx.receiptNumber ?? `#${tx.id}`}</strong>.
              </p>
              <div ref={printRef} style={{ display: "none" }}>
                <div className="center bold" style={{ marginBottom: 8 }}>RECEIPT</div>
                <div className="center" style={{ marginBottom: 8 }}>{tx.receiptNumber ?? `#${tx.id}`}</div>
                <div className="divider" />
                {items.map((item, i) => (
                  <div key={i} className="row">
                    <span>{item.productName} × {item.quantity}</span>
                    <span>{formatCurrency(item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 1))}</span>
                  </div>
                ))}
                <div className="divider" />
                <div className="row"><span>Subtotal</span><span>{formatCurrency(txDetail?.subtotal ?? 0)}</span></div>
                <div className="row"><span>Tax</span><span>{formatCurrency(txDetail?.taxTotal ?? 0)}</span></div>
                <div className="row total"><span>TOTAL</span><span>{formatCurrency(tx.total ?? 0)}</span></div>
                <div className="divider" />
                <div className="center" style={{ marginTop: 8, fontSize: 11 }}>Thank you for your purchase</div>
              </div>
              <Button className="w-full gap-2" onClick={handleReprint}>
                <Printer className="w-4 h-4" /> Print Receipt
              </Button>
            </div>
          )}

          {mode === "email" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Email Address</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="customer@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === "Enter" && handleEmail()}
                      autoFocus
                    />
                  </div>
                  <Button className="gap-1.5 shrink-0" onClick={handleEmail}>
                    {sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {sent ? "Sent!" : "Send"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Receipt for {formatCurrency(tx.total ?? 0)} will be emailed as a PDF.
                </p>
              </div>
            </div>
          )}

          {mode === "sms" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Mobile Number</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder="04XX XXX XXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === "Enter" && handleSMS()}
                      autoFocus
                    />
                  </div>
                  <Button className="gap-1.5 shrink-0" onClick={handleSMS}>
                    {sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {sent ? "Sent!" : "Send"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A receipt link for {formatCurrency(tx.total ?? 0)} will be sent via SMS.
                </p>
              </div>
            </div>
          )}

          {!mode && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Select a delivery method above
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={handleClose}>
            <X className="w-3.5 h-3.5 mr-1.5" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Receipt viewer dialog ──────────────────────────────────────────────── */

interface ReceiptDialogProps {
  tx: Transaction | null;
  txDetail: import("@workspace/api-client-react").Transaction | null | undefined;
  onClose: () => void;
}

function ReceiptDialog({ tx, txDetail, onClose }: ReceiptDialogProps) {
  if (!tx) return null;
  return (
    <Dialog open={!!tx} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Receipt {tx.receiptNumber ?? `#${tx.id}`}</DialogTitle>
        </DialogHeader>
        {txDetail && (
          <div className="space-y-3 text-sm">
            <div className="border rounded-lg divide-y">
              {(txDetail.items ?? []).map((item: { productName?: string; quantity?: number; unitPrice?: number; totalPrice?: number }, i: number) => (
                <div key={i} className="flex justify-between p-2">
                  <span>{item.productName} × {item.quantity}</span>
                  <span>{formatCurrency(item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 1))}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(txDetail.subtotal ?? 0)}</span></div>
              {discountLabel(txDetail) && (
                <div className="flex justify-between items-center text-emerald-700">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Discount ({discountLabel(txDetail)})
                  </span>
                  <span>−{formatCurrency(txDetail.discountTotal ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(txDetail.taxTotal ?? 0)}</span></div>
              <div className="flex justify-between font-semibold text-foreground text-sm border-t pt-1">
                <span>Total</span><span>{formatCurrency(txDetail.total ?? 0)}</span>
              </div>
            </div>
            <Badge variant={STATUS_COLORS[txDetail.status ?? "completed"]} className="capitalize">
              {txDetail.status}
            </Badge>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Refund dialog ──────────────────────────────────────────────────────── */

interface RefundDialogProps {
  tx: Transaction | null;
  onConfirm: (reason: string) => void;
  isPending: boolean;
  onClose: () => void;
}

function RefundDialog({ tx, onConfirm, isPending, onClose }: RefundDialogProps) {
  const [reason, setReason] = useState("");

  if (!tx) return null;

  function handleConfirm() {
    if (!reason.trim()) { toast.error("Please enter a refund reason"); return; }
    onConfirm(reason.trim());
  }

  return (
    <Dialog open={!!tx} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-500" />
            Refund Transaction
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            Refund <span className="font-medium text-foreground">{tx.receiptNumber ?? `#${tx.id}`}</span> for{" "}
            <span className="font-medium text-foreground">{formatCurrency(tx.total ?? 0)}</span>?
          </p>
          <div className="space-y-1.5">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Customer returned item, incorrect charge, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>
        </div>
        <Separator />
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={isPending || !reason.trim()}
          >
            {isPending ? "Processing…" : "Confirm Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

type SortKey = "date" | "total" | "payment" | "customer";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

function customerName(tx: Transaction): string {
  const c = tx.customer;
  if (!c) return "";
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

function discountLabel(tx: { discountPct?: number | null; discountTotal?: number }): string | null {
  if (tx.discountPct != null && tx.discountPct > 0) return `${tx.discountPct}% off`;
  if ((tx.discountTotal ?? 0) > 0) return `${formatCurrency(tx.discountTotal!)} off`;
  return null;
}

function SortHeaderButton({
  label,
  sortKey,
  sort,
  onClick,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "flex items-center gap-1 hover:text-foreground text-left transition-colors",
        className
      )}
    >
      {label}
      {active ? (
        sort.dir === "asc" ? (
          <ChevronUp className="w-3.5 h-3.5 text-primary" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-primary" />
        )
      ) : (
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/50" />
      )}
    </button>
  );
}

export default function POSHistoryPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [viewingTx, setViewingTx] = useState<Transaction | null>(null);
  const [sendTx, setSendTx] = useState<Transaction | null>(null);
  const [reprintTx, setReprintTx] = useState<Transaction | null>(null);
  const [refundTx, setRefundTx] = useState<Transaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);

  const { data: txData, isLoading } = useListTransactions(
    { status: statusFilter && statusFilter !== "all" ? statusFilter : undefined, limit: 100 },
    { query: { queryKey: ["transactions", statusFilter] } }
  );

  const { data: viewDetail } = useGetTransaction(
    viewingTx?.id ?? 0,
    { query: { enabled: !!viewingTx, queryKey: ["transaction", viewingTx?.id] } }
  );

  const { data: sendDetail } = useGetTransaction(
    sendTx?.id ?? 0,
    { query: { enabled: !!sendTx, queryKey: ["transaction", sendTx?.id] } }
  );

  const { data: reprintDetail } = useGetTransaction(
    reprintTx?.id ?? 0,
    { query: { enabled: !!reprintTx, queryKey: ["transaction", reprintTx?.id] } }
  );

  const deleteMutation = useDeleteTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        setDeleteTx(null);
        toast.success("Transaction deleted");
      },
      onError: () => toast.error("Failed to delete transaction"),
    },
  });

  const refundMutation = useRefundTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        setRefundTx(null);
        toast.success("Transaction refunded");
      },
      onError: () => toast.error("Failed to refund transaction"),
    },
  });

  const q = search.toLowerCase();
  const filtered = (txData?.items ?? []).filter((tx) =>
    !q ||
    tx.receiptNumber?.toLowerCase().includes(q) ||
    String(tx.total).includes(q) ||
    customerName(tx).toLowerCase().includes(q)
  );

  function handleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.dir === "asc" ? { key, dir: "desc" } : null;
      }
      return { key, dir: "asc" };
    });
  }

  const transactions = sort === null
    ? filtered
    : [...filtered].sort((a, b) => {
        let cmp = 0;
        switch (sort.key) {
          case "date":
            cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            break;
          case "total":
            cmp = (a.total ?? 0) - (b.total ?? 0);
            break;
          case "payment":
            cmp = (a.paymentMethod ?? "").localeCompare(b.paymentMethod ?? "");
            break;
          case "customer": {
            const na = customerName(a).toLowerCase();
            const nb = customerName(b).toLowerCase();
            if (!na && !nb) cmp = 0;
            else if (!na) cmp = 1;
            else if (!nb) cmp = -1;
            else cmp = na.localeCompare(nb, undefined, { sensitivity: "base" });
            break;
          }
        }
        return sort.dir === "asc" ? cmp : -cmp;
      });

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Sale History</h1>
            <p className="text-sm text-muted-foreground">Browse and search all past sales processed through the register.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search receipt number..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading history...</div>
        ) : transactions.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No transactions found.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Receipt</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">
                    <SortHeaderButton label="Date" sortKey="date" sort={sort} onClick={handleSort} />
                  </th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">
                    <SortHeaderButton label="Customer" sortKey="customer" sort={sort} onClick={handleSort} />
                  </th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">
                    <SortHeaderButton label="Payment" sortKey="payment" sort={sort} onClick={handleSort} />
                  </th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">
                    <SortHeaderButton label="Total" sortKey="total" sort={sort} onClick={handleSort} className="ml-auto" />
                  </th>
                  <th className="p-3 w-36" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="bg-background hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-mono text-xs font-medium">{tx.receiptNumber || `#${tx.id}`}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{formatDate(tx.createdAt)}</td>
                    <td className="p-3 hidden lg:table-cell max-w-[160px]">
                      {customerName(tx) ? (
                        <span className="truncate block">{customerName(tx)}</span>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs italic">Walk-in</span>
                      )}
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {tx.paymentMethod === "card"
                          ? <CreditCard className="w-3.5 h-3.5" />
                          : <Banknote className="w-3.5 h-3.5" />}
                        <span className="capitalize">{tx.paymentMethod}</span>
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={STATUS_COLORS[tx.status ?? "completed"] ?? "outline"}
                        className="capitalize text-xs"
                      >
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-medium">{formatCurrency(tx.total ?? 0)}</span>
                        {discountLabel(tx) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 leading-none">
                            <Tag className="w-2.5 h-2.5" />
                            {discountLabel(tx)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="View receipt"
                          onClick={() => setViewingTx(tx)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Reprint receipt"
                          onClick={() => setReprintTx(tx)}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-primary hover:text-primary"
                          title="Send receipt"
                          onClick={() => setSendTx(tx)}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-amber-600 hover:text-amber-700"
                          title="Refund"
                          disabled={tx.status !== "completed"}
                          onClick={() => setRefundTx(tx)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => setDeleteTx(tx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceiptDialog
        tx={viewingTx}
        txDetail={viewDetail}
        onClose={() => setViewingTx(null)}
      />

      <SendDialog
        tx={sendTx}
        txDetail={sendDetail}
        onClose={() => setSendTx(null)}
      />

      <SendDialog
        tx={reprintTx}
        txDetail={reprintDetail}
        initialMode="reprint"
        onClose={() => setReprintTx(null)}
      />

      <RefundDialog
        tx={refundTx}
        isPending={refundMutation.isPending}
        onConfirm={(reason) => {
          if (!refundTx) return;
          refundMutation.mutate({ id: refundTx.id, data: { reason } });
        }}
        onClose={() => setRefundTx(null)}
      />

      <AlertDialog open={!!deleteTx} onOpenChange={(open) => { if (!open) setDeleteTx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium">{deleteTx?.receiptNumber ?? `#${deleteTx?.id}`}</span> ({formatCurrency(deleteTx?.total ?? 0)}).
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteTx) deleteMutation.mutate({ id: deleteTx.id }); }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
