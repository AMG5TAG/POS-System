import type { ComponentType } from "react";
import {
  Users, Radio, Link2, Gift, Percent,
  BarChart2, TrendingUp, Target, UserPlus, Share2, Globe, Mail, FileText, Brain, Activity,
  UserSquare2, Clock, Coins, Monitor, Map, MapPin, Camera, Scale, TabletSmartphone, LayoutDashboard,
  Boxes, Tag, Layers, LayoutTemplate, Printer, Cpu, HardDrive, Smartphone, Puzzle, Recycle, Repeat,
  UserCircle, Building2, Receipt, Plug, ArrowLeftRight, Sparkles, FolderSync, MessageSquare, Palette,
} from "lucide-react";

export interface HubTab {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Additional paths that should also highlight this tab (sub-routes / aliases). */
  matchPaths?: string[];
}

export interface ManagementHub {
  title: string;
  tabs: HubTab[];
}

/**
 * Single source of truth for every Management hub's title and tab structure.
 *
 * Both the hub layout (tab rails / mobile strip) and the global breadcrumb in
 * app-layout derive from this list, so a hub's navigation and its breadcrumb
 * trail can never drift apart. Each tab route resolves to the breadcrumb
 * trail `Management › <Hub title> › <Tab label>`.
 */

export const CUSTOMERS_HUB_TABS: HubTab[] = [
  { label: "Settings",            href: "/management/customers/settings",            icon: Users  },
  { label: "Heard From",          href: "/management/customers/heard-from", icon: Radio  },
  { label: "Portal",              href: "/management/customers/portal",     icon: Link2  },
  { label: "Loyalty",             href: "/management/customers/loyalty",              icon: Gift,
    matchPaths: ["/management/customers/loyalty/leaderboard"] },
  { label: "Gift Cards",          href: "/management/customers/gift-cards",           icon: Gift   },
  { label: "Service Plans",       href: "/management/customers/service-plans",        icon: Repeat },
  {
    label: "Discounts & Pricing",
    href: "/management/customers/discounts-pricing",
    icon: Percent,
    matchPaths: ["/management/customers/discounts-pricing/pricing-rules", "/management/customers/discounts-pricing/layby"],
  },
];

export const MARKETING_HUB_TABS: HubTab[] = [
  { label: "Sales Overview",  href: "/management/marketing-reports/sales-overview",       icon: BarChart2  },
  {
    label: "Reports",
    href: "/management/marketing-reports/reports",
    icon: TrendingUp,
    matchPaths: [
      "/management/marketing-reports/reports/margin",
      "/management/marketing-reports/reports/z-report",
      "/management/marketing-reports/reports/void-audit",
      "/management/marketing-reports/reports/staff-leaderboard",
      "/management/marketing-reports/reports/product-performance",
      "/management/marketing-reports/reports/daily",
    ],
  },
  { label: "Analytics",       href: "/management/marketing-reports/analytics",     icon: Activity   },
  { label: "KPIs & Targets",  href: "/management/marketing-reports/kpis-targets",                   icon: Target     },
  { label: "Referrals",       href: "/management/marketing-reports/referrals",     icon: UserPlus   },
  { label: "Social Feed",     href: "/management/marketing-reports/social-feed",   icon: Share2     },
  { label: "Online Store",    href: "/management/marketing-reports/online-store",            icon: Globe      },
  { label: "Email",           href: "/management/marketing-reports/email",                   icon: Mail       },
  { label: "Forms & Files",   href: "/management/marketing-reports/forms-files",                   icon: FileText   },
  { label: "AI Assistant",    href: "/management/marketing-reports/ai-assistant",                      icon: Brain      },
];

export const OPERATIONS_HUB_TABS: HubTab[] = [
  { label: "Employees",     href: "/management/staff-operations/employees",              icon: UserSquare2 },
  { label: "Timesheets",    href: "/management/staff-operations/timesheets",    icon: Clock       },
  { label: "Cost Summary",  href: "/management/staff-operations/cost-summary", icon: Coins       },
  { label: "POS Registers", href: "/management/staff-operations/pos-registers",          icon: Monitor     },
  { label: "Floor Plan",    href: "/management/staff-operations/floor-plan",         icon: Map         },
  { label: "Cameras",       href: "/management/staff-operations/cameras",            icon: Camera      },
  { label: "Tech App",      href: "/management/staff-operations/tech-app",           icon: TabletSmartphone },
  { label: "Dashboard",     href: "/management/staff-operations/dashboard",      icon: LayoutDashboard },
  { label: "Legal",         href: "/management/staff-operations/legal",              icon: Scale       },
];

