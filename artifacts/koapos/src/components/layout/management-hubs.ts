import type { ComponentType } from "react";
import {
  Users, Radio, Link2, Gift, Percent, Repeat, Wrench,
  BarChart2, TrendingUp, Target, UserPlus, Globe, Mail, FileText, Brain, Activity, QrCode,
  UserSquare2, Clock, Coins, Monitor, Map, MapPin, Camera, Scale, TabletSmartphone, LayoutDashboard,
  Boxes, Tag, Layers, LayoutTemplate, Printer, Cpu, HardDrive, Smartphone, Puzzle, Recycle, Calculator,
  UserCircle, Building2, Receipt, Plug, ArrowLeftRight, FolderSync, MessageSquare, Palette,
  LayoutGrid, MoreHorizontal, Settings, Image as ImageIcon,
} from "lucide-react";

/**
 * Single source of truth for the Management navigation tree.
 *
 * The sidebar/nav rail in app-layout renders MANAGEMENT_SUBNAV directly, and
 * both the flat per-hub tab lists (MANAGEMENT_HUBS) and the breadcrumb trails
 * (HUB_ROUTE_LABELS) are *derived* from that same tree — so a page cannot be
 * added to one and silently missed by the others.
 *
 * Adding a Management page means adding a leaf here and a <Route> in App.tsx.
 * Nothing else needs touching.
 */

export type NavLeaf     = { name: string; href: string; icon: ComponentType<{ className?: string }>; matchPaths?: string[] };
export type NavSubGroup = { name: string; children: NavLeaf[]; icon: ComponentType<{ className?: string }> };
export type NavGroup    = { name: string; children: (NavLeaf | NavSubGroup)[]; icon: ComponentType<{ className?: string }>; defaultHref?: string };
export type NavItem     = NavLeaf | NavGroup;

