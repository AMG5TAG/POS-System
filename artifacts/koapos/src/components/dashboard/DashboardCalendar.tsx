import { useState } from "react";
import type { ReactNode } from "react";
import { useGetDashboardCalendar, CalendarDay, CalendarAppointment, CalendarBirthday } from "@workspace/api-client-react";
import { useAuth } from "@/lib/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ShoppingCart, Wrench, FileText, CalendarDays, Cake, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EVENT_COLORS = {
  publicHoliday: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700",
  sales:         "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700",
  serviceJobs:   "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700",
  invoices:      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700",
  appointments:  "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/50 dark:text-violet-300 dark:border-violet-700",
  birthdays:     "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/50 dark:text-pink-300 dark:border-pink-700",
};

interface SelectedDay {
  day: CalendarDay;
  type: "appointments" | "birthday";
  appointmentIndex?: number;
  birthday?: CalendarBirthday;
}

function DayAppointmentsDialog({
  appts,
  timezone,
  onSelect,
  onClose,
}: {
  appts: CalendarAppointment[];
  timezone: string;
  onSelect: (a: CalendarAppointment) => void;
  onClose: () => void;
}) {
  const sorted = [...appts].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appointments ({appts.length})</DialogTitle>
          <DialogDescription>All appointments for this day — click one to view details</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2 max-h-80 overflow-y-auto">
          {sorted.map((appt) => {
            const time = new Date(appt.scheduledAt).toLocaleTimeString("en-AU", {
              hour: "2-digit", minute: "2-digit", timeZone: timezone,
            });
            const statusColor =
              appt.status === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
              appt.status === "cancelled" ? "bg-red-100 text-red-700 border-red-200" :
              "bg-violet-100 text-violet-700 border-violet-200";
            return (
              <button
                key={appt.id}
                onClick={() => { onClose(); onSelect(appt); }}
                className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold">{time}</span>
                    {appt.customerName && (
                      <span className="text-sm text-muted-foreground truncate">— {appt.customerName}</span>
                    )}
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium shrink-0", statusColor)}>
                    {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                  </span>
                </div>
                {appt.title && (
                  <p className="text-xs text-muted-foreground mt-1 pl-5">{appt.title}</p>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentDialog({ appt, timezone, onClose }: { appt: CalendarAppointment; timezone: string; onClose: () => void }) {
  const time = new Date(appt.scheduledAt).toLocaleTimeString("en-AU", {
    hour: "2-digit", minute: "2-digit", timeZone: timezone,
  });
  const statusColor = appt.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                      appt.status === "cancelled" ? "bg-red-100 text-red-700" :
                      "bg-violet-100 text-violet-700";
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{appt.title}</DialogTitle>
          <DialogDescription>Appointment details</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{time} · {appt.durationMinutes} mins</span>
          </div>
          {appt.customerName && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{appt.customerName}</span>
            </div>
          )}
          {appt.notes && (
            <p className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3">{appt.notes}</p>
          )}
          <Badge className={cn("text-xs border", statusColor)}>
            {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
          </Badge>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BirthdayDialog({ birthday, onClose }: { birthday: CalendarBirthday; onClose: () => void }) {
  const fullName = [birthday.firstName, birthday.lastName].filter(Boolean).join(" ");
  const subject = encodeURIComponent(`Happy Birthday ${birthday.firstName}!`);
  const body = encodeURIComponent(
    `Hi ${birthday.firstName},\n\nWishing you a wonderful birthday from all of us here at the store!\n\nEnjoy your special day! 🎂\n\nWarm regards`
  );
  const mailtoLink = birthday.email ? `mailto:${birthday.email}?subject=${subject}&body=${body}` : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🎂 Birthday — {fullName}</DialogTitle>
          <DialogDescription>Send a birthday message to this customer</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {birthday.phone && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Phone: </span>{birthday.phone}
            </div>
          )}
          {birthday.email && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Email: </span>{birthday.email}
            </div>
          )}
          <div className="flex flex-col gap-2 pt-2">
            {mailtoLink && (
              <a href={mailtoLink}>
                <Button className="w-full">Send Birthday Email</Button>
              </a>
            )}
            {birthday.phone && (
              <a href={`sms:${birthday.phone}`}>
                <Button variant="outline" className="w-full">Send SMS</Button>
              </a>
            )}
            {!mailtoLink && !birthday.phone && (
              <p className="text-sm text-muted-foreground">No contact info available for this customer.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DayCell({
  day,
  isCurrentMonth,
  isToday,
  isPast,
  onAppointmentClick,
  onBirthdayClick,
}: {
  day: CalendarDay | null;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  onAppointmentClick: (first: CalendarAppointment, all: CalendarAppointment[]) => void;
  onBirthdayClick: (b: CalendarBirthday) => void;
}) {
  if (!day) {
    return <div className="min-h-[160px] bg-muted/20 dark:bg-muted/40 rounded-lg border border-border/40 dark:border-border/70" />;
  }

  const dayNum = parseInt(day.date.split("-")[2], 10);
  const hasEvents = day.publicHoliday || day.sales > 0 || day.serviceJobs > 0 ||
    day.invoices > 0 || day.appointments.length > 0 || day.customerBirthdays.length > 0;

  const apptCount = day.appointments.length;
  const bdayCount = day.customerBirthdays.length;

  // Build left column (sales, serviceJobs) and right column (invoices, appointments, birthdays)
  // max 3 rows total displayed in a 2-col grid
  const leftItems: ReactNode[] = [];
  const rightItems: ReactNode[] = [];

  if (day.sales > 0) leftItems.push(
    <div key="sales" className={cn("text-[10px] px-1 py-0.5 rounded border flex items-center gap-0.5 truncate", EVENT_COLORS.sales)}>
      <ShoppingCart className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{day.sales}</span>
    </div>
  );
  if (day.serviceJobs > 0) leftItems.push(
    <div key="svc" className={cn("text-[10px] px-1 py-0.5 rounded border flex items-center gap-0.5 truncate", EVENT_COLORS.serviceJobs)}>
      <Wrench className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{day.serviceJobs}</span>
    </div>
  );
  if (bdayCount > 0) leftItems.push(
    <button key="bday" onClick={() => onBirthdayClick(day.customerBirthdays[0])}
      className={cn("text-[10px] px-1 py-0.5 rounded border flex items-center gap-0.5 truncate text-left w-full hover:opacity-80 transition-opacity", EVENT_COLORS.birthdays)}
    >
      <Cake className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{bdayCount}</span>
    </button>
  );

  if (day.invoices > 0) rightItems.push(
    <div key="inv" className={cn("text-[10px] px-1 py-0.5 rounded border flex items-center gap-0.5 truncate", EVENT_COLORS.invoices)}>
      <FileText className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{day.invoices}</span>
    </div>
  );
  if (apptCount > 0) rightItems.push(
    <button key="appt" onClick={() => onAppointmentClick(day.appointments[0], day.appointments)}
      className={cn("text-[10px] px-1 py-0.5 rounded border flex items-center gap-0.5 truncate text-left w-full hover:opacity-80 transition-opacity", EVENT_COLORS.appointments)}
    >
      <CalendarDays className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{apptCount}</span>
    </button>
  );

  const maxRows = 3;
  const leftSlots  = leftItems.slice(0, maxRows);
  const rightSlots = rightItems.slice(0, maxRows);

  return (
    <div className={cn(
      "min-h-[120px] rounded-lg border p-1.5 flex flex-col gap-1 transition-colors",
      isCurrentMonth && !isPast ? "bg-card" : "bg-muted/30 dark:bg-muted/20 opacity-60",
      isToday ? "border-primary ring-1 ring-primary/30 opacity-100" : "border-border/60 dark:border-border",
    )}>
      <div className={cn(
        "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full shrink-0 self-start",
        isToday ? "bg-primary text-primary-foreground" :
        isPast && isCurrentMonth ? "text-muted-foreground/60 line-through" : "text-foreground"
      )}>
        {dayNum}
      </div>

      {!hasEvents && <div className="flex-1" />}

      {day.publicHoliday && (
        <div className={cn("text-[10px] px-1 py-0.5 rounded border truncate font-medium col-span-2", EVENT_COLORS.publicHoliday)}>
          🇦🇺 {day.publicHoliday}
        </div>
      )}

      {(leftSlots.length > 0 || rightSlots.length > 0) && (
        <div className="grid grid-cols-2 gap-0.5">
          <div className="flex flex-col gap-0.5">{leftSlots}</div>
          <div className="flex flex-col gap-0.5">{rightSlots}</div>
        </div>
      )}
    </div>
  );
}

export function DashboardCalendar() {
  const { user } = useAuth();
  const tz = user?.timezone ?? "Australia/Sydney";
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
  const [selectedDayAppts, setSelectedDayAppts] = useState<CalendarAppointment[] | null>(null);
  const [selectedBirthday, setSelectedBirthday] = useState<CalendarBirthday | null>(null);

  const handleAppointmentClick = (first: CalendarAppointment, all: CalendarAppointment[]) => {
    if (all.length > 1) {
      setSelectedDayAppts(all);
    } else {
      setSelectedAppt(first);
    }
  };

  const { data, isLoading } = useGetDashboardCalendar(
    { year, month },
    { query: { queryKey: ["calendar", year, month] } }
  );

  const monthName = new Date(year, month - 1, 1).toLocaleString("en-AU", { month: "long", year: "numeric" });

  const goToPrev = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const goToNext = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const goToToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); };

  // Build grid: Monday-start weeks
  const firstDay = new Date(year, month - 1, 1);
  // getDay() 0=Sun, 1=Mon... we want Mon=0
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

  const dayMap = new Map<string, CalendarDay>(
    (data?.days ?? []).map((d) => [d.date, d])
  );

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: (CalendarDay | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayIndex = i - startPad + 1;
    if (dayIndex < 1 || dayIndex > daysInMonth) {
      cells.push(null);
    } else {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(dayIndex).padStart(2, "0")}`;
      cells.push(dayMap.get(key) ?? null);
    }
  }

  // Legend
  const legend = [
    { color: EVENT_COLORS.publicHoliday, label: "Public Holiday" },
    { color: EVENT_COLORS.sales,         label: "Sales" },
    { color: EVENT_COLORS.serviceJobs,   label: "Service Jobs" },
    { color: EVENT_COLORS.invoices,      label: "Invoices" },
    { color: EVENT_COLORS.appointments,  label: "Appointments" },
    { color: EVENT_COLORS.birthdays,     label: "Birthdays" },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="text-lg">Calendar</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrev}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold min-w-[140px] text-center">{monthName}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNext}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {legend.map((l) => (
              <div key={l.label} className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", l.color)}>
                {l.label}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">Loading calendar...</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="text-[11px] font-semibold text-muted-foreground text-center py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((day, i) => (
                    <DayCell
                      key={i}
                      day={day}
                      isCurrentMonth={day !== null}
                      isToday={day?.date === todayStr}
                      isPast={day !== null && day.date < todayStr}
                      onAppointmentClick={handleAppointmentClick}
                      onBirthdayClick={setSelectedBirthday}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAppt && (
        <AppointmentDialog appt={selectedAppt} timezone={tz} onClose={() => setSelectedAppt(null)} />
      )}
      {selectedDayAppts && (
        <DayAppointmentsDialog
          appts={selectedDayAppts}
          timezone={tz}
          onSelect={setSelectedAppt}
          onClose={() => setSelectedDayAppts(null)}
        />
      )}
      {selectedBirthday && (
        <BirthdayDialog birthday={selectedBirthday} onClose={() => setSelectedBirthday(null)} />
      )}
    </>
  );
}
