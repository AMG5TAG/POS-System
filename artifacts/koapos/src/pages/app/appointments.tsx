import { useState, useEffect, useCallback } from "react";
import { buildMapUrl } from "@/pages/app/management-misc";
import { AppLayout } from "@/components/layout/app-layout";
import { FormsAttachmentPanel } from "@/components/forms/FormsAttachmentPanel";
import { FormSelectorField } from "@/components/forms/FormSelectorField";
import {
  useListAppointments,
  useCreateAppointment,
  useDeleteAppointment,
  useUpdateAppointment,
  useListStaff,
  Appointment,
  AppointmentInputStatus,
  Staff,
} from "@workspace/api-client-react";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  CalendarClock, Plus, Trash2, Pencil, Clock, User, StickyNote,
  ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal, Eye, CheckCircle,
  ChevronLeft, ChevronRight, CalendarDays, Phone, Mail, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Status config ──────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled:  { label: "Scheduled",  className: "bg-violet-50 text-violet-700 border-violet-300" },
  completed:  { label: "Completed",  className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  cancelled:  { label: "Cancelled",  className: "bg-red-50 text-red-700 border-red-300" },
  "no-show":  { label: "No Show",   className: "bg-amber-50 text-amber-700 border-amber-300" },
};

function getStatus(s: string) {
  return STATUS_CONFIG[s] ?? { label: s, className: "bg-muted text-muted-foreground border-border" };
}

/* ─── Time helpers ───────────────────────────────────────────────────────── */

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStartTime(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
  return toLocalDatetimeValue(now);
}

function addOneHour(dt: string): string {
  if (!dt) return "";
  const d = new Date(dt);
  d.setHours(d.getHours() + 1);
  return toLocalDatetimeValue(d);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "Australia/Sydney",
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "Australia/Sydney",
  });
}

function formatDuration(mins: number) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ─── Sorting ────────────────────────────────────────────────────────────── */

type SortKey = "scheduledAt" | "customerName" | "staffName" | "status" | "durationMinutes";
type SortDir = "asc" | "desc";

function getSortValue(a: Appointment, key: SortKey): string {
  switch (key) {
    case "scheduledAt":      return a.scheduledAt ?? "";
    case "customerName":     return (a.customerName ?? "").toLowerCase();
    case "staffName":        return (a.staffName ?? "").toLowerCase();
    case "status":           return a.status ?? "";
    case "durationMinutes":  return String(a.durationMinutes ?? 0).padStart(6, "0");
  }
}

function sortAppointments(appts: Appointment[], key: SortKey, dir: SortDir): Appointment[] {
  const done   = appts.filter((a) => a.status === "completed" || a.status === "cancelled");
  const active = appts.filter((a) => a.status !== "completed" && a.status !== "cancelled");

  const cmp = (x: Appointment, y: Appointment) => {
    const av = getSortValue(x, key);
    const bv = getSortValue(y, key);
    const r  = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? r : -r;
  };

  // When sorting by scheduledAt asc, put future appointments first (nearest first),
  // then past scheduled appointments — so the next upcoming is always at the top.
  if (key === "scheduledAt" && dir === "asc") {
    const now = new Date().toISOString();
    const future = active.filter((a) => (a.scheduledAt ?? "") >= now).sort(cmp);
    const past   = active.filter((a) => (a.scheduledAt ?? "") <  now).sort(cmp);
    return [...future, ...past, ...done.sort(cmp)];
  }

  return [...active.sort(cmp), ...done.sort(cmp)];
}

/* ─── Sortable header ────────────────────────────────────────────────────── */

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}

