import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { EmbeddedProvider } from "@/lib/embedded-context";
import { cn } from "@/lib/utils";
import type { HubTab } from "@/components/layout/management-hubs";

export type { HubTab };

interface Props {
  title: string;
  tabs: HubTab[];
  children: React.ReactNode;
}

function isTabActive(tab: HubTab, location: string): boolean {
  if (location === tab.href) return true;
  if (tab.matchPaths) {
    for (const p of tab.matchPaths) {
      if (location === p || location.startsWith(p + "/")) return true;
    }
  }
  return false;
}

const LS_PREFIX = "koapos:hub-last-tab:";

/**
 * Persists the last-visited tab for a hub in localStorage and restores it
 * when the user navigates back to the hub root (no tab is active).
 */
function useHubLastTab(title: string, tabs: HubTab[], location: string) {
  const [, navigate] = useLocation();
  const lsKey = `${LS_PREFIX}${title}`;

  const activeTab = tabs.find((t) => isTabActive(t, location));

  useEffect(() => {
    if (activeTab) {
      try {
        localStorage.setItem(lsKey, activeTab.href);
      } catch {
        // localStorage may be unavailable in some environments
      }
    }
  }, [lsKey, activeTab?.href]);

  useEffect(() => {
    if (!activeTab) {
      let target = tabs[0]?.href;
      try {
        const stored = localStorage.getItem(lsKey);
        if (stored && tabs.some((t) => t.href === stored)) target = stored;
      } catch {
        // ignore
      }
      if (target) navigate(target, { replace: true });
    }
  }, [location]);
}

/** Horizontal scrollable pill strip shown on mobile (< md). */
function MobileTabStrip({ title, tabs }: { title: string; tabs: HubTab[] }) {
  const [location] = useLocation();

  return (
    <div className="md:hidden border-b bg-background">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1">
        {title}
      </p>
      <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab, location);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ManagementHubLayout({ title, tabs, children }: Props) {
  const [location] = useLocation();
  useHubLastTab(title, tabs, location);

  return (
    <AppLayout>
      <div className="flex h-full min-h-[calc(100vh-57px)]">
        {/* ── Left vertical tab rail — desktop only ── */}
        <nav className="hidden md:flex w-56 shrink-0 border-r bg-muted/20 flex-col gap-0.5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 pb-2 pt-1">
            {title}
          </p>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(tab, location);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ── Content area — sub-pages render here (AppLayout shell suppressed) ── */}
        <div className="flex-1 min-w-0 overflow-auto flex flex-col">
          {/* Mobile pill strip — visible only on small screens */}
          <MobileTabStrip title={title} tabs={tabs} />
          <EmbeddedProvider>
            {children}
          </EmbeddedProvider>
        </div>
      </div>
    </AppLayout>
  );
}
