import type { TimeCardSession } from "@workspace/api-client-react";

/* Seconds elapsed for a session, including live time while it's running. */
export function elapsedSeconds(s: TimeCardSession, nowMs: number): number {
  const base = s.elapsedSeconds ?? 0;
  if (s.status === "running" && s.runningSince) {
    return base + Math.max(0, Math.round((nowMs - Date.parse(s.runningSince)) / 1000));
  }
  return base;
}

/* Seconds remaining (can go negative once the time is used up / overtime). */
export function remainingSeconds(s: TimeCardSession, nowMs: number): number {
  return (s.purchasedSeconds ?? 0) - elapsedSeconds(s, nowMs);
}

export type TimeColor = "normal" | "warning" | "danger";

/* Yellow under 5 minutes left, red under 2 minutes (or expired). */
export function timeColor(remaining: number): TimeColor {
  if (remaining < 120) return "danger";
  if (remaining < 300) return "warning";
  return "normal";
}

/* Tailwind text-colour class for a given remaining time. */
export function timeColorClass(remaining: number): string {
  const c = timeColor(remaining);
  return c === "danger" ? "text-red-600" : c === "warning" ? "text-yellow-500" : "text-foreground";
}

/* Format a signed second count as H:MM:SS (or -H:MM:SS once overtime). */
export function fmtClock(totalSeconds: number): string {
  const neg = totalSeconds < 0;
  const t = Math.abs(Math.trunc(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return `${neg ? "-" : ""}${h > 0 ? `${h}:${mm}` : mm}:${ss}`;
}

export const TIME_CARD_STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
};
