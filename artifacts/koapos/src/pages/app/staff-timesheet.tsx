import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  useListStaff,
  useListStaffTimesheets,
  useCreateStaffTimesheet,
  useDeleteStaffTimesheet,
  type Staff,
  type StaffTimesheetEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, ChevronLeft, ChevronRight, Plus, LogIn, Trash2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Time math ──────────────────────────────────────────────────────────── */

function hoursWorked(clockIn: string, clockOut: string | null): number {
  if (!clockOut) return 0;
  const [ih, im] = clockIn.split(":").map(Number);
  const [oh, om] = clockOut.split(":").map(Number);
  const mins = (oh! * 60 + om!) - (ih! * 60 + im!);
  return Math.max(0, mins / 60);
}

function formatHours(h: number): string {
  if (h === 0) return "—";
  const hours = Math.floor(h);
  const mins  = Math.round((h - hours) * 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ─── Week navigation ─────────────────────────────────────────────────────── */

function getWeekDates(offset: number): string[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}

function formatDay(iso: string): { day: string; date: string } {
  const d = new Date(iso + "T00:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: days[d.getDay()]!, date: String(d.getDate()) };
}

function weekLabel(dates: string[]): string {
  const first = new Date(dates[0]! + "T00:00:00");
  const last  = new Date(dates[6]! + "T00:00:00");
  const mo = first.toLocaleString("en-AU", { month: "short" });
  const mo2 = last.toLocaleString("en-AU", { month: "short" });
  if (mo === mo2) return `${first.getDate()} – ${last.getDate()} ${mo} ${last.getFullYear()}`;
  return `${first.getDate()} ${mo} – ${last.getDate()} ${mo2} ${last.getFullYear()}`;
}

/* ─── Add entry dialog ────────────────────────────────────────────────────── */

function AddEntryDialog({
  open, onOpenChange, staff, onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: Staff[];
  onAdd: (staffId: number, staffName: string, date: string, clockIn: string, clockOut: string | null) => void;
}) {
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayDate);
  const [clockIn, setClockIn] = useState("09:00");
  const [clockOut, setClockOut] = useState("17:00");
  const [stillIn, setStillIn] = useState(false);

  const reset = () => { setStaffId(""); setDate(todayDate()); setClockIn("09:00"); setClockOut("17:00"); setStillIn(false); };

  const handleAdd = () => {
    if (!staffId) { toast.error("Select a staff member"); return; }
    if (!date) { toast.error("Select a date"); return; }
    if (!clockIn) { toast.error("Enter clock-in time"); return; }
    if (!stillIn && clockOut && clockOut <= clockIn) { toast.error("Clock-out must be after clock-in"); return; }
    const member = staff.find(s => String(s.id) === staffId);
    if (!member) return;
    onAdd(member.id, member.name, date, clockIn, stillIn ? null : clockOut);
    toast.success("Entry added");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Timesheet Entry</DialogTitle>
          <DialogDescription>Manually record a shift for a staff member.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {staff.filter(s => s.isActive).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} max={todayDate()} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Clock In</Label>
              <Input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Clock Out</Label>
              <Input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)} disabled={stillIn} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={stillIn}
              onChange={e => setStillIn(e.target.checked)}
              className="rounded border-border"
            />
            Currently clocked in (no clock-out)
          </label>
          {!stillIn && clockIn && clockOut && clockOut > clockIn && (
            <p className="text-xs text-muted-foreground">
              Duration: {formatHours(hoursWorked(clockIn, clockOut))}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleAdd}>Add Entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffTimesheetPage() {
  const queryClient = useQueryClient();
  const { data: staffList, isLoading: staffLoading } = useListStaff();
  const activeStaff: Staff[] = (staffList ?? []).filter(s => s.isActive);

  const [weekOffset, setWeekOffset] = useState(0);
  const [filterStaff, setFilterStaff] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const today = todayDate();

  const startDate = weekDates[0]!;
  const endDate   = weekDates[6]!;

  const { data: timesheetData, isLoading: timesheetLoading } = useListStaffTimesheets(
    { startDate, endDate },
    { query: { queryKey: ["/api/staff-timesheets", startDate, endDate], staleTime: 30_000 } },
  );
  const entries: StaffTimesheetEntry[] = timesheetData?.items ?? [];

  const createMutation  = useCreateStaffTimesheet();
  const deleteMutation  = useDeleteStaffTimesheet();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/staff-timesheets"] });
  }, [queryClient]);

  const handleAddEntry = (staffId: number, staffName: string, date: string, clockInTime: string, clockOutTime: string | null) => {
    createMutation.mutate(
      { data: { staffId, staffName, date, clockIn: clockInTime, clockOut: clockOutTime } },
      {
        onSuccess: () => { toast.success("Entry added"); invalidate(); },
        onError: () => toast.error("Failed to add entry"),
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast.success("Entry deleted"); invalidate(); },
      onError: () => toast.error("Failed to delete entry"),
    });
  };

  const visibleStaff = useMemo(() => {
    if (filterStaff === "all") return activeStaff;
    return activeStaff.filter(s => String(s.id) === filterStaff);
  }, [activeStaff, filterStaff]);

  const weekEntries = entries;

  const totalHours = useMemo(
    () => weekEntries
      .filter(e => filterStaff === "all" || String(e.staffId) === filterStaff)
      .reduce((acc, e) => acc + hoursWorked(e.clockIn, e.clockOut), 0),
    [weekEntries, filterStaff],
  );

  const currentlyIn = entries.filter(e => e.clockOut === null && e.date === today);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Timesheet</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track staff working hours, shifts, and attendance.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Entry
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium">Active Staff</p>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            {staffLoading
              ? <Skeleton className="h-7 w-10" />
              : <p className="text-2xl font-bold">{activeStaff.length}</p>
            }
            <p className="text-xs text-muted-foreground mt-0.5">{currentlyIn.length} currently clocked in</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium">Week Total Hours</p>
              <Timer className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{formatHours(totalHours) === "—" ? "0h" : formatHours(totalHours)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{filterStaff === "all" ? "all staff" : "selected staff"}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium">Entries This Week</p>
              <LogIn className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{weekEntries.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">across all staff</p>
          </div>
        </div>

        {/* Week navigation + staff filter */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[200px] text-center">{weekLabel(weekDates)}</span>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekOffset(0)}>
                Today
              </Button>
            )}
          </div>
          <Select value={filterStaff} onValueChange={setFilterStaff}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {activeStaff.map(s => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Weekly grid */}
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 w-40">Staff</TableHead>
                {weekDates.map(d => {
                  const { day, date } = formatDay(d);
                  const isToday = d === today;
                  return (
                    <TableHead key={d} className={cn("text-center min-w-[90px]", isToday && "text-primary font-semibold")}>
                      <div className="flex flex-col items-center">
                        <span className="text-xs uppercase tracking-wider">{day}</span>
                        <span className={cn("text-sm", isToday && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center")}>{date}</span>
                      </div>
                    </TableHead>
                  );
                })}
                <TableHead className="pr-5 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffLoading || timesheetLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : visibleStaff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No staff found</p>
                  </TableCell>
                </TableRow>
              ) : (
                visibleStaff.map(member => {
                  const memberEntries = weekEntries.filter(e => e.staffId === member.id);
                  const memberTotal = memberEntries.reduce((acc, e) => acc + hoursWorked(e.clockIn, e.clockOut), 0);
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="pl-5">
                        <p className="font-medium text-sm">{member.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                        {member.payRate && (
                          <p className="text-xs text-muted-foreground">${member.payRate}/hr</p>
                        )}
                      </TableCell>
                      {weekDates.map(d => {
                        const dayEntries = memberEntries.filter(e => e.date === d);
                        const isToday = d === today;
                        return (
                          <TableCell key={d} className={cn("text-center align-top py-2", isToday && "bg-primary/5")}>
                            {dayEntries.length === 0 ? (
                              <span className="text-muted-foreground/40 text-xs">·</span>
                            ) : (
                              <div className="space-y-1">
                                {dayEntries.map(entry => {
                                  const hrs = hoursWorked(entry.clockIn, entry.clockOut);
                                  const active = entry.clockOut === null;
                                  return (
                                    <div key={entry.id} className={cn(
                                      "rounded-md px-1.5 py-1 text-xs group relative",
                                      active
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                        : "bg-muted text-foreground",
                                    )}>
                                      <div className="flex items-center gap-1 justify-between">
                                        <span>
                                          {entry.clockIn}
                                          {entry.clockOut ? ` – ${entry.clockOut}` : " →"}
                                        </span>
                                        <button
                                          onClick={() => handleDelete(entry.id)}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                          title="Delete entry"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                      {hrs > 0 && <div className="text-[10px] opacity-70">{formatHours(hrs)}</div>}
                                      {active && <Badge className="text-[9px] px-1 py-0 h-3.5 bg-emerald-500 text-white border-0 mt-0.5">In</Badge>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="pr-5 text-right">
                        <p className="font-medium text-sm">
                          {memberTotal > 0 ? formatHours(memberTotal) : <span className="text-muted-foreground text-xs">—</span>}
                        </p>
                        {member.payRate && memberTotal > 0 && (
                          <p className="text-xs text-muted-foreground">
                            ${(memberTotal * parseFloat(member.payRate)).toFixed(2)}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Week pay summary */}
        {activeStaff.some(s => s.payRate) && weekEntries.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Weekly Pay Summary</h3>
            <div className="space-y-2">
              {activeStaff
                .filter(s => s.payRate)
                .map(member => {
                  const hrs = weekEntries
                    .filter(e => e.staffId === member.id)
                    .reduce((acc, e) => acc + hoursWorked(e.clockIn, e.clockOut), 0);
                  if (hrs === 0) return null;
                  const gross = hrs * parseFloat(member.payRate!);
                  return (
                    <div key={member.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{member.name}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">{formatHours(hrs)} × ${member.payRate}/hr</span>
                        <span className="font-medium">${gross.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })
                .filter(Boolean)
              }
            </div>
          </div>
        )}
      </div>

      <AddEntryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        staff={activeStaff}
        onAdd={handleAddEntry}
      />
    </AppLayout>
  );
}
