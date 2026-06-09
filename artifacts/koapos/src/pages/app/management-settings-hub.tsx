import { useLocation } from "wouter";
import { ManagementHubLayout } from "@/components/layout/management-hub-layout";
import { SETTINGS_HUB_TABS } from "@/components/layout/management-hubs";

import SettingsAccountPage from "@/pages/app/settings-account";
import SettingsBusinessPage from "@/pages/app/settings-business";
import SettingsRegionalPage from "@/pages/app/settings-regional";
import SettingsTaxPage from "@/pages/app/settings-tax";
import ManagementIntegrationsPage from "@/pages/app/management-integrations";
import SettingsTyroEftposPage from "@/pages/app/settings-tyro-eftpos";
import ManagementXeroPage from "@/pages/app/management-xero";
import ManagementImportExportPage from "@/pages/app/management-import-export";
import ManagementKoaPOSPage from "@/pages/app/management-koapos";
import ManagementMiscPage from "@/pages/app/management-misc";
import ManagementFeedbackPage from "@/pages/app/management-feedback";
import ManagementBackupPage from "@/pages/app/management-backup";

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/business")      return <SettingsBusinessPage />;
  if (location === "/management/regional")      return <SettingsRegionalPage />;
  if (location === "/management/tax")           return <SettingsTaxPage />;
  if (location === "/management/integrations")  return <ManagementIntegrationsPage />;
  if (location === "/management/tyro-eftpos")   return <SettingsTyroEftposPage />;
  if (location === "/management/xero")          return <ManagementXeroPage />;
  if (location === "/management/import-export") return <ManagementImportExportPage />;
  if (location === "/management/feedback")      return <ManagementFeedbackPage />;
  if (location === "/management/backup")        return <ManagementBackupPage />;
  if (location === "/management/koapos")        return <ManagementKoaPOSPage />;
  if (location === "/management/misc")          return <ManagementMiscPage />;
  return <SettingsAccountPage />;
}

export default function ManagementSettingsHub() {
  return (
    <ManagementHubLayout title="Settings & Integrations" tabs={SETTINGS_HUB_TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
