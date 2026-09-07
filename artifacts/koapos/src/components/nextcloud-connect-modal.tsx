/**
 * Connect a self-hosted Nextcloud server via Login Flow v2.
 *
 * Nextcloud instances are merchant-hosted, so there is no platform OAuth app to
 * redirect through: their server issues an app password once they approve the
 * login. That makes this a two-stage dialog rather than a redirect —
 *
 *   1. "server"  — the merchant enters their address; we open a login session.
 *   2. "approve" — they approve it in a new tab on their own Nextcloud while we
 *                  poll; the poll that succeeds is what stores the credential.
 *
 * The approve link is a real anchor the merchant clicks rather than a
 * window.open() after the fetch, which pop-up blockers would swallow.
 *
 * Shared by the Sync page and the Integrations catalogue.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plug, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { NextcloudIcon } from "@/components/provider-icons";

type NextcloudStage = "server" | "approve";

export function NextcloudConnectModal({ open, onClose, onConnected }: {
  open: boolean;
  onClose: () => void;
  onConnected: (accountHandle?: string) => void;
}) {
  const [stage, setStage] = useState<NextcloudStage>("server");
  const [serverUrl, setServerUrl] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [resolvedServer, setResolvedServer] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (open) {
      setStage("server"); setServerUrl(""); setLoginUrl("");
      setResolvedServer(""); setStarting(false);
    }
  }, [open]);

  /* Poll while awaiting approval. Nextcloud answers "pending" until the merchant
     approves, and expires an unapproved flow after 20 minutes. */
  useEffect(() => {
    if (!open || stage !== "approve") return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const r = await fetch("/api/integrations/nextcloud/login-flow/poll", {
          method: "POST", credentials: "include",
        });
        if (cancelled) return;
        const data = await r.json().catch(() => ({})) as {
          status?: string; accountHandle?: string; error?: string;
        };
        if (!r.ok) {
          clearInterval(timer);
          toast.error(data.error ?? "Couldn't complete the Nextcloud connection.");
          setStage("server");
          return;
        }
        if (data.status === "connected") {
          clearInterval(timer);
          onConnected(data.accountHandle);
        } else if (data.status === "expired") {
          clearInterval(timer);
          toast.error("The Nextcloud login expired before it was approved. Try again.");
          setStage("server");
        }
      } catch {
        /* Transient failure — the next tick retries. */
      }
    }, 2000);

    return () => { cancelled = true; clearInterval(timer); };
  }, [open, stage, onConnected]);

  const start = async () => {
    if (!serverUrl.trim()) { toast.error("Enter your Nextcloud server address"); return; }
    setStarting(true);
    try {
      const r = await fetch("/api/integrations/nextcloud/login-flow/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: serverUrl.trim() }),
      });
      const data = await r.json().catch(() => ({})) as {
        loginUrl?: string; serverUrl?: string; error?: string;
      };
      if (r.ok && data.loginUrl) {
        setLoginUrl(data.loginUrl);
        setResolvedServer(data.serverUrl ?? serverUrl.trim());
        setStage("approve");
      } else {
        toast.error(data.error ?? "Couldn't reach that Nextcloud server.");
      }
    } catch {
      toast.error("Connection request failed — please try again.");
    } finally {
      setStarting(false);
    }
  };

  /* Drop the half-finished flow server-side so a retry starts clean. */
  const cancel = () => {
    if (stage === "approve") {
      void fetch("/api/integrations/nextcloud/login-flow/cancel", {
        method: "POST", credentials: "include",
      }).catch(() => { /* best-effort */ });
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-white border flex items-center justify-center">
              <NextcloudIcon className="w-4 h-4" />
            </span>
            Connect Nextcloud
          </DialogTitle>
          <DialogDescription>
            {stage === "server"
              ? "Back up your KoaPOS data and mirror customer files to your own Nextcloud server."
              : `Approve the connection on ${resolvedServer} to finish.`}
          </DialogDescription>
        </DialogHeader>

        {stage === "server" ? (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="nextcloudServer">Server address</Label>
              <Input
                id="nextcloudServer" type="text" autoComplete="off"
                placeholder="https://cloud.example.com"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !starting) void start(); }}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="w-3.5 h-3.5" /> What happens next
              </p>
              <p>
                You'll approve the connection on your own Nextcloud, which issues KoaPOS
                an app password. Your account password is never entered here, and you can
                revoke access any time from Nextcloud → Settings → Security.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <Button asChild className="w-full gap-1.5">
              <a href={loginUrl} target="_blank" rel="noreferrer">
                <Plug className="w-3.5 h-3.5" /> Open Nextcloud to approve
              </a>
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Waiting for you to approve the connection…
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Grant access in the tab that opens. This page finishes on its own —
              you don't need to come back and click anything.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={cancel}>Cancel</Button>
          {stage === "server" && (
            <Button onClick={start} disabled={starting} className="gap-1.5">
              {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
              Continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
