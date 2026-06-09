import { useLocation } from "wouter";
import { ManagementHubLayout } from "@/components/layout/management-hub-layout";
import { OPERATIONS_HUB_TABS } from "@/components/layout/management-hubs";

import StaffPage from "@/pages/app/staff";
import StaffTimesheetPage from "@/pages/app/staff-timesheet";
import StaffCostSummaryPage from "@/pages/app/staff-cost-summary";
import ManagementRegistersPage from "@/pages/app/management-registers";
import ManagementFloorPlanPage from "@/pages/app/management-floor-plan";
import ManagementCamerasPage from "@/pages/app/management-cameras";
import ManagementTechAppPage from "@/pages/app/management-tech-app";
import ManagementLegalPage from "@/pages/app/management-legal";

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/staff/timesheet")    return <StaffTimesheetPage />;
  if (location === "/management/staff/cost-summary") return <StaffCostSummaryPage />;
  if (location === "/management/registers")          return <ManagementRegistersPage />;
  if (location === "/management/floor-plan")         return <ManagementFloorPlanPage />;
  if (location === "/management/cameras")            return <ManagementCamerasPage />;
  if (location === "/management/tech-app")           return <ManagementTechAppPage />;
  if (location === "/management/legal")              return <ManagementLegalPage />;
  return <StaffPage />;
}

export default function ManagementOperationsHub() {
  return (
    <ManagementHubLayout title="Staff & Operations" tabs={OPERATIONS_HUB_TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
