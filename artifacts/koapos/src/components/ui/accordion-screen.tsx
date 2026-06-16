import * as React from "react";
import { ChevronLeft, ChevronDown, ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Full-screen accordion screen — the app-wide replacement for the old
 * "lightbox + tabs" create/view dialogs.
 *
 * Renders inside `AppLayout` (so the side menu stays visible) and fills the
 * whole right-hand window like the New Service screen. Sections are laid out as
 * a vertical accordion; one section is expanded at a time and grows to fill the
 * available height to minimise scrolling. Each expanded section gets
 * Previous / Next controls that expand the adjacent section.
 */

export interface AccordionSectionDef {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Optional badge / status shown on the right of a collapsed header. */
  summary?: React.ReactNode;
  content: React.ReactNode;
}

export interface AccordionScreenProps {
  title: string;
  subtitle?: string;
  sections: AccordionSectionDef[];
  /** Back affordance (e.g. navigate away). */
  onBack?: () => void;
  /** Actions rendered at the top-right of the header (e.g. a Save button). */
  headerActions?: React.ReactNode;
  /** Called when "Next" is pressed on the last section. */
  onComplete?: () => void;
  /** Label for the final "Next" / complete button. Defaults to "Finish". */
  completeLabel?: string;
  /** Disable the final complete button. */
  completeDisabled?: boolean;
  /** Section id to expand initially. Defaults to the first section. */
  initialOpenId?: string;
  /** Controlled open section id. When provided, the component is controlled. */
  openId?: string;
  /** Notified whenever the open section changes (controlled or uncontrolled). */
  onOpenChange?: (id: string) => void;
  className?: string;
}

export function AccordionScreen({
  title,
  subtitle,
  sections,
  onBack,
  headerActions,
  onComplete,
  completeLabel = "Finish",
  completeDisabled,
  initialOpenId,
  openId: controlledOpenId,
  onOpenChange,
  className,
}: AccordionScreenProps) {
  const [uncontrolledOpenId, setUncontrolledOpenId] = React.useState<string>(initialOpenId ?? sections[0]?.id ?? "");
  const openId = controlledOpenId ?? uncontrolledOpenId;
  const openIndex = sections.findIndex((s) => s.id === openId);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const headerRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const goTo = (id: string) => {
    if (controlledOpenId === undefined) setUncontrolledOpenId(id);
    onOpenChange?.(id);
    // Bring the freshly-expanded section's header into view.
    requestAnimationFrame(() => headerRefs.current[id]?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const goPrev = () => { if (openIndex > 0) goTo(sections[openIndex - 1].id); };
  const goNext = () => {
    if (openIndex < sections.length - 1) goTo(sections[openIndex + 1].id);
    else onComplete?.();
  };

  return (
    <div className={cn("h-full flex flex-col min-h-0", className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b bg-background/60 shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" className="shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg md:text-xl font-bold truncate">{title}</h1>
          {subtitle && <p className="text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {headerActions && <div className="shrink-0 flex items-center gap-2">{headerActions}</div>}
      </div>

      {/* Accordion */}
      <div ref={containerRef} className="flex-1 min-h-0 flex flex-col overflow-y-auto p-3 md:p-4 gap-2.5">
        {sections.map((section, idx) => {
          const isOpen = section.id === openId;
          const Icon = section.icon;
          const isLast = idx === sections.length - 1;
          return (
            <div
              key={section.id}
              className={cn(
                "rounded-xl border bg-card transition-colors",
                isOpen ? "flex-1 min-h-0 flex flex-col shadow-sm ring-1 ring-primary/20" : "shrink-0",
              )}
            >
              <button
                type="button"
                ref={(el) => { headerRefs.current[section.id] = el; }}
                onClick={() => goTo(isOpen ? "" : section.id)}
                aria-expanded={isOpen}
                className={cn(
                  "w-full flex items-center gap-3 px-4 md:px-5 py-3.5 text-left transition-colors",
                  isOpen ? "border-b" : "hover:bg-muted/50 rounded-xl",
                )}
              >
                <span className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0",
                  isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}>
                  {Icon ? <Icon className="w-4 h-4" /> : idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm md:text-base font-semibold truncate">{section.title}</span>
                  {section.description && (
                    <span className="block text-xs text-muted-foreground truncate">{section.description}</span>
                  )}
                </span>
                {!isOpen && section.summary && (
                  <span className="shrink-0 text-xs text-muted-foreground max-w-[40%] truncate">{section.summary}</span>
                )}
                <ChevronDown className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4">
                    {section.content}
                  </div>
                  {/* Per-section Previous / Next */}
                  <div className="flex items-center justify-between gap-2 px-4 md:px-5 py-3 border-t bg-muted/20">
                    <Button variant="outline" size="sm" onClick={goPrev} disabled={openIndex === 0} className="gap-1.5">
                      <ArrowLeft className="w-4 h-4" /> Previous
                    </Button>
                    <Button
                      size="sm"
                      onClick={goNext}
                      disabled={isLast && completeDisabled}
                      className="gap-1.5"
                    >
                      {isLast ? completeLabel : <>Next <ArrowRight className="w-4 h-4" /></>}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