export const MANAGEMENT_SUBNAV: NavItem[] = [
  { name: "Overview", href: "/management/overview", icon: LayoutDashboard },
  {
    name: "Customers", icon: Users, defaultHref: "/management/customers/settings",
    children: [
      { name: "Settings",            href: "/management/customers/settings",            icon: Users         },
      { name: "Heard From",          href: "/management/customers/heard-from",          icon: Radio         },
      { name: "Portal",              href: "/management/customers/portal",              icon: Link2         },
      { name: "Loyalty",             href: "/management/customers/loyalty",             icon: Gift,
        matchPaths: ["/management/customers/loyalty/leaderboard"] },
      { name: "Gift Cards",          href: "/management/customers/gift-cards",          icon: Gift          },
      { name: "Service Plans",       href: "/management/customers/service-plans",       icon: Repeat        },
      { name: "Discounts & Pricing", href: "/management/customers/discounts-pricing",   icon: Percent,
        matchPaths: ["/management/customers/discounts-pricing/pricing-rules", "/management/customers/discounts-pricing/layby"] },
    ],
  },
  {
    name: "Invoices & Services", icon: Receipt, defaultHref: "/management/invoices-services/invoices",
    children: [
      { name: "Invoices",        href: "/management/invoices-services/invoices",        icon: FileText },
      { name: "Service Options", href: "/management/invoices-services/service-options", icon: Wrench   },
    ],
  },
  {
    name: "Products & Inventory", icon: Boxes, defaultHref: "/management/products-inventory/inventory",
    children: [
      { name: "Inventory",           href: "/management/products-inventory/inventory",           icon: Boxes     },
      { name: "Product Types",       href: "/management/products-inventory/product-types",       icon: Tag       },
      { name: "Modifier Groups",     href: "/management/products-inventory/modifier-groups",     icon: Layers    },
      { name: "Loaners",             href: "/management/products-inventory/loaners",             icon: Smartphone },
      { name: "Parts Compatibility", href: "/management/products-inventory/parts-compatibility", icon: Puzzle    },
      { name: "Trade-Ins",           href: "/management/products-inventory/trade-ins",           icon: Recycle   },
      { name: "Time Cards",          href: "/management/products-inventory/time-cards",          icon: Clock     },
      {
        name: "Calculators", icon: Calculator,
        children: [
          { name: "3D Prints",  href: "/management/products-inventory/3d-prints",  icon: Cpu       },
          { name: "PC Builder", href: "/management/products-inventory/pc-builder", icon: HardDrive },
        ],
      },
    ],
  },
  {
    name: "Staff & Operations", icon: UserSquare2, defaultHref: "/management/staff-operations/employees",
    children: [
      { name: "Employees",      href: "/management/staff-operations/employees",     icon: UserSquare2 },
      { name: "Timesheets",     href: "/management/staff-operations/timesheets",    icon: Clock       },
      { name: "Cost Summary",   href: "/management/staff-operations/cost-summary",  icon: Coins       },
      { name: "POS Registers",  href: "/management/staff-operations/pos-registers", icon: Monitor     },
      { name: "KPIs & Targets", href: "/management/staff-operations/kpis-targets",  icon: Target      },
      { name: "Sales Settings", href: "/management/sales-settings",                 icon: Receipt     },
      { name: "Floor Plan",     href: "/management/staff-operations/floor-plan",    icon: Map         },
      { name: "Cameras",        href: "/management/staff-operations/cameras",       icon: Camera      },
      {
        name: "Apps", icon: LayoutGrid,
        children: [
          { name: "Dashboard",  href: "/management/staff-operations/dashboard",  icon: LayoutDashboard  },
          { name: "Mobile POS", href: "/management/staff-operations/mobile-pos", icon: Smartphone       },
          { name: "Tech App",   href: "/management/staff-operations/tech-app",   icon: TabletSmartphone },
        ],
      },
      { name: "Legal",          href: "/management/staff-operations/legal",         icon: Scale       },
    ],
  },
  {
    name: "Marketing & Reports", icon: TrendingUp, defaultHref: "/management/marketing-reports/sales-overview",
    children: [
      { name: "Sales Overview", href: "/management/marketing-reports/sales-overview", icon: BarChart2 },
      { name: "Reports",        href: "/management/marketing-reports/reports",        icon: TrendingUp,
        matchPaths: [
          "/management/marketing-reports/reports/daily",
          "/management/marketing-reports/reports/margin",
          "/management/marketing-reports/reports/z-report",
          "/management/marketing-reports/reports/void-audit",
          "/management/marketing-reports/reports/staff-leaderboard",
          "/management/marketing-reports/reports/product-performance",
        ] },
      { name: "Analytics",      href: "/management/marketing-reports/analytics",      icon: Activity  },
      { name: "Referrals",      href: "/management/marketing-reports/referrals",      icon: UserPlus  },
      {
        name: "Landing Pages", icon: LayoutTemplate,
        children: [
          { name: "Pages",     href: "/management/marketing-reports/landing-pages/pages",     icon: Globe          },
          { name: "Templates", href: "/management/marketing-reports/landing-pages/templates", icon: LayoutTemplate },
        ],
      },
      {
        name: "Generators", icon: QrCode,
        children: [
          { name: "QR Codes",         href: "/management/marketing-reports/generators/qr-codes",         icon: QrCode },
          { name: "Shortlinks",       href: "/management/marketing-reports/generators/shortlinks",       icon: Link2  },
          { name: "Email Signatures", href: "/management/marketing-reports/generators/email-signatures", icon: Mail   },
        ],
      },
      { name: "Online Store",   href: "/management/marketing-reports/online-store",   icon: Globe    },
      { name: "Forms & Files",  href: "/management/marketing-reports/forms-files",    icon: FileText },
      { name: "AI Assistant",   href: "/management/marketing-reports/ai-assistant",   icon: Brain    },
    ],
  },
  {
    name: "Settings & Integrations", icon: Settings, defaultHref: "/management/settings-integrations/account",
    children: [
      { name: "Account",          href: "/management/settings-integrations/account",          icon: UserCircle     },
      { name: "Locations",        href: "/management/settings-integrations/locations",        icon: MapPin         },
      { name: "Business Details", href: "/management/settings-integrations/business-details", icon: Building2,
        matchPaths: ["/management/settings-integrations/business-details/regional"] },
      { name: "Tax",              href: "/management/settings-integrations/tax",              icon: Receipt        },
      { name: "Surcharges",       href: "/management/settings-integrations/surcharges",       icon: Percent        },
      { name: "Themes",           href: "/management/settings-integrations/themes",           icon: Palette        },
      {
        name: "Templates", icon: LayoutTemplate,
        children: [
          { name: "Sales",  href: "/management/products-inventory/sales",  icon: LayoutTemplate },
          { name: "Labels", href: "/management/products-inventory/labels", icon: Printer,
            matchPaths: ["/management/products-inventory/stickers", "/management/sticker-templates"] }, // legacy paths → redirect to Labels
          { name: "Misc",   href: "/management/templates/misc",  icon: FileText },
          { name: "Emails", href: "/management/templates/email", icon: Mail     },
        ],
      },
      { name: "SMS",              href: "/management/settings-integrations/sms",              icon: MessageSquare  },
      { name: "Emails",           href: "/management/marketing-reports/email",                icon: Mail           },
      { name: "Integrations",     href: "/management/settings-integrations/integrations",     icon: Plug,
        matchPaths: [
          "/management/settings-integrations/integrations/tyro-eftpos",
          "/management/settings-integrations/integrations/xero",
          "/management/settings-integrations/integrations/help",
        ] },
      { name: "Sync",             href: "/management/settings-integrations/sync",             icon: FolderSync    },
      { name: "Import / Export",  href: "/management/settings-integrations/import-export",    icon: ArrowLeftRight },
      { name: "Uploads",          href: "/management/settings-integrations/uploads",          icon: ImageIcon      },
      { name: "Misc",             href: "/management/settings-integrations/system/misc",      icon: MoreHorizontal,
        matchPaths: ["/management/settings-integrations/system"] },
      { name: "Feedback",         href: "/management/settings-integrations/feedback",         icon: MessageSquare  },
    ],
  },
];

