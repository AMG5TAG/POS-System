import { useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { DASHBOARD_SECTIONS, type DashboardSectionId } from "@/lib/dashboard-section-order";
import { BirthdayBanner } from "@/components/birthday-banner";
import { SecurityAlertBanner } from "@/components/security-alert-banner";
import { AppLayout } from "@/components/layout/app-layout";
import { DashboardClockBar } from "@/components/dashboard/DashboardClockBar";
import { ActiveTimeCardWidget } from "@/components/dashboard/ActiveTimeCardWidget";
import { ServiceJobsTiles } from "@/components/dashboard/ServiceJobsTiles";
import { DashboardPanels } from "@/components/dashboard/DashboardPanels";
import { DashboardCalendar } from "@/components/dashboard/DashboardCalendar";
import { useDashboardConfig, DashboardConfig } from "@/lib/dashboard-config";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ReferralRevenueWidget } from "@/components/dashboard/ReferralRevenueWidget";
import {
  Timer, BarChart2, AlertTriangle, Bell, Wrench, CalendarDays, RotateCcw, Radio, Cake, Clock, GripVertical,
} from "lucide-react";

const WIDGETS: {
  key: Exclude<keyof DashboardConfig, "sectionOrder">;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "showStatusTiles",
    label: "Service Job Status Tiles",
    description: "In Progress, Awaiting, Pending, Critical, Upcoming Appointments",
    icon: Timer,
  },
  {
    key: "showMetricTiles",
    label: "Business Metric Tiles",
    description: "FY Sales, Total Jobs, Pending Deliveries, Total Customers",
    icon: BarChart2,
  },
  {
    key: "showOverdueBanner",
    label: "Overdue Jobs Banner",
    description: "Alert banner for service jobs booked in 7+ days ago",
    icon: AlertTriangle,
  },
  {
    key: "showNotifications",
    label: "Notifications Panel",
    description: "Sticky notes and critical alerts visible to your team",
    icon: Bell,
  },
  {
    key: "showServiceJobsPanel",
    label: "Service Jobs Panel",
    description: "Live list of all active service jobs with inline editing",
    icon: Wrench,
  },
  {
    key: "showCalendar",
    label: "Calendar",
    description: "Monthly calendar with sales, appointments, birthdays and public holidays",
    icon: CalendarDays,
  },
  {
    key: "showReferralRevenue",
    label: "Top Channels by Revenue",
    description: "Which referral sources bring in the highest-paying customers",
    icon: Radio,
  },
  {
    key: "showBirthdayNotifications",
    label: "Birthday Notifications",
    description: "Banner highlighting customers with a birthday today",
    icon: Cake,
  },
  {
    key: "showFollowUpNotifications",
    label: "Follow Up Notifications",
    description: "Banner counting completed jobs and appointments overdue a follow-up",
    icon: Clock,
  },
];

/* A reorderable section row. Dragging is bound to the grip handle only
   (`dragListener={false}`) so a touch that starts anywhere else on the row
   scrolls the panel instead of picking the row up. */
function SectionReorderItem({
  id, label, description, hidden,
}: { id: DashboardSectionId; label: string; description: string; hidden: boolean }) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={dragControls}
      className="flex items-center gap-3 rounded-xl border bg-background p-3 select-none"
    >
      <GripVertical
        className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={(e) => dragControls.start(e)}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
      {hidden && (
        <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted shrink-0">
          Hidden
        </span>
      )}
    </Reorder.Item>
  );
}

export default function DashboardPage() {
  const { config, toggle, setOrder, reset, isLoading } = useDashboardConfig();
  const [customiseOpen, setCustomiseOpen] = useState(false);

  const order = config.sectionOrder;
  const showPanels = config.showNotifications || config.showServiceJobsPanel;

  const sectionVisible = (id: DashboardSectionId): boolean => {
    switch (id) {
      // The follow-up banner lives at the foot of this section, so the section
      // must still render when it is the only thing switched on.
      case "serviceJobs":     return config.showStatusTiles || config.showMetricTiles || config.showOverdueBanner || config.showFollowUpNotifications;
      case "panels":          return showPanels;
      case "calendar":        return config.showCalendar;
      case "referralRevenue": return config.showReferralRevenue;
    }
  };

  const sectionNode = (id: DashboardSectionId): React.ReactNode => {
    switch (id) {
      case "serviceJobs":
        return (
          <ServiceJobsTiles
            showStatusTiles={config.showStatusTiles}
            showMetricTiles={config.showMetricTiles}
            showOverdueBanner={config.showOverdueBanner}
            showFollowUpBanner={config.showFollowUpNotifications}
          />
        );
      case "panels":
        return (
          <DashboardPanels
            showNotifications={config.showNotifications}
            showServiceJobsPanel={config.showServiceJobsPanel}
          />
        );
      case "calendar":        return <DashboardCalendar />;
      case "referralRevenue": return <ReferralRevenueWidget />;
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {config.showBirthdayNotifications && <BirthdayBanner />}
        <SecurityAlertBanner />
        <DashboardClockBar
          onCustomize={() => setCustomiseOpen(true)}
        />
        <ActiveTimeCardWidget />

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        ) : (
          <>
            {order.map((id) =>
              sectionVisible(id) ? <div key={id}>{sectionNode(id)}</div> : null
            )}
          </>
        )}
      </div>

      {/* Customise Sheet */}
      <Sheet open={customiseOpen} onOpenChange={setCustomiseOpen}>
        {/* Column layout: the header and reset footer stay put while the
            options list between them scrolls, so nothing is cut off on short
            screens. */}
        <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col gap-0 p-0">
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="flex items-center gap-2 text-base">
              Customise Dashboard
            </SheetTitle>
            <SheetDescription className="text-xs">
              Toggle which sections are visible and drag to reorder them. Your preferences are saved automatically.
            </SheetDescription>
          </SheetHeader>

          <Separator className="shrink-0" />

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-1">
              {WIDGETS.map(({ key, label, description, icon: Icon }) => (
                <div
                  key={key}
                  className="flex items-start gap-3 rounded-xl p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`toggle-${key}`}
                      className="text-sm font-medium cursor-pointer leading-snug"
                    >
                      {label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
                  </div>
                  <Switch
                    id={`toggle-${key}`}
                    checked={config[key]}
                    onCheckedChange={() => toggle(key)}
                    className="shrink-0 mt-0.5"
                  />
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                <GripVertical className="w-3.5 h-3.5" /> Arrange sections
              </p>
              <p className="text-xs text-muted-foreground mb-2 leading-snug">
                Drag the grip handle to change the order sections stack on your dashboard.
              </p>
              <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-1">
                {order.map((id) => {
                  const meta = DASHBOARD_SECTIONS.find((s) => s.id === id)!;
                  return (
                    <SectionReorderItem
                      key={id}
                      id={id}
                      label={meta.label}
                      description={meta.description}
                      hidden={!sectionVisible(id)}
                    />
                  );
                })}
              </Reorder.Group>
            </div>
          </div>

          <div className="shrink-0 border-t p-4">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                reset();
                toast.success("Dashboard reset to defaults");
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Reset to defaults
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
