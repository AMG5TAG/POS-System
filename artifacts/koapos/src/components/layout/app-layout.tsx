import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/use-auth";
import { useTheme } from "@/lib/theme";
import { useNavLayout, type NavLayoutMode } from "@/lib/nav-layout";
import { useAccessibility } from "@/lib/accessibility";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ShoppingCart, Package, Users, Receipt,
  Boxes, UserSquare2, Settings, Blocks, LogOut, CalendarClock,
  Wrench, ChevronDown, LayoutGrid, Layers, ClipboardList, Clock,
  RotateCcw, Truck, Bookmark, Tag, Hash, AlertTriangle, History,
  FileText, Package2, ParkingCircle, Coins, TrendingUp,
  BriefcaseBusiness, ArrowLeftRight, Search, Sun, Moon,
  ChevronRight, Building2, Globe, UserCircle, Monitor, Gift,
  Percent, LayoutTemplate, Printer, Check, X, Menu, Accessibility,
  Cpu, Calculator, HardDrive, Target, StickyNote, Link2, Mail, Keyboard,
} from "lucide-react";
import { KEYBOARD_SHORTCUTS, getEnabledShortcuts } from "@/lib/keyboard-shortcuts";
import { useLogout } from "@workspace/api-client-react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarFooter,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/* ─── Nav data ───────────────────────────────────────────────────────────── */

const POS_SUBNAV = [
  { name: "Sell",      href: "/pos",            icon: ShoppingCart },
  { name: "3D Prints", href: "/pos/3d-prints",  icon: Cpu },
  { name: "PC Builder", href: "/pos/pc-builder", icon: HardDrive },
  { name: "History",   href: "/pos/history",    icon: History },
  { name: "Invoices",  href: "/pos/invoices",   icon: FileText },
  { name: "Laybys",    href: "/pos/laybuys",    icon: Package2 },
  { name: "Parked",    href: "/pos/parked",     icon: ParkingCircle },
  { name: "Refund",    href: "/pos/refund",     icon: RotateCcw },
  { name: "Cash",      href: "/pos/cash",       icon: Coins },
];

const CUSTOMERS_SUBNAV = [
  { name: "Forms", href: "/customers/forms", icon: FileText },
];

const STAFF_SUBNAV: NavItem[] = [
  { name: "Rostering",  href: "/staff/rostering",      icon: CalendarClock },
  { name: "Notes",      href: "/staff/notes",          icon: StickyNote    },
  { name: "KPIs",       href: "/staff/kpis",           icon: Target        },
  { name: "Links",      href: "/staff/links",          icon: Link2         },
];

const INVENTORY_SUBNAV = [
  { name: "Overview",        href: "/products/overview",        icon: LayoutGrid },
  { name: "Products",        href: "/products",                 icon: Package },
  { name: "Bundles",         href: "/products/bundles",         icon: Layers },
  { name: "Stocktake",       href: "/products/stocktake",       icon: ClipboardList },
  { name: "Purchase Orders", href: "/products/purchase-orders", icon: ShoppingCart },
  { name: "Pre-Orders",      href: "/products/pre-orders",      icon: Clock },
  { name: "Return Auth.",    href: "/products/return-auth",     icon: RotateCcw },
  { name: "Suppliers",       href: "/products/suppliers",       icon: Truck },
  { name: "Brands",          href: "/products/brands",          icon: Bookmark },
  { name: "Categories",      href: "/products/categories",      icon: Tag },
  { name: "Tags",            href: "/products/tags",            icon: Hash },
  { name: "Recalls",         href: "/products/recalls",         icon: AlertTriangle },
  { name: "Wastage",         href: "/inventory/wastage",        icon: AlertTriangle },
];

type NavLeaf  = { name: string; href: string;  icon: React.ComponentType<{ className?: string }> };
type NavGroup = { name: string; children: NavLeaf[]; icon: React.ComponentType<{ className?: string }> };
type NavItem  = NavLeaf | NavGroup;

