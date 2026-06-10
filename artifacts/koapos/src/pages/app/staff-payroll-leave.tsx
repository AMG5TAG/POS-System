import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListLeaveBalances } from "@workspace/api-client-react";
import { ArrowLeft, CalendarDays } from "lucide-react";

const LEAVE_BADGE: Record<string, string> = {
  annual: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  personal: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  long_service: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

export default function StaffPayrollLeavePage() {
  const { data, isLoading } = useListLeaveBalances();
  const balances = data?.items ?? [];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" asChild>
            <Link href="/staff/payroll"><ArrowLeft className="h-4 w-4" /> Back to Payroll</Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Leave Balances
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Accrued leave per employee, synced from your payroll provider.
          </p>
        </div>

        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : balances.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No leave balances yet. Connect a provider and sync employees to populate this.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave type</TableHead>
                    <TableHead className="text-right">Balance (hrs)</TableHead>
                    <TableHead className="text-right">Accrued (hrs)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.employeeName}</TableCell>
                      <TableCell>
                        <Badge className={LEAVE_BADGE[b.leaveType] ?? ""} variant="secondary">
                          {b.leaveTypeName || b.leaveType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{b.balanceHours}</TableCell>
                      <TableCell className="text-right">{b.accruedHours ?? "—"}</TableCell>
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
