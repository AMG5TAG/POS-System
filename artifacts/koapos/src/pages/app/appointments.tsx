import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListAppointments,
  useCreateAppointment,
  useDeleteAppointment,
  useUpdateAppointment,
  useListCustomers,
  useListStaff,
  Appointment,
  AppointmentInputStatus,
  Customer,
  Staff,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  CalendarClock, Plus, Trash2, Pencil, Search, Clock, User, StickyNote, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type FormState = {
  customerId: string;
  staffId: string;
  startTime: string;
  endTime: string;
  status: AppointmentInputStatus;
  notes: string;
};

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

function makeDefaultForm(): FormState {
  const start = defaultStartTime();
  return {
    customerId: "",
    staffId: "",
    startTime: start,
    endTime: addOneHour(start),
    status: "scheduled",
    notes: "",
  };
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-violet-100 text-violet-700 border-violet-200",
  completed:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled:  "bg-red-100 text-red-700 border-red-200",
  "no-show":  "bg-amber-100 text-amber-700 border-amber-200",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "Australia/Sydney",
  });
}

function formatDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");
}

/* ─── Detail dialog ──────────────────────────────────────────────────────── */

interface DetailDialogProps {
  appt: Appointment | null;
  onClose: () => void;
  onEdit: (a: Appointment) => void;
  onDelete: (id: number) => void;
  deleteIsPending: boolean;
}

