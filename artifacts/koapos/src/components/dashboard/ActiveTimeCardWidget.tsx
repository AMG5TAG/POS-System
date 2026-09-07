import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTimeCardSessions,
  useUpdateTimeCardSession,
  getListTimeCardSessionsQueryKey,
  type TimeCardSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Clock, Play, Pause, Square } from "lucide-react";
import { toast } from "sonner";
import { remainingSeconds, timeColorClass, fmtClock, TIME_CARD_STATUS_LABEL } from "@/lib/time-cards";

/* Active Time Card timers, shown directly under the dashboard Clock Bar. Lists
   one card per sold-and-not-stopped time card with a live countdown that turns
   yellow under 5 min and red under 2 min, plus Start/Pause/Stop controls. */
export function ActiveTimeCardWidget() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data } = useListTimeCardSessions(
    { active: "true" },
    { query: { queryKey: getListTimeCardSessionsQueryKey({ active: "true" }), refetchInterval: 30_000 } },
  );
  const sessions = data?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTimeCardSessionsQueryKey({ active: "true" }) });
  const updateMutation = useUpdateTimeCardSession();

  const act = async (s: TimeCardSession, action: "start" | "pause" | "stop") => {
    try {
      await updateMutation.mutateAsync({ id: s.id, data: { action } });
      invalidate();
    } catch {
      toast.error(`Couldn't ${action} the time card`);
    }
  };

  if (sessions.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">Active Time Cards</h2>
        <span className="text-xs text-muted-foreground">({sessions.length})</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sessions.map((s) => {
          const remaining = remainingSeconds(s, now);
          const expired = remaining <= 0;
          return (
            <div key={s.id} className="rounded-xl border p-3.5 flex flex-col gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{s.customerName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {s.label} · {fmtClock(s.purchasedSeconds)} purchased · {TIME_CARD_STATUS_LABEL[s.status] ?? s.status}
                </p>
              </div>
              <div className={`font-mono text-2xl font-bold tabular-nums ${timeColorClass(remaining)}`}>
                {fmtClock(remaining)}
                {expired && <span className="ml-2 text-xs font-sans font-medium align-middle">Time's up</span>}
              </div>
              <div className="flex gap-1.5">
                {s.status !== "running" ? (
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs flex-1" onClick={() => act(s, "start")}>
                    <Play className="w-3 h-3" /> {s.status === "paused" ? "Resume" : "Start"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs flex-1" onClick={() => act(s, "pause")}>
                    <Pause className="w-3 h-3" /> Pause
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs flex-1 text-destructive hover:text-destructive" onClick={() => act(s, "stop")}>
                  <Square className="w-3 h-3" /> Stop
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
