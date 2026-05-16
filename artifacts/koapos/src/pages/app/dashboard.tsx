import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { DashboardClockBar } from "@/components/dashboard/DashboardClockBar";
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
import {
  Timer, BarChart2, AlertTriangle, Bell, Wrench, CalendarDays,
} from "lucide-react";

const WIDGETS: {
  key: keyof DashboardConfig;
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
];

export default function DashboardPage() {
  const { config, toggle } = useDashboardConfig();
  const [customiseOpen, setCustomiseOpen] = useState(false);

  const showPanels = config.showNotifications || config.showServiceJobsPanel;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <DashboardClockBar onCustomize={() => setCustomiseOpen(true)} />

        {(config.showStatusTiles || config.showMetricTiles || config.showOverdueBanner) && (
          <ServiceJobsTiles
            showStatusTiles={config.showStatusTiles}
            showMetricTiles={config.showMetricTiles}
            showOverdueBanner={config.showOverdueBanner}
          />
        )}

        {showPanels && (
          <DashboardPanels
            showNotifications={config.showNotifications}
            showServiceJobsPanel={config.showServiceJobsPanel}
          />
        )}

        {config.showCalendar && <DashboardCalendar />}
      </div>

      {/* Customise Sheet */}
      <Sheet open={customiseOpen} onOpenChange={setCustomiseOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader className="mb-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              Customise Dashboard
            </SheetTitle>
            <SheetDescription className="text-xs">
              Toggle which sections are visible. Your preferences are saved automatically.
            </SheetDescription>
          </SheetHeader>

          <Separator className="my-4" />

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
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
