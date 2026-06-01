import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { EmbeddedProvider } from "@/lib/embedded-context";
import { cn } from "@/lib/utils";

export interface HubTab {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Additional paths that should also highlight this tab (sub-routes / aliases). */
  matchPaths?: string[];
}

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

export function ManagementHubLayout({ title, tabs, children }: Props) {
  const [location] = useLocation();

  return (
    <AppLayout>
      <div className="flex h-full min-h-[calc(100vh-57px)]">
        {/* ── Left vertical tab rail ── */}
        <nav className="w-56 shrink-0 border-r bg-muted/20 flex flex-col gap-0.5 p-3">
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
        <div className="flex-1 min-w-0 overflow-auto">
          <EmbeddedProvider>
            {children}
          </EmbeddedProvider>
        </div>
      </div>
    </AppLayout>
  );
}
