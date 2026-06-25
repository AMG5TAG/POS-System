import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/use-auth";
import { customerDisplayName } from "@/lib/customer-name";
import { useTheme } from "@/lib/theme";
import { useNavLayout, type NavLayoutMode } from "@/lib/nav-layout";
import { useAccessibility } from "@/lib/accessibility";
import { useAppTheme } from "@/lib/app-theme";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ShoppingCart, Package, Users, Receipt,
  Boxes, UserSquare2, Settings, Blocks, LogOut, LogIn, CalendarClock, Wallet,
  Wrench, ChevronDown, LayoutGrid, Layers, ClipboardList, Clock,
  RotateCcw, Truck, Bookmark, Tag, Hash, AlertTriangle, History,
  FileText, Package2, ParkingCircle, Coins, TrendingUp,
  BriefcaseBusiness, ArrowLeftRight, Search, Sun, Moon, Radio,
  ChevronRight, Building2, Globe, UserCircle, Monitor, Gift, Trophy,
  Percent, LayoutTemplate, Printer, Check, X, Menu, Accessibility,
  Cpu, Calculator, HardDrive, Target, StickyNote, Link2, Mail, Keyboard,
  Megaphone, QrCode, BarChart2, Send, Zap, Share2, UserPlus, Sparkles,
  ShoppingBag, Map, MoreHorizontal, MessageSquare, Camera, Brain, ReceiptText,
  CreditCard, Plug, Scale, Lock, TabletSmartphone, Smartphone, ShieldCheck, FolderSync, Activity, Palette,
} from "lucide-react";
import { KEYBOARD_SHORTCUTS, getEnabledShortcuts } from "@/lib/keyboard-shortcuts";
import { useEmbedded } from "@/lib/embedded-context";
import {
  useLogout,
  useListCustomers,
  useListServiceJobs,
  useListAppointments,
  useListProducts,
  useGetAuthEventsUnreadCount,
  useGetStaffClockStatus,
  useClockIn,
  useClockOut,
  useListStaff,
  useVerifyStaffPin,
  useGetPosSettings,
  type Customer,
  type Appointment,
  type ServiceJob,
  type Product,
  type Staff,
} from "@workspace/api-client-react";
import { useStaffSession } from "@/lib/staff-day-session";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarFooter,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { LocationSwitcher } from "@/components/layout/location-switcher";

/* ─── Nav data ───────────────────────────────────────────────────────────── */

const POS_SUBNAV = [
  { name: "Sell",      href: "/pos/sell",            icon: ShoppingCart },
  { name: "3D Prints", href: "/pos/3d-prints",  icon: Cpu },
  { name: "PC Builder", href: "/pos/pc-builder", icon: HardDrive },
  { name: "History",   href: "/pos/history",    icon: History },
  { name: "Invoices",  href: "/pos/invoices",   icon: FileText },
  { name: "Quotes",    href: "/pos/quotes",     icon: ClipboardList },
  { name: "Laybys",    href: "/pos/laybys",    icon: Package2 },
  { name: "Parked",    href: "/pos/parked",     icon: ParkingCircle },
  { name: "Refund",    href: "/pos/refund",     icon: RotateCcw },
  { name: "Cash",      href: "/pos/cash",       icon: Coins },
  { name: "End of Day", href: "/pos/eod",       icon: Moon },
];

const CUSTOMERS_SUBNAV = [
  { name: "Forms", href: "/customers/forms", icon: FileText },
];

const STAFF_SUBNAV: NavItem[] = [
  { name: "Overview",    href: "/staff/overview",     icon: LayoutGrid    },
  { name: "Rostering",   href: "/staff/rostering",    icon: CalendarClock },
  { name: "Payroll",     href: "/staff/payroll",      icon: Wallet        },
  { name: "Notes",       href: "/staff/notes",        icon: StickyNote    },
  { name: "KPIs",        href: "/staff/kpis",         icon: Target        },
  { name: "Links",       href: "/staff/links",        icon: Link2         },
  { name: "Social Feed", href: "/staff/social-feed",  icon: Share2        },
];

const ONLINE_SUBNAV: NavItem[] = [
  { name: "Deliveries", href: "/online/deliveries", icon: Package2    },
  { name: "Shipping",        href: "/online/shipping",        icon: Truck       },
  { name: "Marketplace",     href: "/online/marketplace",     icon: ShoppingBag },
];

const MARKETING_SUBNAV: NavItem[] = [
  { name: "Overview",      href: "/marketing/overview",                      icon: BarChart2 },
  {
    name: "Email",
    icon: Mail,
    href: "/marketing/email/campaigns",
    children: [
      { name: "Campaigns", href: "/marketing/email/campaigns", icon: Send },
      { name: "Templates",       href: "/marketing/email/templates",  icon: FileText },
    ],
  },
  {
    name: "SMS",
    icon: MessageSquare,
    href: "/marketing/sms/campaigns",
    children: [
      { name: "Campaigns", href: "/marketing/sms/campaigns", icon: Send },
      { name: "Templates", href: "/marketing/sms/templates",  icon: FileText },
    ],
  },
  { name: "Social Media",  href: "/marketing/social",               icon: Share2 },
  {
    name: "Loyalty",
    icon: Gift,
    children: [
      { name: "Promos",  href: "/marketing/loyalty/promos",  icon: Zap   },
      { name: "Leaders", href: "/marketing/loyalty/leaders", icon: Trophy },
    ],
  },
  { name: "Automation",    href: "/marketing/automation",       icon: Zap },
  { name: "Referrals",     href: "/marketing/referrals",        icon: UserPlus },
];

const INVENTORY_SUBNAV = [
  { name: "Overview",        href: "/inventory/overview",        icon: LayoutGrid },
  { name: "Products",        href: "/inventory/products",                 icon: Package },
  { name: "Bundles",         href: "/inventory/bundles",         icon: Layers },
  { name: "Stocktake",       href: "/inventory/stocktake",       icon: ClipboardList },
  { name: "Purchase Orders", href: "/inventory/purchase-orders", icon: ShoppingCart },
  { name: "Pre-Orders",      href: "/inventory/pre-orders",      icon: Clock },
  { name: "Return Auth.",    href: "/inventory/return-auth",     icon: RotateCcw },
  { name: "Suppliers",       href: "/inventory/suppliers",       icon: Truck },
  { name: "Brands",          href: "/inventory/brands",          icon: Bookmark },
  { name: "Categories",      href: "/inventory/categories",      icon: Tag },
  { name: "Tags",            href: "/inventory/tags",            icon: Hash },
  { name: "Recalls",         href: "/inventory/recalls",         icon: AlertTriangle },
  { name: "Warranty",        href: "/inventory/warranty",        icon: ShieldCheck },
  { name: "Wastage",         href: "/inventory/wastage",        icon: AlertTriangle },
];

type NavLeaf     = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; matchPaths?: string[] };
type NavSubGroup = { name: string; children: NavLeaf[]; icon: React.ComponentType<{ className?: string }> };
type NavGroup    = { name: string; children: (NavLeaf | NavSubGroup)[]; icon: React.ComponentType<{ className?: string }>; defaultHref?: string };
type NavItem     = NavLeaf | NavGroup;

