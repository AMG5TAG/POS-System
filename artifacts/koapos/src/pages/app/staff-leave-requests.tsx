import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLeaveRequests,
  useCreateLeaveRequest,
  useUpdateLeaveRequest,
  useListStaff,
  getListLeaveRequestsQueryKey,
  type LeaveRequestItem,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/use-auth";
import {
  ClipboardList, Plus, CheckCircle2, XCircle, Clock, CalendarDays,
  Users, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const LEAVE_TYPES = [
  { value: "annual",   label: "Annual Leave" },
  { value: "sick",     label: "Sick Leave" },
  { value: "personal", label: "Personal Leave" },
  { value: "unpaid",   label: "Unpaid Leave" },
  { value: "other",    label: "Other" },
];

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:  { label: "Pending",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",   icon: Clock },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",       icon: XCircle },
};

type FilterTab = "all" | "pending" | "approved" | "rejected";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatDate(iso: string) {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

function daysBetween(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

/* ─── Status badge ────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full", cfg.cls)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

/* ─── Request Dialog ──────────────────────────────────────────────────────── */

interface RequestDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

function RequestDialog({ open, onOpenChange, onCreated }: RequestDialogProps) {
  const { data: staffList } = useListStaff();
  const createMutation = useCreateLeaveRequest();
  const [staffId, setStaffId] = useState("");
  const [type, setType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const reset = () => {
    setStaffId(""); setType("annual"); setStartDate(""); setEndDate(""); setReason("");
  };

  const handleSubmit = () => {
    if (!staffId) { toast.error("Please select a staff member"); return; }
    if (!startDate || !endDate) { toast.error("Please select start and end dates"); return; }
    if (new Date(endDate) < new Date(startDate)) { toast.error("End date must be after start date"); return; }

    const staff = staffList?.find(s => String(s.id) === staffId);
    if (!staff) { toast.error("Staff member not found"); return; }

    createMutation.mutate(
      {
        data: {
          requestId: crypto.randomUUID(),
          staffId: String(staff.id),
          staffName: staff.name,
          type,
          startDate,
          endDate,
          reason: reason.trim() || undefined,
          status: "pending",
        },
      },
      {
        onSuccess: () => {
          toast.success("Leave request submitted");
          reset();
          onCreated();
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to submit leave request"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Leave Request</DialogTitle>
          <DialogDescription>Submit a leave request for a staff member.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
              <SelectContent>
                {staffList?.filter(s => s.isActive).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          {startDate && endDate && new Date(endDate) >= new Date(startDate) && (
            <p className="text-xs text-muted-foreground">
              {daysBetween(startDate, endDate)} day{daysBetween(startDate, endDate) !== 1 ? "s" : ""} of leave
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Add any notes or context…"
              className="resize-none h-20"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Submitting…" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Approve/Reject confirm ──────────────────────────────────────────────── */

function ConfirmDialog({
  open, onOpenChange, action, request, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: "approved" | "rejected";
  request: LeaveRequestItem | null;
  onConfirm: () => void;
}) {
  if (!request) return null;
  const isApprove = action === "approved";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isApprove ? "Approve" : "Reject"} Leave Request</AlertDialogTitle>
          <AlertDialogDescription>
            {isApprove
              ? `Approve ${request.staffName}'s ${LEAVE_TYPES.find(t => t.value === request.type)?.label ?? request.type} request from ${formatDate(request.startDate)} to ${formatDate(request.endDate)}?`
              : `Reject ${request.staffName}'s leave request? This action will notify them of the decision.`
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={isApprove ? "" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
          >
            {isApprove ? "Approve" : "Reject"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─── Row skeleton ────────────────────────────────────────────────────────── */

function RowSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 6 }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffLeaveRequestsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListLeaveRequests();
  const updateMutation = useUpdateLeaveRequest();

  const canManage = ["owner", "manager"].includes(user?.staffRole ?? "");

  const [filter, setFilter] = useState<FilterTab>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approved" | "rejected" | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<LeaveRequestItem | null>(null);

  const inv = () => queryClient.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });

  const allRequests: LeaveRequestItem[] = data?.items ?? [];

  const counts = {
    all:      allRequests.length,
    pending:  allRequests.filter(r => r.status === "pending").length,
    approved: allRequests.filter(r => r.status === "approved").length,
    rejected: allRequests.filter(r => r.status === "rejected").length,
  };

  const visible = filter === "all" ? allRequests : allRequests.filter(r => r.status === filter);

  const openConfirm = (req: LeaveRequestItem, action: "approved" | "rejected") => {
    setConfirmRequest(req);
    setConfirmAction(action);
  };

  const handleConfirm = () => {
    if (!confirmRequest || !confirmAction) return;
    updateMutation.mutate(
      { id: confirmRequest.id, data: { status: confirmAction } },
      {
        onSuccess: () => {
          toast.success(confirmAction === "approved" ? "Leave request approved" : "Leave request rejected");
          inv();
          setConfirmAction(null);
          setConfirmRequest(null);
        },
        onError: () => toast.error("Failed to update request"),
      },
    );
  };

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all",      label: `All (${counts.all})` },
    { key: "pending",  label: `Pending (${counts.pending})` },
    { key: "approved", label: `Approved (${counts.approved})` },
    { key: "rejected", label: `Rejected (${counts.rejected})` },
  ];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Leave Requests</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage staff leave requests and approvals.
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Request
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Requests", value: counts.all,      icon: FileText,      cls: "" },
            { label: "Pending",        value: counts.pending,  icon: Clock,         cls: "text-amber-600" },
            { label: "Approved",       value: counts.approved, icon: CheckCircle2,  cls: "text-emerald-600" },
            { label: "Rejected",       value: counts.rejected, icon: XCircle,       cls: "text-rose-500" },
          ].map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <Icon className={cn("w-4 h-4 text-muted-foreground", cls)} />
              </div>
              {isLoading
                ? <Skeleton className="h-8 w-10" />
                : <p className="text-3xl font-bold tracking-tight">{value}</p>
              }
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                filter === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Staff Member</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="pr-5 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <RowSkeleton />
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center py-16 text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No {filter !== "all" ? filter : ""} leave requests</p>
                    <p className="text-xs mt-1">
                      {filter === "all"
                        ? "Submit a new request using the button above."
                        : `No requests with ${filter} status.`}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                visible.map(req => {
                  const typeLabel = LEAVE_TYPES.find(t => t.value === req.type)?.label ?? req.type;
                  const days = daysBetween(req.startDate, req.endDate);
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{req.staffName}</p>
                            {req.reason && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{req.reason}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{typeLabel}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{formatDate(req.startDate)}</span>
                          {req.startDate !== req.endDate && (
                            <><span className="text-muted-foreground">→</span><span>{formatDate(req.endDate)}</span></>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{days}d</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={req.status} />
                      </TableCell>
                      {canManage && (
                        <TableCell className="pr-5 text-right">
                          {req.status === "pending" && (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                onClick={() => openConfirm(req, "approved")}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-rose-500 border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                onClick={() => openConfirm(req, "rejected")}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                              </Button>
                            </div>
                          )}
                          {req.status !== "pending" && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <RequestDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={inv}
      />

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(v) => { if (!v) { setConfirmAction(null); setConfirmRequest(null); } }}
        action={confirmAction ?? "approved"}
        request={confirmRequest}
        onConfirm={handleConfirm}
      />
    </AppLayout>
  );
}
