import { AppLayout } from "@/components/layout/app-layout";
import { DashboardClockBar } from "@/components/dashboard/DashboardClockBar";
import { ServiceJobsTiles } from "@/components/dashboard/ServiceJobsTiles";
import { DashboardPanels } from "@/components/dashboard/DashboardPanels";
import { DashboardCalendar } from "@/components/dashboard/DashboardCalendar";

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <DashboardClockBar />
        <ServiceJobsTiles />
        <DashboardPanels />
        <DashboardCalendar />
      </div>
    </AppLayout>
  );
}