const MANAGEMENT_SUBNAV: NavItem[] = [
  { name: "Overview",       href: "/management/overview",       icon: LayoutDashboard },
  {
    name: "Account",
    icon: UserCircle,
    children: [
      { name: "Account",  href: "/management/account", icon: UserCircle },
      { name: "Modules",  href: "/modules",            icon: Blocks     },
    ],
  },
  {
    name: "Business Info",
    icon: Building2,
    children: [
      { name: "Details",  href: "/management/business",  icon: Building2 },
      { name: "Regional", href: "/management/regional",  icon: Globe     },
    ],
  },
  {
    name: "Calculators",
    icon: Calculator,
    children: [
      { name: "3D Printing", href: "/management/calculators/3d-printing", icon: Cpu },
      { name: "PC Builder",  href: "/management/calculators/pc-builder",  icon: HardDrive },
    ],
  },
  { name: "Customers",      href: "/management/customers",      icon: Users          },
  { name: "Discounts",      href: "/management/discounts",      icon: Percent        },
  { name: "Email",          href: "/management/email",          icon: Mail           },
  { name: "Forms",          href: "/management/forms",          icon: FileText       },
  { name: "Import / Export",href: "/management/import-export",  icon: ArrowLeftRight },
  { name: "Integrations",   href: "/management/integrations",   icon: Receipt        },
  { name: "Inventory",      href: "/management/inventory",      icon: Boxes          },
  { name: "KPIs & Targets", href: "/management/kpis",           icon: Target         },
  { name: "Layby",          href: "/management/layby",          icon: Package2       },
  { name: "Loyalty",        href: "/management/loyalty",        icon: Gift           },
  { name: "POS Registers",  href: "/management/registers",      icon: Monitor        },
  { name: "Reports",        href: "/management/sales-overview", icon: TrendingUp     },
  {
    name: "Staff",
    icon: UserSquare2,
    children: [
      { name: "Employees", href: "/management/staff",              icon: UserSquare2 },
      { name: "Timesheet", href: "/management/staff/timesheet",    icon: Clock       },
      { name: "Costs",     href: "/management/staff/cost-summary", icon: Coins       },
    ],
  },
  {
    name: "Stickers",
    icon: Tag,
    children: [
      { name: "Labels",    href: "/management/stickers",          icon: Printer        },
      { name: "Templates", href: "/management/sticker-templates", icon: LayoutTemplate },
    ],
  },
  { name: "Tax & Receipts", href: "/management/tax",            icon: Receipt        },
  { name: "Templates",      href: "/management/templates",      icon: LayoutTemplate },
];

/* ─── Search index ───────────────────────────────────────────────────────── */