const MANAGEMENT_SUBNAV: NavItem[] = [
  { name: "Overview", href: "/management/overview", icon: LayoutDashboard },
  {
    name: "Customers", icon: Users, defaultHref: "/management/customers/settings",
    children: [
      { name: "Settings",            href: "/management/customers/settings",            icon: Users         },
      { name: "Heard From",          href: "/management/customers/heard-from", icon: Radio         },
      { name: "Portal",              href: "/management/customers/portal",     icon: Link2         },
      { name: "Loyalty",             href: "/management/customers/loyalty",              icon: Gift,
        matchPaths: ["/management/customers/loyalty/leaderboard"] },
      { name: "Gift Cards",          href: "/management/customers/gift-cards",           icon: Gift          },
      { name: "Discounts & Pricing", href: "/management/customers/discounts-pricing",            icon: Percent,
        matchPaths: ["/management/customers/discounts-pricing/pricing-rules", "/management/customers/discounts-pricing/layby"] },
    ],
  },
  {
    name: "Invoices & Services", icon: Receipt, defaultHref: "/management/invoices-services/service-options",
    children: [
      { name: "Service Options", href: "/management/invoices-services/service-options", icon: Wrench },
    ],
  },
  {
    name: "Products & Inventory", icon: Boxes, defaultHref: "/management/products-inventory/inventory",
    children: [
      { name: "Inventory",       href: "/management/products-inventory/inventory",       icon: Boxes    },
      { name: "Product Types",   href: "/management/products-inventory/product-types",   icon: Tag      },
      { name: "Modifier Groups", href: "/management/products-inventory/modifier-groups", icon: Layers   },
      {
        name: "Calculators", icon: Calculator,
        children: [
          { name: "3D Prints",  href: "/management/products-inventory/3d-prints", icon: Cpu       },
          { name: "PC Builder", href: "/management/products-inventory/pc-builder",  icon: HardDrive },
        ],
      },
    ],
  },
  {
    name: "Staff & Operations", icon: UserSquare2, defaultHref: "/management/staff-operations/employees",
    children: [
      { name: "Employees",     href: "/management/staff-operations/employees",              icon: UserSquare2 },
      { name: "Timesheets",    href: "/management/staff-operations/timesheets",    icon: Clock       },
      { name: "Cost Summary",  href: "/management/staff-operations/cost-summary", icon: Coins       },
      { name: "POS Registers", href: "/management/staff-operations/pos-registers",          icon: Monitor     },
      { name: "Sales Settings", href: "/management/sales-settings",    icon: Receipt     },
      { name: "Floor Plan",    href: "/management/staff-operations/floor-plan",         icon: Map         },
      { name: "Cameras",       href: "/management/staff-operations/cameras",            icon: Camera      },
      {
        name: "Apps", icon: LayoutGrid,
        children: [
          { name: "Dashboard",  href: "/management/staff-operations/dashboard", icon: LayoutDashboard  },
          { name: "Mobile POS", href: "/management/staff-operations/mobile-pos",     icon: Smartphone },
          { name: "Tech App",   href: "/management/staff-operations/tech-app",      icon: TabletSmartphone },
        ],
      },
      { name: "Legal",         href: "/management/staff-operations/legal",              icon: Scale       },
    ],
  },
  {
    name: "Marketing & Reports", icon: TrendingUp, defaultHref: "/management/marketing-reports/sales-overview",
    children: [
      { name: "Sales Overview", href: "/management/marketing-reports/sales-overview",       icon: BarChart2  },
      { name: "Reports",        href: "/management/marketing-reports/reports", icon: TrendingUp,
        matchPaths: ["/management/marketing-reports/reports/daily"] },
      { name: "Analytics",      href: "/management/marketing-reports/analytics",   icon: Activity   },
      { name: "KPIs & Targets", href: "/management/marketing-reports/kpis-targets",                 icon: Target     },
      { name: "Referrals",      href: "/management/marketing-reports/referrals",  icon: UserPlus   },
      { name: "Social Feed",    href: "/management/marketing-reports/social-feed",icon: Share2     },
      {
        name: "Landing Pages", icon: LayoutTemplate,
        children: [
          { name: "Pages",         href: "/management/marketing-reports/landing-pages/pages",          icon: Globe },
          { name: "Templates",     href: "/management/marketing-reports/landing-pages/templates", icon: LayoutTemplate },
        ],
      },
      {
        name: "Generators", icon: QrCode,
        children: [
          { name: "QR Codes",   href: "/management/marketing-reports/generators/qr-codes",   icon: QrCode },
          { name: "Shortlinks", href: "/management/marketing-reports/generators/shortlinks", icon: Link2  },
        ],
      },
      { name: "Online Store",   href: "/management/marketing-reports/online-store",         icon: Globe      },
      { name: "Forms & Files",  href: "/management/marketing-reports/forms-files",                icon: FileText   },
      { name: "AI Assistant",   href: "/management/marketing-reports/ai-assistant",                   icon: Brain      },
    ],
  },
  {
    name: "Settings & Integrations", icon: Settings, defaultHref: "/management/settings-integrations/account",
    children: [
      { name: "Account",           href: "/management/settings-integrations/account",       icon: UserCircle     },
      { name: "Business Details",  href: "/management/settings-integrations/business-details",      icon: Building2,
        matchPaths: ["/management/settings-integrations/business-details/regional"] },
      { name: "Tax",               href: "/management/settings-integrations/tax",           icon: Receipt        },
      { name: "Surcharges",        href: "/management/settings-integrations/surcharges",    icon: Percent        },
      { name: "Themes",            href: "/management/settings-integrations/themes",        icon: Palette        },
      {
        name: "Templates", icon: LayoutTemplate,
        children: [
          { name: "Sales",             href: "/management/products-inventory/sales",        icon: LayoutTemplate },
          { name: "Stickers",          href: "/management/products-inventory/stickers",         icon: Printer,
            matchPaths: ["/management/sticker-templates"] }, // legacy path → redirects to /management/stickers
          { name: "Misc",              href: "/management/templates/misc",   icon: FileText },
        ],
      },
      { name: "SMS",               href: "/management/settings-integrations/sms",           icon: MessageSquare  },
      { name: "Emails",            href: "/management/marketing-reports/email",         icon: Mail           },
      { name: "Integrations",      href: "/management/settings-integrations/integrations",  icon: Plug,
        matchPaths: ["/management/settings-integrations/integrations/tyro-eftpos", "/management/settings-integrations/integrations/xero"] },
      { name: "Sync",              href: "/management/settings-integrations/sync",          icon: FolderSync,
        matchPaths: ["/management/settings-integrations/sync/backup"] },
      { name: "Import / Export",   href: "/management/settings-integrations/import-export", icon: ArrowLeftRight },
      { name: "Misc",              href: "/management/settings-integrations/system/misc",          icon: MoreHorizontal },
      { name: "Feedback",          href: "/management/settings-integrations/feedback",      icon: MessageSquare  },
    ],
  },
];

/* ─── Search index ───────────────────────────────────────────────────────── */

