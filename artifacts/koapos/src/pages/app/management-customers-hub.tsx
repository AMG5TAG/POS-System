import { useLocation } from "wouter";
import { ManagementHubLayout } from "@/components/layout/management-hub-layout";
import { CUSTOMERS_HUB_TABS } from "@/components/layout/management-hubs";

import SettingsCustomersPage from "@/pages/app/settings-customers";
import ManagementCustomersHeardFromPage from "@/pages/app/management-customers-heard-from";
import ManagementCustomersPortalPage from "@/pages/app/management-customers-portal";
import ManagementLoyaltyPage from "@/pages/app/management-loyalty";
import ManagementLoyaltyLeaderboardPage from "@/pages/app/management-loyalty-leaderboard";
import ManagementGiftCardsPage from "@/pages/app/management-gift-cards";
import ManagementDiscountsPage from "@/pages/app/management-discounts";
import ManagementLaybyPage from "@/pages/app/management-layby";
import SettingsPricingRulesPage from "@/pages/app/settings-pricing-rules";

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/customers/heard-from")  return <ManagementCustomersHeardFromPage />;
  if (location === "/management/customers/portal")      return <ManagementCustomersPortalPage />;
  if (location === "/management/loyalty/leaderboard")   return <ManagementLoyaltyLeaderboardPage />;
  if (location === "/management/loyalty")               return <ManagementLoyaltyPage />;
  if (location === "/management/gift-cards")            return <ManagementGiftCardsPage />;
  if (location === "/management/discounts")             return <ManagementDiscountsPage />;
  if (location === "/management/pricing-rules")         return <SettingsPricingRulesPage />;
  if (location === "/management/layby")                 return <ManagementLaybyPage />;
  return <SettingsCustomersPage />;
}

export default function ManagementCustomersHub() {
  return (
    <ManagementHubLayout title="Customers" tabs={CUSTOMERS_HUB_TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