const SEARCH_INDEX = [
  { label: "Dashboard",          href: "/dashboard",                   icon: LayoutDashboard, group: "Pages" },
  { label: "POS · Sell",         href: "/pos",                         icon: ShoppingCart,    group: "POS" },
  { label: "POS · History",      href: "/pos/history",                 icon: History,         group: "POS" },
  { label: "POS · Invoices",     href: "/pos/invoices",                icon: FileText,        group: "POS" },
  { label: "POS · Laybys",       href: "/pos/laybuys",                 icon: Package2,        group: "POS" },
  { label: "POS · Parked",       href: "/pos/parked",                  icon: ParkingCircle,   group: "POS" },
  { label: "POS · Refund",       href: "/pos/refund",                  icon: RotateCcw,       group: "POS" },
  { label: "Services",           href: "/service-jobs",                icon: Wrench,          group: "Pages" },
  { label: "Appointments",       href: "/appointments",                icon: CalendarClock,   group: "Pages" },
  { label: "Customers",          href: "/customers",                   icon: Users,           group: "Pages" },
  { label: "Customers · Forms", href: "/customers/forms",             icon: FileText,        group: "Customers" },
  { label: "Products",           href: "/products",                    icon: Package,         group: "Inventory" },
  { label: "Inventory Overview", href: "/products/overview",           icon: LayoutGrid,      group: "Inventory" },
  { label: "Stocktake",          href: "/products/stocktake",          icon: ClipboardList,   group: "Inventory" },
  { label: "Suppliers",          href: "/products/suppliers",          icon: Truck,           group: "Inventory" },
  { label: "Categories",         href: "/products/categories",         icon: Tag,             group: "Inventory" },
  { label: "Staff · Employees",  href: "/staff",                       icon: UserSquare2,     group: "Staff" },
  { label: "Staff · Timesheet",  href: "/staff/timesheet",             icon: Clock,           group: "Staff" },
  { label: "Staff · Rostering",  href: "/staff/rostering",             icon: CalendarClock,   group: "Staff" },
  { label: "Staff · Costs",      href: "/staff/cost-summary",          icon: Coins,           group: "Staff" },
  { label: "Staff · Notes",      href: "/staff/notes",                 icon: StickyNote,      group: "Staff" },
  { label: "Staff · KPIs",       href: "/staff/kpis",                  icon: Target,          group: "Staff" },
  { label: "Staff · Links",      href: "/staff/links",                 icon: Link2,           group: "Staff" },
  { label: "Overview",            href: "/management/overview",         icon: LayoutDashboard, group: "Management" },
  { label: "Reports",             href: "/management/sales-overview",   icon: TrendingUp,      group: "Management" },
  { label: "KPIs & Targets",     href: "/management/kpis",             icon: Target,          group: "Management" },
  { label: "Discounts",          href: "/management/discounts",        icon: Percent,         group: "Management" },
  { label: "Email Settings",      href: "/management/email",                      icon: Mail,         group: "Management" },
  { label: "Tax & Receipts",     href: "/management/tax",                        icon: Receipt,      group: "Management" },
  { label: "3D Prints",          href: "/pos/3d-prints",                          icon: Cpu,          group: "POS" },
  { label: "Calculators · 3D",       href: "/management/calculators/3d-printing",  icon: Calculator,  group: "Management" },
  { label: "Calculators · PC Builder", href: "/management/calculators/pc-builder", icon: HardDrive,   group: "Management" },
  { label: "PC Builder",             href: "/pos/pc-builder",                      icon: HardDrive,   group: "POS" },
  { label: "Customers",          href: "/management/customers",        icon: Users,           group: "Management" },
  { label: "Loyalty",            href: "/management/loyalty",          icon: Gift,            group: "Management" },
  { label: "Layby",              href: "/management/layby",            icon: Package2,        group: "Management" },
  { label: "POS Registers",      href: "/management/registers",        icon: Monitor,         group: "Management" },
  { label: "Inventory Settings", href: "/management/inventory",        icon: Boxes,           group: "Management" },
  { label: "Business Details",   href: "/management/business",         icon: Building2,       group: "Management" },
  { label: "Regional Settings",  href: "/management/regional",         icon: Globe,           group: "Management" },
  { label: "Account",            href: "/management/account",          icon: UserCircle,      group: "Management" },
  { label: "Modules",            href: "/modules",                     icon: Blocks,          group: "Management" },
  { label: "Integrations",       href: "/management/integrations",     icon: Receipt,         group: "Management" },
  { label: "Templates",          href: "/management/templates",        icon: LayoutTemplate,  group: "Management" },
  { label: "Forms",             href: "/management/forms",            icon: FileText,        group: "Management" },
  { label: "Labels",             href: "/management/stickers",         icon: Tag,             group: "Management" },
  { label: "Sticker Templates",  href: "/management/sticker-templates",icon: LayoutTemplate,  group: "Management" },
  { label: "Wastage / Write-off",         href: "/inventory/wastage",                            icon: AlertTriangle, group: "Inventory"  },
  { label: "Registers · POS Settings",   href: "/management/registers#pos-settings",            icon: Monitor,       group: "Registers"  },
  { label: "Registers · Hardware",        href: "/management/registers#hardware",                icon: HardDrive,     group: "Registers"  },
  { label: "Registers · Shortcuts",       href: "/management/registers#shortcuts",               icon: Keyboard,      group: "Registers"  },
  { label: "Reports · Payments",          href: "/management/sales-overview#payments",           icon: Receipt,       group: "Reports"    },
  { label: "Reports · Inventory",         href: "/management/sales-overview#inventory",          icon: Package,       group: "Reports"    },
  { label: "Reports · Profit & Loss",     href: "/management/sales-overview#profit-loss",        icon: TrendingUp,    group: "Reports"    },
  { label: "Reports · Top Products",      href: "/management/sales-overview#top-products",       icon: Boxes,         group: "Reports"    },
  { label: "Reports · Register Closures", href: "/management/sales-overview#register-closures",  icon: Monitor,       group: "Reports"    },
  { label: "Reports · Customer Insights", href: "/management/sales-overview#customer-insights",  icon: Users,         group: "Reports"    },
  { label: "Reports · GST / BAS",         href: "/management/sales-overview#gst-bas",            icon: Receipt,       group: "Reports"    },
  { label: "Reports · Cash Movements",    href: "/management/sales-overview#cash-movements",     icon: Coins,         group: "Reports"    },
  { label: "Reports · Report Builder",    href: "/management/sales-overview#report-builder",     icon: LayoutGrid,    group: "Reports"    },
  { label: "Reports · Gift Cards",        href: "/management/sales-overview#gift-cards",         icon: Gift,          group: "Reports"    },
  { label: "Reports · Scheduled",         href: "/management/sales-overview#scheduled",          icon: CalendarClock, group: "Reports"    },
  { label: "Reports · User Activity",     href: "/management/sales-overview#user-activity",      icon: Users,         group: "Reports"    },
];

