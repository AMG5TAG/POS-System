import { useState } from "react";
import { MailWarning, X, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function EmailVerificationBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST", credentials: "include" });
      if (res.ok) {
        setSent(true);
        toast.success("Verification email sent — check your inbox.");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Failed to send verification email.");
      }
    } catch {
      toast.error("Failed to send verification email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3 max-w-full">
        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300 min-w-0">
          <MailWarning className="w-4 h-4 shrink-0" />
          <span className="truncate">Please verify your email address to unlock all features.</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sent ? (
            <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Sent!
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
              onClick={resend}
              disabled={sending}
            >
              {sending ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Sending…</> : "Resend email"}
            </Button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
