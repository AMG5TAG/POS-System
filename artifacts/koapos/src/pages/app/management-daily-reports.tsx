import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListDailyCloses } from "@workspace/api-client-react";
import type { DailyClose } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ReceiptText, TrendingDown, TrendingUp, Minus, Banknote,
  CreditCard, Gift, MoreHorizontal, ChevronRight,
  ShoppingCart, CalendarDays, Printer, Download,
} from "lucide-react";
import { printDailyClose, exportDailyClosesCSV } from "@/lib/print-daily-close";

const fmt$ = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
};

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

function VarianceBadge({ variance }: { variance: number }) {
  if (variance === 0) return (
    <Badge variant="outline" className="border-emerald-300 text-emerald-700 gap-1 text-xs">
      <Minus className="w-3 h-3" /> Balanced
    </Badge>
  );
  if (variance > 0) return (
    <Badge variant="outline" className="border-blue-300 text-blue-700 gap-1 text-xs">
      <TrendingUp className="w-3 h-3" /> +{fmt$(variance)}
    </Badge>
  );
  return (
    <Badge variant="outline" className="border-rose-300 text-rose-700 gap-1 text-xs">
      <TrendingDown className="w-3 h-3" /> -{fmt$(Math.abs(variance))}
    </Badge>
  );
}

function DetailRow({ label, value, bold, dimmed }: { label: string; value: string; bold?: boolean; dimmed?: boolean }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className={cn("text-sm", dimmed && "text-muted-foreground")}>{label}</span>
      <span className={cn("text-sm", bold && "font-semibold")}>{value}</span>
    </div>
  );
}

function DetailSheet({ row, onClose }: { row: DailyClose; onClose: () => void }) {
  const b = row.breakdown as Record<string, number>;
  const variance = row.variance;
  const isOver = variance > 0;
  const isShort = variance < 0;

  return (
    <Sheet open onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="w-4 h-4 text-primary" />
            Daily Close — {fmtDate(row.closeDate)}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Closed {row.closedByName ? `by ${row.closedByName} ` : ""}on {fmtDateTime(row.createdAt)}
          </SheetDescription>
        </SheetHeader>

        <Separator className="mb-4" />

        <div className="space-y-5">
          {/* Sales summary */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sales Summary</p>
            <div className="rounded-xl border px-4 py-2 space-y-0.5">
              <DetailRow label="Gross Sales" value={fmt$(b.grossSales ?? 0)} bold />
              <DetailRow label="Tax (GST)" value={`-${fmt$(b.taxTotal ?? 0)}`} dimmed />
              <DetailRow label="Discounts" value={`-${fmt$(b.discountTotal ?? 0)}`} dimmed />
              <DetailRow label="Refunds" value={`-${fmt$(b.refundTotal ?? 0)}`} dimmed />
              <Separator className="my-2" />
              <DetailRow label="Net Sales" value={fmt$(b.netSales ?? 0)} bold />
            </div>
          </div>

          {/* Payment breakdown */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment Breakdown</p>
            <div className="rounded-xl border px-4 py-2 divide-y">
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Banknote className="w-4 h-4" /> Cash
                </div>
                <span className="text-sm font-medium">{fmt$(b.cash ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CreditCard className="w-4 h-4" /> Card / EFTPOS
                </div>
                <span className="text-sm font-medium">{fmt$(b.card ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Gift className="w-4 h-4" /> Gift Card
                </div>
                <span className="text-sm font-medium">{fmt$(b.giftCard ?? 0)}</span>
              </div>
              {(b.other ?? 0) > 0 && (
                <div className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MoreHorizontal className="w-4 h-4" /> Other
                  </div>
                  <span className="text-sm font-medium">{fmt$(b.other)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Cash reconciliation */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cash Reconciliation</p>
            <div className="rounded-xl border px-4 py-2 space-y-0.5">
              <DetailRow label="Expected Cash" value={fmt$(row.expectedCash)} />
              <DetailRow label="Counted Cash" value={fmt$(row.countedCash)} />
              <Separator className="my-2" />
              <div className="flex justify-between py-1.5">
                <span className="text-sm font-semibold">Variance</span>
                <span className={cn(
                  "text-sm font-bold",
                  variance === 0 && "text-emerald-600",
                  isOver && "text-blue-600",
                  isShort && "text-rose-600",
                )}>
                  {isOver ? "+" : isShort ? "-" : ""}{fmt$(Math.abs(variance))}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {row.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
              <p className="text-sm rounded-xl border px-4 py-3 bg-muted/30">{row.notes}</p>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full gap-2 mt-2"
            onClick={() => printDailyClose(row)}
          >
            <Printer className="w-4 h-4" />
            Print Report
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function ManagementDailyReportsPage() {
  const [selected, setSelected] = useState<DailyClose | null>(null);

  const { data: closes, isLoading } = useListDailyCloses({ limit: 100, offset: 0 });

  const totalGross = (closes ?? []).reduce((s, r) => s + ((r.breakdown as Record<string, number>).grossSales ?? 0), 0);
  const avgVariance = closes?.length
    ? (closes ?? []).reduce((s, r) => s + Math.abs(r.variance), 0) / closes.length
    : 0;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Daily Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              End-of-day cash reconciliation records.
            </p>
          </div>
          {closes && closes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 self-start sm:self-auto"
              onClick={() => exportDailyClosesCSV(closes)}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
        </div>

        {/* KPI strip */}
        {!isLoading && closes && closes.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardDescription className="text-xs">Total Closes</CardDescription>
                <CardTitle className="text-2xl">{closes.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardDescription className="text-xs">Total Gross Sales (all closes)</CardDescription>
                <CardTitle className="text-2xl">{fmt$(totalGross)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardDescription className="text-xs">Avg Cash Variance</CardDescription>
                <CardTitle className={cn("text-2xl", avgVariance > 5 ? "text-rose-500" : "text-emerald-600")}>
                  {fmt$(avgVariance)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Close History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-md" />)}
              </div>
            ) : !closes || closes.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <ReceiptText className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No daily closes yet.</p>
                <p className="text-xs text-muted-foreground">Use the "Close Day" button on the Dashboard to record your first end-of-day reconciliation.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Gross Sales</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Expected Cash</TableHead>
                    <TableHead className="text-right">Counted Cash</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Closed By</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closes.map(row => {
                    const b = row.breakdown as Record<string, number>;
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setSelected(row)}
                      >
                        <TableCell className="font-medium">{fmtDate(row.closeDate)}</TableCell>
                        <TableCell className="text-right">{fmt$(b.grossSales ?? 0)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <div className="flex items-center justify-end gap-1">
                            <ShoppingCart className="w-3.5 h-3.5" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{fmt$(row.expectedCash)}</TableCell>
                        <TableCell className="text-right">{fmt$(row.countedCash)}</TableCell>
                        <TableCell className="text-right">
                          <VarianceBadge variance={row.variance} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.closedByName ?? "—"}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {selected && <DetailSheet row={selected} onClose={() => setSelected(null)} />}
    </AppLayout>
  );
}
