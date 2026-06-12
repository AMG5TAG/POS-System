import type { ComponentType } from "react";
import {
  Users, Radio, Link2, Gift, Percent,
  BarChart2, TrendingUp, Target, UserPlus, Share2, Globe, Mail, FileText, Brain,
  UserSquare2, Clock, Coins, Monitor, Map, Camera, Scale, TabletSmartphone, LayoutDashboard,
  Boxes, Tag, Layers, LayoutTemplate, Printer, Cpu, HardDrive,
  UserCircle, Building2, Receipt, Plug, ArrowLeftRight, Sparkles, FolderSync, MessageSquare,
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
  { label: "Settings",            href: "/management/customers",            icon: Users  },
  { label: "Heard From",          href: "/management/customers/heard-from", icon: Radio  },
  { label: "Portal",              href: "/management/customers/portal",     icon: Link2  },
  { label: "Loyalty",             href: "/management/loyalty",              icon: Gift,
    matchPaths: ["/management/loyalty/leaderboard"] },
  { label: "Gift Cards",          href: "/management/gift-cards",           icon: Gift   },
  {
    label: "Discounts & Pricing",
    href: "/management/discounts",
    icon: Percent,
    matchPaths: ["/management/pricing-rules", "/management/layby"],
  },
];

export const MARKETING_HUB_TABS: HubTab[] = [
  { label: "Sales Overview",  href: "/management/sales-overview",       icon: BarChart2  },
  {
    label: "Reports",
    href: "/management/reports/bas",
    icon: TrendingUp,
    matchPaths: [
      "/management/reports/margin",
      "/management/reports/z-report",
      "/management/reports/void-audit",
      "/management/reports/staff-leaderboard",
      "/management/reports/product-performance",
      "/management/daily-reports",
    ],
  },
  { label: "KPIs & Targets",  href: "/management/kpis",                   icon: Target     },
  { label: "Referrals",       href: "/management/marketing/referrals",     icon: UserPlus   },
  { label: "Social Feed",     href: "/management/marketing/social-feed",   icon: Share2     },
  { label: "Online Store",    href: "/management/online-store",            icon: Globe      },
  { label: "Email",           href: "/management/email",                   icon: Mail       },
  { label: "Forms & Files",   href: "/management/forms",                   icon: FileText   },
  { label: "AI Assistant",    href: "/management/ai",                      icon: Brain      },
];

export const OPERATIONS_HUB_TABS: HubTab[] = [
  { label: "Employees",     href: "/management/staff",              icon: UserSquare2 },
  { label: "Timesheets",    href: "/management/staff/timesheet",    icon: Clock       },
  { label: "Cost Summary",  href: "/management/staff/cost-summary", icon: Coins       },
  { label: "POS Registers", href: "/management/registers",          icon: Monitor     },
  { label: "Floor Plan",    href: "/management/floor-plan",         icon: Map         },
  { label: "Cameras",       href: "/management/cameras",            icon: Camera      },
  { label: "Tech App",      href: "/management/tech-app",           icon: TabletSmartphone },
  { label: "Dashboard",     href: "/management/dashboard-app",      icon: LayoutDashboard },
  { label: "Legal",         href: "/management/legal",              icon: Scale       },
];

export const PRODUCTS_HUB_TABS: HubTab[] = [
  { label: "Inventory",       href: "/management/inventory",               icon: Boxes          },
  { label: "Product Types",   href: "/management/product-types",           icon: Tag            },
  { label: "Modifier Groups", href: "/management/modifier-groups",         icon: Layers         },
  { label: "Sales",           href: "/management/templates",               icon: LayoutTemplate },
  { label: "Stickers",        href: "/management/stickers",                icon: Printer        },
  { label: "3D Prints",       href: "/management/calculators/3d-printing", icon: Cpu            },
  { label: "PC Builder",      href: "/management/calculators/pc-builder",  icon: HardDrive      },
];

export const SETTINGS_HUB_TABS: HubTab[] = [
  { label: "Account",          href: "/management/account",       icon: UserCircle     },
  {
    label: "Business Details",
    href: "/management/business",
    icon: Building2,
    matchPaths: ["/management/regional"],
  },
  { label: "Tax",              href: "/management/tax",            icon: Receipt        },
  {
    label: "Integrations",
    href: "/management/integrations",
    icon: Plug,
    matchPaths: ["/management/tyro-eftpos", "/management/xero"],
  },
  {
    label: "Sync",
    href: "/management/sync",
    icon: FolderSync,
    matchPaths: ["/management/backup"],
  },
  { label: "Import / Export",  href: "/management/import-export",  icon: ArrowLeftRight },
  {
    label: "System",
    href: "/management/koapos",
    icon: Sparkles,
    matchPaths: ["/management/misc"],
  },
  { label: "Feedback",         href: "/management/feedback",       icon: MessageSquare  },
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
 *   "/management/customers" → ["Management", "Customers", "Settings"]
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
