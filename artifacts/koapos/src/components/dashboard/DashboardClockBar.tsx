import { useState, useEffect } from "react";
import { useAuth } from "@/lib/use-auth";
import { useBusinessProfile } from "@/lib/business-profile";
import { Settings2 } from "lucide-react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "09:00" / "9:00" → minutes since midnight (null if blank/invalid). */
function hmToMinutes(s: string | undefined | null): number | null {
  if (!s) return null;
  const [h, m] = String(s).split(":").map((x) => parseInt(x, 10));
  if (isNaN(h)) return null;
  return h * 60 + (isNaN(m) ? 0 : m);
}

/** "09:00" → "9:00 AM". */
function formatHM(s: string) {
  const mins = hmToMinutes(s);
  if (mins == null) return s;
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

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

function minutesInTz(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric", minute: "2-digit", hour12: false, timeZone: tz,
  }).formatToParts(d);
  const get = (type: string) => parseInt(parts.find(x => x.type === type)?.value ?? "0");
  return get("hour") * 60 + get("minute");
}

/* Clock colour by trading state: green while open, amber within 15 minutes
 * either side of opening / closing, red when closed (or closed all day). */
const EDGE_MIN = 15;
function clockStateAt(total: number, openMin: number | null, closeMin: number | null): "open" | "edge" | "closed" {
  if (openMin == null || closeMin == null) return "closed";
  if (Math.abs(total - openMin) <= EDGE_MIN || Math.abs(total - closeMin) <= EDGE_MIN) return "edge";
  if (total > openMin && total < closeMin) return "open";
  return "closed";
}

export function DashboardClockBar({
  onCustomize,
}: {
  onCustomize?: () => void;
}) {
  const { user } = useAuth();
  const { profile } = useBusinessProfile();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tz = user?.timezone ?? "Australia/Sydney";
  const { hours, minutes, seconds, ampm } = getTimeInTz(now, tz);
  const { day, date } = getDateInTz(now, tz);

  // Today's trading hours come from Business Details (Themes/Business profile).
  // `day` is the weekday name (e.g. "Monday") which matches the openingHours keys.
  const todayHours = profile.openingHours?.[day];
  const openMin  = todayHours?.enabled ? hmToMinutes(todayHours.open)  : null;
  const closeMin = todayHours?.enabled ? hmToMinutes(todayHours.close) : null;
  const total = minutesInTz(now, tz);
  const open = openMin != null && closeMin != null && total >= openMin && total < closeMin;
  const clockState = clockStateAt(total, openMin, closeMin);
  const clockColor = clockState === "open" ? "text-emerald-500" : clockState === "edge" ? "text-amber-500" : "text-rose-500";
  const hoursLabel = todayHours?.enabled && todayHours.open && todayHours.close
    ? `${formatHM(todayHours.open)} – ${formatHM(todayHours.close)}`
    : null;

  const displayName = user?.ownerName || user?.businessName || "there";

  return (
    <div className="rounded-2xl border bg-card px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
      <div className="flex items-center gap-5">
        <div className={`flex items-baseline gap-0.5 shrink-0 ${clockColor}`}>
          <span className="text-4xl font-bold tabular-nums tracking-tight leading-none">
            {hours}
          </span>
          <span className="text-4xl font-bold opacity-50 leading-none animate-pulse">:</span>
          <span className="text-4xl font-bold tabular-nums tracking-tight leading-none">
            {minutes}
          </span>
          <span className="text-4xl font-bold opacity-50 leading-none animate-pulse">:</span>
          <span className="text-4xl font-bold tabular-nums tracking-tight leading-none">
            {seconds}
          </span>
          <span className="ml-1.5 text-sm font-semibold opacity-70 self-end pb-0.5">{ampm}</span>
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
          {hoursLabel ? `${open ? "Open" : "Closed"}: ${hoursLabel}` : "Closed today"}
        </p>
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto">
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