/* ─── Route → breadcrumb label ───────────────────────────────────────────── */

const ROUTE_LABEL: Record<string, string[]> = {
  "/dashboard":                   ["Dashboard"],
  "/pos":                         ["POS", "Sell"],
  "/pos/history":                 ["POS", "History"],
  "/pos/invoices":                ["POS", "Invoices"],
  "/pos/laybuys":                 ["POS", "Laybys"],
  "/management/layby":            ["Management", "Layby"],
  "/pos/parked":                  ["POS", "Parked"],
  "/pos/refund":                  ["POS", "Refund"],
  "/pos/cash":                    ["POS", "Cash"],
  "/pos/3d-prints":               ["POS", "3D Prints"],
  "/service-jobs":                ["Services"],
  "/service-jobs/new":            ["Services", "New Job"],
  "/appointments":                ["Appointments"],
  "/customers":                   ["Customers"],
  "/customers/forms":            ["Customers", "Forms"],
  "/transactions":                ["Transactions"],
  "/inventory":                   ["Inventory"],
  "/products":                    ["Inventory", "Products"],
  "/products/overview":           ["Inventory", "Overview"],
  "/products/bundles":            ["Inventory", "Bundles"],
  "/products/stocktake":          ["Inventory", "Stocktake"],
  "/products/purchase-orders":    ["Inventory", "Purchase Orders"],
  "/products/pre-orders":         ["Inventory", "Pre-Orders"],
  "/products/return-auth":        ["Inventory", "Return Auth"],
  "/products/suppliers":          ["Inventory", "Suppliers"],
  "/products/brands":             ["Inventory", "Brands"],
  "/products/categories":         ["Inventory", "Categories"],
  "/products/tags":               ["Inventory", "Tags"],
  "/products/recalls":            ["Inventory", "Recalls"],
  "/staff":                       ["Staff", "Employees"],
  "/staff/timesheet":             ["Staff", "Timesheet"],
  "/staff/rostering":             ["Staff", "Rostering"],
  "/staff/leave-requests":        ["Staff", "Leave"],
  "/staff/cost-summary":          ["Staff", "Costs"],
  "/staff/notes":                 ["Staff", "Notes"],
  "/staff/kpis":                  ["Staff", "KPIs"],
  "/staff/links":                 ["Staff", "Links"],
  "/modules":                     ["Management", "Account", "Modules"],
  "/management/staff":              ["Management", "Staff", "Employees"],
  "/management/staff/timesheet":    ["Management", "Staff", "Timesheet"],
  "/management/staff/cost-summary": ["Management", "Staff", "Costs"],
  "/settings":                    ["Settings"],
  "/management/customers":        ["Management", "Customers"],
  "/management/registers":        ["Management", "POS Registers"],
  "/management/business":         ["Management", "Business Info"],
  "/management/regional":         ["Management", "Regional Settings"],
  "/management/account":          ["Management", "Account"],
  "/management/overview":         ["Management", "Overview"],
  "/management/sales-overview":   ["Management", "Reports"],
  "/management/kpis":             ["Management", "KPIs & Targets"],
  "/management/integrations":     ["Management", "Integrations"],
  "/management/import-export":    ["Management", "Import / Export"],
  "/management/loyalty":          ["Management", "Loyalty"],
  "/management/inventory":        ["Management", "Inventory"],
  "/management/discounts":        ["Management", "Discounts"],
  "/inventory/wastage":           ["Inventory", "Wastage"],
  "/settings/tax":                ["Management", "Tax & Receipts"],
  "/management/tax":              ["Management", "Tax & Receipts"],
  "/management/email":            ["Management", "Email"],
  "/management/templates":        ["Management", "Templates"],
  "/management/calculators/3d-printing": ["Management", "Calculators", "3D Printing"],
  "/management/calculators/pc-builder":  ["Management", "Calculators", "PC Builder"],
  "/pos/pc-builder":                     ["POS", "PC Builder"],
  "/management/stickers":         ["Management", "Stickers"],
  "/management/sticker-templates":["Management", "Sticker Templates"],
};

