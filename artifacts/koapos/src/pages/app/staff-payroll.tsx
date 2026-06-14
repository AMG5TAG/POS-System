import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  useGetPayrollStatus,
  useListPayRuns,
  useCreatePayRun,
  useSyncPayrollEmployees,
  type PayRun,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Wallet, Plug, Users, Plus, Settings, FileText, CalendarDays } from "lucide-react";

const fmt = (cents: number) => formatCurrency(cents / 100);

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  posted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  filed: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

export default function StaffPayrollPage() {
  const { data: status, isLoading: statusLoading } = useGetPayrollStatus();
  const { data: payRuns, isLoading: runsLoading, refetch: refetchRuns } = useListPayRuns();

  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [paymentDate, setPaymentDate] = useState("");

  const syncEmployees = useSyncPayrollEmployees({
    mutation: {
      onSuccess: (r) => toast.success(r.message),
      onError: () => toast.error("Employee sync failed — is the provider connected?"),
    },
  });

  const createRun = useCreatePayRun({
    mutation: {
      onSuccess: () => {
        toast.success("Draft pay run created");
        setOpen(false);
        setPeriodStart(""); setPeriodEnd(""); setPaymentDate("");
        refetchRuns();
      },
      onError: () => toast.error("Failed to create pay run"),
    },
  });

  const connected = !!status?.connected;
  const runs: PayRun[] = payRuns?.items ?? [];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6" /> Payroll
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Run payroll through your connected provider — pay calculation, PAYG, super and STP are handled for you.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/settings/payroll"><Settings className="h-4 w-4" /> Settings</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!connected || syncEmployees.isPending}
              onClick={() => syncEmployees.mutate()}
            >
              <Users className="h-4 w-4" /> Sync employees
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" disabled={!connected}>
                  <Plus className="h-4 w-4" /> Run payroll
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New pay run</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label>Period start</Label>
                    <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Period end</Label>
                    <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment date (optional)</Label>
                    <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    disabled={!periodStart || !periodEnd || createRun.isPending}
                    onClick={() =>
                      createRun.mutate({
                        data: { periodStart, periodEnd, paymentDate: paymentDate || null },
                      })
                    }
                  >
                    Create draft
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Not connected banner */}
        {!statusLoading && !connected && (
          <Card>
            <CardContent className="flex items-center justify-between gap-4 flex-wrap p-5">
              <div className="flex items-center gap-3">
                <Plug className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">No payroll provider connected</p>
                  <p className="text-xs text-muted-foreground">
                    {status?.configured
                      ? "Connect a payroll provider to create pay runs."
                      : "Payroll OAuth is not configured on this server yet."}
                  </p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" asChild>
                <Link href="/settings/payroll"><Settings className="h-4 w-4" /> Go to settings</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/staff/payroll/payslips">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-3 p-5">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div><p className="text-sm font-medium">Payslips</p><p className="text-xs text-muted-foreground">View payslips by pay run</p></div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/staff/payroll/leave">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-3 p-5">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                <div><p className="text-sm font-medium">Leave balances</p><p className="text-xs text-muted-foreground">Annual, personal & long service</p></div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent pay runs */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pay runs</CardTitle></CardHeader>
          <CardContent>
            {runsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No pay runs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">PAYG</TableHead>
                    <TableHead className="text-right">Super</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.periodStart} → {r.periodEnd}</TableCell>
                      <TableCell><Badge className={STATUS_BADGE[r.status] ?? ""} variant="secondary">{r.status}</Badge></TableCell>
                      <TableCell className="text-right">{fmt(r.grossCents)}</TableCell>
                      <TableCell className="text-right">{fmt(r.paygCents)}</TableCell>
                      <TableCell className="text-right">{fmt(r.superCents)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.netCents)}</TableCell>
                      <TableCell className="text-right">{r.employeeCount}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/staff/payroll/runs?id=${r.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
