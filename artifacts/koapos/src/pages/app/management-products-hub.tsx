import { useLocation } from "wouter";
import { ManagementHubLayout } from "@/components/layout/management-hub-layout";
import { PRODUCTS_HUB_TABS } from "@/components/layout/management-hubs";

import ManagementInventoryPage from "@/pages/app/management-inventory";
import SettingsProductTypesPage from "@/pages/app/settings-product-types";
import SettingsModifierGroupsPage from "@/pages/app/settings-modifier-groups";
import ManagementTemplatesPage from "@/pages/app/management-templates";
import ManagementStickersPage from "@/pages/app/management-stickers";
import ManagementCalculators3DPage from "@/pages/app/management-calculators-3d";
import ManagementCalculatorsPCBuilderPage from "@/pages/app/management-calculators-pc-builder";

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/product-types")          return <SettingsProductTypesPage />;
  if (location === "/management/modifier-groups")        return <SettingsModifierGroupsPage />;
  if (location === "/management/templates")              return <ManagementTemplatesPage />;
  if (location === "/management/stickers")               return <ManagementStickersPage />;
  if (location === "/management/calculators/pc-builder") return <ManagementCalculatorsPCBuilderPage />;
  if (location.startsWith("/management/calculators"))    return <ManagementCalculators3DPage />;
  return <ManagementInventoryPage />;
}

export default function ManagementProductsHub() {
  return (
    <ManagementHubLayout title="Products & Inventory" tabs={PRODUCTS_HUB_TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
