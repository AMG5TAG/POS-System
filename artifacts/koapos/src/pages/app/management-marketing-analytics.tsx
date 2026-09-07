import { AppLayout } from "@/components/layout/app-layout";
import { Activity } from "lucide-react";
import { AnalyticsTab } from "./management-sales";

/**
 * Marketing Analytics — moved out of the Reports / Sales Overview screen into
 * its own hub tab (Management → Marketing & Reports → Analytics). Renders the
 * marketing-analytics view (QR codes, shortlinks, landing pages) shared from
 * management-sales, where its chart/KPI helpers live.
 */
export default function ManagementMarketingAnalyticsPage() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Marketing performance across QR codes, shortlinks, and landing pages
          </p>
        </div>
        <AnalyticsTab />
      </div>
    </AppLayout>
  );
}
