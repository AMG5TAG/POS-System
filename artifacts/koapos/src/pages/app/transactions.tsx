import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListTransactions, useRefundTransaction, useGetLoyaltySettings, Transaction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Receipt, RotateCcw, CreditCard, Banknote,
  ChevronUp, ChevronDown, ChevronsUpDown, Gift, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type SortKey = "date" | "total" | "status" | "payment";
type SortDir  = "asc" | "desc";

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-300",
  refunded:  "bg-red-50 text-red-700 border-red-300",
  voided:    "bg-muted text-muted-foreground border-border",
};

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  card: <CreditCard className="w-3.5 h-3.5" />,
  cash: <Banknote   className="w-3.5 h-3.5" />,
};

/** Format a loyalty earned amount with the unit that matches the program type. */
function formatLoyaltyEarned(amount: number, programType?: string | null): string {
  switch (programType) {
    case "points": return `${amount.toLocaleString()} pts`;
    case "stamp":  return `${amount} ${amount === 1 ? "stamp" : "stamps"}`;
    case "cashback":
    case "tiered":
    case "custom":
    default:       return formatCurrency(amount);
  }
}

/* ─── Sort header ────────────────────────────────────────────────────────── */

function SortTh({ label, sortKey, active, dir, onSort, className, align = "left" }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string; align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th className={cn("p-3 font-medium whitespace-nowrap cursor-pointer select-none group", align === "right" ? "text-right" : "text-left", className)}
      onClick={() => onSort(sortKey)}>
      <span className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", align === "right" && "flex-row-reverse")}>
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" /> : <ChevronsUpDown className="w-3 h-3" />}
        </span>
      </span>
    </th>
  );
}

/* ─── Receipt detail dialog ──────────────────────────────────────────────── */

