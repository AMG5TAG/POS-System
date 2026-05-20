import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListTransactions, useRefundTransaction, Transaction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RotateCcw, Search, CreditCard, Banknote, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function POSRefundPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [refundingTx, setRefundingTx] = useState<Transaction | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const { data: txData, isLoading } = useListTransactions(
    { status: "completed", limit: 100 },
    { query: { queryKey: ["transactions", "completed"] } }
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
          toast.success("Refund processed successfully");
          setRefundingTx(null);
          setRefundReason("");
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        },
        onError: () => toast.error("Failed to process refund"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <RotateCcw className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Process Refund</h1>
            <p className="text-sm text-muted-foreground">Find a completed sale and issue a refund</p>
          </div>
        </div>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">Refunds are permanent and cannot be undone. Only completed transactions can be refunded.</p>
          </CardContent>
        </Card>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by receipt number or amount..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">No completed transactions found.</CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Receipt</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Payment</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="p-3 w-28" />
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
                    <td className="p-3 text-right font-medium">{formatCurrency(tx.total ?? 0)}</td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                        onClick={() => { setRefundingTx(tx); setRefundReason(""); }}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Refund
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!refundingTx} onOpenChange={() => setRefundingTx(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm Refund</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Receipt</span><span className="font-mono font-medium">{refundingTx?.receiptNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{refundingTx ? formatDate(refundingTx.createdAt) : ""}</span></div>
              <div className="flex justify-between font-semibold border-t pt-2"><span>Refund Amount</span><span className="text-destructive">{formatCurrency(refundingTx?.total ?? 0)}</span></div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. Faulty product, wrong item..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRefundingTx(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRefund} disabled={refundMutation.isPending}>
                <RotateCcw className="w-4 h-4 mr-2" /> Process Refund
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
