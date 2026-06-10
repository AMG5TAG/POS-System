import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListPayslips } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, FileText } from "lucide-react";

const fmt = (cents: number) => formatCurrency(cents / 100);

export default function StaffPayrollPayslipsPage() {
  const { data, isLoading } = useListPayslips();
  const payslips = data?.items ?? [];

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
            <FileText className="h-6 w-6" /> Payslips
          </h1>
          <p className="text-sm text-muted-foreground mt-1">All payslips across pay runs.</p>
        </div>

        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : payslips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No payslips yet. They appear here after a pay run is processed.
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
                    <TableHead></TableHead>
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
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/staff/payroll/runs?id=${p.payRunId}`}>Pay run</Link>
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
