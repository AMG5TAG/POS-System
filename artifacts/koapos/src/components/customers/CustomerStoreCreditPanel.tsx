import { useState } from "react";
import {
  useGetCustomerStoreCredit,
  useAddCustomerStoreCredit,
  getGetCustomerStoreCreditQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import { Wallet, Loader2, Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { toast } from "sonner";

type EntryType = "issue" | "redeem" | "adjust" | "refund" | "expire";

const TYPE_LABEL: Record<EntryType, string> = {
  issue: "Issued", redeem: "Redeemed", adjust: "Adjustment", refund: "Refund credit", expire: "Expired",
};

/** Per-customer store-credit balance, ledger and issue/redeem controls. */
export function CustomerStoreCreditPanel({ customerId }: { customerId: number }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useGetCustomerStoreCredit(customerId, {
    query: { queryKey: getGetCustomerStoreCreditQueryKey(customerId) },
  });
  const add = useAddCustomerStoreCredit();

  const [type, setType]     = useState<EntryType>("issue");
  const [amount, setAmount] = useState("");
  const [note, setNote]     = useState("");

  const balance = data?.balance ?? 0;
  const entries = data?.entries ?? [];

  const handleAdd = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt === 0) { toast.error("Enter an amount"); return; }
    try {
      await add.mutateAsync({ customerId, data: { type, amount: amt, note: note.trim() || undefined } as never });
      queryClient.invalidateQueries({ queryKey: getGetCustomerStoreCreditQueryKey(customerId) });
      setAmount(""); setNote("");
      toast.success("Store credit updated");
    } catch (e) {
      const msg = (e as { data?: { error?: string } })?.data?.error;
      toast.error(msg || "Couldn't update store credit");
    }
  };

  if (isLoading) {
    return <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }
  if (isError) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Couldn't load store credit.{" "}
        <button className="text-primary underline" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance */}
      <div className="rounded-xl border bg-primary/5 p-4 flex items-center gap-3">
        <Wallet className="w-6 h-6 text-primary shrink-0" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Store Credit Balance</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(balance)}</p>
        </div>
      </div>

      {/* Add movement */}
      <div className="rounded-xl border border-dashed p-3 space-y-2">
        <div className="flex gap-2">
          <Select value={type} onValueChange={(v) => setType(v as EntryType)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="issue">Issue</SelectItem>
              <SelectItem value="redeem">Redeem</SelectItem>
              <SelectItem value="refund">Refund credit</SelectItem>
              <SelectItem value="adjust">Adjust</SelectItem>
              <SelectItem value="expire">Expire</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" min={0} step={0.01} className="h-8 w-28 text-xs" placeholder="Amount"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input className="h-8 flex-1 text-xs" placeholder="Note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" className="h-8 gap-1.5" onClick={handleAdd} disabled={add.isPending}>
            {add.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Apply
          </Button>
        </div>
        {type === "adjust" && (
          <p className="text-[11px] text-muted-foreground">Use a negative amount to debit credit, positive to add.</p>
        )}
      </div>

      {/* Ledger */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No store-credit history yet.</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {entries.map((e) => {
            const positive = e.amount >= 0;
            return (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                {positive
                  ? <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <ArrowDownRight className="w-4 h-4 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{TYPE_LABEL[(e.type as EntryType)] ?? e.type}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {new Date(e.createdAt).toLocaleString("en-AU")}{e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <span className={cn("font-medium tabular-nums", positive ? "text-emerald-600" : "text-red-500")}>
                  {positive ? "+" : ""}{formatCurrency(e.amount)}
                </span>
                <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(e.balanceAfter)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
