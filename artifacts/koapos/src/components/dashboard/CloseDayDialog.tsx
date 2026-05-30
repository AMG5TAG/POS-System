import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetDailyCloseCurrent,
  useCreateDailyClose,
} from "@workspace/api-client-react";
import type { DailyClose } from "@workspace/api-client-react";
import { printDailyClose } from "@/lib/print-daily-close";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, ChevronRight, CreditCard, Banknote, Gift,
  MoreHorizontal, TrendingDown, TrendingUp, Minus,
  ShoppingCart, ReceiptText, AlertTriangle, Printer,
} from "lucide-react";

interface CloseDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt$ = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STEPS = ["Summary", "Cash Count", "Confirm"] as const;
type Step = 0 | 1 | 2 | 3; // 3 = success screen

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
            current > i
              ? "bg-emerald-500 text-white"
              : current === i
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}>
            {current > i ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <span className={cn(
            "text-xs font-medium",
            current === i ? "text-foreground" : "text-muted-foreground"
          )}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

function MethodRow({ label, amount, icon: Icon }: { label: string; amount: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <span className="text-sm font-medium">{fmt$(amount)}</span>
    </div>
  );
}

function SummaryRow({ label, value, bold, dimmed, className }: {
  label: string; value: string; bold?: boolean; dimmed?: boolean; className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between py-1.5", className)}>
      <span className={cn("text-sm", dimmed ? "text-muted-foreground" : "text-foreground")}>{label}</span>
      <span className={cn("text-sm", bold && "font-semibold")}>{value}</span>
    </div>
  );
}

export function CloseDayDialog({ open, onOpenChange }: CloseDayDialogProps) {
  const [step, setStep] = useState<Step>(0);
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [savedRecord, setSavedRecord] = useState<DailyClose | null>(null);

  const { data: summary, isLoading } = useGetDailyCloseCurrent({
    query: { enabled: open, staleTime: 60000, queryKey: ["daily-close-current"] },
  });

  const { mutate: createClose, isPending } = useCreateDailyClose();

  const counted = parseFloat(countedCash) || 0;
  const expected = summary?.expectedCash ?? 0;
  const variance = counted - expected;
  const varianceAbs = Math.abs(variance);
  const isOver = variance > 0;
  const isShort = variance < 0;
  const isBalanced = variance === 0;

  function handleClose() {
    onOpenChange(false);
    // reset on close
    setTimeout(() => {
      setStep(0);
      setCountedCash("");
      setNotes("");
      setSavedRecord(null);
    }, 300);
  }

  function handleSave() {
    if (!summary) return;
    createClose({
      data: {
        closeDate: summary.date,
        expectedCash: expected,
        countedCash: counted,
        notes: notes.trim() || undefined,
        breakdown: {
          grossSales: summary.grossSales,
          netSales: summary.netSales,
          taxTotal: summary.taxTotal,
          discountTotal: summary.discountTotal,
          refundTotal: summary.refundTotal,
          cash: summary.byPaymentMethod.cash ?? 0,
          card: summary.byPaymentMethod.card ?? 0,
          giftCard: summary.byPaymentMethod.giftCard ?? 0,
          other: summary.byPaymentMethod.other ?? 0,
        },
      },
    }, {
      onSuccess: (saved) => {
        setSavedRecord(saved);
        setStep(3);
      },
      onError: () => {
        toast.error("Failed to save daily close. Please try again.");
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-primary" />
            {step === 3 ? "Day Closed" : "Close Day"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === 3
              ? "Your end-of-day reconciliation has been saved."
              : "End-of-day cash reconciliation and summary."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Success ─────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Day Closed Successfully</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isBalanced && "Cash balanced perfectly."}
                  {isOver && `Cash overage of ${fmt$(varianceAbs)}.`}
                  {isShort && `Cash shortage of ${fmt$(varianceAbs)}.`}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button className="flex-1" onClick={handleClose}>Done</Button>
              {savedRecord && (
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => printDailyClose(savedRecord)}
                >
                  <Printer className="w-4 h-4" />
                  Print
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={() => { handleClose(); window.location.href = "/management/daily-reports"; }}>
                View Reports
              </Button>
            </div>
          </div>
        )}

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {step !== 3 && isLoading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {/* ── Steps ────────────────────────────────────────────────────── */}
        {step !== 3 && !isLoading && summary && (
          <>
            <StepIndicator current={step} />

            {/* Step 0 — Daily Summary */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-0.5">
                  <SummaryRow label="Gross Sales" value={fmt$(summary.grossSales)} bold />
                  <SummaryRow label="Tax (GST)" value={`-${fmt$(summary.taxTotal)}`} dimmed />
                  <SummaryRow label="Discounts" value={`-${fmt$(summary.discountTotal)}`} dimmed />
                  <SummaryRow label="Refunds" value={`-${fmt$(summary.refundTotal)}`} dimmed className="text-rose-500" />
                  <Separator className="my-2" />
                  <SummaryRow label="Net Sales" value={fmt$(summary.netSales)} bold />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Breakdown</p>
                  <div className="rounded-xl border px-4 py-2 divide-y">
                    <MethodRow label="Cash" amount={summary.byPaymentMethod.cash ?? 0} icon={Banknote} />
                    <MethodRow label="Card / EFTPOS" amount={summary.byPaymentMethod.card ?? 0} icon={CreditCard} />
                    <MethodRow label="Gift Card" amount={summary.byPaymentMethod.giftCard ?? 0} icon={Gift} />
                    {(summary.byPaymentMethod.other ?? 0) > 0 && (
                      <MethodRow label="Other" amount={summary.byPaymentMethod.other} icon={MoreHorizontal} />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <ShoppingCart className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    {summary.transactionCount} transaction{summary.transactionCount !== 1 ? "s" : ""} today
                  </span>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleClose}>Cancel</Button>
                  <Button onClick={() => setStep(1)}>Next: Cash Count <ChevronRight className="w-4 h-4 ml-1" /></Button>
                </div>
              </div>
            )}

            {/* Step 1 — Cash Count */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/30 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Expected Cash</span>
                  <span className="text-lg font-bold text-primary">{fmt$(expected)}</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="counted-cash">Counted Cash (physical count)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      id="counted-cash"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="pl-7"
                      value={countedCash}
                      onChange={e => setCountedCash(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>

                {countedCash !== "" && (
                  <div className={cn(
                    "rounded-xl border px-4 py-3 flex items-center justify-between",
                    isBalanced && "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20",
                    isOver && "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20",
                    isShort && "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20",
                  )}>
                    <div className="flex items-center gap-2">
                      {isBalanced && <Minus className="w-4 h-4 text-emerald-600" />}
                      {isOver && <TrendingUp className="w-4 h-4 text-blue-600" />}
                      {isShort && <TrendingDown className="w-4 h-4 text-rose-600" />}
                      <span className={cn(
                        "text-sm font-medium",
                        isBalanced && "text-emerald-700 dark:text-emerald-400",
                        isOver && "text-blue-700 dark:text-blue-400",
                        isShort && "text-rose-700 dark:text-rose-400",
                      )}>
                        {isBalanced ? "Balanced" : isOver ? "Overage" : "Shortage"}
                      </span>
                    </div>
                    <span className={cn(
                      "text-base font-bold",
                      isBalanced && "text-emerald-700 dark:text-emerald-400",
                      isOver && "text-blue-700 dark:text-blue-400",
                      isShort && "text-rose-700 dark:text-rose-400",
                    )}>
                      {isOver ? "+" : isShort ? "-" : ""}{fmt$(varianceAbs)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
                  <Button onClick={() => setStep(2)} disabled={countedCash === ""}>
                    Next: Confirm <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2 — Confirm */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-0.5">
                  <SummaryRow label="Gross Sales" value={fmt$(summary.grossSales)} bold />
                  <SummaryRow label="Net Sales" value={fmt$(summary.netSales)} dimmed />
                  <SummaryRow label="Tax (GST)" value={fmt$(summary.taxTotal)} dimmed />
                  <SummaryRow label="Refunds" value={fmt$(summary.refundTotal)} dimmed />
                  <Separator className="my-2" />
                  <SummaryRow label="Expected Cash" value={fmt$(expected)} />
                  <SummaryRow label="Counted Cash" value={fmt$(counted)} />
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm font-semibold">Variance</span>
                    <div className="flex items-center gap-1.5">
                      {!isBalanced && (
                        <AlertTriangle className={cn("w-3.5 h-3.5", isShort ? "text-rose-500" : "text-blue-500")} />
                      )}
                      <span className={cn(
                        "text-sm font-bold",
                        isBalanced && "text-emerald-600",
                        isOver && "text-blue-600",
                        isShort && "text-rose-600",
                      )}>
                        {isOver ? "+" : isShort ? "-" : ""}{fmt$(varianceAbs)}
                      </span>
                      <Badge variant="outline" className={cn(
                        "text-xs",
                        isBalanced && "border-emerald-300 text-emerald-700",
                        isOver && "border-blue-300 text-blue-700",
                        isShort && "border-rose-300 text-rose-700",
                      )}>
                        {isBalanced ? "Balanced" : isOver ? "Overage" : "Shortage"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="close-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    id="close-notes"
                    placeholder="Any notes about this close..."
                    className="resize-none text-sm"
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                  <Button onClick={handleSave} disabled={isPending}>
                    {isPending ? "Saving..." : "Save & Close Day"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
