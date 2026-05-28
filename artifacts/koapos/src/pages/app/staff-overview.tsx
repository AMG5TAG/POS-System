import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff, type Staff } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Clock,
  CalendarOff,
  Clock3,
  PhoneCall,
  ExternalLink,
} from "lucide-react";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
};

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  manager: "secondary",
  cashier: "outline",
};

function roleBadge(role: string) {
  return (
    <Badge variant={ROLE_VARIANT[role] ?? "outline"}>
      {ROLE_LABEL[role] ?? role}
    </Badge>
  );
}

function formatPhone(phone?: string | null) {
  return phone?.trim() || <span className="text-muted-foreground">—</span>;
}

/* ─── Summary card ───────────────────────────────────────────────────────── */

interface SummaryCardProps {
  title: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}

function SummaryCard({ title, value, sub, icon: Icon, loading }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="p-1.5 rounded-md bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-bold tracking-tight">{value}</p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/* ─── Row skeleton ───────────────────────────────────────────────────────── */

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 5 }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffOverviewPage() {
  const { data: staffList, isLoading } = useListStaff();

  const activeStaff = staffList?.filter((s: Staff) => s.isActive) ?? [];
  const totalActive = activeStaff.length;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">

        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold">Staff Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Executive summary of your team — active headcount, shift status, and quick directory access.
          </p>
        </div>

        {/* ── Summary cards row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            title="Total Active Staff"
            value={isLoading ? null : totalActive}
            sub={`${staffList?.length ?? 0} total employees on record`}
            icon={Users}
            loading={isLoading}
          />
          <SummaryCard
            title="Currently Clocked In"
            value="—"
            sub="Shift tracking module not yet enabled"
            icon={Clock}
          />
          <SummaryCard
            title="Pending Leave Requests"
            value="—"
            sub="Leave management module not yet enabled"
            icon={CalendarOff}
          />
        </div>

        {/* ── Master staff directory table ── */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Staff Directory
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Shift Status</TableHead>
                  <TableHead>Contact Phone</TableHead>
                  <TableHead className="pr-6 text-right">Quick Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton />
                ) : (staffList?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="font-medium">No staff members found</p>
                      <p className="text-xs mt-1">Add team members from the Staff page to see them here.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  staffList?.map((member: Staff) => (
                    <TableRow key={member.id}>
                      <TableCell className="pl-6">
                        <div className="flex flex-col">
                          <span className="font-medium">{member.name}</span>
                          {member.email && (
                            <span className="text-xs text-muted-foreground">{member.email}</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>{roleBadge(member.role)}</TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {member.isActive ? (
                            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                              Active
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Inactive
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <PhoneCall className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{formatPhone(member.phone)}</span>
                        </div>
                      </TableCell>

                      <TableCell className="pr-6 text-right">
                        <Button asChild variant="outline" size="sm" className="gap-1.5">
                          <Link href="/staff/timesheet">
                            <ExternalLink className="h-3.5 w-3.5" />
                            View Timesheet
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
