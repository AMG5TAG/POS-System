import { useState, useEffect } from "react";
import { useAuth } from "@/lib/use-auth";
import { Settings2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const OPEN_HOUR  = 9;
const OPEN_MIN   = 0;
const CLOSE_HOUR = 17;
const CLOSE_MIN  = 0;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatHour(h: number, m: number) {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

const openLabel = `${formatHour(OPEN_HOUR, OPEN_MIN)} – ${formatHour(CLOSE_HOUR, CLOSE_MIN)}`;

function getTimeInTz(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true, timeZone: tz,
  }).formatToParts(d);
  const get = (type: string) => parts.find(x => x.type === type)?.value ?? "00";
  return { hours: get("hour"), minutes: get("minute"), seconds: get("second"), ampm: get("dayPeriod").toUpperCase() };
}

function getDateInTz(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz,
  }).formatToParts(d);
  const get = (type: string) => parts.find(x => x.type === type)?.value ?? "";
  return { day: get("weekday"), date: `${get("day")}/${get("month")}/${get("year")}` };
}

function isOpenInTz(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric", minute: "2-digit", hour12: false, timeZone: tz,
  }).formatToParts(d);
  const get = (type: string) => parseInt(parts.find(x => x.type === type)?.value ?? "0");
  const total = get("hour") * 60 + get("minute");
  return total >= OPEN_HOUR * 60 + OPEN_MIN && total < CLOSE_HOUR * 60 + CLOSE_MIN;
}

export function DashboardClockBar({
  onCustomize,
  onCloseDay,
}: {
  onCustomize?: () => void;
  onCloseDay?: () => void;
}) {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tz = user?.timezone ?? "Australia/Sydney";
  const { hours, minutes, seconds, ampm } = getTimeInTz(now, tz);
  const { day, date } = getDateInTz(now, tz);
  const open = isOpenInTz(now, tz);

  const displayName = user?.ownerName || user?.businessName || "there";
  const canCloseDay = user?.staffRole !== "cashier";

  return (
    <div className="rounded-2xl border bg-card px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
      <div className="flex items-center gap-5">
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-4xl font-bold tabular-nums tracking-tight text-primary leading-none">
            {hours}
          </span>
          <span className="text-4xl font-bold text-primary/50 leading-none animate-pulse">:</span>
          <span className="text-4xl font-bold tabular-nums tracking-tight text-primary leading-none">
            {minutes}
          </span>
          <span className="text-4xl font-bold text-primary/50 leading-none animate-pulse">:</span>
          <span className="text-4xl font-bold tabular-nums tracking-tight text-primary leading-none">
            {seconds}
          </span>
          <span className="ml-1.5 text-sm font-semibold text-primary/70 self-end pb-0.5">{ampm}</span>
        </div>

        <div className="shrink-0 border-l pl-5">
          <p className="text-sm font-bold text-foreground leading-tight">{day}</p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          Welcome, <span className="font-semibold">{displayName}</span>
        </p>
        <p className={`text-xs font-medium mt-0.5 ${open ? "text-emerald-600" : "text-rose-500"}`}>
          {open ? "Open" : "Closed"}: {openLabel}
        </p>
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto">
        {canCloseDay && onCloseDay && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCloseDay}
            className="gap-1.5 text-xs h-8"
          >
            <LogOut className="w-3.5 h-3.5" />
            Close Day
          </Button>
        )}

        <button
          onClick={onCustomize}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Customise dashboard"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
