import type { ComponentType } from "react";
import { useEffect, useRef } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

/**
 * Shared multi-step progress indicator used by every wizard (staff, customer,
 * supplier, onboarding). Renders a chevron-separated row of pills — upcoming,
 * active and completed (with a check) — matching the breadcrumb visual
 * language so all stepped flows look identical.
 *
 * Options:
 *  - `numbered`       prefix each label with its 1-based position.
 *  - `alwaysShowLabel` keep labels visible at every width (default: icon-only
 *                      below the `sm` breakpoint to stay compact).
 *  - `scrollActiveIntoView` lay the steps out in a horizontal scroller and keep
 *                      the active step centred (for flows with many steps).
 */
export function Stepper({
  steps,
  current,
  className,
  numbered = false,
  alwaysShowLabel = false,
  scrollActiveIntoView = false,
}: {
  steps: readonly StepperStep[];
  current: number;
  className?: string;
  numbered?: boolean;
  alwaysShowLabel?: boolean;
  scrollActiveIntoView?: boolean;
}) {
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollActiveIntoView) return;
    const el = navRef.current?.querySelectorAll("[data-step]")[current] as HTMLElement | null;
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current, scrollActiveIntoView]);

  return (
    <nav
      ref={navRef}
      aria-label="Progress"
      className={cn(
        "flex items-center gap-1",
        scrollActiveIntoView ? "flex-nowrap overflow-x-auto pb-0.5 scrollbar-none" : "flex-wrap",
        className,
      )}
    >
      {steps.map((step, i) => {
        const Icon = step.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={step.label} data-step={i} className="flex items-center gap-1 shrink-0">
            <div
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-background border border-primary/40 text-primary"
                    : "text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="w-3 h-3 shrink-0" />
              ) : Icon ? (
                <Icon className="w-3 h-3 shrink-0" />
              ) : null}
              <span className={cn(alwaysShowLabel ? "" : "hidden sm:inline", !done && !active && "opacity-70")}>
                {numbered ? `${i + 1} ${step.label}` : step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            )}
          </div>
        );
      })}
    </nav>
  );
}
