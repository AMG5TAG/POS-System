import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Globe, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Summary {
  eligible: number;
  active: number;
  noEmail: number;
  sending: { total: number; sent: number; startedAt: string } | null;
}

/* Invite customers to their online shop account (koastal.com.au/shop). Every
   customer already has an account — an invite is the email with a link to set
   its password. Sending is a bulk email to real people, so it needs the count
   typed back before it goes (see routes/shop-invites.ts). */
export function ShopInvitesCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/shop-invites/summary", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Summary | null) => setSummary(d))
      .catch(() => {});

  useEffect(() => { void load(); }, []);
  // While a batch is going out, keep the progress current.
  useEffect(() => {
    if (!summary?.sending) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [summary?.sending]);

  const send = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/shop-invites/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmCount: Number(typed) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't send invites");
      toast.success(`Sending ${d.queued} invites — this runs in the background`);
      setOpen(false);
      setTyped("");
      void load();
    } catch (e) {
      toast.error((e as Error).message);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const n = summary?.eligible ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="w-4 h-4" /> Online shop accounts</CardTitle>
        <CardDescription>
          Every customer can sign in at koastal.com.au/shop with their email. An invite emails them a link to set their password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!summary ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{summary.active}</p><p className="text-xs text-muted-foreground">Signed up</p></div>
              <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{n}</p><p className="text-xs text-muted-foreground">Can be invited</p></div>
              <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{summary.noEmail}</p><p className="text-xs text-muted-foreground">No email on file</p></div>
            </div>
            {summary.sending ? (
              <p className="text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Sending invites… {summary.sending.sent} of {summary.sending.total}
              </p>
            ) : (
              <Button onClick={() => setOpen(true)} disabled={n === 0} className="gap-2">
                <Mail className="w-4 h-4" /> Invite {n} customer{n === 1 ? "" : "s"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Only customers with an email and no password yet are invited, once per email address. Anyone invited in the last 14 days is skipped.
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTyped(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Email {n} customers?</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Each gets an email — <strong>“Your online account is ready”</strong> — with a link to set their password on the shop. The link lasts 14 days.</p>
            <p>This can't be undone once sent. Type <strong>{n}</strong> to confirm.</p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={String(n)} noPhoneFormat />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void send()} disabled={busy || Number(typed) !== n}>{busy ? "Sending…" : `Send ${n} invites`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
