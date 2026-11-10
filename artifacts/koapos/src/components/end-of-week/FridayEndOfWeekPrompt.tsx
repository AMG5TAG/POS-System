import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarRange } from "lucide-react";
import { useAuth } from "@/lib/use-auth";

/* On a Friday, opening a register asks for End of Week — the Fri → Thu week
   that finished yesterday. Shown once per device per day, and not at all once
   that week is finalised. Managers and owners get a button straight to it;
   anyone else is asked to let a manager know (the report is manager-only).
   "Friday" is the shop's own day, from GET /end-of-week/status. */

const EOW_PATH = "/management/marketing-reports/end-of-week";
const FRIDAY = 5;

interface Status { today: string; weekday: number; startDate: string; endDate: string; status: string }

function seenKey(today: string): string {
  return `kk-eow-prompted-${today}`;
}

const fmt = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

/**
 * Bump `trigger` each time a register is opened. `blocked` holds the prompt
 * back while another dialog from the same action is still up (the float slip).
 */
export function FridayEndOfWeekPrompt({ trigger, blocked = false }: { trigger: number; blocked?: boolean }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const canRun = user?.staffRole === "owner" || user?.staffRole === "manager" || !user?.staffRole;

  useEffect(() => { if (trigger > 0) setPending(true); }, [trigger]);

  useEffect(() => {
    if (!pending || blocked) return;
    setPending(false);
    let live = true;
    fetch("/api/end-of-week/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => {
        if (!live || !s || s.weekday !== FRIDAY || s.status === "finalised") return;
        try { if (localStorage.getItem(seenKey(s.today))) return; } catch { /* still prompt */ }
        setStatus(s);
      })
      .catch(() => { /* a missed prompt is not worth an error */ });
    return () => { live = false; };
  }, [pending, blocked]);

  const close = () => {
    if (status) { try { localStorage.setItem(seenKey(status.today), "1"); } catch { /* fine */ } }
    setStatus(null);
  };

  return (
    <Dialog open={!!status} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarRange className="w-5 h-5 text-primary" />It's Friday — time for End of Week</DialogTitle>
          <DialogDescription>
            Last week ({status ? `${fmt(status.startDate)} – ${fmt(status.endDate)}` : ""}) has finished
            {status?.status === "draft" ? " and has been started but not finalised" : " and hasn't been done yet"}.
            {canRun
              ? " Bank the takings, check staff costs and see how the week did against budget."
              : " Please let a manager know so they can run it."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close}>{canRun ? "Later" : "OK"}</Button>
          {canRun && (
            <Button onClick={() => { close(); navigate(EOW_PATH); }}>
              <CalendarRange className="w-4 h-4 mr-2" />Run End of Week
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
