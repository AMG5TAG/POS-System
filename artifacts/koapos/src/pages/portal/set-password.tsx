import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Where a set-up / reset link lands: /c/:token/set-password?token=<one-time>.
 *
 * Two different tokens meet on this page. The one in the path is the customer's
 * stable portalToken, which only says *which* account this is; the one in the
 * query is the single-use, hour-long proof that arrived in their inbox or by
 * text. Only the second one authorises anything — which is the whole point of
 * the flow, since anyone who scans the sticker on the device holds the first.
 */
export default function PortalSetPasswordPage() {
  const { businessUsername, token: portalToken } = useParams<{ businessUsername?: string; token: string }>();
  const [, navigate] = useLocation();

  /* Set-up links are built as /b/<username>/c/<token>/set-password whenever the
     merchant has no custom domain, so dropping the prefix on the way back would
     land the customer on a portal that no longer knows which business it is. */
  const portalHome = businessUsername
    ? `/b/${businessUsername}/c/${portalToken}`
    : `/c/${portalToken}`;

  const oneTimeToken = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Those passwords don't match."); return; }
    if (password.length < 8) { setError("Please use at least 8 characters."); return; }

    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/portal/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: oneTimeToken, password }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? "That link is no longer valid. Please request a new one.");
        return;
      }
      setDone(true);
      // The response opens a session, so land them straight in their account.
      setTimeout(() => navigate(portalHome), 1200);
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!oneTimeToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-gray-50">
        <div>
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-800">This link is incomplete</p>
          <p className="text-sm text-gray-500 mt-1">Open the link from your email or text message again.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-gray-50">
        <div>
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="font-semibold text-gray-800">Password set</p>
          <p className="text-sm text-gray-500 mt-1">Taking you to your account…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <h1 className="font-semibold text-lg">Set your password</h1>
          <p className="text-sm text-gray-500">You'll use this to sign in to your account from now on.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" autoFocus
                 value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-gray-400">At least 8 characters.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password"
                 value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set password"}
        </Button>
      </form>
    </div>
  );
}
