import { useLocation } from "wouter";
import { ManagementHubLayout, type HubTab } from "@/components/layout/management-hub-layout";
import { Boxes, Tag, Layers, LayoutTemplate, Printer, Calculator } from "lucide-react";

import ManagementInventoryPage from "@/pages/app/management-inventory";
import SettingsProductTypesPage from "@/pages/app/settings-product-types";
import SettingsModifierGroupsPage from "@/pages/app/settings-modifier-groups";
import ManagementTemplatesPage from "@/pages/app/management-templates";
import ManagementStickersPage from "@/pages/app/management-stickers";
import ManagementStickerTemplatesPage from "@/pages/app/management-sticker-templates";
import ManagementCalculators3DPage from "@/pages/app/management-calculators-3d";
import ManagementCalculatorsPCBuilderPage from "@/pages/app/management-calculators-pc-builder";

const TABS: HubTab[] = [
  { label: "Inventory",  href: "/management/inventory",               icon: Boxes          },
  { label: "Product Types",      href: "/management/product-types",           icon: Tag            },
  { label: "Modifier Groups",    href: "/management/modifier-groups",         icon: Layers         },
  { label: "Sale Templates",     href: "/management/templates",               icon: LayoutTemplate },
  {
    label: "Labels & Stickers",
    href: "/management/stickers",
    icon: Printer,
    matchPaths: ["/management/sticker-templates"],
  },
  {
    label: "Calculators",
    href: "/management/calculators/3d-printing",
    icon: Calculator,
    matchPaths: ["/management/calculators/pc-builder"],
  },
];

function HubContent() {
  const [location] = useLocation();

  if (location === "/management/product-types")          return <SettingsProductTypesPage />;
  if (location === "/management/modifier-groups")        return <SettingsModifierGroupsPage />;
  if (location === "/management/templates")              return <ManagementTemplatesPage />;
  if (location === "/management/stickers")               return <ManagementStickersPage />;
  if (location === "/management/sticker-templates")      return <ManagementStickerTemplatesPage />;
  if (location === "/management/calculators/pc-builder") return <ManagementCalculatorsPCBuilderPage />;
  if (location.startsWith("/management/calculators"))    return <ManagementCalculators3DPage />;
  return <ManagementInventoryPage />;
}

export default function ManagementProductsHub() {
  return (
    <ManagementHubLayout title="Products & Inventory" tabs={TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
