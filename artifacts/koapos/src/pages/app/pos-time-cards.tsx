import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListTimeCardSessions,
  useUpdateTimeCardSession,
  useDeleteTimeCardSession,
  getListTimeCardSessionsQueryKey,
  type TimeCardSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Play, Pause, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { remainingSeconds, timeColorClass, fmtClock, TIME_CARD_STATUS_LABEL } from "@/lib/time-cards";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ready: "secondary",
  running: "default",
  paused: "outline",
  stopped: "destructive",
};

export default function POSTimeCardsPage() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data, isLoading } = useListTimeCardSessions(
    {},
    { query: { queryKey: getListTimeCardSessionsQueryKey({}), refetchInterval: 30_000 } },
  );
  const sessions = data?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTimeCardSessionsQueryKey({}) });
  const updateMutation = useUpdateTimeCardSession();
  const deleteMutation = useDeleteTimeCardSession();

  const act = async (s: TimeCardSession, action: "start" | "pause" | "stop") => {
    try {
      await updateMutation.mutateAsync({ id: s.id, data: { action } });
      invalidate();
    } catch {
      toast.error(`Couldn't ${action} the time card`);
    }
  };

  const remove = async (s: TimeCardSession) => {
    try {
      await deleteMutation.mutateAsync({ id: s.id });
      toast.success("Time card removed");
      invalidate();
    } catch {
      toast.error("Couldn't remove the time card");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Time Cards</h1>
            <p className="text-sm text-muted-foreground">Every time card sold. Start, pause or stop a customer's timer.</p>
          </div>
        </div>

        {isLoading ? (
          <Card><CardContent className="flex items-center justify-center py-16">
            <p className="text-muted-foreground text-sm">Loading time cards…</p>
          </CardContent></Card>
        ) : sessions.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Clock className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No time cards sold yet</p><p className="text-muted-foreground text-sm">Sell a time card at the POS to start a timer.</p></div>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Customer</th>
                  <th className="text-left p-3 font-medium">Time Card</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Remaining</th>
                  <th className="p-3 text-right font-medium">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map((s) => {
                  const remaining = remainingSeconds(s, now);
                  const live = s.status === "running" || s.status === "paused" || s.status === "ready";
                  return (
                    <tr key={s.id} className="bg-background hover:bg-muted/20">
                      <td className="p-3 font-medium">{s.customerName}</td>
                      <td className="p-3 text-muted-foreground">{s.label}</td>
                      <td className="p-3">
                        <Badge variant={STATUS_VARIANT[s.status] ?? "secondary"}>{TIME_CARD_STATUS_LABEL[s.status] ?? s.status}</Badge>
                      </td>
                      <td className={`p-3 text-right font-mono font-semibold tabular-nums ${live ? timeColorClass(remaining) : "text-muted-foreground"}`}>
                        {fmtClock(remaining)}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {s.status !== "stopped" && s.status !== "running" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Start" onClick={() => act(s, "start")}><Play className="w-3.5 h-3.5" /></Button>
                          )}
                          {s.status === "running" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Pause" onClick={() => act(s, "pause")}><Pause className="w-3.5 h-3.5" /></Button>
                          )}
                          {s.status !== "stopped" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Stop" onClick={() => act(s, "stop")}><Square className="w-3.5 h-3.5" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Remove" onClick={() => remove(s)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
