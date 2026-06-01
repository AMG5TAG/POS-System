import { useLocation } from "wouter";
import { ManagementHubLayout, type HubTab } from "@/components/layout/management-hub-layout";
import { UserCircle, Building2, Receipt, Plug, ArrowLeftRight, Sparkles } from "lucide-react";

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

const TABS: HubTab[] = [
  { label: "Account & Modules",  href: "/management/account",       icon: UserCircle     },
  {
    label: "Business Details",
    href: "/management/business",
    icon: Building2,
    matchPaths: ["/management/regional"],
  },
  { label: "Tax",                href: "/management/tax",            icon: Receipt        },
  {
    label: "Integrations",
    href: "/management/integrations",
    icon: Plug,
    matchPaths: ["/management/tyro-eftpos", "/management/xero"],
  },
  { label: "Import / Export",    href: "/management/import-export",  icon: ArrowLeftRight },
  {
    label: "System",
    href: "/management/koapos",
    icon: Sparkles,
    matchPaths: ["/management/misc"],
  },
];

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/business")      return <SettingsBusinessPage />;
  if (location === "/management/regional")      return <SettingsRegionalPage />;
  if (location === "/management/tax")           return <SettingsTaxPage />;
  if (location === "/management/integrations")  return <ManagementIntegrationsPage />;
  if (location === "/management/tyro-eftpos")   return <SettingsTyroEftposPage />;
  if (location === "/management/xero")          return <ManagementXeroPage />;
  if (location === "/management/import-export") return <ManagementImportExportPage />;
  if (location === "/management/koapos")        return <ManagementKoaPOSPage />;
  if (location === "/management/misc")          return <ManagementMiscPage />;
  return <SettingsAccountPage />;
}

export default function ManagementSettingsHub() {
  return (
    <ManagementHubLayout title="Settings & Integrations" tabs={TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
