import { Link, useSearch } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useGetPayRun,
  usePostPayRun,
  useSyncPayrollJournal,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Send, BookOpen } from "lucide-react";

const fmt = (cents: number) => formatCurrency(cents / 100);

export default function StaffPayrollRunsPage() {
  const search = useSearch();
  const id = Number(new URLSearchParams(search).get("id") ?? "");
  const valid = Number.isFinite(id) && id > 0;

  const { data, isLoading, refetch } = useGetPayRun(id, {
    query: { queryKey: ["/api/payroll/pay-runs", id], enabled: valid },
  });

  const post = usePostPayRun({
    mutation: {
      onSuccess: () => { toast.success("Pay run posted — provider will lodge STP"); refetch(); },
      onError: () => toast.error("Failed to post pay run"),
    },
  });
  const syncJournal = useSyncPayrollJournal({
    mutation: {
      onSuccess: (r) => toast.success(r.message),
      onError: () => toast.error("Journal sync failed"),
    },
  });

  const run = data?.payRun;
  const payslips = data?.payslips ?? [];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" asChild>
            <Link href="/staff/payroll"><ArrowLeft className="h-4 w-4" /> Back to Payroll</Link>
          </Button>
        </div>

        {!valid ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            No pay run selected. <Link href="/staff/payroll" className="underline">Choose one</Link>.
          </CardContent></Card>
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !run ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Pay run not found.</CardContent></Card>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">Pay run</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {run.periodStart} → {run.periodEnd}
                  {run.paymentDate ? ` · paid ${run.paymentDate}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{run.status}</Badge>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={run.status !== "draft" || post.isPending}
                  onClick={() => post.mutate({ id: run.id })}
                >
                  <Send className="h-4 w-4" /> Post & lodge
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={run.status === "draft" || syncJournal.isPending}
                  onClick={() => syncJournal.mutate({ data: { payRunId: run.id } })}
                >
                  <BookOpen className="h-4 w-4" /> Sync journal
                </Button>
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Gross", value: run.grossCents },
                { label: "PAYG", value: run.paygCents },
                { label: "Super", value: run.superCents },
                { label: "Net", value: run.netCents },
              ].map((t) => (
                <Card key={t.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{t.label}</p>
                    <p className="text-lg font-bold">{fmt(t.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Payslips */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Payslips</CardTitle></CardHeader>
              <CardContent>
                {payslips.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No payslips yet — they populate once the provider processes the run.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">PAYG</TableHead>
                        <TableHead className="text-right">Super</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslips.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.employeeName}</TableCell>
                          <TableCell className="text-right">{fmt(p.grossCents)}</TableCell>
                          <TableCell className="text-right">{fmt(p.paygCents)}</TableCell>
                          <TableCell className="text-right">{fmt(p.superCents)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(p.netCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
