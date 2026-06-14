import { useState } from "react";
import { ShieldAlert, X, ArrowRight } from "lucide-react";
import { useGetAuthEventsFlaggedCount } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export function SecurityAlertBanner() {
  const [dismissed, setDismissed] = useState(false);

  const { data } = useGetAuthEventsFlaggedCount({
    query: {
      queryKey: ["auth-events-flagged-count"],
      refetchInterval: 60_000,
    },
  });

  const count = data?.count ?? 0;

  if (dismissed || count === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm"
      )}
      role="alert"
    >
      <ShieldAlert className="w-5 h-5 shrink-0 text-destructive" />
      <p className="flex-1 text-destructive font-medium leading-snug">
        {count === 1
          ? "1 sign-in has been flagged as suspicious and needs your attention."
          : `${count} sign-ins have been flagged as suspicious and need your attention.`}
      </p>
      <Link href="/management/settings-integrations/account#recent-sign-ins" asChild>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/60 hover:text-destructive gap-1 px-2.5"
        >
          Review <ArrowRight className="w-3 h-3" />
        </Button>
      </Link>
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0 h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss security alert"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