export const PRODUCTS_HUB_TABS: HubTab[] = [
  { label: "Inventory",       href: "/management/products-inventory/inventory",               icon: Boxes          },
  { label: "Product Types",   href: "/management/products-inventory/product-types",           icon: Tag            },
  { label: "Modifier Groups", href: "/management/products-inventory/modifier-groups",         icon: Layers         },
  { label: "Sales",           href: "/management/products-inventory/sales",               icon: LayoutTemplate },
  { label: "Loaners",         href: "/management/products-inventory/loaners",             icon: Smartphone },
  { label: "Parts Compat",    href: "/management/products-inventory/parts-compatibility", icon: Puzzle },
  { label: "Trade-Ins",       href: "/management/products-inventory/trade-ins",           icon: Recycle },
  { label: "Labels",          href: "/management/products-inventory/labels",                  icon: Printer        },
  { label: "3D Prints",       href: "/management/products-inventory/3d-prints", icon: Cpu            },
  { label: "PC Builder",      href: "/management/products-inventory/pc-builder",  icon: HardDrive      },
  { label: "Time Cards",      href: "/management/products-inventory/time-cards",  icon: Clock          },
];

export const SETTINGS_HUB_TABS: HubTab[] = [
  { label: "Account",          href: "/management/settings-integrations/account",       icon: UserCircle     },
  { label: "Locations",        href: "/management/settings-integrations/locations",     icon: MapPin         },
  {
    label: "Business Details",
    href: "/management/settings-integrations/business-details",
    icon: Building2,
    matchPaths: ["/management/settings-integrations/business-details/regional"],
  },
  { label: "Tax",              href: "/management/settings-integrations/tax",            icon: Receipt        },
  { label: "Themes",           href: "/management/settings-integrations/themes",         icon: Palette        },
  {
    label: "Integrations",
    href: "/management/settings-integrations/integrations",
    icon: Plug,
    matchPaths: ["/management/settings-integrations/integrations/tyro-eftpos", "/management/settings-integrations/integrations/xero", "/management/settings-integrations/integrations/help"],
  },
  {
    label: "Sync",
    href: "/management/settings-integrations/sync",
    icon: FolderSync,
    matchPaths: ["/management/settings-integrations/sync/backup"],
  },
  { label: "Import / Export",  href: "/management/settings-integrations/import-export",  icon: ArrowLeftRight },
  {
    label: "System",
    href: "/management/settings-integrations/system",
    icon: Sparkles,
    matchPaths: ["/management/settings-integrations/system/misc"],
  },
  { label: "Feedback",         href: "/management/settings-integrations/feedback",       icon: MessageSquare  },
];

export const MANAGEMENT_HUBS: ManagementHub[] = [
  { title: "Customers",             tabs: CUSTOMERS_HUB_TABS },
  { title: "Marketing & Reports",   tabs: MARKETING_HUB_TABS },
  { title: "Staff & Operations",    tabs: OPERATIONS_HUB_TABS },
  { title: "Products & Inventory",  tabs: PRODUCTS_HUB_TABS },
  { title: "Settings & Integrations", tabs: SETTINGS_HUB_TABS },
];

/**
 * Route → breadcrumb-trail map derived from the hub structure above:
 *   "/management/customers/settings" → ["Management", "Customers", "Settings"]
 * Includes each tab's `matchPaths` so sub-routes share the tab's trail.
 */
export const HUB_ROUTE_LABELS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const hub of MANAGEMENT_HUBS) {
    for (const tab of hub.tabs) {
      const trail = ["Management", hub.title, tab.label];
      out[tab.href] = trail;
      for (const p of tab.matchPaths ?? []) out[p] = trail;
    }
  }
  return out;
})();
