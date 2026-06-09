import { useLocation } from "wouter";
import { ManagementHubLayout } from "@/components/layout/management-hub-layout";
import { MARKETING_HUB_TABS } from "@/components/layout/management-hubs";

import ManagementSalesPage from "@/pages/app/management-sales";
import ManagementReportsBasPage from "@/pages/app/management-reports-bas";
import ManagementDailyReportsPage from "@/pages/app/management-daily-reports";
import ManagementKpisPage from "@/pages/app/management-kpis";
import ManagementMarketingReferralsPage from "@/pages/app/management-marketing-referrals";
import ManagementMarketingSocialFeedPage from "@/pages/app/management-marketing-social-feed";
import ManagementOnlineStorePage from "@/pages/app/management-online-store";
import SettingsEmailPage from "@/pages/app/settings-email";
import ManagementFormsPage from "@/pages/app/management-forms";
import ManagementAIPage from "@/pages/app/management-ai";
import ManagementReportsMarginPage from "@/pages/app/management-reports-margin";
import ManagementReportsZReportPage from "@/pages/app/management-reports-z-report";
import ManagementReportsVoidAuditPage from "@/pages/app/management-reports-void-audit";
import ManagementReportsStaffLeaderboardPage from "@/pages/app/management-reports-staff-leaderboard";
import ManagementReportsProductPerformancePage from "@/pages/app/management-reports-product-performance";

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/kpis")                        return <ManagementKpisPage />;
  if (location === "/management/marketing/referrals")         return <ManagementMarketingReferralsPage />;
  if (location === "/management/marketing/social-feed")       return <ManagementMarketingSocialFeedPage />;
  if (location === "/management/online-store")                return <ManagementOnlineStorePage />;
  if (location === "/management/email")                       return <SettingsEmailPage />;
  if (location === "/management/forms")                       return <ManagementFormsPage />;
  if (location === "/management/ai")                          return <ManagementAIPage />;
  if (location === "/management/reports/margin")              return <ManagementReportsMarginPage />;
  if (location === "/management/reports/z-report")            return <ManagementReportsZReportPage />;
  if (location === "/management/reports/void-audit")          return <ManagementReportsVoidAuditPage />;
  if (location === "/management/reports/staff-leaderboard")   return <ManagementReportsStaffLeaderboardPage />;
  if (location === "/management/reports/product-performance") return <ManagementReportsProductPerformancePage />;
  if (location === "/management/daily-reports")               return <ManagementDailyReportsPage />;
  if (location.startsWith("/management/reports"))             return <ManagementReportsBasPage />;
  return <ManagementSalesPage />;
}

export default function ManagementMarketingHub() {
  return (
    <ManagementHubLayout title="Marketing & Reports" tabs={MARKETING_HUB_TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
