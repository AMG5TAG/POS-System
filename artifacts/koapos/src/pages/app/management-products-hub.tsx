import { useLocation } from "wouter";
import { ManagementHubLayout, type HubTab } from "@/components/layout/management-hub-layout";
import { Boxes, Tag, Layers, LayoutTemplate, Printer, Cpu, HardDrive } from "lucide-react";

import ManagementInventoryPage from "@/pages/app/management-inventory";
import SettingsProductTypesPage from "@/pages/app/settings-product-types";
import SettingsModifierGroupsPage from "@/pages/app/settings-modifier-groups";
import ManagementTemplatesPage from "@/pages/app/management-templates";
import ManagementStickersPage from "@/pages/app/management-stickers";
import ManagementCalculators3DPage from "@/pages/app/management-calculators-3d";
import ManagementCalculatorsPCBuilderPage from "@/pages/app/management-calculators-pc-builder";

const TABS: HubTab[] = [
  { label: "Inventory",       href: "/management/inventory",               icon: Boxes          },
  { label: "Product Types",   href: "/management/product-types",           icon: Tag            },
  { label: "Modifier Groups", href: "/management/modifier-groups",         icon: Layers         },
  { label: "Sales",           href: "/management/templates",               icon: LayoutTemplate },
  {
    label: "Stickers",
    href: "/management/stickers",
    icon: Printer,
  },
  { label: "3D Prints",  href: "/management/calculators/3d-printing", icon: Cpu       },
  { label: "PC Builder", href: "/management/calculators/pc-builder",  icon: HardDrive },
];

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
    <ManagementHubLayout title="Products & Inventory" tabs={TABS}>
      <HubContent />
    </ManagementHubLayout>
  );
}
