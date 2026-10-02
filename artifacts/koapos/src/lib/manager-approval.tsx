import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* Manager approval at the till.
 *
 * The server refuses manager-only till actions (refund, void, adding store
 * credit, repricing…) from a cashier's session with
 *   403 { code: "manager_approval_required", error }
 * and accepts them for two minutes after a manager or owner enters their PIN
 * at that till (POST /staff/verify-pin with requireManager). Rather than teach
 * every screen that, fetch itself is wrapped: such a 403 opens one PIN prompt,
 * and on approval the same request is sent again. A cancelled prompt hands the
 * original 403 back to the caller, which shows its usual error.
 *
 * Wrapping window.fetch (once, at startup) covers the generated API hooks and
 * the screens that call fetch directly alike. */

type Pending = { message: string; resolve: (approved: boolean) => void };

let listener: ((p: Pending | null) => void) | null = null;
let current: Promise<boolean> | null = null;
let originalFetch: typeof fetch | null = null;

function askForApproval(message: string): Promise<boolean> {
  if (!listener) return Promise.resolve(false);
  // Several requests refused at once share one prompt.
  if (current) return current;
  current = new Promise<boolean>((resolve) => {
    listener!({
      message,
      resolve: (ok) => { current = null; listener?.(null); resolve(ok); },
    });
  });
  return current;
}

function isApiUrl(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch { return false; }
}

/** A body that can be sent a second time (a stream cannot). */
function resendable(init?: RequestInit): boolean {
  const b = init?.body;
  return b == null || typeof b === "string" || b instanceof FormData || b instanceof URLSearchParams || b instanceof Blob;
}

export function installManagerApprovalFetch(): void {
  if (originalFetch || typeof window === "undefined") return;
  originalFetch = window.fetch.bind(window);
  const base = originalFetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await base(input, init);
    if (res.status !== 403 || !isApiUrl(input) || input instanceof Request || !resendable(init)) return res;
    let body: { code?: string; error?: string } | null = null;
    try { body = await res.clone().json(); } catch { return res; }
    if (body?.code !== "manager_approval_required") return res;
    const approved = await askForApproval(body.error ?? "A manager or owner needs to approve this.");
    return approved ? base(input, init) : res;
  };
}

/** Mounted once inside the app: renders the PIN prompt when one is needed. */
export function ManagerApprovalHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listener = (p) => { setPending(p); setPin(""); setError(""); setBusy(false); };
    return () => { listener = null; };
  }, []);

  const submit = async () => {
    if (!pending || !pin || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await (originalFetch ?? fetch)("/api/staff/verify-pin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, requireManager: true }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; reason?: string };
      if (data.ok) { pending.resolve(true); return; }
      setError(
        data.reason === "role" ? "That PIN isn't a manager's or owner's."
        : data.reason === "rate_limited" ? "Too many attempts — wait a few minutes and try again."
        : "Incorrect PIN. Try again.",
      );
      setPin("");
    } catch {
      setError("Couldn't check the PIN — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={pending != null} onOpenChange={(open) => { if (!open) pending?.resolve(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Manager approval needed</DialogTitle>
          <DialogDescription>{pending?.message}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-2">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="Manager or owner PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            noPhoneFormat
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => pending?.resolve(false)}>Cancel</Button>
            <Button type="submit" disabled={!pin || busy}>Approve</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
