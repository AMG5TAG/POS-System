import { useState, useEffect } from "react";
import { useAuth } from "@/lib/use-auth";
import { Settings2 } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const OPEN_HOUR = 9;
const OPEN_MIN = 0;
const CLOSE_HOUR = 17;
const CLOSE_MIN = 0;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return { hours: pad(h), minutes: pad(m), seconds: pad(s), ampm };
}

function formatDate(d: Date) {
  const day = DAYS[d.getDay()];
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return { day, date };
}

function isOpen(d: Date) {
  const totalMinutes = d.getHours() * 60 + d.getMinutes();
  const openAt = OPEN_HOUR * 60 + OPEN_MIN;
  const closeAt = CLOSE_HOUR * 60 + CLOSE_MIN;
  return totalMinutes >= openAt && totalMinutes < closeAt;
}

function formatHour(h: number, m: number) {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

const openLabel = `${formatHour(OPEN_HOUR, OPEN_MIN)} – ${formatHour(CLOSE_HOUR, CLOSE_MIN)}`;

export function DashboardClockBar({ onCustomize }: { onCustomize?: () => void }) {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { hours, minutes, seconds, ampm } = formatTime(now);
  const { day, date } = formatDate(now);
  const open = isOpen(now);

  const displayName = user?.ownerName || user?.businessName || "there";

  return (
    <div className="rounded-2xl border bg-card px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
      {/* Top row on mobile: clock + date */}
      <div className="flex items-center gap-5">
        {/* Live clock */}
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

        {/* Day + date */}
        <div className="shrink-0 border-l pl-5">
          <p className="text-sm font-bold text-foreground leading-tight">{day}</p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
      </div>

      {/* Welcome + hours — full width on mobile */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          Welcome, <span className="font-semibold">{displayName}</span>
        </p>
        <p className={`text-xs font-medium mt-0.5 ${open ? "text-emerald-600" : "text-rose-500"}`}>
          {open ? "Open" : "Closed"}: {openLabel}
        </p>
      </div>

      {/* Customise button */}
      <button
        onClick={onCustomize}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors self-start sm:self-auto"
        title="Customise dashboard"
      >
        <Settings2 className="w-4 h-4" />
      </button>
    </div>
  );
}