const SEARCH_INDEX = [
  { label: "Dashboard",          href: "/dashboard",                   icon: LayoutDashboard, group: "Pages" },
  { label: "POS · Sell",         href: "/pos/sell",                         icon: ShoppingCart,    group: "POS" },
  { label: "POS · History",      href: "/pos/history",                 icon: History,         group: "POS" },
  { label: "POS · Invoices",     href: "/pos/invoices",                icon: FileText,        group: "POS" },
  { label: "POS · Quotes",       href: "/pos/quotes",                  icon: ClipboardList,   group: "POS" },
  { label: "POS · Laybys",       href: "/pos/laybys",                 icon: Package2,        group: "POS" },
  { label: "POS · Parked",       href: "/pos/parked",                  icon: ParkingCircle,   group: "POS" },
  { label: "POS · Refund",       href: "/pos/refund",                  icon: RotateCcw,       group: "POS" },
  { label: "Services",           href: "/services",                icon: Wrench,          group: "Pages" },
  { label: "Appointments",       href: "/appointments",                icon: CalendarClock,   group: "Pages" },
  { label: "Customers",          href: "/customers",                   icon: Users,           group: "Pages" },
  { label: "Customers · Forms", href: "/customers/forms",             icon: FileText,        group: "Customers" },
  { label: "Products",           href: "/inventory/products",                    icon: Package,         group: "Inventory" },
  { label: "Inventory Overview", href: "/inventory/overview",           icon: LayoutGrid,      group: "Inventory" },
  { label: "Stocktake",          href: "/inventory/stocktake",          icon: ClipboardList,   group: "Inventory" },
  { label: "Suppliers",          href: "/inventory/suppliers",          icon: Truck,           group: "Inventory" },
  { label: "Categories",         href: "/inventory/categories",         icon: Tag,             group: "Inventory" },
  { label: "Staff · Employees",  href: "/staff/employees",                       icon: UserSquare2,     group: "Staff" },
  { label: "Staff · Timesheet",  href: "/staff/timesheet",             icon: Clock,           group: "Staff" },
  { label: "Staff · Rostering",  href: "/staff/rostering",             icon: CalendarClock,   group: "Staff" },
  { label: "Staff · Costs",      href: "/staff/costs",          icon: Coins,           group: "Staff" },
  { label: "Staff · Notes",      href: "/staff/notes",                 icon: StickyNote,      group: "Staff" },
  { label: "Staff · KPIs",       href: "/staff/kpis",                  icon: Target,          group: "Staff" },
  { label: "Staff · Links",        href: "/staff/links",                        icon: Link2,    group: "Staff" },
  { label: "Staff · Social Feed", href: "/staff/social-feed",                  icon: Share2,   group: "Staff" },
  { label: "3D Prints",          href: "/pos/3d-prints",                          icon: Cpu,          group: "POS" },
  { label: "PC Builder",             href: "/pos/pc-builder",                      icon: HardDrive,   group: "POS" },
  { label: "POS · End of Day",            href: "/pos/eod",                                       icon: Moon,          group: "POS"        },
  { label: "Overview",            href: "/management/overview",         icon: LayoutDashboard, group: "Management" },
  { label: "Account",            href: "/management/settings-integrations/account",          icon: UserCircle,      group: "Management" },
  { label: "Themes",             href: "/management/settings-integrations/themes",           icon: Palette,         group: "Management" },
  { label: "Modules",            href: "/management/settings-integrations/account/modules",                     icon: Blocks,          group: "Management" },
  { label: "AI Assistant",       href: "/management/marketing-reports/ai-assistant",             icon: Brain,          group: "Management" },
  { label: "Business Details",   href: "/management/settings-integrations/business-details",         icon: Building2,       group: "Management" },
  { label: "Regional Settings",  href: "/management/settings-integrations/business-details/regional",         icon: Globe,           group: "Management" },
  { label: "Calculators · 3D",       href: "/management/products-inventory/3d-prints",  icon: Calculator,  group: "Management" },
  { label: "Calculators · PC Builder", href: "/management/products-inventory/pc-builder", icon: HardDrive,   group: "Management" },
  { label: "Camera Management",             href: "/management/staff-operations/cameras",                    icon: Camera,         group: "Management"  },
  { label: "Customers",          href: "/management/customers/settings",        icon: Users,           group: "Management" },
  { label: "Customers · Heard From", href: "/management/customers/heard-from", icon: Radio,         group: "Management" },
  { label: "Customers · Portal",    href: "/management/customers/portal",     icon: Link2,         group: "Management" },
  { label: "Discounts",          href: "/management/customers/discounts-pricing",        icon: Percent,         group: "Management" },
  { label: "Emails",              href: "/management/marketing-reports/email",                      icon: Mail,         group: "Management" },
  { label: "SMS Settings",        href: "/management/settings-integrations/sms",                        icon: MessageSquare, group: "Management" },
  { label: "Feedback",                      href: "/management/settings-integrations/feedback",                   icon: MessageSquare,  group: "Management" },
  { label: "Floor Plan",         href: "/management/staff-operations/floor-plan",       icon: Map,             group: "Management" },
  { label: "Forms & Files",     href: "/management/marketing-reports/forms-files",            icon: FileText,        group: "Management" },
  { label: "Gift Cards",        href: "/management/customers/gift-cards",       icon: Gift,            group: "Management" },
  { label: "Import / Export",   href: "/management/settings-integrations/import-export",    icon: ArrowLeftRight,  group: "Management" },
  { label: "Integrations",       href: "/management/settings-integrations/integrations",     icon: Receipt,         group: "Management" },
  { label: "Integrations · Tyro EFTPOS", href: "/management/settings-integrations/integrations/tyro-eftpos", icon: CreditCard,   group: "Management" },
  { label: "Inventory Settings",       href: "/management/products-inventory/inventory",         icon: Boxes,           group: "Management" },
  { label: "Inventory · Modifier Groups", href: "/management/products-inventory/modifier-groups",   icon: Layers,          group: "Management" },
  { label: "Inventory · Product Types",   href: "/management/products-inventory/product-types",     icon: Tag,             group: "Management" },
  { label: "KPIs & Targets",     href: "/management/marketing-reports/kpis-targets",             icon: Target,          group: "Management" },
  { label: "KoaPOS Partner Referrals",     href: "/management/settings-integrations/system/misc",                    icon: Sparkles,  group: "Management" },
  { label: "Layby",              href: "/management/customers/discounts-pricing/layby",            icon: Package2,        group: "Management" },
  { label: "Labels",             href: "/management/products-inventory/stickers",         icon: Tag,             group: "Management" },
  { label: "Sticker Templates",  href: "/management/products-inventory/stickers",         icon: LayoutTemplate,  group: "Management" },
  { label: "Loyalty",            href: "/management/customers/loyalty",          icon: Gift,            group: "Management" },
  { label: "Marketing · Referral Settings", href: "/management/marketing-reports/referrals",       icon: UserPlus, group: "Management" },
  { label: "Marketing · Social Feed Settings", href: "/management/marketing-reports/social-feed", icon: Share2, group: "Management" },
  { label: "Misc",                          href: "/management/settings-integrations/system/misc",                       icon: MoreHorizontal, group: "Management" },
  { label: "Online Store",              href: "/management/marketing-reports/online-store",  icon: Globe,        group: "Management" },
  { label: "POS Registers",      href: "/management/staff-operations/pos-registers",        icon: Monitor,         group: "Management" },
  { label: "Sales Settings",     href: "/management/sales-settings",   icon: Receipt,         group: "Management" },
  { label: "Sales",               href: "/management/products-inventory/sales",        icon: LayoutTemplate,  group: "Management" },
  { label: "Customer PDF Template", href: "/management/templates/misc",  icon: FileText,        group: "Management" },
  /* moved under Inventory */
  { label: "Tax Settings",       href: "/management/settings-integrations/tax",                        icon: Receipt,      group: "Management" },
  { label: "Reports",             href: "/management/marketing-reports/sales-overview",   icon: TrendingUp,      group: "Management" },
  { label: "Wastage / Write-off",         href: "/inventory/wastage",                            icon: AlertTriangle, group: "Inventory"  },
  { label: "Marketing · Overview",             href: "/marketing/overview",                          icon: BarChart2,  group: "Marketing" },
  { label: "Marketing · Email Campaigns",       href: "/marketing/email/campaigns",          icon: Send,       group: "Marketing" },
  { label: "Marketing · Email Templates",      href: "/marketing/email/templates",          icon: FileText,   group: "Marketing" },
  { label: "Marketing · SMS Campaigns",        href: "/marketing/sms/campaigns",            icon: Send,       group: "Marketing" },
  { label: "Marketing · SMS Templates",        href: "/marketing/sms/templates",            icon: FileText,   group: "Marketing" },
  { label: "Marketing · Social Media",         href: "/marketing/social",                   icon: Share2,     group: "Marketing" },
  { label: "Marketing · QR Codes",             href: "/management/marketing-reports/generators/qr-codes",   icon: QrCode,     group: "Management" },
  { label: "Marketing · Shortlinks",           href: "/management/marketing-reports/generators/shortlinks", icon: Link2,      group: "Management" },
  { label: "Marketing · Landing Pages",        href: "/management/marketing-reports/landing-pages/pages",         icon: LayoutTemplate, group: "Management" },
  { label: "Marketing · Landing Page Templates", href: "/management/marketing-reports/landing-pages/templates", icon: LayoutTemplate, group: "Management" },
  { label: "Marketing · Loyalty Promos",    href: "/marketing/loyalty/promos",  icon: Zap,    group: "Marketing" },
  { label: "Marketing · Loyalty Leaders",  href: "/marketing/loyalty/leaders", icon: Trophy, group: "Marketing" },
  { label: "Cameras",                       href: "/cameras",                               icon: Camera,         group: "Pages"       },
  { label: "Marketing · Referrals",       href: "/marketing/referrals",                  icon: UserPlus,  group: "Marketing"  },
  { label: "Marketing · Automation",         href: "/marketing/automation",                icon: Zap,       group: "Marketing" },
  { label: "Online · Deliveries",     href: "/online/deliveries",   icon: Package2,     group: "Online"     },
  { label: "Online · Shipping",         href: "/online/shipping",          icon: Truck,        group: "Online"     },
  { label: "Online · Marketplace",      href: "/online/marketplace",       icon: ShoppingBag,  group: "Online"     },
  { label: "Registers · POS Settings",   href: "/management/staff-operations/pos-registers#pos-settings",            icon: Monitor,       group: "Registers"  },
  { label: "Registers · Hardware",        href: "/management/staff-operations/pos-registers#hardware",                icon: HardDrive,     group: "Registers"  },
  { label: "Registers · Shortcuts",       href: "/management/staff-operations/pos-registers#shortcuts",               icon: Keyboard,      group: "Registers"  },
  { label: "Reports · Payments",          href: "/management/marketing-reports/sales-overview#payments",           icon: Receipt,       group: "Reports"    },
  { label: "Reports · Inventory",         href: "/management/marketing-reports/sales-overview#inventory",          icon: Package,       group: "Reports"    },
  { label: "Reports · Profit & Loss",     href: "/management/marketing-reports/sales-overview#profit-loss",        icon: TrendingUp,    group: "Reports"    },
  { label: "Reports · Top Products",      href: "/management/marketing-reports/sales-overview#top-products",       icon: Boxes,         group: "Reports"    },
  { label: "Reports · Register Closures", href: "/management/marketing-reports/sales-overview#register-closures",  icon: Monitor,       group: "Reports"    },
  { label: "Reports · BAS / GST",         href: "/management/marketing-reports/reports",                        icon: Receipt,       group: "Reports"    },
  { label: "Reports · Margin & Profit",   href: "/management/marketing-reports/reports/margin",                     icon: TrendingUp,    group: "Reports"    },
  { label: "Reports · Daily Closes",      href: "/management/marketing-reports/reports/daily",                        icon: ReceiptText,   group: "Reports"    },
  { label: "Reports · Customer Insights", href: "/management/marketing-reports/sales-overview#customer-insights",  icon: Users,         group: "Reports"    },
  { label: "Reports · GST / BAS",         href: "/management/marketing-reports/sales-overview#gst-bas",            icon: Receipt,       group: "Reports"    },
  { label: "Reports · Cash Movements",    href: "/management/marketing-reports/sales-overview#cash-movements",     icon: Coins,         group: "Reports"    },
  { label: "Reports · Report Builder",    href: "/management/marketing-reports/sales-overview#report-builder",     icon: LayoutGrid,    group: "Reports"    },
  { label: "Reports · Gift Cards",        href: "/management/marketing-reports/sales-overview#gift-cards",         icon: Gift,          group: "Reports"    },
  { label: "Reports · Scheduled",         href: "/management/marketing-reports/sales-overview#scheduled",          icon: CalendarClock, group: "Reports"    },
  { label: "Reports · User Activity",     href: "/management/marketing-reports/sales-overview#user-activity",      icon: Users,         group: "Reports"    },
  { label: "Analytics",                   href: "/management/marketing-reports/analytics",                        icon: Activity,      group: "Reports"    },
];

/* ─── Route → breadcrumb label ───────────────────────────────────────────── */

const SEGMENT_LABEL: Record<string, string> = {
  "pos": "POS",
  "sms": "SMS",
  "kpis": "KPIs",
  "kpis-targets": "KPIs & Targets",
  "qr-codes": "QR Codes",
  "pc-builder": "PC Builder",
  "pre-orders": "Pre-Orders",
  "3d-prints": "3D Prints",
  "ai-assistant": "AI Assistant",
  "pos-registers": "POS Registers",
  "import-export": "Import / Export",
  "forms-files": "Forms & Files",
  "discounts-pricing": "Discounts & Pricing",
  "marketing-reports": "Marketing & Reports",
  "staff-operations": "Staff & Operations",
  "products-inventory": "Products & Inventory",
  "settings-integrations": "Settings & Integrations",
  "invoices-services": "Invoices & Services",
  "service-options": "Service Options",
  "mobile-pos": "Mobile POS",
};

function inMarketingSection(loc: string): boolean {
  return loc === "/marketing" || loc.startsWith("/marketing/");
}
function inManagementSection(loc: string): boolean {
  return loc.startsWith("/management/") || loc === "/modules" || loc.startsWith("/settings/");
}