function SortableHeader({ label, sortKey, activeSortKey, dir, onSort, className }: SortableHeaderProps) {
  const isActive = sortKey === activeSortKey;
  return (
    <th
      className={cn("px-3 py-3 text-left font-medium select-none cursor-pointer group", className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive
            ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
            : <ChevronsUpDown className="w-3 h-3" />}
        </span>
      </span>
    </th>
  );
}

/* ─── Detail dialog ──────────────────────────────────────────────────────── */

interface DetailDialogProps {
  appt: Appointment | null;
  onClose: () => void;
  onEdit: (a: Appointment) => void;
  onDelete: (id: number) => void;
  deleteIsPending: boolean;
}

function apptRefCode(id: number): string {
  return `KA${String(id).padStart(5, "0")}`;
}

function DetailDialog({ appt, onClose, onEdit, onDelete, deleteIsPending }: DetailDialogProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!appt) return null;
  const { label, className } = getStatus(appt.status);

  return (
    <>
    <Dialog open={!!appt} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">{appt.title || "Appointment"}</span>
            <span className="font-mono text-xs font-normal text-muted-foreground">{apptRefCode(appt.id)}</span>
            <span className={cn("ml-1 inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium border", className)}>
              {label}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Time */}
          <div className="rounded-xl border bg-muted/20 divide-y">
            <div className="flex items-start gap-3 px-4 py-3">
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Start</p>
                <p className="font-medium">{formatDateTime(appt.scheduledAt)}</p>
              </div>
            </div>
            {appt.endAt && (
              <div className="flex items-start gap-3 px-4 py-3">
                <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground mb-0.5">End · {formatDuration(appt.durationMinutes)}</p>
                  <p className="font-medium">{formatDateTime(appt.endAt)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Customer / Staff */}
          {(appt.customerName || appt.staffName) && (
            <div className="rounded-xl border bg-muted/20 divide-y">
              {appt.customerName && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-sm min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Customer</p>
                    <p className="font-medium">{appt.customerName}</p>
                    {appt.customerPhone && (
                      <a
                        href={`tel:${appt.customerPhone}`}
                        className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Phone className="w-3 h-3 shrink-0" />
                        {appt.customerPhone}
                      </a>
                    )}
                    {appt.customerEmail && (
                      <a
                        href={`mailto:${appt.customerEmail}`}
                        className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Mail className="w-3 h-3 shrink-0" />
                        {appt.customerEmail}
                      </a>
                    )}
                    {appt.customerAddress && (
                      <a
                        href={buildMapUrl(appt.customerAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-1.5 mt-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <MapPin className="w-3 h-3 shrink-0 mt-px" />
                        {appt.customerAddress}
                      </a>
                    )}
                  </div>
                </div>
              )}
              {appt.staffName && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Assigned Staff</p>
                    <p className="font-medium">{appt.staffName}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {appt.notes && (
            <div className="rounded-xl border bg-muted/20 px-4 py-3 flex items-start gap-3">
              <StickyNote className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                <p className="whitespace-pre-wrap">{appt.notes}</p>
              </div>
            </div>
          )}

          <FormsAttachmentPanel
            sourceType="appointment"
            sourceId={appt.id}
            customerId={appt.customerId ?? undefined}
            customerName={appt.customerName ?? undefined}
          />
        </div>

        <DialogFooter className="gap-2 flex-row justify-between sm:justify-between">
          <Button
            variant="destructive" size="sm" className="gap-1.5"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteIsPending}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" className="gap-1.5" onClick={() => { onClose(); onEdit(appt); }}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{appt.title || "Appointment"}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this appointment and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { onDelete(appt.id); onClose(); }}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/* ─── Booking dialog ─────────────────────────────────────────────────────── */

type FormState = {
  customerId: string;
  staffId: string;
  startTime: string;
  endTime: string;
  status: AppointmentInputStatus;
  notes: string;
  selectedFormIds: number[];
};

function makeDefaultForm(): FormState {
  const start = defaultStartTime();
  return { customerId: "", staffId: "", startTime: start, endTime: addOneHour(start), status: "scheduled", notes: "", selectedFormIds: [] };
}

interface BookingDialogProps {
  open: boolean;
  editing: Appointment | null;
  onClose: () => void;
  staff: Staff[];
}

function BookingDialog({ open, editing, onClose, staff }: BookingDialogProps) {
  const [form, setForm]               = useState<FormState>(makeDefaultForm);
  const queryClient = useQueryClient();
  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();

  useEffect(() => {
    if (open) {
      setForm(editing ? {
        customerId: editing.customerId ? String(editing.customerId) : "",
        staffId:    editing.staffId    ? String(editing.staffId)    : "",
        startTime:  toLocalDatetimeValue(new Date(editing.scheduledAt)),
        endTime:    toLocalDatetimeValue(new Date(editing.endAt!)),
        status:     editing.status as AppointmentInputStatus,
        notes:      editing.notes ?? "",
        selectedFormIds: [],
      } : makeDefaultForm());
    }
  }, [open, editing]);

  const setField = (key: keyof FormState, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const safeStaff = Array.isArray(staff) ? staff : [];

  const handleSubmit = () => {
    if (!form.customerId) { toast.error("Please select a customer"); return; }
    if (!form.startTime || !form.endTime) { toast.error("Please set start and end times"); return; }
    const payload = {
      customerId: form.customerId ? Number(form.customerId) : null,
      staffId:    form.staffId    ? Number(form.staffId)    : null,
      scheduledAt: new Date(form.startTime).toISOString(),
      endAt:       new Date(form.endTime).toISOString(),
      status: form.status,
      notes:  form.notes || null,
    };
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listAppointments"] });
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload }, {
        onSuccess: () => { toast.success("Appointment updated"); invalidate(); onClose(); },
        onError:   () => toast.error("Failed to update appointment"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { toast.success("Appointment booked"); invalidate(); onClose(); },
        onError:   () => toast.error("Failed to book appointment"),
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="w-5 h-5 text-primary" />
            {editing ? "Edit Appointment" : "New On-Site Appointment"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Customer */}
          <div className="space-y-1.5">
            <Label>
              Customer <span className="text-destructive">*</span>
            </Label>
            <CustomerSearchInput
              value={form.customerId}
              onChange={(id) => setField("customerId", id)}
              placeholder="Search customer..."
              invalid={!form.customerId}
            />
            {!form.customerId && (
              <p className="text-xs text-muted-foreground">A customer is required to book an appointment.</p>
            )}
          </div>

          {/* Time */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Appointment Time</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm"><Clock className="w-3.5 h-3.5 text-muted-foreground" /> Start Time</Label>
                <Input type="datetime-local" value={form.startTime}
                  onChange={(e) => { setField("startTime", e.target.value); setField("endTime", addOneHour(e.target.value)); }} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" /> End Time
                  <span className="text-muted-foreground text-xs font-normal">(auto +1hr)</span>
                </Label>
                <Input type="datetime-local" value={form.endTime} onChange={(e) => setField("endTime", e.target.value)} className="text-sm" />
              </div>
            </div>
          </div>

          {/* Status + Staff */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="no-show">No Show</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-muted-foreground" /> Assigned Staff</Label>
              <Select value={form.staffId || "__none__"} onValueChange={(v) => setField("staffId", v === "__none__" ? "" : v)}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Not assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not assigned</SelectItem>
                  {safeStaff.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Form Selector */}
          <FormSelectorField
            value={form.selectedFormIds}
            onChange={(ids) => setForm((f) => ({ ...f, selectedFormIds: ids }))}
            label="Attach Forms"
          />

          {/* Work Details */}
          <div className="space-y-1.5">
            <Label>Work Details</Label>
            <Textarea placeholder="Any additional details..." value={form.notes}
              onChange={(e) => setField("notes", e.target.value)} rows={3} className="text-sm resize-none" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : editing ? "Save Changes" : "Book Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Appointments-only Calendar ─────────────────────────────────────────── */

function AppointmentsCalendar({
  appointments,
  onView,
}: {
  appointments: Appointment[];
  onView: (a: Appointment) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  // Show scheduled and completed appointments in the calendar
  const upcomingAppts = appointments.filter((a) => a.status === "scheduled" || a.status === "completed");

  const monthName = new Date(year, month - 1, 1).toLocaleString("en-AU", {
    month: "long",
    year: "numeric",
  });

  const goToPrev = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  };
  const goToNext = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  };
  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  // Build grid: Monday-start weeks
  const firstDay = new Date(year, month - 1, 1);
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Map appts by date
  const byDate = new Map<string, Appointment[]>();
  for (const a of upcomingAppts) {
    const d = a.scheduledAt?.split("T")[0];
    if (!d) continue;
    const arr = byDate.get(d) ?? [];
    arr.push(a);
    byDate.set(d, arr);
  }

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const cells: { dayNum: number | null; dateKey: string | null; appts: Appointment[] }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayIndex = i - startPad + 1;
    if (dayIndex < 1 || dayIndex > daysInMonth) {
      cells.push({ dayNum: null, dateKey: null, appts: [] });
    } else {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(dayIndex).padStart(2, "0")}`;
      cells.push({ dayNum: dayIndex, dateKey: key, appts: byDate.get(key) ?? [] });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Upcoming Appointments</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[140px] text-center">{monthName}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Only scheduled appointments are shown. Click an appointment to view full details.</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-[11px] font-semibold text-muted-foreground text-center py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (!cell.dayNum) {
                  return (
                    <div
                      key={i}
                      className="min-h-[120px] bg-muted/20 dark:bg-muted/40 rounded-lg border border-border/40 dark:border-border/70"
                    />
                  );
                }
                const isToday = cell.dateKey === todayStr;
                const isPast = cell.dateKey !== null && cell.dateKey < todayStr;
                const hasAppts = cell.appts.length > 0;
                return (
                  <div
                    key={i}
                    className={cn(
                      "min-h-[120px] rounded-lg border p-1.5 flex flex-col gap-1 transition-colors",
                      isPast ? "bg-muted/30 dark:bg-muted/20 opacity-60" : "bg-card",
                      isToday ? "border-primary ring-1 ring-primary/30 opacity-100" : "border-border/60 dark:border-border"
                    )}
                  >
                    <div
                      className={cn(
                        "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full shrink-0 self-start",
                        isToday ? "bg-primary text-primary-foreground" : isPast ? "text-muted-foreground/60" : "text-foreground"
                      )}
                    >
                      {cell.dayNum}
                    </div>
                    {!hasAppts && <div className="flex-1" />}
                    {hasAppts && (
                      <div className="flex flex-col gap-0.5 mt-1">
                        {cell.appts.map((a) => {
                          const time = a.scheduledAt
                            ? new Date(a.scheduledAt).toLocaleTimeString("en-AU", {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Australia/Sydney",
                              })
                            : "";
                          const isCompleted = a.status === "completed";
                          return (
                            <button
                              key={a.id}
                              onClick={() => onView(a)}
                              className={cn(
                                "text-[11px] px-1.5 py-0.5 rounded border text-left truncate transition-colors",
                                isCompleted
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700"
                                  : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700"
                              )}
                              title={`${time} — ${a.customerName || a.title || "Appointment"}`}
                            >
                              <span className="font-medium">{time}</span>
                              {" — "}
                              <span className="truncate">{a.customerName || a.title || "Appointment"}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function AppointmentsPage() {
  const [collapsed, setCollapsed]     = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeSortKey, setSortKey]   = useState<SortKey>("scheduledAt");
  const [sortDir, setSortDir]         = useState<SortDir>("asc");
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [viewing, setViewing]         = useState<Appointment | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [editing, setEditing]         = useState<Appointment | null>(null);

  const queryClient = useQueryClient();
  const { data: appointmentsData, isLoading } = useListAppointments({}, { query: { queryKey: ["listAppointments"] } });
  const { data: staffData } = useListStaff();
  const deleteMutation          = useDeleteAppointment();
  const completeMutation        = useUpdateAppointment();

  const appts = Array.isArray(appointmentsData) ? appointmentsData : [];
  const staff = Array.isArray(staffData) ? staffData : [];

  const upcoming = appts.filter((a) => a.status === "scheduled").length;

  /* Filter */
  const filtered = appts.filter((a) => statusFilter === "all" || a.status === statusFilter);

  /* Sort — completed/cancelled pinned to bottom */
  const sorted = sortAppointments(filtered, activeSortKey, sortDir);

  /* Sort handler */
  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; }
      setSortDir("asc");
      return key;
    });
  }, []);

  /* Select */
  const allSelected = sorted.length > 0 && sorted.every((a) => selected.has(a.id));
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(sorted.map((a) => a.id)));
  const toggleOne   = (id: number) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* Delete */
  const handleDelete = (id: number) => {
    if (!confirm("Delete this appointment?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast.success("Appointment deleted");
        queryClient.invalidateQueries({ queryKey: ["listAppointments"] });
      },
      onError: () => toast.error("Failed to delete appointment"),
    });
  };

  const handleComplete = (appt: Appointment) => {
    const endAt = appt.scheduledAt
      ? new Date(new Date(appt.scheduledAt).getTime() + (appt.durationMinutes ?? 60) * 60000).toISOString()
      : new Date().toISOString();
    completeMutation.mutate(
      {
        id: appt.id,
        data: {
          scheduledAt: appt.scheduledAt,
          endAt,
          status: "completed" as AppointmentInputStatus,
          customerId: appt.customerId ?? null,
          staffId: appt.staffId ?? null,
          title: appt.title ?? undefined,
          notes: appt.notes ?? null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Appointment marked as completed");
          queryClient.invalidateQueries({ queryKey: ["listAppointments"] });
        },
        onError: () => toast.error("Failed to update appointment"),
      }
    );
  };

  const openNew  = () => { setEditing(null); setBookingOpen(true); };
  const openEdit = (a: Appointment) => { setEditing(a); setBookingOpen(true); };

  /* Shared header shorthand */
  const sh = (label: string, key: SortKey, className?: string) => ({
    label, sortKey: key, activeSortKey, dir: sortDir, onSort: handleSort, className,
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-sm text-muted-foreground">Schedule and manage customer appointments and service bookings.</p>
        </div>
        {/* Panel header */}
        <div className="flex items-center justify-between bg-background border border-border rounded-t-xl px-5 py-3">
          <h2 className="text-base font-semibold">
            All Appointments{" "}
            <span className="font-normal text-muted-foreground text-sm">
              ({upcoming} upcoming)
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openNew}>
              <Plus className="w-3.5 h-3.5" />
              New Appointment
            </Button>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp className={cn("w-4 h-4 transition-transform duration-200", collapsed && "rotate-180")} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Filter bar */}
            <div className="flex items-center justify-between border-x border-b border-border bg-muted/20 px-5 py-2.5 gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs w-40 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="no-show">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-sm text-muted-foreground">{sorted.length} of {appts.length}</span>
            </div>

            {/* Table */}
            <div className="border-x border-b border-border rounded-b-xl overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Loading appointments...</div>
              ) : sorted.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {appts.length === 0 ? 'No appointments yet. Click "New Appointment" to book one.' : "No appointments match the current filter."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="w-10 px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            className="rounded border-muted-foreground/40 accent-primary"
                          />
                        </th>
                        <th className="px-3 py-3 text-left font-medium">Ref #</th>
                        <SortableHeader {...sh("Date & Time", "scheduledAt")} />
                        <SortableHeader {...sh("Duration", "durationMinutes")} />
                        <SortableHeader {...sh("Customer", "customerName")} />
                        <SortableHeader {...sh("Staff", "staffName")} />
                        <SortableHeader {...sh("Status", "status")} />
                        <th className="px-3 py-3 text-left font-medium">Notes</th>
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background">
                      {sorted.map((appt) => {
                        const { label, className } = getStatus(appt.status);
                        const isChecked   = selected.has(appt.id);
                        const isDone      = appt.status === "completed" || appt.status === "cancelled";
                        return (
                          <tr
                            key={appt.id}
                            className={cn(
                              "hover:bg-muted/30 transition-colors cursor-pointer",
                              isChecked && "bg-primary/5",
                              isDone    && "opacity-60",
                            )}
                            onClick={() => setViewing(appt)}
                          >
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleOne(appt.id)}
                                className="rounded border-muted-foreground/40 accent-primary"
                              />
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="font-mono text-xs font-medium text-muted-foreground">{apptRefCode(appt.id)}</span>
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap text-xs text-foreground">
                              {formatDateShort(appt.scheduledAt)}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                              {formatDuration(appt.durationMinutes)}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              {appt.customerName
                                ? <span className="text-primary font-medium">{appt.customerName}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap text-sm">
                              {appt.staffName || <span className="text-muted-foreground">—</span>}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium border", className)}>
                                {label}
                              </span>
                            </td>

                            <td className="px-3 py-3 max-w-[200px]">
                              <span className="text-xs text-muted-foreground line-clamp-1">
                                {appt.notes || "—"}
                              </span>
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setViewing(appt)}
                                  className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                                >
                                  <Eye className="w-3 h-3" /> View
                                </button>
                                <button
                                  onClick={() => openEdit(appt)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium hover:underline"
                                >
                                  <Pencil className="w-3 h-3" /> Edit
                                </button>
                                {appt.status === "scheduled" && (
                                  <button
                                    onClick={() => handleComplete(appt)}
                                    className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
                                  >
                                    <CheckCircle className="w-3 h-3" /> Complete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="px-6 md:px-8 pb-8">
        <AppointmentsCalendar appointments={appts} onView={setViewing} />
      </div>

      <DetailDialog
        appt={viewing}
        onClose={() => setViewing(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
      />

      <BookingDialog
        open={bookingOpen}
        editing={editing}
        onClose={() => setBookingOpen(false)}
        staff={staff}
      />
    </AppLayout>
  );
}
