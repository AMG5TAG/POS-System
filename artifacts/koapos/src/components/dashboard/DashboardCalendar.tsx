import { useState } from "react";
import { useGetDashboardCalendar, CalendarDay, CalendarAppointment, CalendarBirthday } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ShoppingCart, Wrench, FileText, CalendarDays, Cake, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EVENT_COLORS = {
  publicHoliday: "bg-red-100 text-red-700 border-red-200",
  sales:         "bg-emerald-100 text-emerald-700 border-emerald-200",
  serviceJobs:   "bg-blue-100 text-blue-700 border-blue-200",
  invoices:      "bg-amber-100 text-amber-700 border-amber-200",
  appointments:  "bg-violet-100 text-violet-700 border-violet-200",
  birthdays:     "bg-pink-100 text-pink-700 border-pink-200",
};

interface SelectedDay {
  day: CalendarDay;
  type: "appointments" | "birthday";
  appointmentIndex?: number;
  birthday?: CalendarBirthday;
}

function AppointmentDialog({ appt, onClose }: { appt: CalendarAppointment; onClose: () => void }) {
  const time = new Date(appt.scheduledAt).toLocaleTimeString("en-AU", {
    hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney"
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
  onAppointmentClick: (appt: CalendarAppointment) => void;
  onBirthdayClick: (b: CalendarBirthday) => void;
}) {
  if (!day) {
    return <div className="min-h-[110px] bg-muted/20 rounded-lg" />;
  }

  const dayNum = parseInt(day.date.split("-")[2], 10);
  const hasEvents = day.publicHoliday || day.sales > 0 || day.serviceJobs > 0 ||
    day.invoices > 0 || day.appointments.length > 0 || day.customerBirthdays.length > 0;

  return (
    <div className={cn(
      "min-h-[110px] rounded-lg border p-1.5 flex flex-col gap-1 transition-colors",
      isCurrentMonth && !isPast ? "bg-card" : "bg-muted/30 opacity-60",
      isToday ? "border-primary ring-1 ring-primary/30 opacity-100" : "border-border/60",
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
        <div className={cn("text-[10px] px-1.5 py-0.5 rounded border truncate font-medium", EVENT_COLORS.publicHoliday)}>
          🇦🇺 {day.publicHoliday}
        </div>
      )}

      {day.sales > 0 && (
        <div className={cn("text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1", EVENT_COLORS.sales)}>
          <ShoppingCart className="w-2.5 h-2.5 shrink-0" />
          {day.sales}
        </div>
      )}

      {day.serviceJobs > 0 && (
        <div className={cn("text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1", EVENT_COLORS.serviceJobs)}>
          <Wrench className="w-2.5 h-2.5 shrink-0" />
          {day.serviceJobs}
        </div>
      )}

      {day.invoices > 0 && (
        <div className={cn("text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1", EVENT_COLORS.invoices)}>
          <FileText className="w-2.5 h-2.5 shrink-0" />
          {day.invoices}
        </div>
      )}

      {day.appointments.map((appt) => (
        <button
          key={appt.id}
          onClick={() => onAppointmentClick(appt)}
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 text-left w-full hover:opacity-80 transition-opacity",
            EVENT_COLORS.appointments
          )}
        >
          <CalendarDays className="w-2.5 h-2.5 shrink-0" />
          1
        </button>
      ))}

      {day.customerBirthdays.map((b) => (
        <button
          key={b.id}
          onClick={() => onBirthdayClick(b)}
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 text-left w-full hover:opacity-80 transition-opacity",
            EVENT_COLORS.birthdays
          )}
        >
          <Cake className="w-2.5 h-2.5 shrink-0" />
          1
        </button>
      ))}
    </div>
  );
}

export function DashboardCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
  const [selectedBirthday, setSelectedBirthday] = useState<CalendarBirthday | null>(null);

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
                      onAppointmentClick={setSelectedAppt}
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
        <AppointmentDialog appt={selectedAppt} onClose={() => setSelectedAppt(null)} />
      )}
      {selectedBirthday && (
        <BirthdayDialog birthday={selectedBirthday} onClose={() => setSelectedBirthday(null)} />
      )}
    </>
  );
}