function DetailDialog({ appt, onClose, onEdit, onDelete, deleteIsPending }: DetailDialogProps) {
  if (!appt) return null;

  return (
    <Dialog open={!!appt} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">{appt.title || "Appointment"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs border px-2 py-0.5", STATUS_COLORS[appt.status] ?? "")}>
              {statusLabel(appt.status)}
            </Badge>
          </div>

          {/* Time */}
          <div className="rounded-xl border bg-muted/20 divide-y">
            <div className="flex items-start gap-3 px-4 py-3">
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Start</p>
                <p className="text-muted-foreground">{formatTime(appt.scheduledAt)}</p>
              </div>
            </div>
            {appt.endAt && (
              <div className="flex items-start gap-3 px-4 py-3">
                <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">End · <span className="font-normal text-muted-foreground">{formatDuration(appt.durationMinutes)}</span></p>
                  <p className="text-muted-foreground">{formatTime(appt.endAt)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Customer / Staff */}
          {(appt.customerName || appt.staffName) && (
            <div className="rounded-xl border bg-muted/20 divide-y">
              {appt.customerName && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium">{appt.customerName}</p>
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
        </div>

        <DialogFooter className="gap-2 flex-row justify-between sm:justify-between">
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => { onDelete(appt.id); onClose(); }}
            disabled={deleteIsPending}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" className="gap-1.5" onClick={() => { onClose(); onEdit(appt); }}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Booking (create / edit) dialog ────────────────────────────────────── */

interface BookingDialogProps {
  open: boolean;
  editing: Appointment | null;
  onClose: () => void;
  customers: Customer[];
  staff: Staff[];
}

function BookingDialog({ open, editing, onClose, customers, staff }: BookingDialogProps) {
  const [form, setForm] = useState<FormState>(makeDefaultForm);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          customerId: editing.customerId ? String(editing.customerId) : "",
          staffId: editing.staffId ? String(editing.staffId) : "",
          startTime: toLocalDatetimeValue(new Date(editing.scheduledAt)),
          endTime: toLocalDatetimeValue(new Date(editing.endAt!)),
          status: editing.status as AppointmentInputStatus,
          notes: editing.notes ?? "",
        });
      } else {
        setForm(makeDefaultForm());
      }
      setCustomerSearch("");
      setCustomerOpen(false);
    }
  }, [open, editing]);

  function setField(key: keyof FormState, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeStaff = Array.isArray(staff) ? staff : [];

  const filteredCustomers = safeCustomers.filter((c) => {
    const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase();
    return (
      name.includes(customerSearch.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(customerSearch.toLowerCase())
    );
  });

  const selectedCustomer = safeCustomers.find((c) => String(c.id) === form.customerId);

  const handleSubmit = () => {
    if (!form.startTime || !form.endTime) {
      toast.error("Please set start and end times");
      return;
    }
    const payload = {
      customerId: form.customerId ? Number(form.customerId) : null,
      staffId: form.staffId ? Number(form.staffId) : null,
      scheduledAt: new Date(form.startTime).toISOString(),
      endAt: new Date(form.endTime).toISOString(),
      status: form.status,
      notes: form.notes || null,
    };

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            toast.success("Appointment updated");
            queryClient.invalidateQueries({ queryKey: ["listAppointments"] });
            onClose();
          },
          onError: () => toast.error("Failed to update appointment"),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast.success("Appointment booked");
            queryClient.invalidateQueries({ queryKey: ["listAppointments"] });
            onClose();
          },
          onError: () => toast.error("Failed to book appointment"),
        }
      );
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
            <Label>Customer <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCustomerOpen((o) => !o)}
                className="w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-background hover:bg-muted/40 transition-colors"
              >
                <span className={selectedCustomer ? "text-foreground" : "text-muted-foreground"}>
                  {selectedCustomer
                    ? `${selectedCustomer.firstName ?? ""} ${selectedCustomer.lastName ?? ""}`.trim()
                    : "Search contacts..."}
                </span>
                <Search className="w-4 h-4 text-muted-foreground" />
              </button>
              {customerOpen && (
                <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-md">
                  <div className="p-2 border-b">
                    <Input
                      autoFocus
                      placeholder="Search by name or email..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => { setField("customerId", ""); setCustomerOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40"
                    >
                      No customer
                    </button>
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setField("customerId", String(c.id));
                          setCustomerOpen(false);
                          setCustomerSearch("");
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-muted/40",
                          form.customerId === String(c.id) && "bg-primary/10 font-medium"
                        )}
                      >
                        <span className="font-medium">
                          {`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}
                        </span>
                        {c.email && (
                          <span className="ml-2 text-muted-foreground text-xs">{c.email}</span>
                        )}
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                        No customers found
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Time */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Appointment Time
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" /> Start Time
                </Label>
                <Input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => {
                    setField("startTime", e.target.value);
                    setField("endTime", addOneHour(e.target.value));
                  }}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" /> End Time
                  <span className="text-muted-foreground text-xs font-normal">(auto +1hr)</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => setField("endTime", e.target.value)}
                  className="text-sm"
                />
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
              <Label className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" /> Assigned Staff
              </Label>
              <Select
                value={form.staffId || "__none__"}
                onValueChange={(v) => setField("staffId", v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Not assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not assigned</SelectItem>
                  {safeStaff.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Any additional details..."
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
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

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function AppointmentsPage() {
  const [bookingOpen, setBookingOpen]   = useState(false);
  const [editing, setEditing]           = useState<Appointment | null>(null);
  const [viewing, setViewing]           = useState<Appointment | null>(null);
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading } = useListAppointments(
    {},
    { query: { queryKey: ["listAppointments"] } }
  );
  const { data: customersData } = useListCustomers();
  const { data: staffData }     = useListStaff();
  const deleteMutation          = useDeleteAppointment();

  const customers = Array.isArray(customersData) ? customersData : [];
  const staff     = Array.isArray(staffData)     ? staffData     : [];

  const handleDelete = (id: number) => {
    if (!confirm("Delete this appointment?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Appointment deleted");
          queryClient.invalidateQueries({ queryKey: ["listAppointments"] });
        },
        onError: () => toast.error("Failed to delete appointment"),
      }
    );
  };

  const openNew  = () => { setEditing(null); setBookingOpen(true); };
  const openEdit = (a: Appointment) => { setEditing(a); setBookingOpen(true); };
  const openView = (a: Appointment) => setViewing(a);

  // Group by date
  const apptList = Array.isArray(appointments) ? appointments : [];
  const grouped: Record<string, Appointment[]> = {};
  for (const a of apptList) {
    const date = new Date(a.scheduledAt).toLocaleDateString("en-AU", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      timeZone: "Australia/Sydney",
    });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(a);
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Appointments</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {apptList.length} total appointment{apptList.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            New Appointment
          </Button>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground">Loading appointments...</div>
        ) : apptList.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CalendarClock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No appointments yet</p>
              <p className="text-sm text-muted-foreground mt-1">Click "New Appointment" to book one.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([date, appts]) => (
              <div key={date}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  {date}
                </h2>
                <div className="space-y-2">
                  {appts.map((a) => (
                    <Card
                      key={a.id}
                      className="hover:shadow-md transition-shadow cursor-pointer group"
                      onClick={() => openView(a)}
                    >
                      <CardContent className="py-4 px-5 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{a.title}</span>
                            <Badge className={cn("text-[11px] border px-1.5 py-0.5", STATUS_COLORS[a.status] ?? "")}>
                              {statusLabel(a.status)}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTime(a.scheduledAt)} · {formatDuration(a.durationMinutes)}
                            </span>
                            {a.customerName && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {a.customerName}
                              </span>
                            )}
                            {a.staffName && <span>Staff: {a.staffName}</span>}
                          </div>
                          {a.notes && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{a.notes}</p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <DetailDialog
        appt={viewing}
        onClose={() => setViewing(null)}
        onEdit={(a) => { setViewing(null); openEdit(a); }}
        onDelete={(id) => { handleDelete(id); }}
        deleteIsPending={deleteMutation.isPending}
      />

      {/* Create / edit dialog */}
      <BookingDialog
        open={bookingOpen}
        editing={editing}
        onClose={() => { setBookingOpen(false); setEditing(null); }}
        customers={customers}
        staff={staff}
      />
    </AppLayout>
  );
}