/* ─── Derived views ──────────────────────────────────────────────────────── */

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

const isGroup = (item: NavItem): item is NavGroup => "children" in item;
const isSubGroup = (child: NavLeaf | NavSubGroup): child is NavSubGroup => "children" in child;

const toTab = (leaf: NavLeaf): HubTab => ({
  label: leaf.name,
  href: leaf.href,
  icon: leaf.icon,
  ...(leaf.matchPaths ? { matchPaths: leaf.matchPaths } : {}),
});

/**
 * Every hub with its tabs flattened one level: a sub-group's children are
 * spliced in where the sub-group sits, since a tab rail has no second row.
 */
export const MANAGEMENT_HUBS: ManagementHub[] = MANAGEMENT_SUBNAV
  .filter(isGroup)
  .map((group) => ({
    title: group.name,
    tabs: group.children.flatMap((child) => (isSubGroup(child) ? child.children.map(toTab) : [toTab(child)])),
  }));

/**
 * Route → breadcrumb-trail map derived from the tree above:
 *   "/management/customers/settings" → ["Management", "Customers", "Settings"]
 *   "/management/products-inventory/3d-prints"
 *     → ["Management", "Products & Inventory", "Calculators", "3D Prints"]
 * Includes each leaf's `matchPaths` so sub-routes share their tab's trail.
 */
export const HUB_ROUTE_LABELS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  const addLeaf = (leaf: NavLeaf, trail: string[]) => {
    const full = [...trail, leaf.name];
    out[leaf.href] = full;
    for (const p of leaf.matchPaths ?? []) out[p] = full;
  };
  for (const item of MANAGEMENT_SUBNAV) {
    if (!isGroup(item)) { addLeaf(item, ["Management"]); continue; }
    for (const child of item.children) {
      if (isSubGroup(child)) {
        for (const leaf of child.children) addLeaf(leaf, ["Management", item.name, child.name]);
      } else {
        addLeaf(child, ["Management", item.name]);
      }
    }
  }
  return out;
})();
