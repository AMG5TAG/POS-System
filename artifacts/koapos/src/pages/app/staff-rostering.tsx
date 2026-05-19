import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageTabsNav } from "@/components/ui/page-tabs-nav";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Clock, UserSquare2, CalendarClock,
  ClipboardList, Coins, StickyNote, Target, Link2, Users, Send,
} from "lucide-react";

/* ─── Tabs ───────────────────────────────────────────────────────────────── */

const STAFF_TABS = [
  { href: "/staff",                label: "Employees", icon: UserSquare2  },
  { href: "/staff/timesheet",      label: "Timesheet", icon: Clock        },
  { href: "/staff/rostering",      label: "Rostering", icon: CalendarClock },
  { href: "/staff/leave-requests", label: "Leave",     icon: ClipboardList },
  { href: "/staff/cost-summary",   label: "Costs",     icon: Coins        },
  { href: "/staff/notes",          label: "Notes",     icon: StickyNote   },
  { href: "/staff/kpis",           label: "KPIs",      icon: Target       },
  { href: "/staff/links",          label: "Links",     icon: Link2        },
];

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface RosterShift {
  id: string;
  staffId: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM
  endTime: string;
  note: string;
}

type LeaveType = "annual" | "sick" | "personal" | "unpaid" | "public_holiday";
type LeaveStatus = "pending" | "approved" | "declined";

interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
}

/* ─── localStorage ───────────────────────────────────────────────────────── */

const ROSTER_KEY  = "koapos_roster_shifts";
const LEAVE_KEY   = "koapos_leave_requests";

