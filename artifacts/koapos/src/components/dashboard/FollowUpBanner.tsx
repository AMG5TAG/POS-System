import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Clock, Send, X } from "lucide-react";
import { useStaffSession } from "@/lib/staff-day-session";
import { useAuth } from "@/lib/use-auth";
import { useGetFollowUpSummary } from "@workspace/api-client-react";

/**
 * Dashboard banner counting completed services/appointments that are past the
 * Follow Up window and still haven't been contacted.
 *
 * Dismissal is scoped per staff member per day (same convention as the birthday
 * banner) so clearing it on a shared device doesn't hide the prompt from the
 * next person to PIN in, and a fresh batch surfaces again tomorrow.
 */

const DISMISS_KEY = "follow-up-banner-dismissed";

function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const UNIT_LABEL: Record<string, string> = { days: "days", weeks: "weeks", months: "months" };

export function FollowUpBanner() {
  const { dayStaff } = useStaffSession();
  const { user } = useAuth();
  const identity =
    dayStaff?.staffId != null
      ? `staff-${dayStaff.staffId}`
      : user?.id != null
        ? `merchant-${user.id}`
        : "anon";
  const dismissKey = `${DISMISS_KEY}:${identity}`;

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey) === todayKey());
    } catch {
      setDismissed(false);
    }
  }, [dismissKey]);

  const { data } = useGetFollowUpSummary({ query: { queryKey: ["follow-up-summary"] } });

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey, todayKey());
    } catch { /* ignore storage failures */ }
    setDismissed(true);
  };

  // Nothing to chase, or nobody we can actually reach — stay quiet.
  if (dismissed || !data || data.contactableCount === 0) return null;

  const { dueCount, contactableCount, servicesDue, appointmentsDue, oldestDaysSince, windowValue, windowUnit } = data;
  const breakdown = [
    servicesDue > 0 ? `${servicesDue} service job${servicesDue !== 1 ? "s" : ""}` : null,
    appointmentsDue > 0 ? `${appointmentsDue} appointment${appointmentsDue !== 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
          <Clock className="w-4.5 h-4.5 text-amber-700 dark:text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900 dark:text-amber-100 text-sm">
            {dueCount === 1
              ? "1 customer is overdue a follow-up"
              : `${dueCount} customers are overdue a follow-up`}
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            Completed more than {windowValue} {UNIT_LABEL[windowUnit] ?? windowUnit} ago
            {breakdown ? ` — ${breakdown}` : ""}
            {oldestDaysSince > 0 ? `. Longest waiting: ${oldestDaysSince} days.` : "."}
            {contactableCount !== dueCount && (
              <> {contactableCount} {contactableCount === 1 ? "has" : "have"} contact details on file.</>
            )}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Link href="/marketing/follow-up">
              <Button size="sm" className="h-7 text-xs gap-1.5">
                <Send className="w-3 h-3" /> Send follow-ups
              </Button>
            </Link>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-amber-400 hover:text-amber-600 shrink-0"
          onClick={handleDismiss}
          aria-label="Dismiss follow-up reminder for today"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
