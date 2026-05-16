import { AppLayout } from "@/components/layout/app-layout";
import { PageTabsNav } from "@/components/ui/page-tabs-nav";
import { Clock, UserSquare2, CalendarClock, ClipboardList, Coins } from "lucide-react";

const STAFF_TABS = [
  { href: "/staff",                label: "Employees",      icon: UserSquare2  },
  { href: "/staff/timesheet",      label: "Timesheet",      icon: Clock        },
  { href: "/staff/rostering",      label: "Rostering",      icon: CalendarClock },
  { href: "/staff/leave-requests", label: "Leave Requests", icon: ClipboardList },
  { href: "/staff/cost-summary",   label: "Cost Summary",   icon: Coins        },
];

export default function StaffLeaveRequestsPage() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Staff</h1>
        </div>

        <PageTabsNav tabs={STAFF_TABS} />

        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-base">Leave Requests</p>
          <p className="text-sm mt-1">Review and approve employee leave and absence requests.</p>
          <p className="text-xs mt-3 opacity-60">Coming soon</p>
        </div>
      </div>
    </AppLayout>
  );
}
