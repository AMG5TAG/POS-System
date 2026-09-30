import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Merge, Search } from "lucide-react";
import { toast } from "sonner";

/**
 * Merge several brands (or suppliers) into one. Pick the one to keep, tick the
 * ones to fold into it, and the server first answers a dry run with exactly
 * what will move — nothing changes until that has been shown and confirmed.
 * The merged-away records are deleted, which can't be undone.
 */

type Item = { id: number; name: string };
type Counts = Record<string, number>;

const LABELS: Record<string, string> = {
  products: "product",
  purchaseOrders: "purchase order",
  returnAuths: "return authorisation",
};

export function MergeRecordsDialog({ open, onOpenChange, kind, items, endpoint, onMerged }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: "brand" | "supplier";
  items: Item[];
  endpoint: string;
  onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [sources, setSources] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setTargetId(null); setSources(new Set()); setQ(""); setPreview(null); } }, [open]);
  // Any change to the selection invalidates a preview that was shown for the old one.
  useEffect(() => { setPreview(null); }, [targetId, sources]);

  const sorted = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const target = items.find((i) => i.id === targetId) ?? null;
  const candidates = sorted.filter((i) => i.id !== targetId && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase())));
  const chosen = sorted.filter((i) => sources.has(i.id) && i.id !== targetId);

  const call = async (dryRun: boolean): Promise<Counts> => {
    const r = await fetch(`/api${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, sourceIds: chosen.map((c) => c.id), dryRun }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error((body as { error?: string } | null)?.error ?? "Merge failed");
    return body as Counts;
  };

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const counts = await call(dryRun);
      if (dryRun) { setPreview(counts); return; }
      toast.success(`Merged ${chosen.length} ${kind}${chosen.length === 1 ? "" : "s"} into ${target?.name} — ${counts.products ?? 0} product${counts.products === 1 ? "" : "s"} moved`);
      onMerged();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const plural = kind === "brand" ? "brands" : "suppliers";
  const moves = preview
    ? Object.entries(preview).filter(([k, n]) => k in LABELS && n > 0).map(([k, n]) => `${n} ${LABELS[k]}${n === 1 ? "" : "s"}`)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Merge className="w-4 h-4" /> Merge {plural}</DialogTitle>
          <DialogDescription>
            Everything on the {plural} you tick moves to the one you keep, then those {plural} are deleted.
            {kind === "supplier" && " The kept supplier's own details (contacts, account numbers) are the ones that remain."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Keep this {kind}</Label>
            <Select value={targetId ? String(targetId) : ""} onValueChange={(v) => setTargetId(Number(v))}>
              <SelectTrigger><SelectValue placeholder={`Choose the ${kind} to keep…`} /></SelectTrigger>
              <SelectContent>{sorted.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {target && (
            <div className="space-y-1.5">
              <Label className="text-xs">Merge these into {target.name}</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${plural}…`} className="pl-8 h-8 text-sm" noPhoneFormat />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                {candidates.length === 0 && <p className="p-3 text-xs text-muted-foreground">No other {plural} match.</p>}
                {candidates.map((i) => (
                  <label key={i.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                    <input type="checkbox" className="w-4 h-4 accent-primary" checked={sources.has(i.id)}
                      onChange={(e) => setSources((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
                    {i.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
              <p className="font-medium flex items-center gap-1.5 text-destructive"><AlertTriangle className="w-4 h-4" /> This can't be undone</p>
              <p>{moves.length ? `${moves.join(", ")} will move to ${target?.name}.` : `Nothing is linked to ${chosen.length === 1 ? "it" : "them"} — they will just be removed.`}</p>
              <p>Deleted: {chosen.map((c) => c.name).join(", ")}.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {preview ? (
            <Button variant="destructive" disabled={busy} onClick={() => void run(false)} className="gap-1.5">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Merge {chosen.length} into {target?.name}
            </Button>
          ) : (
            <Button disabled={busy || !target || chosen.length === 0} onClick={() => void run(true)} className="gap-1.5">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Review merge
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
