import { useState } from "react";
import {
  useListServiceJobTime,
  useServiceJobTimeAction,
  useDeleteServiceJobTime,
  useListStaff,
  getListServiceJobTimeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Play, Square, Plus, Trash2, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

function fmtMins(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

/** Technician time logged against a job: start/stop timer, manual entries, total. */
export function ServiceJobTimePanel({ jobId }: { jobId: number }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useListServiceJobTime(jobId, {
    query: { queryKey: getListServiceJobTimeQueryKey(jobId), refetchInterval: 60000 },
  });
  const act = useServiceJobTimeAction();
  const del = useDeleteServiceJobTime();
  const { data: staff } = useListStaff();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListServiceJobTimeQueryKey(jobId) });

  const [staffId, setStaffId] = useState("");
  const [manualMins, setManualMins] = useState("");

  const entries = data?.entries ?? [];
  const totalMinutes = data?.totalMinutes ?? 0;
  const running = data?.running ?? null;
  const staffList = staff ?? [];

  const run = async (body: Record<string, unknown>) => {
    try { await act.mutateAsync({ jobId, data: body as never }); invalidate(); }
    catch { toast.error("Couldn't update time"); }
  };

  const start = () => run({ action: "start", staffId: staffId ? Number(staffId) : undefined });
  const stop  = () => run({ action: "stop" });
  const addManual = async () => {
    const mins = Math.round(parseFloat(manualMins) || 0);
    if (mins <= 0) { toast.error("Enter minutes"); return; }
    await run({ action: "manual", minutes: mins, staffId: staffId ? Number(staffId) : undefined });
    setManualMins("");
  };
  const remove = async (entryId: number) => {
    try { await del.mutateAsync({ jobId, entryId }); invalidate(); }
    catch { toast.error("Couldn't delete entry"); }
  };

  if (isLoading) return <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (isError) return (
    <div className="py-4 text-center text-sm text-muted-foreground">
      Couldn't load time. <button className="text-primary underline" onClick={() => refetch()}>Retry</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold">{fmtMins(totalMinutes)}</span>
          <span className="text-muted-foreground text-xs">logged</span>
        </div>
        {running ? (
          <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={stop} disabled={act.isPending}>
            <Square className="w-3.5 h-3.5" /> Stop timer
          </Button>
        ) : (
          <Button size="sm" className="h-8 gap-1.5" onClick={start} disabled={act.isPending}>
            <Play className="w-3.5 h-3.5" /> Start timer
          </Button>
        )}
      </div>

      {/* Who + manual entry */}
      <div className="flex gap-2">
        <Select value={staffId || "__none__"} onValueChange={(v) => setStaffId(v === "__none__" ? "" : v)}>
          <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Technician (optional)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unassigned</SelectItem>
            {staffList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="number" min={0} className="h-8 w-24 text-xs" placeholder="Mins" value={manualMins} onChange={(e) => setManualMins(e.target.value)} />
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={addManual} disabled={act.isPending}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="rounded-lg border divide-y">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <span className="flex-1 min-w-0 truncate">
                {e.staffName ?? "Unassigned"}
                {e.note ? <span className="text-muted-foreground"> · {e.note}</span> : ""}
              </span>
              {e.running && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 animate-pulse">running</span>}
              <span className="tabular-nums text-muted-foreground">{fmtMins(e.durationMinutes)}</span>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove(e.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
