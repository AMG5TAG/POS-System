import { useState } from "react";
import {
  useListServiceJobLines,
  getListServiceJobLinesQueryKey,
  useRecordServiceJobDeposit,
  getListServiceJobsQueryKey,
  type ServiceJob,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, cn } from "@/lib/utils";
import { CheckCircle2, Clock, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

/**
 * Estimate-approval status and deposit tracking for a repair job (feature #2).
 * Reuses the (deduped) lines query for the job total so the balance stays in
 * sync with parts/labour, and records in-store deposits against the job.
 */
export function ServiceJobDepositPanel({ job, readOnly = false }: { job: ServiceJob; readOnly?: boolean }) {
  const qc = useQueryClient();
  const { data } = useListServiceJobLines(job.id, { query: { queryKey: getListServiceJobLinesQueryKey(job.id) } });
  const record = useRecordServiceJobDeposit();
  const [amount, setAmount] = useState("");

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const total = data?.totals?.total ?? 0;
  const required = job.depositRequired ?? null;
  const paid = job.depositPaid ?? 0;
  const balance = round2(Math.max(0, total - paid));
  const outstanding = required != null ? round2(Math.max(0, required - paid)) : 0;
  const approved = !!job.estimateApprovedAt;

  const handleRecord = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a deposit amount"); return; }
    try {
      await record.mutateAsync({ id: job.id, data: { amount: amt } });
      setAmount("");
      qc.invalidateQueries({ queryKey: getListServiceJobsQueryKey() });
      toast.success("Deposit recorded");
    } catch { toast.error("Couldn't record deposit"); }
  };

  // Nothing to show when there's no estimate, no deposit policy and nothing paid.
  if (!approved && required == null && paid === 0 && total === 0) return null;

  return (
    <div className="space-y-3">
      <div className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        approved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
      )}>
        {approved ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
        {approved
          ? <span>Estimate approved{job.estimateApprovedVia ? ` (${job.estimateApprovedVia === "portal" ? "customer portal" : "in-store"})` : ""}</span>
          : <span>Estimate not yet approved by the customer</span>}
      </div>

      <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm space-y-1">
        {required != null && <Row label="Deposit required" value={formatCurrency(required)} />}
        <Row label="Deposit paid" value={formatCurrency(paid)} />
        {required != null && outstanding > 0 && (
          <Row label="Deposit outstanding" value={formatCurrency(outstanding)} className="text-amber-600 font-medium" />
        )}
        {total > 0 && (
          <div className="flex justify-between font-semibold pt-1 border-t mt-1">
            <span>Balance after deposit</span><span className="tabular-nums">{formatCurrency(balance)}</span>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Wallet className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input type="number" min={0} step={0.01} className="h-8 pl-7 text-xs"
              placeholder="Deposit amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={handleRecord} disabled={record.isPending}>
            {record.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Record deposit
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between", className)}>
      <span className={className ? undefined : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