/** Title-case a raw path segment, e.g. "purchase-orders" → "Purchase Orders". */
function titleCaseSegment(seg: string): string {
  return seg
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Breadcrumb labels for a route, falling back to a title-cased path trail. */
/** Breadcrumb labels for a route, derived from its URL segments. */
function routeLabels(location: string): string[] {
  const segments = location.split("/").filter(Boolean);
  if (!segments.length) return ["Home"];
  return segments.map((seg) => SEGMENT_LABEL[seg] ?? titleCaseSegment(seg));
}

/* ─── Staff clock in/out dialog ──────────────────────────────────────────── */

type ClockStep = "pin" | "confirm" | "done";

function StaffClockDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [pin, setPin] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setPin(""); setSubmitted(false); };

  const { data: status, isFetching, error } = useGetStaffClockStatus({ pin }, {
    query: {
      queryKey: ["/api/staff-timesheets/status", pin],
      enabled: submitted && pin.length >= 4,
      retry: false,
      staleTime: 0,
    },
  });

  const clockInMutation  = useClockIn();
  const clockOutMutation = useClockOut();

  const handleClose = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleSubmitPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) { toast.error("Enter your 4-digit PIN"); return; }
    setSubmitted(true);
  };

  const handleClockIn = () => {
    clockInMutation.mutate({ data: { pin } }, {
      onSuccess: (entry) => {
        toast.success(`${entry.staffName} clocked in at ${entry.clockIn}`);
        handleClose(false);
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Clock-in failed";
        toast.error(msg);
      },
    });
  };

  const handleClockOut = () => {
    clockOutMutation.mutate({ data: { pin } }, {
      onSuccess: (entry) => {
        const hours = entry.clockOut && entry.clockIn
          ? (() => {
              const [ih, im] = entry.clockIn.split(":").map(Number);
              const [oh, om] = (entry.clockOut as string).split(":").map(Number);
              const mins = (oh! * 60 + om!) - (ih! * 60 + im!);
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return m > 0 ? `${h}h ${m}m` : `${h}h`;
            })()
          : "";
        toast.success(`${entry.staffName} clocked out${hours ? ` — ${hours} worked` : ""}`);
        handleClose(false);
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Clock-out failed";
        toast.error(msg);
      },
    });
  };

  const isPending = clockInMutation.isPending || clockOutMutation.isPending;
  const apiError  = (error as { message?: string } | null)?.message;
  const showConfirm = submitted && !isFetching && status && !apiError;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4" /> Staff Clock In / Out
          </DialogTitle>
          <DialogDescription>Enter your PIN to clock in or out for today.</DialogDescription>
        </DialogHeader>

        {!showConfirm ? (
          <form onSubmit={handleSubmitPin} className="space-y-4 py-1">
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setSubmitted(false); }}
              placeholder="Enter PIN"
              className="text-center text-2xl tracking-widest h-12"
              autoFocus
            />
            {apiError && (
              <p className="text-sm text-destructive text-center">{apiError}</p>
            )}
            <Button type="submit" className="w-full" disabled={isFetching || pin.length < 4}>
              {isFetching ? "Looking up…" : "Continue"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4 py-1">
            <div className="rounded-lg bg-muted px-4 py-3 text-center">
              <p className="font-semibold text-base">{status.staffName}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {status.clockedIn
                  ? `Clocked in since ${status.clockInTime}`
                  : "Not clocked in today"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { reset(); }}>
                Back
              </Button>
              {status.clockedIn ? (
                <Button className="flex-1 gap-1.5" onClick={handleClockOut} disabled={isPending}>
                  <LogOut className="w-4 h-4" />
                  {clockOutMutation.isPending ? "Clocking out…" : "Clock Out"}
                </Button>
              ) : (
                <Button className="flex-1 gap-1.5" onClick={handleClockIn} disabled={isPending}>
                  <LogIn className="w-4 h-4" />
                  {clockInMutation.isPending ? "Clocking in…" : "Clock In"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Global search ──────────────────────────────────────────────────────── */

type SearchResultItem = {
  label: string;
  sub?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  action?: () => void;
};

function GlobalSearch({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [clockOpen, setClockOpen] = useState(false);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { settings: themeSettings } = useAppTheme();

  const setOpenWithCallback = (val: boolean) => { setOpen(val); onOpenChange?.(val); };

  // Debounce query for API calls
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Reset active index when query changes
  useEffect(() => { setActiveIdx(0); }, [debouncedQ]);

  const q = debouncedQ.toLowerCase();
  const liveEnabled = q.length >= 2;

  // Server-side search: customers and products support a search param
  const { data: custData, isFetching: custFetching } = useListCustomers(
    { search: debouncedQ, limit: 5 },
    { query: { enabled: liveEnabled, staleTime: 15000, queryKey: ["gs-customers", debouncedQ] } },
  );
  const { data: prodData, isFetching: prodFetching } = useListProducts(
    { search: debouncedQ, limit: 5 },
    { query: { enabled: liveEnabled, staleTime: 15000, queryKey: ["gs-products", debouncedQ] } },
  );
  // Client-side filter: service jobs and appointments (no server search param)
  const { data: svcData } = useListServiceJobs(
    { query: { enabled: liveEnabled, staleTime: 60000, queryKey: ["gs-service-jobs"] } },
  );
  const { data: apptData } = useListAppointments(
    undefined,
    { query: { enabled: liveEnabled, staleTime: 60000, queryKey: ["gs-appointments"] } },
  );

  const isSearching = liveEnabled && (custFetching || prodFetching);

  const CLOCK_QUICK_ACTION: SearchResultItem = {
    label: "Staff Clock In / Out",
    sub: "Record shift start or end with PIN",
    href: "#staff-clock",
    icon: Clock,
    group: "Quick Actions",
    action: () => setClockOpen(true),
  };

  // Build sections
  const sections: { title: string; items: SearchResultItem[] }[] = [];

  if (liveEnabled) {
    const customers = ((custData as { items?: Customer[] } | undefined)?.items ?? [])
      .slice(0, 5)
      .map((c): SearchResultItem => ({
        label: customerDisplayName(c, "") || c.email || "Customer",
        sub: c.email ?? c.phone ?? undefined,
        href: "/customers",
        icon: Users,
        group: "Customer",
        action: () => {
          sessionStorage.setItem("koapos_open_customer", String(c.id));
          navigate("/customers");
        },
      }));
    if (customers.length) sections.push({ title: "Customers", items: customers });

    const products = ((prodData as { items?: Product[] } | undefined)?.items ?? [])
      .slice(0, 5)
      .map((p): SearchResultItem => ({
        label: p.name,
        sub: p.sku ? `${formatCurrency(p.price)} · ${p.sku}` : formatCurrency(p.price),
        href: "/inventory/products",
        icon: Package,
        group: "Product",
      }));
    if (products.length) sections.push({ title: "Products", items: products });

    const rawJobs = svcData as ServiceJob[] | { items?: ServiceJob[] } | undefined;
    const jobs = (Array.isArray(rawJobs) ? rawJobs : (rawJobs as { items?: ServiceJob[] })?.items ?? [])
      .filter((j) => {
        const haystack = [j.jobNumber, (j as ServiceJob & { deviceDescription?: string }).deviceDescription, (j as ServiceJob & { deviceType?: string }).deviceType, j.customerName].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 5)
      .map((j): SearchResultItem => ({
        label: `#${j.jobNumber ?? j.id} — ${(j as ServiceJob & { deviceDescription?: string }).deviceDescription ?? (j as ServiceJob & { deviceType?: string }).deviceType ?? "Service Job"}`,
        sub: j.customerName ?? undefined,
        href: `/services/${j.id}`,
        icon: Wrench,
        group: "Service",
      }));
    if (jobs.length) sections.push({ title: "Services", items: jobs });

    const appts = (Array.isArray(apptData) ? apptData as Appointment[] : [])
      .filter((a) => `${a.title} ${a.customerName ?? ""}`.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a): SearchResultItem => ({
        label: a.title,
        sub: a.customerName ?? undefined,
        href: "/appointments",
        icon: CalendarClock,
        group: "Appointment",
      }));
    if (appts.length) sections.push({ title: "Appointments", items: appts });
  }

  const navItems = q.length === 0
    ? SEARCH_INDEX.slice(0, 6)
    : SEARCH_INDEX.filter((item) =>
        item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)
      ).slice(0, 5);
  if (navItems.length) sections.push({ title: q ? "Navigation" : "Quick Navigation", items: navItems });

  // Staff clock action — always show when no query; show when query matches
  const clockMatches = q.length === 0 || ["clock", "staff", "login", "shift", "in", "out"].some(kw => kw.includes(q) || q.includes(kw));
  if (clockMatches) {
    sections.push({ title: "Quick Actions", items: [CLOCK_QUICK_ACTION] });
  }

  // Flat indexed list for keyboard nav
  const allItems = sections.flatMap((s) => s.items);
  const totalItems = allItems.length;

  // Build flat entries (headers + items) for rendering
  const flatEntries: ({ kind: "header"; title: string } | { kind: "item"; item: SearchResultItem; idx: number })[] = [];
  let itemCounter = 0;
  for (const section of sections) {
    flatEntries.push({ kind: "header", title: section.title });
    for (const item of section.items) {
      flatEntries.push({ kind: "item", item, idx: itemCounter++ });
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpenWithCallback(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpenWithCallback(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpenWithCallback(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const go = (item: SearchResultItem) => {
    if (item.action) { item.action(); }
    else { navigate(item.href); }
    setOpenWithCallback(false);
    setQuery("");
    setDebouncedQ("");
    inputRef.current?.blur();
  };

  // Themes setting: hide the universal search bar entirely.
  if (themeSettings.hideSearchBar) return null;

  const layout = themeSettings.searchBarLayout;
  const collapsedIcon = layout === "icon" && !open && query.length === 0;
  const outerCls = cn(
    "relative",
    layout === "expanded" && "flex-1",
    layout === "compact" && "w-56 max-w-full shrink-0",
    layout === "icon" && (collapsedIcon ? "w-9 shrink-0" : "flex-1"),
  );

  return (
    <div ref={containerRef} className={outerCls}>
      <div className="relative">
        <Search
          onMouseDown={collapsedIcon ? () => { setOpenWithCallback(true); inputRef.current?.focus(); } : undefined}
          className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors", collapsedIcon ? "cursor-pointer" : "pointer-events-none", isSearching ? "text-primary animate-pulse" : "text-muted-foreground")}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpenWithCallback(true)}
          onChange={(e) => { setQuery(e.target.value); setOpenWithCallback(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, totalItems - 1)); }
            if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter" && allItems[activeIdx]) { go(allItems[activeIdx]); }
            if (e.key === "Escape") { setOpenWithCallback(false); inputRef.current?.blur(); }
          }}
          placeholder={collapsedIcon ? "" : "Search customers, products, services…"}
          className={cn(
            "h-9 pl-9 rounded-md border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background transition-all",
            collapsedIcon ? "w-9 pr-0 cursor-pointer" : "w-full pr-14",
          )}
        />
        {!collapsedIcon && (
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground font-mono border rounded px-1 py-0.5">⌘K</kbd>
        )}
      </div>
      {open && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden min-w-[320px]">
          {flatEntries.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
              {isSearching ? "Searching…" : "No results found."}
            </div>
          ) : (
            <div ref={listRef} className="py-1 max-h-[420px] overflow-y-auto">
              {flatEntries.map((entry, i) =>
                entry.kind === "header" ? (
                  <div key={`h-${i}`} className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
                    {entry.title}
                  </div>
                ) : (
                  <button
                    key={`item-${entry.idx}`}
                    data-active={entry.idx === activeIdx}
                    onMouseDown={() => go(entry.item)}
                    onMouseEnter={() => setActiveIdx(entry.idx)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left group",
                      entry.idx === activeIdx
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    <entry.item.icon className={cn("w-4 h-4 shrink-0", entry.idx === activeIdx ? "text-primary-foreground/80" : "text-muted-foreground")} />
                    <span className="flex-1 font-medium truncate">{entry.item.label}</span>
                    {entry.item.sub && (
                      <span className={cn("text-xs shrink-0 max-w-[140px] truncate", entry.idx === activeIdx ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {entry.item.sub}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
      <StaffClockDialog open={clockOpen} onOpenChange={setClockOpen} />
    </div>
  );
}

/* ─── Breadcrumbs ────────────────────────────────────────────────────────── */

function Breadcrumbs({ location }: { location: string }) {
  const labels = routeLabels(location);
  return (
    <nav className="flex items-center gap-1.5 text-sm flex-wrap">
      <Link href="/dashboard" className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground">
        <LayoutGrid className="w-4 h-4" />
      </Link>
      {labels.map((label, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
          <span className={cn(i === labels.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
        </span>
      ))}
    </nav>
  );
}

/* ─── Nested nav group (level 3, sidebar only) ───────────────────────────── */

function isLeafActive(child: NavLeaf, location: string): boolean {
  if (location === child.href || location.startsWith(child.href + "/")) return true;
  if (child.matchPaths) return child.matchPaths.some((p) => location === p || location.startsWith(p + "/"));
  return false;
}

function isSubGroupActive(sg: NavSubGroup, location: string): boolean {
  return sg.children.some((c) => isLeafActive(c, location));
}

function NavInlineSubGroup({ name, icon: Icon, children, location, navigate }: {
  name: string; icon: React.ComponentType<{ className?: string }>; children: NavLeaf[];
  location: string; navigate?: (href: string) => void;
}) {
  const active = children.some((c) => isLeafActive(c, location));
  const [open, setOpen] = useState(active);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton isActive={active} onClick={() => setOpen((o) => !o)} className="cursor-pointer w-full">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1">{name}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </SidebarMenuSubButton>
      {open && (
        <SidebarMenuSub>
          {children.map((child) => {
            const childActive = isLeafActive(child, location);
            return (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton asChild isActive={childActive}>
                  <Link href={child.href} className="flex items-center gap-2.5">
                    <child.icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1">{child.name}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuSubItem>
  );
}

function NavNestedGroup({ name, icon: Icon, children, location, defaultHref, navigate, badgeCountByHref }: {
  name: string; icon: React.ComponentType<{ className?: string }>; children: (NavLeaf | NavSubGroup)[]; location: string;
  defaultHref?: string; navigate?: (href: string) => void; badgeCountByHref?: Record<string, number>;
}) {
  const isChildActive = children.some((c) =>
    "href" in c ? isLeafActive(c, location) : isSubGroupActive(c, location)
  );
  const [open, setOpen] = useState(isChildActive);
  const totalBadge = badgeCountByHref
    ? children.filter((c): c is NavLeaf => "href" in c)
        .reduce((sum, c) => sum + (badgeCountByHref[c.href] ?? 0), 0)
    : 0;
  const handleClick = () => {
    if (defaultHref && navigate) navigate(defaultHref);
    setOpen((o) => !o);
  };
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton isActive={isChildActive} onClick={handleClick} className="cursor-pointer w-full">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1">{name}</span>
        {!open && totalBadge > 0 && (
          <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground shrink-0">
            {totalBadge > 9 ? "9+" : totalBadge}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </SidebarMenuSubButton>
      {open && (
        <SidebarMenuSub>
          {children.map((child) => {
            if (!("href" in child)) {
              return (
                <NavInlineSubGroup
                  key={child.name}
                  name={child.name}
                  icon={child.icon}
                  children={child.children}
                  location={location}
                  navigate={navigate}
                />
              );
            }
            const active = isLeafActive(child, location);
            const badge = badgeCountByHref?.[child.href] ?? 0;
            return (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton asChild isActive={active}>
                  <Link href={child.href} className="flex items-center gap-2.5">
                    <child.icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1">{child.name}</span>
                    {badge > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground shrink-0">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuSubItem>
  );
}

/* ─── Sidebar footer content ─────────────────────────────────────────────── */

function SidebarFooterContent({ user, onLogout, isPending }: {
  user: { ownerName?: string | null; email?: string } | null;
  onLogout: () => void;
  isPending: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  if (collapsed) {
    return (
      <div className="flex justify-center">
        <button onClick={onLogout} disabled={isPending} title="Sign out"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm truncate">
        <p className="font-medium truncate">{user?.ownerName || "Merchant"}</p>
        <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
      </div>
      <Button variant="outline" className="w-full justify-start gap-2" onClick={onLogout} disabled={isPending}>
        <LogOut className="w-4 h-4" /> Sign out
      </Button>
    </div>
  );
}

/* ─── Layout picker ──────────────────────────────────────────────────────── */

function LayoutPreview({ mode, active }: { mode: NavLayoutMode; active: boolean }) {
  const bar = cn("rounded-[1px]", active ? "bg-primary" : "bg-primary/50");
  const bg  = "rounded-[1px] bg-muted";
  if (mode === "left") return (
    <div className="w-7 h-5 rounded border flex gap-[2px] p-[2px] shrink-0 overflow-hidden">
      <div className={cn(bar, "w-1.5")} /><div className={cn(bg, "flex-1")} />
    </div>
  );
  if (mode === "right") return (
    <div className="w-7 h-5 rounded border flex gap-[2px] p-[2px] shrink-0 overflow-hidden">
      <div className={cn(bg, "flex-1")} /><div className={cn(bar, "w-1.5")} />
    </div>
  );
  if (mode === "top") return (
    <div className="w-7 h-5 rounded border flex flex-col gap-[2px] p-[2px] shrink-0 overflow-hidden">
      <div className={cn(bar, "h-1.5")} /><div className={cn(bg, "flex-1")} />
    </div>
  );
  if (mode === "bottom") return (
    <div className="w-7 h-5 rounded border flex flex-col gap-[2px] p-[2px] shrink-0 overflow-hidden">
      <div className={cn(bg, "flex-1")} /><div className={cn(bar, "h-1.5")} />
    </div>
  );
  return (
    <div className="w-7 h-5 rounded border flex gap-[2px] p-[2px] shrink-0 overflow-hidden">
      <div className={cn("w-1 rounded-[1px]", active ? "bg-primary/60" : "bg-muted-foreground/30")} />
      <div className={cn(bg, "flex-1")} />
    </div>
  );
}

const LAYOUT_OPTIONS: { mode: NavLayoutMode; label: string }[] = [
  { mode: "left",      label: "Left sidebar"       },
  { mode: "right",     label: "Right sidebar"      },
  { mode: "top",       label: "Top bar"            },
  { mode: "bottom",    label: "Bottom bar"         },
  { mode: "auto-hide", label: "Auto-hide sidebar"  },
];

function LayoutPicker() {
  const { navLayout, setNavLayout } = useNavLayout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Change layout" title="Change layout"
      >
        <LayoutTemplate className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-popover border rounded-xl shadow-xl z-[200] p-2 w-52">
          <p className="text-xs font-medium text-muted-foreground px-2 pb-1.5">Navigation layout</p>
          {LAYOUT_OPTIONS.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => { setNavLayout(mode); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors",
                navLayout === mode ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground",
              )}
            >
              <LayoutPreview mode={mode} active={navLayout === mode} />
              <span className="flex-1 text-left">{label}</span>
              {navLayout === mode && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Accessibility picker ───────────────────────────────────────────────── */

function AccessibilityPicker() {
  const { fontSize, setFontSize, contrastMode, setContrastMode } = useAccessibility();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fontOptions = [
    { key: "normal" as const, label: "A",   title: "Normal text size"   },
    { key: "large"  as const, label: "A",   title: "Large text size",  cls: "text-base" },
    { key: "xl"     as const, label: "A",   title: "Extra-large text", cls: "text-lg"   },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Accessibility settings"
        title="Accessibility settings"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Accessibility className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 bg-popover border rounded-xl shadow-xl z-[200] p-3 w-52"
          role="dialog"
          aria-label="Accessibility settings"
        >
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-2">Text size</p>
          <div className="flex gap-1 mb-3">
            {fontOptions.map(({ key, label, title, cls }) => (
              <button
                key={key}
                onClick={() => setFontSize(key)}
                title={title}
                aria-pressed={fontSize === key}
                className={cn(
                  "flex-1 rounded-lg py-1.5 font-semibold border transition-colors",
                  cls ?? "text-sm",
                  fontSize === key
                    ? "bg-primary/10 border-primary text-primary"
                    : "pill-selector border-border hover:bg-muted text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-2">Contrast</p>
          <div className="flex gap-1">
            {(["normal", "high"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setContrastMode(mode)}
                aria-pressed={contrastMode === mode}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-medium border transition-colors",
                  contrastMode === mode
                    ? "bg-primary/10 border-primary text-primary"
                    : "pill-selector border-border hover:bg-muted text-foreground"
                )}
              >
                {mode === "normal" ? "Standard" : "High"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Auto-hide sidebar wrapper (must be inside SidebarProvider) ─────────── */

function AutoHideSidebarWrapper({ children }: { children: React.ReactNode }) {
  const { setOpen } = useSidebar();
  return (
    <div onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
    </div>
  );
}

/* ─── Top nav components ─────────────────────────────────────────────────── */

function TopNavBtn({
  icon: Icon, label, isActive, onClick,
}: { icon: React.ComponentType<{ className?: string }>; label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
        isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function TopNavDropdown({ label, icon: Icon, items, isActive, isOpen, onToggle, location, navigate, defaultHref }: {
  label: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[];
  isActive: boolean; isOpen: boolean; onToggle: () => void;
  location: string; navigate: (href: string) => void;
  defaultHref?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const handleToggle = () => {
    if (!isOpen && containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      const minWidth = 220;
      const margin = 8;
      // Keep within right edge of viewport
      const left = Math.min(r.left, window.innerWidth - minWidth - margin);
      // Available height below the button, leave 8px gap from bottom edge
      const maxHeight = Math.max(120, window.innerHeight - r.bottom - margin - 4);
      setPos({ left, top: r.bottom + 4, maxHeight });
    }
    onToggle();
  };

  const handleMainClick = () => {
    if (defaultHref && location !== defaultHref) {
      navigate(defaultHref);
    } else {
      handleToggle();
    }
  };

  const panel = isOpen && pos
    ? createPortal(
        <div
          className="fixed bg-popover border rounded-xl shadow-xl z-[9999] py-1.5 min-w-[190px] overflow-y-auto"
          style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
        >
          {items.map((item) => {
            if ("children" in item) {
              return (
                <div key={item.name}>
                  <div className="flex items-center gap-2 px-3 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                    <item.icon className="w-3 h-3" /><span>{item.name}</span>
                  </div>
                  {item.children.map((child) => {
                    if (!("href" in child)) {
                      return (
                        <div key={child.name}>
                          <div className="flex items-center gap-1.5 pl-7 pr-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                            <child.icon className="w-3 h-3" /><span>{child.name}</span>
                          </div>
                          {child.children.map((leaf) => (
                            <button key={leaf.href} onClick={() => { navigate(leaf.href); onToggle(); }}
                              className={cn("w-full flex items-center gap-2.5 pl-11 pr-3 py-1.5 text-sm hover:bg-muted transition-colors text-left", isLeafActive(leaf, location) && "bg-primary/15 text-primary font-medium")}>
                              <leaf.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              {leaf.name}
                            </button>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <button key={child.href} onClick={() => { navigate(child.href); onToggle(); }}
                        className={cn("w-full flex items-center gap-2.5 pl-7 pr-3 py-2 text-sm hover:bg-muted transition-colors text-left", isLeafActive(child, location) && "bg-primary/15 text-primary font-medium")}>
                        <child.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        {child.name}
                      </button>
                    );
                  })}
                </div>
              );
            }
            const active = location === item.href;
            return (
              <button key={item.href} onClick={() => { navigate(item.href); onToggle(); }}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left", active && "bg-primary/15 text-primary font-medium")}>
                <item.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                {item.name}
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={containerRef} className="flex items-center">
      <button
        onClick={handleMainClick}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-md text-sm font-medium transition-colors whitespace-nowrap",
          isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">{label}</span>
      </button>
      <button
        onClick={handleToggle}
        className={cn(
          "px-1.5 py-1.5 rounded-r-md text-sm font-medium transition-colors",
          isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
      >
        <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>
      {panel}
    </div>
  );
}

/* ─── Staff day login (universal top bar) ────────────────────────────────── */

/**
 * The day's staff login for THIS device. A staff member signs in here with
 * their PIN at the start of the day; their session persists until Close Till
 * or an explicit sign-out. The POS cart-header staff button is, by contrast,
 * only a temporary one-sale switch that reverts back to this day login.
 */
function StaffLoginButton({ location }: { location: string }) {
  const { dayStaff, signInForDay, signOutForDay } = useStaffSession();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const isPosPage = location === "/pos" || location.startsWith("/pos/");
  const { data: posSettingsData } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const forceStaffLogin = posSettingsData?.forceStaffLogin === "true";

  /* The staff list only reveals whether a forced login is even possible
     (PIN values are masked by the server); verification happens server-side. */
  const needStaffList = open || (isPosPage && forceStaffLogin && !dayStaff);
  const { data: staffListData } = useListStaff({ query: { queryKey: ["staff-pos"], enabled: needStaffList } });
  const staffList = (staffListData as Staff[] | undefined) ?? [];
  const pinStaffExists = staffList.some((s) => s.pin && s.isActive);
  const verifyPin = useVerifyStaffPin();

  /* Forced start-of-day login — on the POS with nobody signed in for the day,
     the PIN dialog opens instantly and cannot be dismissed. */
  const forced = isPosPage && forceStaffLogin && !dayStaff && pinStaffExists;
  useEffect(() => {
    if (forced) { setPin(""); setError(""); setOpen(true); }
  }, [forced]);

  /* The POS "Charge" guard dispatches this when a sale is attempted with no
     day staff while forced login is on. */
  useEffect(() => {
    const handler = () => { setPin(""); setError(""); setOpen(true); };
    window.addEventListener("koapos:open-day-staff-login", handler);
    return () => window.removeEventListener("koapos:open-day-staff-login", handler);
  }, []);

  const handleSubmit = () => {
    if (!pin || verifyPin.isPending) return;
    // establishDaySession: record this staff as the server session's day-staff so
    // server-side attribution (daily closes, stock takes, customer merges) credits them.
    verifyPin.mutate({ data: { pin, establishDaySession: true } }, {
      onSuccess: (res) => {
        if (!res.ok || !res.staff) {
          setError(res.reason === "rate_limited"
            ? "Too many attempts — wait a minute and try again."
            : "Incorrect PIN. Try again.");
          setPin("");
          return;
        }
        signInForDay(res.staff);
        setOpen(false); setPin(""); setError("");
        toast.success(`${res.staff.name} signed in for the day`);
      },
      onError: () => setError("Couldn't verify PIN — check your connection and try again."),
    });
  };

  const handleSignOut = () => {
    const name = dayStaff?.staffName;
    signOutForDay();
    setPin(""); setError("");
    toast.success(`${name ?? "Staff"} signed out`);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v && forced) return; /* must sign in before the dialog can close */
    if (!v) { setPin(""); setError(""); }
    setOpen(v);
  };

  return (
    <>
      <button
        onClick={() => { setPin(""); setError(""); setOpen(true); }}
        title={dayStaff ? `Signed in for the day: ${dayStaff.staffName}` : "Staff login"}
        aria-label={dayStaff ? `Signed in for the day: ${dayStaff.staffName}` : "Staff login"}
        className={cn(
          "h-8 rounded-lg flex items-center justify-center gap-1.5 px-2 transition-colors",
          dayStaff ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
      >
        <UserCircle className="w-4 h-4 shrink-0" />
        {dayStaff && (
          <span className="hidden md:inline text-xs font-semibold max-w-[90px] truncate">
            {dayStaff.staffName.split(" ")[0]}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className={cn("sm:max-w-xs", forced && "[&>button.absolute]:hidden")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" /> Staff Login
            </DialogTitle>
            <DialogDescription>
              {dayStaff
                ? <>Signed in for the day: <span className="font-semibold text-foreground">{dayStaff.staffName}</span></>
                : forced
                  ? "Enter your PIN to start the day on this register."
                  : "Enter your PIN to sign in for the day on this device."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
              placeholder="••••"
              className="text-center tracking-widest text-lg"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, ki) => (
                <button
                  key={ki} disabled={!k}
                  onClick={() => { if (k === "⌫") setPin((p) => p.slice(0, -1)); else if (k) { setPin((p) => p + k); setError(""); } }}
                  className={cn("h-11 rounded-xl border font-semibold text-base transition-colors", k ? "hover:bg-muted active:bg-muted/80" : "opacity-0 pointer-events-none", k === "⌫" && "text-destructive text-sm")}
                >{k}</button>
              ))}
            </div>
            {error && <p className="text-xs text-destructive text-center">{error}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {dayStaff && (
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleSignOut}>
                <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign Out
              </Button>
            )}
            {!forced && (
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            )}
            <Button onClick={handleSubmit} disabled={!pin || verifyPin.isPending}>
              {verifyPin.isPending ? "Verifying…" : "Sign In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useHeaderScrollShadow() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 4);
    onScroll();
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

function TopNavLayout({ children, location, navigate, user, theme, toggleTheme, handleLogout, logoutPending, canManage }: LayoutSharedProps) {
  const isPOSSection        = location === "/pos" || location.startsWith("/pos/");
  const isInventorySection  = location === "/products" || location.startsWith("/products/") || location === "/inventory" || location.startsWith("/inventory/");
  const isStaffSection      = location === "/staff" || location.startsWith("/staff/");
  const isManagementSection = inManagementSection(location);
  const isMarketingSection  = inMarketingSection(location);
  const isOnlineSection     = location === "/online" || location.startsWith("/online/");
  const isCamerasSection    = location === "/cameras";

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const headerScrolled = useHeaderScrollShadow();

  const toggle = (key: string) => setOpenDropdown((d) => (d === key ? null : key));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpenDropdown(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setOpenDropdown(null); }, [location]);

  return (
    <div className="h-[100dvh] flex flex-col bg-muted/10 overflow-hidden">
      <header ref={headerRef} className={cn("h-14 flex items-center gap-2 px-4 shrink-0 sticky top-0 z-30 transition-all duration-200 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80", headerScrolled ? "shadow-[0_4px_24px_-2px_rgba(0,0,0,0.10),0_1px_4px_-1px_rgba(0,0,0,0.06)] border-b border-transparent" : "border-b border-border")}>
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0 mr-1">
          <img src="/logo.png" alt="KoaPOS" className="w-7 h-7 object-contain" />
          <span className="font-bold text-sm hidden lg:block max-w-[110px] truncate">{user?.businessName || "KoaPOS"}</span>
        </Link>

        {/* Nav items */}
        <nav className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0" aria-label="Main navigation" style={{ scrollbarWidth: "none" }}>
          <TopNavBtn icon={LayoutDashboard} label="Dashboard" isActive={location === "/dashboard"} onClick={() => navigate("/dashboard")} />
          <TopNavDropdown label="POS" icon={ShoppingCart} items={POS_SUBNAV} isActive={isPOSSection}
            isOpen={openDropdown === "pos"} onToggle={() => toggle("pos")} location={location} navigate={navigate} />
          <TopNavBtn icon={Wrench} label="Services" isActive={location === "/services" || location.startsWith("/services/")} onClick={() => navigate("/services")} />
          <TopNavBtn icon={CalendarClock} label="Appts" isActive={location === "/appointments"} onClick={() => navigate("/appointments")} />
          <TopNavDropdown label="Inventory" icon={Boxes} items={INVENTORY_SUBNAV} isActive={isInventorySection}
            isOpen={openDropdown === "inventory"} onToggle={() => toggle("inventory")} location={location} navigate={navigate} />
          <TopNavBtn icon={Users} label="Customers" isActive={location === "/customers"} onClick={() => navigate("/customers")} />
          <TopNavDropdown label="Staff" icon={UserSquare2} items={STAFF_SUBNAV} isActive={isStaffSection}
            isOpen={openDropdown === "staff"} onToggle={() => toggle("staff")} location={location} navigate={navigate} />
          <TopNavDropdown label="Marketing" icon={Megaphone} items={MARKETING_SUBNAV} isActive={isMarketingSection}
            isOpen={openDropdown === "marketing"} onToggle={() => toggle("marketing")} location={location} navigate={navigate} defaultHref="/marketing/overview" />
          <TopNavDropdown label="Online" icon={Globe} items={ONLINE_SUBNAV} isActive={isOnlineSection}
            isOpen={openDropdown === "online"} onToggle={() => toggle("online")} location={location} navigate={navigate} defaultHref="/online/deliveries" />
          <TopNavBtn icon={Camera} label="Cameras" isActive={isCamerasSection} onClick={() => navigate("/cameras")} />
          {canManage && (
            <TopNavDropdown label="Management" icon={BriefcaseBusiness} items={MANAGEMENT_SUBNAV} isActive={isManagementSection}
              isOpen={openDropdown === "management"} onToggle={() => toggle("management")} location={location} navigate={navigate} />
          )}
        </nav>

        {/* Search */}
        <div className="w-44 xl:w-64 shrink-0">
          <GlobalSearch onOpenChange={setSearchOpen} />
        </div>

        {/* Right actions */}
        <LocationSwitcher />
        <LayoutPicker />
        <AccessibilityPicker />
        <div className={cn("flex items-center gap-1.5 shrink-0 overflow-hidden transition-all duration-300", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "max-w-xs opacity-100")}>
          <Link href="/pos/sell">
            <Button variant={isPOSSection ? "default" : "outline"} size="sm" className="gap-1.5 font-semibold h-8 px-3">
              <ShoppingCart className="w-3.5 h-3.5" /><span className="hidden sm:inline">POS</span>
            </Button>
          </Link>
          <StaffLoginButton location={location} />
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main id="main-content" className="relative flex-1 overflow-y-auto bg-muted/10">{children}</main>
    </div>
  );
}

/* ─── Bottom nav components ──────────────────────────────────────────────── */

function BottomMoreSheet({ open, onClose, location, navigate, user, onLogout, logoutPending, canManage }: {
  open: boolean; onClose: () => void; location: string; navigate: (href: string) => void;
  user: { ownerName?: string | null; email?: string } | null;
  onLogout: () => void; logoutPending: boolean; canManage: boolean;
}) {
  if (!open) return null;

  const go = (href: string) => { navigate(href); onClose(); };

  const flattenNavItems = (items: NavItem[]): NavLeaf[] =>
    items.flatMap((item) =>
      "children" in item
        ? item.children.flatMap((c) => "href" in c ? [c] : c.children)
        : [item]
    );

  const sections: { label: string; items: NavLeaf[] }[] = [
    { label: "POS",        items: POS_SUBNAV },
    { label: "Inventory",  items: INVENTORY_SUBNAV },
    { label: "Staff",      items: flattenNavItems(STAFF_SUBNAV) },
    { label: "Marketing",  items: flattenNavItems(MARKETING_SUBNAV) },
    { label: "Online",     items: flattenNavItems(ONLINE_SUBNAV) },
    { label: "Cameras",    items: [{ name: "Camera Dashboard", href: "/cameras", icon: Camera }] },
    // Management menus are restricted to Owner/Manager roles.
    ...(canManage ? [{ label: "Management", items: flattenNavItems(MANAGEMENT_SUBNAV) }] : []),
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-background rounded-t-2xl z-50 border-t shadow-2xl overflow-y-auto max-h-[78dvh] pb-safe">
        <div className="sticky top-0 bg-background flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="font-semibold text-sm">{user?.ownerName || "Merchant"}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors" aria-label="Close menu">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-4">
          <div className="space-y-0.5">
            <button onClick={() => go("/services")} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left", location.startsWith("/services") && "bg-primary/15 text-primary font-medium")}>
              <Wrench className="w-4 h-4 shrink-0 text-muted-foreground" /><span>Services</span>
            </button>
            <button onClick={() => go("/appointments")} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left", location === "/appointments" && "bg-primary/15 text-primary font-medium")}>
              <CalendarClock className="w-4 h-4 shrink-0 text-muted-foreground" /><span>Appointments</span>
            </button>
            <button onClick={() => go("/transactions")} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left", location === "/transactions" && "bg-primary/15 text-primary font-medium")}>
              <Receipt className="w-4 h-4 shrink-0 text-muted-foreground" /><span>Transactions</span>
            </button>
          </div>

          {sections.map(({ label, items }) => (
            <div key={label} className="space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground px-3 pb-0.5 uppercase tracking-widest">{label}</p>
              {items.map((item) => {
                const active = location === item.href;
                return (
                  <button key={item.href} onClick={() => go(item.href)}
                    className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left", active && "bg-primary/15 text-primary font-medium")}>
                    <item.icon className="w-4 h-4 shrink-0 text-muted-foreground" /><span>{item.name}</span>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="pt-1 border-t">
            <button onClick={() => { onLogout(); onClose(); }} disabled={logoutPending}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors text-left disabled:opacity-50">
              <LogOut className="w-4 h-4 shrink-0" /><span>{logoutPending ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function BottomNavLayout({ children, location, navigate, user, theme, toggleTheme, handleLogout, logoutPending, canManage }: LayoutSharedProps) {
  const isPOSSection        = location === "/pos" || location.startsWith("/pos/");
  const isInventorySection  = location === "/products" || location.startsWith("/products/") || location === "/inventory" || location.startsWith("/inventory/");
  const isStaffSection      = location === "/staff" || location.startsWith("/staff/");
  const isManagementSection = inManagementSection(location);
  const isOnlineSection     = location === "/online" || location.startsWith("/online/");
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const BottomTab = ({ href, icon: Icon, label, active, onClick }: {
    href?: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean; onClick?: () => void;
  }) => {
    const cls = cn("flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors min-w-[56px]",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground");
    if (onClick) return (
      <button onClick={onClick} className={cls}>
        <Icon className="w-5 h-5 shrink-0" /><span>{label}</span>
      </button>
    );
    return (
      <Link href={href!} className={cls}>
        <Icon className="w-5 h-5 shrink-0" /><span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-muted/10 overflow-hidden">
      <header className="h-14 flex items-center gap-3 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shrink-0 sticky top-0 z-30 transition-shadow shadow-md">
        <div className={cn("shrink-0 overflow-hidden transition-all duration-300 ease-in-out", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "opacity-100")}>
          <Breadcrumbs location={location} />
        </div>
        <div className="flex-1 min-w-0 flex"><GlobalSearch onOpenChange={setSearchOpen} /></div>
        <LayoutPicker />
        <AccessibilityPicker />
        <div className={cn("flex items-center gap-2 shrink-0 overflow-hidden transition-all duration-300 ease-in-out", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "max-w-xs opacity-100")}>
          <Link href="/pos/sell">
            <Button variant={isPOSSection ? "default" : "outline"} size="sm" className="gap-1.5 font-semibold rounded-md h-8 px-3">
              <ShoppingCart className="w-3.5 h-3.5" /><span className="hidden sm:inline">POS</span>
            </Button>
          </Link>
          <StaffLoginButton location={location} />
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main id="main-content" className="relative flex-1 overflow-y-auto bg-muted/10 pb-16">{children}</main>

      {/* Fixed bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 border-t bg-background flex items-center justify-around px-2 z-30" aria-label="Main navigation">
        <BottomTab href="/dashboard"        icon={LayoutDashboard} label="Dashboard" active={location === "/dashboard"} />
        <BottomTab href="/pos/sell"              icon={ShoppingCart}    label="POS"       active={isPOSSection} />
        <BottomTab href="/inventory/overview"icon={Boxes}           label="Inventory" active={isInventorySection} />
        <BottomTab href="/customers"        icon={Users}           label="Customers" active={location === "/customers"} />
        <BottomTab icon={Menu} label="More" active={isManagementSection || isOnlineSection || moreOpen} onClick={() => setMoreOpen(true)} />
      </nav>

      <BottomMoreSheet
        open={moreOpen} onClose={() => setMoreOpen(false)}
        location={location} navigate={navigate} user={user}
        onLogout={handleLogout} logoutPending={logoutPending} canManage={canManage}
      />
    </div>
  );
}

/* ─── Shared props type ───────────────────────────────────────────────────── */

type MerchantUser = { ownerName?: string | null; email?: string; businessName?: string | null } | null;

interface LayoutSharedProps {
  children: React.ReactNode;
  location: string;
  navigate: (href: string) => void;
  user: MerchantUser;
  theme: "light" | "dark";
  toggleTheme: () => void;
  handleLogout: () => void;
  logoutPending: boolean;
  /** Owner/Manager — controls visibility of the Management section menus. */
  canManage: boolean;
}

/* ─── Main AppLayout ─────────────────────────────────────────────────────── */

export function AppLayout({ children, hideSidebar }: { children: React.ReactNode; hideSidebar?: boolean }) {
  const embedded = useEmbedded();
  if (embedded) return <>{children}</>;
  return <AppLayoutInner hideSidebar={hideSidebar}>{children}</AppLayoutInner>;
}

function AppLayoutInner({ children, hideSidebar }: { children: React.ReactNode; hideSidebar?: boolean }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { dayStaff, signOutForDay } = useStaffSession();
  const { theme, toggleTheme } = useTheme();
  const { navLayout } = useNavLayout();
  const logoutMutation = useLogout();

  /* When the platform user logs in, immediately prompt for a staff PIN so a till
     is bound to whoever is operating this device for the duration of the session.
     The day-staff session is hydrated from localStorage, so a plain refresh (where
     dayStaff is already set) never re-opens the dialog — only a genuine new login
     with nobody signed in for the day. The binding is released on logout below. */
  const wasAuthedRef = useRef(false);
  useEffect(() => {
    const authed = !!user;
    if (authed && !wasAuthedRef.current && !dayStaff) {
      window.dispatchEvent(new CustomEvent("koapos:open-day-staff-login"));
    }
    wasAuthedRef.current = authed;
  }, [user, dayStaff]);

  // Scroll only the main content area to the top when the pathname changes — ignore hash/query
  const scrollPathRef = useRef("");
  useEffect(() => {
    const pathname = location.split("?")[0].split("#")[0];
    if (pathname !== scrollPathRef.current) {
      scrollPathRef.current = pathname;
      document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [location]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      const enabledIds = getEnabledShortcuts();
      for (const sc of KEYBOARD_SHORTCUTS) {
        if (!sc.navigate || !enabledIds.includes(sc.id)) continue;
        const k = sc.keys;
        if (/^F\d+$/.test(k) && e.key === k && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          (navigate as (h: string) => void)(sc.navigate);
          return;
        }
        if (k.startsWith("Alt+")) {
          const ch = k.slice(4).toLowerCase();
          if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === ch) {
            e.preventDefault();
            (navigate as (h: string) => void)(sc.navigate);
            return;
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const isPOSSection        = location === "/pos" || location.startsWith("/pos/");
  const isInventorySection  = location === "/products" || location.startsWith("/products/") || location === "/inventory" || location.startsWith("/inventory/");
  const isStaffSection      = location === "/staff" || location.startsWith("/staff/");
  const isMarketingSection  = inMarketingSection(location);
  const isManagementSection = inManagementSection(location);
  const isCustomersSection  = location === "/customers" || location.startsWith("/customers/");
  const isOnlineSection     = location === "/online" || location.startsWith("/online/");

  const { data: unreadData } = useGetAuthEventsUnreadCount({
    query: { queryKey: ["auth-events-unread-count"], refetchInterval: 60_000, staleTime: 30_000 },
  });
  const unreadSecurityCount = unreadData?.count ?? 0;
  const mgmtBadgeByHref: Record<string, number> = unreadSecurityCount > 0
    ? { "/management/settings-integrations/account": unreadSecurityCount }
    : {};

  const [posOpen,      setPosOpen]      = useState(isPOSSection);
  const [invOpen,      setInvOpen]      = useState(isInventorySection);
  const [staffOpen,    setStaffOpen]    = useState(isStaffSection);
  const [marketingOpen, setMarketingOpen] = useState(isMarketingSection);
  const [onlineOpen,   setOnlineOpen]   = useState(isOnlineSection);
  const [mgmtOpen,     setMgmtOpen]     = useState(isManagementSection);
  const [custsOpen,    setCustsOpen]    = useState(isCustomersSection);
  const [searchOpen, setSearchOpen] = useState(false);

  // Management menus & routes are restricted to Owner and Manager staff roles.
  const canManage = ["owner", "manager"].includes(user?.staffRole ?? "");

  const handleLogout = () => logoutMutation.mutate(undefined, { onSuccess: () => { signOutForDay(); logout(); } });
  const logoutPending = logoutMutation.isPending;

  const wrappedChildren = (
    <>
      {user && !user.emailVerified && <EmailVerificationBanner />}
      {user && !user.onboardingCompleted && <OnboardingWizard />}
      {children}
    </>
  );

  const sharedProps: LayoutSharedProps = {
    children: wrappedChildren, location, navigate: navigate as (href: string) => void,
    user: user as MerchantUser, theme, toggleTheme, handleLogout, logoutPending, canManage,
  };

  /* ── Top nav layout ─────────────────────────────────────────────────── */
  if (navLayout === "top")    return <TopNavLayout    {...sharedProps} />;

  /* ── Bottom nav layout ──────────────────────────────────────────────── */
  if (navLayout === "bottom") return <BottomNavLayout {...sharedProps} />;

  /* ── Sidebar layouts (left / right / auto-hide) ─────────────────────── */
  const isRight    = navLayout === "right";
  const isAutoHide = navLayout === "auto-hide";

  const NavLink = ({ href, icon: Icon, name }: { href: string; icon: React.ComponentType<{ className?: string }>; name: string }) => {
    const active = location === href || location.startsWith(href + "/");
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={name}
          className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground">
          <Link href={href} className="flex items-center gap-3">
            <Icon className="w-4 h-4 shrink-0" /><span>{name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const CollapsibleSection = ({ label, icon: Icon, isActive, isOpen, onToggle, items, accent, defaultHref, badgeCountByHref }: {
    label: string; icon: React.ComponentType<{ className?: string }>; isActive: boolean; isOpen: boolean;
    onToggle: () => void; items: NavItem[]; accent?: boolean; defaultHref?: string; badgeCountByHref?: Record<string, number>;
  }) => {
    const { state, setOpen } = useSidebar();
    const totalSectionBadge = badgeCountByHref
      ? items.reduce((sum, item) => {
          if ("children" in item) {
            return sum + item.children.reduce((s, c) =>
              "href" in c ? s + (badgeCountByHref[c.href] ?? 0) : s, 0);
          }
          return sum + (badgeCountByHref[(item as NavLeaf).href] ?? 0);
        }, 0)
      : 0;
    const handleClick = () => {
      if (state === "collapsed") {
        setOpen(true);
      }
      if (defaultHref) navigate(defaultHref as string);
      onToggle();
    };
    return (
      <SidebarMenuItem>
        <SidebarMenuButton isActive={isActive} onClick={handleClick} tooltip={label}
          className={`flex items-center gap-3 cursor-pointer w-full data-[active=true]:bg-primary data-[active=true]:text-primary-foreground${accent ? " text-primary font-semibold hover:text-primary" : ""}`}>
          <Icon className={`w-4 h-4 shrink-0${accent ? " text-primary" : ""}`} />
          <span className="flex-1">{label}</span>
          {!isOpen && totalSectionBadge > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground shrink-0">
              {totalSectionBadge > 9 ? "9+" : totalSectionBadge}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}${accent ? " text-primary" : " text-muted-foreground"}`} />
        </SidebarMenuButton>
        {isOpen && (
          <SidebarMenuSub>
            {items.map((item) => {
              if ("children" in item) {
                return <NavNestedGroup key={item.name} name={item.name} icon={item.icon} children={item.children} location={location} defaultHref={item.defaultHref} navigate={navigate} badgeCountByHref={badgeCountByHref} />;
              }
              const active = location === item.href;
              const badge = badgeCountByHref?.[(item as NavLeaf).href] ?? 0;
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link href={item.href} className="flex items-center gap-2.5">
                      <item.icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1">{item.name}</span>
                      {badge > 0 && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground shrink-0">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  };

  const sidebarEl = (
    <Sidebar
      side={isRight ? "right" : "left"}
      collapsible={hideSidebar ? "offcanvas" : "icon"}
      className="overflow-y-auto"
    >
      <SidebarHeader className="min-h-16 flex items-center px-4 py-3 border-b">
        <Link href="/dashboard" className="flex items-center gap-2 w-full">
          <img src="/logo.png" alt="KoaPOS" className="w-8 h-8 object-contain shrink-0" />
          <span className="font-bold text-sm leading-snug break-words line-clamp-3 min-w-0">{user?.businessName || "KoaPOS"}</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          <NavLink href="/dashboard"  icon={LayoutDashboard} name="Dashboard" />
          <CollapsibleSection
            label="POS" icon={ShoppingCart} isActive={isPOSSection} isOpen={posOpen}
            onToggle={() => { setPosOpen((o) => !o); setInvOpen(false); setMgmtOpen(false); }}
            items={POS_SUBNAV}
          />
          <NavLink href="/services"  icon={Wrench}        name="Services" />
          <NavLink href="/appointments"  icon={CalendarClock} name="Appointments" />
          <CollapsibleSection
            label="Inventory" icon={Boxes} isActive={isInventorySection} isOpen={invOpen}
            onToggle={() => { setInvOpen((o) => !o); setPosOpen(false); setMgmtOpen(false); }}
            items={INVENTORY_SUBNAV} defaultHref="/inventory/overview"
          />
          <CollapsibleSection
            label="Customers" icon={Users} isActive={isCustomersSection} isOpen={custsOpen}
            onToggle={() => { setCustsOpen((o) => !o); setPosOpen(false); setInvOpen(false); setStaffOpen(false); setMgmtOpen(false); }}
            items={CUSTOMERS_SUBNAV} defaultHref="/customers"
          />
          <CollapsibleSection
            label="Staff" icon={UserSquare2} isActive={isStaffSection} isOpen={staffOpen}
            onToggle={() => { setStaffOpen((o) => !o); setPosOpen(false); setInvOpen(false); setCustsOpen(false); setMgmtOpen(false); setMarketingOpen(false); }}
            items={STAFF_SUBNAV} defaultHref="/staff/overview"
          />
          <CollapsibleSection
            label="Marketing" icon={Megaphone} isActive={isMarketingSection} isOpen={marketingOpen}
            onToggle={() => { setMarketingOpen((o) => !o); setPosOpen(false); setInvOpen(false); setStaffOpen(false); setCustsOpen(false); setOnlineOpen(false); setMgmtOpen(false); }}
            items={MARKETING_SUBNAV} defaultHref="/marketing/overview"
          />
          <CollapsibleSection
            label="Online" icon={Globe} isActive={isOnlineSection} isOpen={onlineOpen}
            onToggle={() => { setOnlineOpen((o) => !o); setPosOpen(false); setInvOpen(false); setStaffOpen(false); setCustsOpen(false); setMarketingOpen(false); setMgmtOpen(false); }}
            items={ONLINE_SUBNAV} defaultHref="/online/deliveries"
          />
          <NavLink href="/cameras"       icon={Camera}        name="Cameras" />
          {canManage && (
            <CollapsibleSection
              label="Management" icon={BriefcaseBusiness} isActive={isManagementSection} isOpen={mgmtOpen}
              onToggle={() => { setMgmtOpen((o) => !o); setPosOpen(false); setInvOpen(false); setStaffOpen(false); setMarketingOpen(false); setOnlineOpen(false); }}
              items={MANAGEMENT_SUBNAV} accent defaultHref="/management/overview"
              badgeCountByHref={mgmtBadgeByHref}
            />
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t">
        <SidebarFooterContent user={user} onLogout={handleLogout} isPending={logoutPending} />
      </SidebarFooter>
    </Sidebar>
  );

  return (
    <SidebarProvider key={isAutoHide ? "auto-hide" : "sidebar"} defaultOpen={isAutoHide ? false : !hideSidebar}>
      <div className={cn("h-[100dvh] w-full flex bg-muted/10 overflow-hidden", isRight && "flex-row-reverse")}>

        {isAutoHide ? <AutoHideSidebarWrapper>{sidebarEl}</AutoHideSidebarWrapper> : sidebarEl}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 flex items-center gap-3 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shrink-0 sticky top-0 z-30 transition-shadow shadow-md">
            <SidebarTrigger className={hideSidebar ? "shrink-0" : "md:hidden shrink-0"} />

            <div className={cn("shrink-0 overflow-hidden transition-all duration-300 ease-in-out", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "opacity-100")}>
              <Breadcrumbs location={location} />
            </div>

            <div className="flex-1 min-w-0 flex"><GlobalSearch onOpenChange={setSearchOpen} /></div>

            <div className={cn("flex items-center gap-2 shrink-0 overflow-hidden transition-all duration-300 ease-in-out", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "max-w-xs opacity-100")}>
              <Link href="/pos/sell">
                <Button variant={isPOSSection ? "default" : "outline"} size="sm" className="gap-1.5 font-semibold rounded-md h-8 px-3">
                  <ShoppingCart className="w-3.5 h-3.5" /><span className="hidden sm:inline">POS</span>
                </Button>
              </Link>
              <StaffLoginButton location={location} />
              <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
            <LayoutPicker />
            <AccessibilityPicker />
          </header>

          <main id="main-content" className="relative flex-1 overflow-y-auto bg-muted/10">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
