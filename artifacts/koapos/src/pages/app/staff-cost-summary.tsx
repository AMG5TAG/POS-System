import { AppLayout } from "@/components/layout/app-layout";
import { PageTabsNav } from "@/components/ui/page-tabs-nav";
import { Clock, UserSquare2, CalendarClock, ClipboardList, Coins, StickyNote, Target, Link2 } from "lucide-react";

const STAFF_TABS = [
  { href: "/staff",                label: "Employees", icon: UserSquare2  },
  { href: "/staff/timesheet",      label: "Timesheet", icon: Clock        },
  { href: "/staff/rostering",      label: "Rostering", icon: CalendarClock },
  { href: "/staff/leave-requests", label: "Leave",     icon: ClipboardList },
  { href: "/staff/cost-summary",   label: "Costs",     icon: Coins        },
  { href: "/staff/notes",          label: "Notes",     icon: StickyNote   },
  { href: "/staff/kpis",           label: "KPIs",      icon: Target       },
  { href: "/staff/links",          label: "Links",     icon: Link2        },
];

export default function StaffCostSummaryPage() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Staff</h1>
        </div>

        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Coins className="h-10 w-10 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-base">Cost Summary</p>
          <p className="text-sm mt-1">View wage costs, payroll summaries, and labour percentages.</p>
          <p className="text-xs mt-3 opacity-60">Coming soon</p>
        </div>
      </div>
    </AppLayout>
  );
}
