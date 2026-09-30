import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MonitorSmartphone, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";

/**
 * A screen has opened the public Dashboard link and is waiting to be let in
 * (see api lib/dashboard-devices.ts). Shown on every POS page to owners and
 * managers — the only roles the decision endpoint accepts — so whoever is at
 * the counter can approve the TV without leaving the sale they're on.
 *
 * Fixed to the top of the viewport rather than placed in the page, because
 * <AppLayout> has three shapes and each renders its own <main>.
 */

type PendingScreen = { id: number; pairCode: string; ipAddress: string | null; userAgent: string | null; requestedAt: string };

export const PENDING_SCREENS_KEY = ["dashboard-app-pending-screens"];

function browserLabel(ua: string | null): string {
  if (!ua) return "Unknown browser";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows"
    : /Mac OS X/i.test(ua) ? "macOS" : /CrOS/i.test(ua) ? "ChromeOS" : /Linux/i.test(ua) ? "Linux" : "";
  const tv = /SMART-TV|SmartTV|Tizen|Web0S|webOS|AFT|BRAVIA|GoogleTV|Android TV/i.test(ua) ? "TV" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return [br, [tv, os].filter(Boolean).join(" ")].filter(Boolean).join(" on ");
}

export function DashboardAccessBanner() {
  const { user } = useAuth();
  const canApprove = ["owner", "manager"].includes(user?.staffRole ?? "");
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: PENDING_SCREENS_KEY,
    enabled: canApprove,
    refetchInterval: 8_000,
    queryFn: async (): Promise<PendingScreen[]> => {
      const r = await fetch("/api/dashboard-app/devices/pending", { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });

  const decide = async (id: number, decision: "approved" | "denied") => {
    setBusy(id);
    try {
      const r = await fetch(`/api/dashboard-app/devices/${id}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Failed");
      toast.success(decision === "approved" ? "Screen approved — the Dashboard will open on it" : "Screen denied");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: PENDING_SCREENS_KEY });
      void qc.invalidateQueries({ queryKey: ["dashboard-app-devices"] });
    }
  };

  if (!canApprove || !data?.length) return null;

  return (
    <div
      className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
    >
      {data.slice(0, 3).map((s) => (
        <div key={s.id} role="alert" className="pointer-events-auto w-full max-w-xl flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-background shadow-lg px-4 py-3">
          <MonitorSmartphone className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-[12rem] text-sm leading-snug">
            <p className="font-medium">A screen wants to show the Dashboard</p>
            <p className="text-xs text-muted-foreground">
              Code <span className="font-semibold text-foreground tabular-nums tracking-wider">{s.pairCode}</span>
              {" · "}{browserLabel(s.userAgent)}{s.ipAddress ? ` · ${s.ipAddress}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" className="h-8 gap-1" disabled={busy === s.id} onClick={() => void decide(s.id, "denied")}>
              <X className="w-3.5 h-3.5" /> Deny
            </Button>
            <Button size="sm" className="h-8 gap-1" disabled={busy === s.id} onClick={() => void decide(s.id, "approved")}>
              {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
