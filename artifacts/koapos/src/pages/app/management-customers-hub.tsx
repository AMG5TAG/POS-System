import { useLocation } from "wouter";
import { ManagementHubLayout, type HubTab } from "@/components/layout/management-hub-layout";
import { Users, Radio, Gift, Percent } from "lucide-react";

import SettingsCustomersPage from "@/pages/app/settings-customers";
import ManagementCustomersHeardFromPage from "@/pages/app/management-customers-heard-from";
import ManagementLoyaltyPage from "@/pages/app/management-loyalty";
import ManagementLoyaltyLeaderboardPage from "@/pages/app/management-loyalty-leaderboard";
import ManagementGiftCardsPage from "@/pages/app/management-gift-cards";
import ManagementDiscountsPage from "@/pages/app/management-discounts";
import ManagementLaybyPage from "@/pages/app/management-layby";
import SettingsPricingRulesPage from "@/pages/app/settings-pricing-rules";

const TABS: HubTab[] = [
  { label: "Settings",            href: "/management/customers",            icon: Users         },
  { label: "Heard From",          href: "/management/customers/heard-from", icon: Radio         },
  { label: "Loyalty",             href: "/management/loyalty",              icon: Gift,
    matchPaths: ["/management/loyalty/leaderboard"] },
  { label: "Gift Cards",          href: "/management/gift-cards",           icon: Gift          },
  {
    label: "Discounts & Pricing",
    href: "/management/discounts",
    icon: Percent,
    matchPaths: ["/management/pricing-rules", "/management/layby"],
  },
];

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/customers/heard-from")  return <ManagementCustomersHeardFromPage />;
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
    <ManagementHubLayout title="Customers" tabs={TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