function ReceiptDialog({
  tx, onClose, onRefund, loyaltyProgramType,
}: { tx: Transaction | null; onClose: () => void; onRefund: (tx: Transaction) => void; loyaltyProgramType?: string | null }) {
  if (!tx) return null;

  const statusClass = STATUS_COLORS[tx.status] ?? "bg-muted text-muted-foreground border-border";

  return (
    <Dialog open={!!tx} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Receipt className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">Receipt #{tx.receiptNumber}</span>
            <span className={cn("ml-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border capitalize", statusClass)}>
              {tx.status}
            </span>
            {tx.discountCapped && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800">
                <AlertTriangle className="w-3 h-3" />
                Discount capped
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-xl border bg-muted/20 divide-y text-sm">
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{formatDate(tx.createdAt)}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">Payment</span>
              <span className="flex items-center gap-1.5 capitalize font-medium">
                {PAYMENT_ICONS[tx.paymentMethod] ?? <CreditCard className="w-3.5 h-3.5" />}
                {tx.paymentMethod}
              </span>
            </div>
          </div>

          <div className="rounded-xl border divide-y overflow-hidden">
            {(tx.items as { productName: string; unitPrice: number; quantity: number; totalPrice: number }[]).map((item, i) => (
              <div key={i} className="flex justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice)} × {item.quantity}</p>
                </div>
                <span className="font-medium">{formatCurrency(item.totalPrice)}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border bg-muted/20 divide-y text-sm">
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(tx.subtotal)}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">GST (10%)</span>
              <span>{formatCurrency(tx.taxTotal)}</span>
            </div>
            {(tx.discountTotal ?? 0) > 0 && (
              <div className="flex justify-between px-4 py-3 text-emerald-600">
                <span>Discount</span>
                <span>−{formatCurrency(tx.discountTotal ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3 font-bold text-base">
              <span>Total</span>
              <span>{formatCurrency(tx.total)}</span>
            </div>
          </div>

          {(tx.loyaltyEarned != null && tx.loyaltyEarned > 0) && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 px-4 py-3 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <Gift className="w-3.5 h-3.5" /> Loyalty Earned
              </span>
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                +{formatLoyaltyEarned(tx.loyaltyEarned, loyaltyProgramType)}
              </span>
            </div>
          )}

          {tx.notes && <p className="text-xs text-muted-foreground italic px-1">{tx.notes}</p>}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {tx.status === "completed" ? (
            <Button variant="destructive" size="sm" className="gap-1.5"
              onClick={() => { onRefund(tx); onClose(); }}>
              <RotateCcw className="w-3.5 h-3.5" /> Refund
            </Button>
          ) : <div />}
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter]   = useState<string>("");
  const [selectedTx, setSelectedTx]       = useState<Transaction | null>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason]   = useState("");
  const [refundingTx, setRefundingTx]     = useState<Transaction | null>(null);
  const [sortKey, setSortKey]             = useState<SortKey>("date");
  const [sortDir, setSortDir]             = useState<SortDir>("desc");
  const [checked, setChecked]             = useState<Set<number>>(new Set());

  const { data: txData, isLoading } = useListTransactions(
    { status: statusFilter === "all" ? undefined : statusFilter || undefined, limit: 1000 },
    { query: { queryKey: ["transactions", statusFilter] } }
  );
  const { data: loyaltySettings } = useGetLoyaltySettings();
  const refundMutation = useRefundTransaction();
  const transactions = txData?.items || [];

  /* Sort */
  const sorted = [...transactions].sort((a, b) => {
    let av: string | number = "", bv: string | number = "";
    switch (sortKey) {
      case "date":    av = a.createdAt; bv = b.createdAt; break;
      case "total":   av = a.total;    bv = b.total;     break;
      case "status":  av = a.status;   bv = b.status;    break;
      case "payment": av = a.paymentMethod; bv = b.paymentMethod; break;
    }
    const r = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? r : -r;
  });

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => { if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; } setSortDir("asc"); return key; });
  }, []);

  const allChecked = sorted.length > 0 && sorted.every((t) => checked.has(t.id));
  const toggleAll  = () => setChecked(allChecked ? new Set() : new Set(sorted.map((t) => t.id)));
  const toggleOne  = (id: number) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleRefund = () => {
    if (!refundingTx) return;
    refundMutation.mutate(
      { id: refundingTx.id, data: { reason: refundReason || "Customer requested refund" } },
      {
        onSuccess: () => {
          toast.success("Transaction refunded");
          setRefundDialogOpen(false); setRefundReason("");
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        },
        onError: () => toast.error("Failed to process refund"),
      }
    );
  };

  const sh = (label: string, key: SortKey, className?: string, align?: "left" | "right") => ({
    label, sortKey: key, active: sortKey, dir: sortDir, onSort: handleSort, className, align,
  });

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-sm text-muted-foreground">View and manage all completed and refunded sales transactions.</p>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All transactions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Transactions</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="rounded-lg border">
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Receipt className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No transactions yet</p>
                <p className="text-muted-foreground text-sm">Transactions will appear here after your first sale.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-3 w-10">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      className="rounded border-muted-foreground/40 accent-primary" />
                  </th>
                  <th className="p-3 text-left font-medium whitespace-nowrap">Receipt</th>
                  <SortTh {...sh("Date", "date", "hidden md:table-cell")} />
                  <SortTh {...sh("Payment", "payment", "hidden sm:table-cell")} />
                  <SortTh {...sh("Status", "status", "hidden lg:table-cell")} />
                  <SortTh {...sh("Total", "total", undefined, "right")} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((tx) => {
                  const isChecked   = checked.has(tx.id);
                  const statusClass = STATUS_COLORS[tx.status] ?? "bg-muted text-muted-foreground border-border";
                  return (
                    <tr key={tx.id}
                      className={cn("bg-background hover:bg-muted/30 transition-colors cursor-pointer", isChecked && "bg-primary/5")}
                      onClick={() => setSelectedTx(tx)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleOne(tx.id)}
                          className="rounded border-muted-foreground/40 accent-primary" />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-mono text-xs font-medium">{tx.receiptNumber}</p>
                          {tx.discountCapped && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800 whitespace-nowrap">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Discount capped
                            </span>
                          )}
                        </div>
                        {tx.items && Array.isArray(tx.items) && (
                          <p className="text-xs text-muted-foreground">
                            {(tx.items as unknown[]).length} item{(tx.items as unknown[]).length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                        {formatDate(tx.createdAt)}
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <span className="flex items-center gap-1.5 capitalize text-muted-foreground">
                          {PAYMENT_ICONS[tx.paymentMethod] ?? <CreditCard className="w-3.5 h-3.5" />}
                          {tx.paymentMethod}
                        </span>
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border capitalize", statusClass)}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold">{formatCurrency(tx.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceiptDialog
        tx={selectedTx}
        onClose={() => setSelectedTx(null)}
        onRefund={(tx) => { setRefundingTx(tx); setRefundDialogOpen(true); }}
        loyaltyProgramType={loyaltySettings?.programType}
      />

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refund Transaction</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">
            Refund <strong>{formatCurrency(refundingTx?.total || 0)}</strong> for receipt{" "}
            <strong>{refundingTx?.receiptNumber}</strong>?
          </p>
          <div>
            <Label>Reason (optional)</Label>
            <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Customer requested refund" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRefund} disabled={refundMutation.isPending}>Process Refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
