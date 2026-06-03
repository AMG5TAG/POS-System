import { useLocation } from "wouter";
import { ManagementHubLayout, type HubTab } from "@/components/layout/management-hub-layout";
import { UserSquare2, Clock, Coins, Monitor, Map, Camera, Scale } from "lucide-react";

import StaffPage from "@/pages/app/staff";
import StaffTimesheetPage from "@/pages/app/staff-timesheet";
import StaffCostSummaryPage from "@/pages/app/staff-cost-summary";
import ManagementRegistersPage from "@/pages/app/management-registers";
import ManagementFloorPlanPage from "@/pages/app/management-floor-plan";
import ManagementCamerasPage from "@/pages/app/management-cameras";
import ManagementLegalPage from "@/pages/app/management-legal";

const TABS: HubTab[] = [
  { label: "Employees",    href: "/management/staff",              icon: UserSquare2 },
  { label: "Timesheets",   href: "/management/staff/timesheet",    icon: Clock       },
  { label: "Cost Summary", href: "/management/staff/cost-summary", icon: Coins       },
  { label: "POS Registers",href: "/management/registers",          icon: Monitor     },
  { label: "Floor Plan",   href: "/management/floor-plan",         icon: Map         },
  { label: "Cameras",      href: "/management/cameras",            icon: Camera      },
  { label: "Legal",        href: "/management/legal",              icon: Scale       },
];

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/staff/timesheet")    return <StaffTimesheetPage />;
  if (location === "/management/staff/cost-summary") return <StaffCostSummaryPage />;
  if (location === "/management/registers")          return <ManagementRegistersPage />;
  if (location === "/management/floor-plan")         return <ManagementFloorPlanPage />;
  if (location === "/management/cameras")            return <ManagementCamerasPage />;
  if (location === "/management/legal")              return <ManagementLegalPage />;
  return <StaffPage />;
}

export default function ManagementOperationsHub() {
  return (
    <ManagementHubLayout title="Staff & Operations" tabs={TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