/* ─── Global search ──────────────────────────────────────────────────────── */

function GlobalSearch({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const setOpenWithCallback = (val: boolean) => { setOpen(val); onOpenChange?.(val); };

  const results = query.trim().length === 0
    ? SEARCH_INDEX.slice(0, 8)
    : SEARCH_INDEX.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.group.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpenWithCallback(true); setTimeout(() => inputRef.current?.focus(), 50); }
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

  const go = (href: string) => { navigate(href); setOpenWithCallback(false); setQuery(""); };

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpenWithCallback(true)}
          onChange={(e) => { setQuery(e.target.value); setOpenWithCallback(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) go(results[0].href);
            if (e.key === "Escape") { setOpenWithCallback(false); inputRef.current?.blur(); }
          }}
          placeholder="Search everything..."
          className="w-full h-9 pl-9 pr-14 rounded-md border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background transition-all"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground font-mono border rounded px-1 py-0.5">⌘K</kbd>
      </div>
      {open && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">No results found.</div>
          ) : (
            <div className="py-1 max-h-80 overflow-y-auto">
              {results.map((item) => (
                <button key={item.href} onMouseDown={() => go(item.href)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-left">
                  <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.group}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Breadcrumbs ────────────────────────────────────────────────────────── */

function Breadcrumbs({ location }: { location: string }) {
  const labels = ROUTE_LABEL[location] || [location.split("/").filter(Boolean).join(" / ") || "Home"];
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

function NavNestedGroup({ name, icon: Icon, children, location }: {
  name: string; icon: React.ComponentType<{ className?: string }>; children: NavLeaf[]; location: string;
}) {
  const isChildActive = children.some((c) => location === c.href);
  const [open, setOpen] = useState(isChildActive);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton isActive={isChildActive} onClick={() => setOpen((o) => !o)} className="cursor-pointer w-full">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1">{name}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </SidebarMenuSubButton>
      {open && (
        <SidebarMenuSub>
          {children.map((child) => {
            const active = location === child.href;
            return (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton asChild isActive={active}>
                  <Link href={child.href} className="flex items-center gap-2.5">
                    <child.icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{child.name}</span>
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
                    : "border-border hover:bg-muted text-foreground"
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
                    : "border-border hover:bg-muted text-foreground"
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
        isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function TopNavDropdown({ label, icon: Icon, items, isActive, isOpen, onToggle, location, navigate }: {
  label: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[];
  isActive: boolean; isOpen: boolean; onToggle: () => void;
  location: string; navigate: (href: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const handleToggle = () => {
    if (!isOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
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
                  {item.children.map((child) => (
                    <button key={child.href} onClick={() => { navigate(child.href); onToggle(); }}
                      className={cn("w-full flex items-center gap-2.5 pl-7 pr-3 py-2 text-sm hover:bg-muted transition-colors text-left", location === child.href && "bg-secondary/60 font-medium")}>
                      <child.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      {child.name}
                    </button>
                  ))}
                </div>
              );
            }
            const active = location === item.href;
            return (
              <button key={item.href} onClick={() => { navigate(item.href); onToggle(); }}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left", active && "bg-secondary/60 font-medium")}>
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
    <div>
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
          isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>
      {panel}
    </div>
  );
}

function TopNavLayout({ children, location, navigate, user, theme, toggleTheme, handleLogout, logoutPending }: LayoutSharedProps) {
  const isPOSSection        = location === "/pos" || location.startsWith("/pos/");
  const isInventorySection  = location === "/products" || location.startsWith("/products/") || location === "/inventory" || location.startsWith("/inventory/");
  const isStaffSection      = location === "/staff" || location.startsWith("/staff/");
  const isManagementSection = location.startsWith("/management/") || location === "/modules" || location.startsWith("/settings/");

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

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
    <div className="min-h-[100dvh] flex flex-col bg-muted/10">
      <header ref={headerRef} className="h-14 border-b bg-background flex items-center gap-2 px-4 shrink-0 sticky top-0 z-30">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0 mr-1">
          <img src="/logo.png" alt="KoaPOS" className="w-7 h-7 object-contain" />
          <span className="font-bold text-sm hidden lg:block max-w-[110px] truncate">{user?.businessName || "KoaPOS"}</span>
        </Link>

        {/* Nav items */}
        <nav className="flex items-center gap-0.5 overflow-x-auto shrink-0" aria-label="Main navigation" style={{ scrollbarWidth: "none" }}>
          <TopNavBtn icon={LayoutDashboard} label="Dashboard" isActive={location === "/dashboard"} onClick={() => navigate("/dashboard")} />
          <TopNavDropdown label="POS" icon={ShoppingCart} items={POS_SUBNAV} isActive={isPOSSection}
            isOpen={openDropdown === "pos"} onToggle={() => toggle("pos")} location={location} navigate={navigate} />
          <TopNavBtn icon={Wrench} label="Services" isActive={location === "/service-jobs" || location.startsWith("/service-jobs/")} onClick={() => navigate("/service-jobs")} />
          <TopNavBtn icon={CalendarClock} label="Appts" isActive={location === "/appointments"} onClick={() => navigate("/appointments")} />
          <TopNavDropdown label="Inventory" icon={Boxes} items={INVENTORY_SUBNAV} isActive={isInventorySection}
            isOpen={openDropdown === "inventory"} onToggle={() => toggle("inventory")} location={location} navigate={navigate} />
          <TopNavBtn icon={Users} label="Customers" isActive={location === "/customers"} onClick={() => navigate("/customers")} />
          <TopNavDropdown label="Staff" icon={UserSquare2} items={STAFF_SUBNAV} isActive={isStaffSection}
            isOpen={openDropdown === "staff"} onToggle={() => toggle("staff")} location={location} navigate={navigate} />
          <TopNavDropdown label="Management" icon={BriefcaseBusiness} items={MANAGEMENT_SUBNAV} isActive={isManagementSection}
            isOpen={openDropdown === "management"} onToggle={() => toggle("management")} location={location} navigate={navigate} />
        </nav>

        {/* Flex spacer */}
        <div className="flex-1 min-w-0" />

        {/* Search */}
        <div className="w-44 xl:w-64 shrink-0">
          <GlobalSearch onOpenChange={setSearchOpen} />
        </div>

        {/* Right actions */}
        <LayoutPicker />
        <AccessibilityPicker />
        <div className={cn("flex items-center gap-1.5 shrink-0 overflow-hidden transition-all duration-300", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "max-w-xs opacity-100")}>
          <Link href="/pos">
            <Button variant={isPOSSection ? "default" : "outline"} size="sm" className="gap-1.5 font-semibold h-8 px-3">
              <ShoppingCart className="w-3.5 h-3.5" /><span className="hidden sm:inline">POS</span>
            </Button>
          </Link>
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main id="main-content" className="flex-1 overflow-auto bg-muted/10">{children}</main>
    </div>
  );
}

/* ─── Bottom nav components ──────────────────────────────────────────────── */

function BottomMoreSheet({ open, onClose, location, navigate, user, onLogout, logoutPending }: {
  open: boolean; onClose: () => void; location: string; navigate: (href: string) => void;
  user: { ownerName?: string | null; email?: string } | null;
  onLogout: () => void; logoutPending: boolean;
}) {
  if (!open) return null;

  const go = (href: string) => { navigate(href); onClose(); };

  const sections: { label: string; items: NavLeaf[] }[] = [
    { label: "POS",        items: POS_SUBNAV },
    { label: "Inventory",  items: INVENTORY_SUBNAV },
    {
      label: "Staff",
      items: STAFF_SUBNAV.flatMap((item) =>
        "children" in item ? item.children : [item as NavLeaf]
      ),
    },
    {
      label: "Management",
      items: MANAGEMENT_SUBNAV.flatMap((item) =>
        "children" in item ? item.children : [item as NavLeaf]
      ),
    },
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
            <button onClick={() => go("/service-jobs")} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left", location.startsWith("/service-jobs") && "bg-secondary/60 font-medium")}>
              <Wrench className="w-4 h-4 shrink-0 text-muted-foreground" /><span>Services</span>
            </button>
            <button onClick={() => go("/appointments")} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left", location === "/appointments" && "bg-secondary/60 font-medium")}>
              <CalendarClock className="w-4 h-4 shrink-0 text-muted-foreground" /><span>Appointments</span>
            </button>
            <button onClick={() => go("/transactions")} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left", location === "/transactions" && "bg-secondary/60 font-medium")}>
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
                    className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left", active && "bg-secondary/60 font-medium")}>
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

function BottomNavLayout({ children, location, navigate, user, theme, toggleTheme, handleLogout, logoutPending }: LayoutSharedProps) {
  const isPOSSection        = location === "/pos" || location.startsWith("/pos/");
  const isInventorySection  = location === "/products" || location.startsWith("/products/") || location === "/inventory" || location.startsWith("/inventory/");
  const isStaffSection      = location === "/staff" || location.startsWith("/staff/");
  const isManagementSection = location.startsWith("/management/") || location === "/modules" || location.startsWith("/settings/");
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
    <div className="min-h-[100dvh] flex flex-col bg-muted/10">
      <header className="h-14 flex items-center gap-3 px-4 border-b bg-background shrink-0">
        <div className={cn("shrink-0 overflow-hidden transition-all duration-300 ease-in-out", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "opacity-100")}>
          <Breadcrumbs location={location} />
        </div>
        <div className="flex-1 min-w-0 flex"><GlobalSearch onOpenChange={setSearchOpen} /></div>
        <LayoutPicker />
        <AccessibilityPicker />
        <div className={cn("flex items-center gap-2 shrink-0 overflow-hidden transition-all duration-300 ease-in-out", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "max-w-xs opacity-100")}>
          <Link href="/pos">
            <Button variant={isPOSSection ? "default" : "outline"} size="sm" className="gap-1.5 font-semibold rounded-md h-8 px-3">
              <ShoppingCart className="w-3.5 h-3.5" /><span className="hidden sm:inline">POS</span>
            </Button>
          </Link>
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main id="main-content" className="flex-1 overflow-auto bg-muted/10 pb-16">{children}</main>

      {/* Fixed bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 border-t bg-background flex items-center justify-around px-2 z-30" aria-label="Main navigation">
        <BottomTab href="/dashboard"        icon={LayoutDashboard} label="Dashboard" active={location === "/dashboard"} />
        <BottomTab href="/pos"              icon={ShoppingCart}    label="POS"       active={isPOSSection} />
        <BottomTab href="/products/overview"icon={Boxes}           label="Inventory" active={isInventorySection} />
        <BottomTab href="/customers"        icon={Users}           label="Customers" active={location === "/customers"} />
        <BottomTab icon={Menu} label="More" active={isManagementSection || moreOpen} onClick={() => setMoreOpen(true)} />
      </nav>

      <BottomMoreSheet
        open={moreOpen} onClose={() => setMoreOpen(false)}
        location={location} navigate={navigate} user={user}
        onLogout={handleLogout} logoutPending={logoutPending}
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
}

/* ─── Main AppLayout ─────────────────────────────────────────────────────── */

export function AppLayout({ children, hideSidebar }: { children: React.ReactNode; hideSidebar?: boolean }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { navLayout } = useNavLayout();
  const logoutMutation = useLogout();

  // Scroll only the main content area to the top on navigation — sidebar keeps its position
  useEffect(() => {
    document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "instant" });
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
  const isInventorySection  = location === "/products" || location.startsWith("/products/");
  const isStaffSection      = location === "/staff" || location.startsWith("/staff/");
  const isManagementSection =
    location.startsWith("/management/") ||
    location === "/modules" || location.startsWith("/settings/");
  const isCustomersSection  = location === "/customers" || location.startsWith("/customers/");

  const [posOpen,    setPosOpen]    = useState(isPOSSection);
  const [invOpen,    setInvOpen]    = useState(isInventorySection);
  const [staffOpen,  setStaffOpen]  = useState(isStaffSection);
  const [mgmtOpen,   setMgmtOpen]   = useState(isManagementSection);
  const [custsOpen,  setCustsOpen]  = useState(isCustomersSection);
  const [searchOpen, setSearchOpen] = useState(false);

  const canManage = !!user;

  const handleLogout = () => logoutMutation.mutate(undefined, { onSuccess: () => logout() });
  const logoutPending = logoutMutation.isPending;

  const sharedProps: LayoutSharedProps = {
    children, location, navigate: navigate as (href: string) => void,
    user: user as MerchantUser, theme, toggleTheme, handleLogout, logoutPending,
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
          className="data-[active=true]:bg-secondary data-[active=true]:text-secondary-foreground">
          <Link href={href} className="flex items-center gap-3">
            <Icon className="w-4 h-4 shrink-0" /><span>{name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const CollapsibleSection = ({ label, icon: Icon, isActive, isOpen, onToggle, items, accent, defaultHref }: {
    label: string; icon: React.ComponentType<{ className?: string }>; isActive: boolean; isOpen: boolean;
    onToggle: () => void; items: NavItem[]; accent?: boolean; defaultHref?: string;
  }) => {
    const handleClick = () => { if (defaultHref) navigate(defaultHref as string); onToggle(); };
    return (
      <SidebarMenuItem>
        <SidebarMenuButton isActive={isActive} onClick={handleClick} tooltip={label}
          className={`flex items-center gap-3 cursor-pointer w-full data-[active=true]:bg-secondary data-[active=true]:text-secondary-foreground${accent ? " text-primary font-semibold hover:text-primary" : ""}`}>
          <Icon className={`w-4 h-4 shrink-0${accent ? " text-primary" : ""}`} />
          <span className="flex-1">{label}</span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}${accent ? " text-primary" : " text-muted-foreground"}`} />
        </SidebarMenuButton>
        {isOpen && (
          <SidebarMenuSub>
            {items.map((item) => {
              if ("children" in item) {
                return <NavNestedGroup key={item.name} name={item.name} icon={item.icon} children={item.children} location={location} />;
              }
              const active = location === item.href;
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link href={item.href} className="flex items-center gap-2.5">
                      <item.icon className="w-3.5 h-3.5 shrink-0" /><span>{item.name}</span>
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
      collapsible="icon"
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
          <NavLink href="/service-jobs"  icon={Wrench}        name="Services" />
          <NavLink href="/appointments"  icon={CalendarClock} name="Appointments" />
          <CollapsibleSection
            label="Inventory" icon={Boxes} isActive={isInventorySection} isOpen={invOpen}
            onToggle={() => { setInvOpen((o) => !o); setPosOpen(false); setMgmtOpen(false); }}
            items={INVENTORY_SUBNAV} defaultHref="/products/overview"
          />
          <CollapsibleSection
            label="Customers" icon={Users} isActive={isCustomersSection} isOpen={custsOpen}
            onToggle={() => { setCustsOpen((o) => !o); setPosOpen(false); setInvOpen(false); setStaffOpen(false); setMgmtOpen(false); }}
            items={CUSTOMERS_SUBNAV} defaultHref="/customers"
          />
          <CollapsibleSection
            label="Staff" icon={UserSquare2} isActive={isStaffSection} isOpen={staffOpen}
            onToggle={() => { setStaffOpen((o) => !o); setPosOpen(false); setInvOpen(false); setCustsOpen(false); setMgmtOpen(false); }}
            items={STAFF_SUBNAV} defaultHref="/staff"
          />
          {canManage && (
            <CollapsibleSection
              label="Management" icon={BriefcaseBusiness} isActive={isManagementSection} isOpen={mgmtOpen}
              onToggle={() => { setMgmtOpen((o) => !o); setPosOpen(false); setInvOpen(false); setStaffOpen(false); }}
              items={MANAGEMENT_SUBNAV} accent defaultHref="/management/overview"
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
      <div className={cn("min-h-[100dvh] w-full flex bg-muted/10", isRight && "flex-row-reverse")}>

        {isAutoHide ? <AutoHideSidebarWrapper>{sidebarEl}</AutoHideSidebarWrapper> : sidebarEl}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 flex items-center gap-3 px-4 border-b bg-background shrink-0">
            <SidebarTrigger className="md:hidden shrink-0" />

            <div className={cn("shrink-0 overflow-hidden transition-all duration-300 ease-in-out", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "opacity-100")}>
              <Breadcrumbs location={location} />
            </div>

            <div className="flex-1 min-w-0 flex"><GlobalSearch onOpenChange={setSearchOpen} /></div>

            <div className={cn("flex items-center gap-2 shrink-0 overflow-hidden transition-all duration-300 ease-in-out", searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "max-w-xs opacity-100")}>
              <Link href="/pos">
                <Button variant={isPOSSection ? "default" : "outline"} size="sm" className="gap-1.5 font-semibold rounded-md h-8 px-3">
                  <ShoppingCart className="w-3.5 h-3.5" /><span className="hidden sm:inline">POS</span>
                </Button>
              </Link>
              <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
            <LayoutPicker />
            <AccessibilityPicker />
          </header>

          <main id="main-content" className="flex-1 overflow-auto bg-muted/10">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