function loadShifts(): RosterShift[] {
  try { const r = localStorage.getItem(ROSTER_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveShifts(s: RosterShift[]) { localStorage.setItem(ROSTER_KEY, JSON.stringify(s)); }

function loadLeave(): LeaveRequest[] {
  try { const r = localStorage.getItem(LEAVE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveLeave(l: LeaveRequest[]) { localStorage.setItem(LEAVE_KEY, JSON.stringify(l)); }

/* ─── Date helpers ───────────────────────────────────────────────────────── */

function fmtDate(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const grid: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) grid.push(null);
  for (let d = 1; d <= last.getDate(); d++) grid.push(new Date(year, month, d));
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Annual Leave", sick: "Sick Leave", personal: "Personal Leave",
  unpaid: "Unpaid Leave", public_holiday: "Public Holiday",
};

const STATUS_META: Record<LeaveStatus, { label: string; cls: string }> = {
  pending:  { label: "Pending",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"   },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"   },
  declined: { label: "Declined", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"       },
};

/* ─── Staff colour palette ───────────────────────────────────────────────── */

const STAFF_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500",  "bg-teal-500",  "bg-indigo-500", "bg-red-500",
];

/* ─── Shift Dialog ───────────────────────────────────────────────────────── */

function ShiftDialog({
  open, onOpenChange, date, staffList, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  staffList: { id: number; name: string }[];
  onSave: (s: Omit<RosterShift, "id">) => void;
}) {
  const [form, setForm] = useState({ staffId: "", startTime: "09:00", endTime: "17:00", note: "" });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.staffId) { toast.error("Select a staff member"); return; }
    onSave({ ...form, date });
    onOpenChange(false);
    setForm({ staffId: "", startTime: "09:00", endTime: "17:00", note: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Shift</DialogTitle>
          <DialogDescription>
            {new Date(date + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={form.staffId} onValueChange={(v) => set("staffId", v)}>
              <SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger>
              <SelectContent>
                {staffList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Opening shift" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Add Shift</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

const today = new Date();

export default function StaffRosteringPage() {
  const { data: staffData } = useListStaff({ query: { queryKey: ["staff"] } });
  const staffList = (Array.isArray(staffData) ? staffData : []) as { id: number; name: string }[];

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [shifts, setShifts]   = useState<RosterShift[]>(loadShifts);
  const [leaves, setLeaves]   = useState<LeaveRequest[]>(loadLeave);
  const [shiftOpen, setShiftOpen] = useState(false);

  /* Leave form */
  const [leaveForm, setLeaveForm] = useState({
    staffId: "", type: "annual" as LeaveType, startDate: "", endDate: "", reason: "",
  });

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, RosterShift[]>();
    for (const s of shifts) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return map;
  }, [shifts]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    staffList.forEach((s, i) => m.set(String(s.id), STAFF_COLORS[i % STAFF_COLORS.length]));
    return m;
  }, [staffList]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const persistShifts = (next: RosterShift[]) => { setShifts(next); saveShifts(next); };
  const addShift = (s: Omit<RosterShift, "id">) => { persistShifts([...shifts, { ...s, id: crypto.randomUUID() }]); toast.success("Shift added"); };
  const removeShift = (id: string) => { persistShifts(shifts.filter((s) => s.id !== id)); };

  const selectedShifts = selectedDate ? (shiftsByDate.get(selectedDate) ?? []) : [];

  const submitLeave = () => {
    const member = staffList.find((s) => String(s.id) === leaveForm.staffId);
    if (!leaveForm.staffId || !leaveForm.startDate || !leaveForm.endDate) {
      toast.error("Please fill in all required fields"); return;
    }
    if (leaveForm.startDate > leaveForm.endDate) {
      toast.error("End date must be on or after start date"); return;
    }
    const req: LeaveRequest = {
      id: crypto.randomUUID(),
      staffId: leaveForm.staffId,
      staffName: member?.name ?? "Unknown",
      type: leaveForm.type,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      reason: leaveForm.reason,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const next = [...leaves, req];
    setLeaves(next); saveLeave(next);
    setLeaveForm({ staffId: "", type: "annual", startDate: "", endDate: "", reason: "" });
    toast.success("Leave request submitted");
  };

  const updateLeaveStatus = (id: string, status: LeaveStatus) => {
    const next = leaves.map((l) => l.id === id ? { ...l, status } : l);
    setLeaves(next); saveLeave(next);
    toast.success(`Request ${status}`);
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Staff</h1>
            <p className="text-sm text-muted-foreground mt-1">Roster calendar and leave management.</p>
          </div>
        </div>

        <PageTabsNav tabs={STAFF_TABS} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── Calendar ─────────────────────────────────────────────────── */}
          <div className="space-y-4" id="rostering">

            {/* Month nav */}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
              <h2 className="font-semibold text-base">{MONTH_NAMES[month]} {year}</h2>
              <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border">
              {grid.map((date, i) => {
                if (!date) return <div key={`empty-${i}`} className="bg-muted/20 min-h-[72px]" />;
                const dateStr = fmtDate(date);
                const dayShifts = shiftsByDate.get(dateStr) ?? [];
                const isToday = dateStr === fmtDate(today);
                const isSel = dateStr === selectedDate;
                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "bg-background min-h-[72px] p-1.5 cursor-pointer transition-colors hover:bg-primary/5",
                      isToday && "bg-primary/5",
                      isSel && "ring-2 ring-inset ring-primary",
                    )}
                    onClick={() => setSelectedDate(isSel ? null : dateStr)}
                  >
                    <span className={cn(
                      "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full",
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}>
                      {date.getDate()}
                    </span>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {dayShifts.slice(0, 3).map((s) => {
                        const name = staffList.find((m) => String(m.id) === s.staffId)?.name ?? "?";
                        return (
                          <div key={s.id} className={cn("text-[10px] leading-tight px-1 py-0.5 rounded text-white truncate", colorMap.get(s.staffId) ?? "bg-primary")}>
                            {name.split(" ")[0]}
                          </div>
                        );
                      })}
                      {dayShifts.length > 3 && (
                        <div className="text-[10px] text-muted-foreground pl-1">+{dayShifts.length - 3}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected day detail */}
            {selectedDate && (
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                  <Button size="sm" onClick={() => setShiftOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />Add Shift
                  </Button>
                </div>
                {selectedShifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No shifts rostered for this day.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedShifts.map((s) => {
                      const name = staffList.find((m) => String(m.id) === s.staffId)?.name ?? "Unknown";
                      return (
                        <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                          <div className={cn("w-2 h-8 rounded-full shrink-0", colorMap.get(s.staffId) ?? "bg-primary")} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{name}</p>
                            <p className="text-xs text-muted-foreground">{s.startTime} – {s.endTime}{s.note && ` · ${s.note}`}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeShift(s.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Staff colour legend */}
            {staffList.length > 0 && (
              <div className="rounded-xl border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Staff Colour Key</p>
                <div className="flex flex-wrap gap-2">
                  {staffList.map((s) => (
                    <div key={s.id} className="flex items-center gap-1.5 text-xs">
                      <div className={cn("w-3 h-3 rounded-full", colorMap.get(String(s.id)) ?? "bg-primary")} />
                      <span>{s.name.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Leave ──────────────────────────────────────────────── */}
          <div className="space-y-6" id="leave-requests">

            {/* Leave request form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  Leave / Day Off Request
                </CardTitle>
                <CardDescription>Submit a leave or day-off request for review by management.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Staff Member</Label>
                  <Select value={leaveForm.staffId} onValueChange={(v) => setLeaveForm((p) => ({ ...p, staffId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
                    <SelectContent>
                      {staffList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Leave Type</Label>
                  <Select value={leaveForm.type} onValueChange={(v) => setLeaveForm((p) => ({ ...p, type: v as LeaveType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(LEAVE_TYPE_LABELS) as [LeaveType, string][]).map(([k, l]) => (
                        <SelectItem key={k} value={k}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>From</Label>
                    <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((p) => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>To</Label>
                    <Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((p) => ({ ...p, endDate: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Textarea
                    value={leaveForm.reason}
                    onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))}
                    placeholder="Additional details…"
                    className="h-20 resize-none"
                  />
                </div>
                <Button className="w-full" onClick={submitLeave}>
                  <Send className="w-4 h-4 mr-2" />Submit Request
                </Button>
              </CardContent>
            </Card>

            {/* Leave requests list */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Leave Requests
                </CardTitle>
                <CardDescription>Review and action pending requests.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-0">
                {leaves.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No leave requests yet.</p>
                ) : (
                  <div className="divide-y -mx-6">
                    {[...leaves].reverse().map((req) => {
                      const sm = STATUS_META[req.status];
                      return (
                        <div key={req.id} className="px-6 py-3.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">{req.staffName}</p>
                              <p className="text-xs text-muted-foreground">{LEAVE_TYPE_LABELS[req.type]}</p>
                            </div>
                            <Badge className={cn("text-xs shrink-0", sm.cls)}>{sm.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(req.startDate + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                            {" → "}
                            {new Date(req.endDate + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          {req.reason && <p className="text-xs italic text-muted-foreground">"{req.reason}"</p>}
                          {req.status === "pending" && (
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400" onClick={() => updateLeaveStatus(req.id, "approved")}>Approve</Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-rose-700 border-rose-300 hover:bg-rose-50 dark:text-rose-400" onClick={() => updateLeaveStatus(req.id, "declined")}>Decline</Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ShiftDialog
        open={shiftOpen}
        onOpenChange={setShiftOpen}
        date={selectedDate ?? fmtDate(today)}
        staffList={staffList}
        onSave={addShift}
      />
    </AppLayout>
  );
}
