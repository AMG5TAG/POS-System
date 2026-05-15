import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListTransactions, useGetTransaction, useRefundTransaction, Transaction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";
import { History, Eye, RotateCcw, CreditCard, Banknote, Search } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  refunded: "destructive",
  voided: "secondary",
};

export default function POSHistoryPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundingTx, setRefundingTx] = useState<Transaction | null>(null);

  const { data: txData, isLoading } = useListTransactions(
    { status: statusFilter && statusFilter !== "all" ? statusFilter : undefined, limit: 100 },
    { query: { queryKey: ["transactions", statusFilter] } }
  );
  const { data: txDetail } = useGetTransaction(
    selectedTx?.id ?? 0,
    { query: { enabled: !!selectedTx, queryKey: ["transaction", selectedTx?.id] } }
  );
  const refundMutation = useRefundTransaction();

  const transactions = (txData?.items ?? []).filter((tx) =>
    !search ||
    tx.receiptNumber?.toLowerCase().includes(search.toLowerCase()) ||
    String(tx.total).includes(search)
  );

  const handleRefund = () => {
    if (!refundingTx) return;
    refundMutation.mutate(
      { id: refundingTx.id, data: { reason: refundReason || "Customer requested refund" } },
      {
        onSuccess: () => {
          toast.success("Transaction refunded");
          setRefundDialogOpen(false);
          setRefundReason("");
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          if (selectedTx?.id === refundingTx.id) setSelectedTx(null);
        },
        onError: () => toast.error("Failed to process refund"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Sale History</h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search receipt number..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
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
          <Card><CardContent className="py-16 text-center text-muted-foreground">No transactions found.</CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Receipt</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Payment</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="bg-background hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-mono text-xs font-medium">{tx.receiptNumber || `#${tx.id}`}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{formatDate(tx.createdAt)}</td>
                    <td className="p-3 hidden md:table-cell">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {tx.paymentMethod === "card" ? <CreditCard className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
                        <span className="capitalize">{tx.paymentMethod}</span>
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant={STATUS_COLORS[tx.status ?? "completed"] ?? "outline"} className="capitalize text-xs">
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-medium">{formatCurrency(tx.total ?? 0)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedTx(tx)}><Eye className="w-3.5 h-3.5" /></Button>
                        {tx.status === "completed" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { setRefundingTx(tx); setRefundDialogOpen(true); }}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt viewer */}
      <Dialog open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receipt {selectedTx?.receiptNumber}</DialogTitle></DialogHeader>
          {txDetail && (
            <div className="space-y-3 text-sm">
              <div className="border rounded-lg divide-y">
                {(txDetail.items ?? []).map((item: { name?: string; quantity?: number; price?: number }, i: number) => (
                  <div key={i} className="flex justify-between p-2">
                    <span>{item.name} × {item.quantity}</span>
                    <span>{formatCurrency((item.price ?? 0) * (item.quantity ?? 1))}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(txDetail.subtotal ?? 0)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(txDetail.taxTotal ?? 0)}</span></div>
                <div className="flex justify-between font-semibold text-foreground text-sm border-t pt-1"><span>Total</span><span>{formatCurrency(txDetail.total ?? 0)}</span></div>
              </div>
              <Badge variant={STATUS_COLORS[txDetail.status ?? "completed"]} className="capitalize">{txDetail.status}</Badge>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Refund {refundingTx?.receiptNumber}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Refund {formatCurrency(refundingTx?.total ?? 0)} to customer?</p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Customer requested refund" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRefund} disabled={refundMutation.isPending}>Process Refund</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
