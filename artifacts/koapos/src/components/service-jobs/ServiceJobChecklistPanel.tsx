import { useState } from "react";
import {
  useListServiceJobChecklist,
  useAddServiceJobChecklistItems,
  useUpdateServiceJobChecklistItem,
  useDeleteServiceJobChecklistItem,
  getListServiceJobChecklistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, X, MinusCircle, Circle, Trash2, Plus, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";

type Result = "pending" | "pass" | "fail" | "na";

/* Built-in diagnostic/QC templates by device family. Front-desk/techs can apply
   one with a click, then tick each check. Matched loosely to the job's device type. */
const TEMPLATES: { match: RegExp; label: string; items: string[] }[] = [
  {
    match: /phone|smart|mobile|iphone|android/i,
    label: "Phone",
    items: ["Powers on", "Screen / touch", "Front + rear cameras", "Speakers & mic", "Charging port", "Buttons (vol/power)", "Wi-Fi & mobile signal", "Battery health", "Water-damage indicator", "Face/Touch ID"],
  },
  {
    match: /laptop|notebook|macbook/i,
    label: "Laptop",
    items: ["Powers on / boots", "Screen (no dead pixels)", "Keyboard & trackpad", "Battery health", "Charging / adapter", "USB / ports", "Wi-Fi & Bluetooth", "Webcam & audio", "Fans / overheating"],
  },
  {
    match: /tablet|ipad/i,
    label: "Tablet",
    items: ["Powers on", "Screen / touch", "Cameras", "Charging port", "Speakers & mic", "Wi-Fi", "Battery health", "Buttons"],
  },
  {
    match: /desktop|pc|aio|all.?in.?one/i,
    label: "Desktop / PC",
    items: ["Powers on / POSTs", "Boots to OS", "Display output", "All ports", "Network", "Audio", "Fans / temps", "Storage health (SMART)"],
  },
  {
    match: /console|playstation|xbox|nintendo/i,
    label: "Console",
    items: ["Powers on", "Video output", "Disc drive", "Controllers pair", "Network", "Overheating / fan noise", "Ports"],
  },
];

const GENERIC = ["Powers on", "Physical condition noted", "Customer fault confirmed", "Accessories logged"];

const RESULT_META: Record<Result, { icon: typeof Circle; color: string; ring: string }> = {
  pending: { icon: Circle,      color: "text-muted-foreground", ring: "" },
  pass:    { icon: Check,       color: "text-emerald-600", ring: "bg-emerald-50 dark:bg-emerald-950/30" },
  fail:    { icon: X,           color: "text-red-600",     ring: "bg-red-50 dark:bg-red-950/30" },
  na:      { icon: MinusCircle, color: "text-muted-foreground", ring: "" },
};

const CYCLE: Record<Result, Result> = { pending: "pass", pass: "fail", fail: "na", na: "pending" };

/** Per-job diagnostic / QC checklist. */
export function ServiceJobChecklistPanel({ jobId, deviceType }: { jobId: number; deviceType?: string | null }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useListServiceJobChecklist(jobId, {
    query: { queryKey: getListServiceJobChecklistQueryKey(jobId) },
  });
  const add    = useAddServiceJobChecklistItems();
  const update = useUpdateServiceJobChecklistItem();
  const remove = useDeleteServiceJobChecklistItem();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListServiceJobChecklistQueryKey(jobId) });

  const [newLabel, setNewLabel] = useState("");

  const items = data?.items ?? [];
  const suggested = TEMPLATES.find((t) => deviceType && t.match.test(deviceType)) ?? null;

  const applyTemplate = async (labels: string[]) => {
    try {
      await add.mutateAsync({ jobId, data: { items: labels.map((label) => ({ label })) } as never });
      invalidate();
    } catch { toast.error("Couldn't apply template"); }
  };

  const addOne = async () => {
    if (!newLabel.trim()) return;
    try {
      await add.mutateAsync({ jobId, data: { label: newLabel.trim() } as never });
      invalidate(); setNewLabel("");
    } catch { toast.error("Couldn't add check"); }
  };

  const cycleResult = async (id: number, current: Result) => {
    try { await update.mutateAsync({ jobId, itemId: id, data: { result: CYCLE[current] } as never }); invalidate(); }
    catch { toast.error("Couldn't update check"); }
  };

  const setNote = async (id: number, note: string) => {
    try { await update.mutateAsync({ jobId, itemId: id, data: { note } as never }); invalidate(); }
    catch { toast.error("Couldn't save note"); }
  };

  const del = async (id: number) => {
    try { await remove.mutateAsync({ jobId, itemId: id }); invalidate(); }
    catch { toast.error("Couldn't delete check"); }
  };

  if (isLoading) return <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (isError) return (
    <div className="py-4 text-center text-sm text-muted-foreground">
      Couldn't load checklist. <button className="text-primary underline" onClick={() => refetch()}>Retry</button>
    </div>
  );

  const passed = items.filter((i) => i.result === "pass").length;
  const failed = items.filter((i) => i.result === "fail").length;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">No checks yet. Apply a template:</p>
          <div className="flex flex-wrap gap-2">
            {suggested && (
              <Button size="sm" variant="default" className="gap-1.5" onClick={() => applyTemplate(suggested.items)} disabled={add.isPending}>
                <ListChecks className="w-3.5 h-3.5" /> {suggested.label} checklist
              </Button>
            )}
            {TEMPLATES.filter((t) => t !== suggested).map((t) => (
              <Button key={t.label} size="sm" variant="outline" className="gap-1.5" onClick={() => applyTemplate(t.items)} disabled={add.isPending}>
                {t.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => applyTemplate(GENERIC)} disabled={add.isPending}>Generic</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{items.length} checks</span>
            {passed > 0 && <span className="text-emerald-600">{passed} pass</span>}
            {failed > 0 && <span className="text-red-600">{failed} fail</span>}
          </div>
          <div className="rounded-lg border divide-y">
            {items.map((it) => {
              const result = (it.result as Result);
              const meta = RESULT_META[result] ?? RESULT_META.pending;
              const Icon = meta.icon;
              return (
                <div key={it.id} className={cn("flex items-center gap-2 px-2.5 py-1.5", meta.ring)}>
                  <button type="button" title="Cycle pass / fail / N-A" onClick={() => cycleResult(it.id, result)}
                    className={cn("w-6 h-6 rounded-full border flex items-center justify-center shrink-0", meta.color)}>
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-sm flex-1 min-w-0 truncate">{it.label}</span>
                  <Input defaultValue={it.note ?? ""} placeholder="note" className="h-7 w-28 text-xs"
                    onBlur={(e) => { if ((e.target.value || "") !== (it.note ?? "")) setNote(it.id, e.target.value); }} />
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => del(it.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add custom check */}
      <div className="flex gap-2">
        <Input className="h-8 flex-1 text-xs" placeholder="Add a custom check…" value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addOne(); }} />
        <Button size="sm" className="h-8 gap-1.5" onClick={addOne} disabled={add.isPending || !newLabel.trim()}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}
