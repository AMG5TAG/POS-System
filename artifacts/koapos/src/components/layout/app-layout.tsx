import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard, ShoppingCart, Package, Users, Receipt,
  Boxes, UserSquare2, Settings, Blocks, LogOut, CalendarClock,
  Wrench, ChevronDown, LayoutGrid, Layers, ClipboardList, Clock,
  RotateCcw, Truck, Bookmark, Tag, Hash, AlertTriangle, History,
  FileText, Package2, ParkingCircle, Coins, TrendingUp,
  BriefcaseBusiness, ArrowLeftRight, Search, Sun, Moon,
  ChevronRight, LayoutDashboard as DashboardIcon,
} from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarFooter,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/* ─── Nav data ───────────────────────────────────────────────────────────── */

const POS_SUBNAV = [
  { name: "Sell",     href: "/pos",           icon: ShoppingCart },
  { name: "History",  href: "/pos/history",   icon: History },
  { name: "Invoices", href: "/pos/invoices",  icon: FileText },
  { name: "Laybuys",  href: "/pos/laybuys",   icon: Package2 },
  { name: "Parked",   href: "/pos/parked",    icon: ParkingCircle },
  { name: "Refund",   href: "/pos/refund",    icon: RotateCcw },
  { name: "Cash",     href: "/pos/cash",      icon: Coins },
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
];

const MANAGEMENT_SUBNAV = [
  { name: "Sales Overview",  href: "/management/sales-overview", icon: TrendingUp },
  { name: "Staff",           href: "/staff",                     icon: UserSquare2 },
  { name: "Modules",         href: "/modules",                   icon: Blocks },
  { name: "Integrations",    href: "/management/integrations",   icon: Receipt },
  { name: "Import / Export", href: "/management/import-export",  icon: ArrowLeftRight },
];

/* ─── Search index ───────────────────────────────────────────────────────── */

const SEARCH_INDEX = [
  { label: "Dashboard",        href: "/dashboard",                   icon: LayoutDashboard, group: "Pages" },
  { label: "POS · Sell",       href: "/pos",                         icon: ShoppingCart,    group: "POS" },
  { label: "POS · History",    href: "/pos/history",                 icon: History,         group: "POS" },
  { label: "POS · Invoices",   href: "/pos/invoices",                icon: FileText,        group: "POS" },
  { label: "POS · Laybuys",    href: "/pos/laybuys",                 icon: Package2,        group: "POS" },
  { label: "POS · Parked",     href: "/pos/parked",                  icon: ParkingCircle,   group: "POS" },
  { label: "POS · Refund",     href: "/pos/refund",                  icon: RotateCcw,       group: "POS" },
  { label: "Services",         href: "/service-jobs",                icon: Wrench,          group: "Pages" },
  { label: "Appointments",     href: "/appointments",                icon: CalendarClock,   group: "Pages" },
  { label: "Customers",        href: "/customers",                   icon: Users,           group: "Pages" },
  { label: "Products",         href: "/products",                    icon: Package,         group: "Inventory" },
  { label: "Inventory Overview", href: "/products/overview",         icon: LayoutGrid,      group: "Inventory" },
  { label: "Stocktake",        href: "/products/stocktake",          icon: ClipboardList,   group: "Inventory" },
  { label: "Suppliers",        href: "/products/suppliers",          icon: Truck,           group: "Inventory" },
  { label: "Categories",       href: "/products/categories",         icon: Tag,             group: "Inventory" },
  { label: "Staff",            href: "/staff",                       icon: UserSquare2,     group: "Management" },
  { label: "Modules",          href: "/modules",                     icon: Blocks,          group: "Management" },
  { label: "Integrations",     href: "/management/integrations",     icon: Receipt,         group: "Management" },
  { label: "Sales Overview",   href: "/management/sales-overview",   icon: TrendingUp,      group: "Management" },
  { label: "Settings",         href: "/settings",                    icon: Settings,        group: "Pages" },
];

/* ─── Route → breadcrumb label ───────────────────────────────────────────── */

const ROUTE_LABEL: Record<string, string[]> = {
  "/dashboard":                   ["Dashboard"],
  "/pos":                         ["POS", "Sell"],
  "/pos/history":                 ["POS", "History"],
  "/pos/invoices":                ["POS", "Invoices"],
  "/pos/laybuys":                 ["POS", "Laybuys"],
  "/pos/parked":                  ["POS", "Parked"],
  "/pos/refund":                  ["POS", "Refund"],
  "/pos/cash":                    ["POS", "Cash"],
  "/service-jobs":                ["Services"],
  "/service-jobs/new":            ["Services", "New Job"],
  "/appointments":                ["Appointments"],
  "/customers":                   ["Customers"],
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
  "/staff":                       ["Management", "Staff"],
  "/modules":                     ["Management", "Modules"],
  "/settings":                    ["Settings"],
  "/management/sales-overview":   ["Management", "Sales Overview"],
  "/management/integrations":     ["Management", "Integrations"],
  "/management/import-export":    ["Management", "Import / Export"],
};

/* ─── Global search ──────────────────────────────────────────────────────── */

function GlobalSearch({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const setOpenWithCallback = (val: boolean) => {
    setOpen(val);
    onOpenChange?.(val);
  };

  const results = query.trim().length === 0
    ? SEARCH_INDEX.slice(0, 8)
    : SEARCH_INDEX.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.group.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10);

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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenWithCallback(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const go = (href: string) => {
    navigate(href);
    setOpenWithCallback(false);
    setQuery("");
  };

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
          className="w-full h-9 pl-9 pr-14 rounded-full border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background transition-all"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground font-mono border rounded px-1 py-0.5">
          ⌘K
        </kbd>
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">No results found.</div>
          ) : (
            <div className="py-1 max-h-80 overflow-y-auto">
              {results.map((item) => (
                <button
                  key={item.href}
                  onMouseDown={() => go(item.href)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-left"
                >
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
    <nav className="flex items-center gap-1.5 text-sm min-w-0 shrink-0">
      {/* Grid icon → Dashboard */}
      <Link href="/dashboard" className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground">
        <LayoutGrid className="w-4 h-4" />
      </Link>

      {labels.map((label, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
          <span className={cn(
            "truncate",
            i === labels.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground",
          )}>
            {label}
          </span>
        </span>
      ))}
    </nav>
  );
}

/* ─── Main layout ────────────────────────────────────────────────────────── */

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const logoutMutation = useLogout();

  const isPOSSection        = location === "/pos" || location.startsWith("/pos/");
  const isInventorySection  = location === "/products" || location.startsWith("/products/");
  const isManagementSection =
    location.startsWith("/management/") ||
    location === "/staff" ||
    location === "/modules" ||
    location === "/management/integrations";

  const [posOpen,     setPosOpen]     = useState(isPOSSection);
  const [invOpen,     setInvOpen]     = useState(isInventorySection);
  const [mgmtOpen,    setMgmtOpen]    = useState(isManagementSection);
  const [searchOpen,  setSearchOpen]  = useState(false);

  const canManage = !!user;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => logout() });
  };

  const NavLink = ({
    href, icon: Icon, name,
  }: { href: string; icon: React.ComponentType<{ className?: string }>; name: string }) => {
    const active = location === href || location.startsWith(href + "/");
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild isActive={active} tooltip={name}
          className="data-[active=true]:bg-secondary data-[active=true]:text-secondary-foreground"
        >
          <Link href={href} className="flex items-center gap-3">
            <Icon className="w-4 h-4 shrink-0" />
            <span>{name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const CollapsibleSection = ({
    label, icon: Icon, isActive, isOpen, onToggle, items, accent,
  }: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    isActive: boolean; isOpen: boolean; onToggle: () => void;
    items: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
    accent?: boolean;
  }) => (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive} onClick={onToggle} tooltip={label}
        className={`flex items-center gap-3 cursor-pointer w-full data-[active=true]:bg-secondary data-[active=true]:text-secondary-foreground${accent ? " text-primary font-semibold hover:text-primary" : ""}`}
      >
        <Icon className={`w-4 h-4 shrink-0${accent ? " text-primary" : ""}`} />
        <span className="flex-1">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}${accent ? " text-primary" : " text-muted-foreground"}`} />
      </SidebarMenuButton>
      {isOpen && (
        <SidebarMenuSub>
          {items.map((item) => {
            const active = location === item.href;
            return (
              <SidebarMenuSubItem key={item.href}>
                <SidebarMenuSubButton asChild isActive={active}>
                  <Link href={item.href} className="flex items-center gap-2.5">
                    <item.icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );

  return (
    <SidebarProvider>
      <div className="min-h-[100dvh] w-full flex bg-muted/10">
        <Sidebar className="border-r">
          <SidebarHeader className="h-16 flex items-center px-4 border-b">
            <Link href="/dashboard" className="flex items-center gap-2 w-full">
              <img src="/logo.png" alt="KoaPOS" className="w-8 h-8 object-contain shrink-0" />
              <span className="font-bold text-lg truncate">{user?.businessName || "KoaPOS"}</span>
            </Link>
          </SidebarHeader>

          <SidebarContent className="px-2 py-4">
            <SidebarMenu>
              <NavLink href="/dashboard"   icon={LayoutDashboard} name="Dashboard" />
              <CollapsibleSection
                label="POS" icon={ShoppingCart}
                isActive={isPOSSection} isOpen={posOpen} onToggle={() => setPosOpen((o) => !o)}
                items={POS_SUBNAV}
              />
              <NavLink href="/service-jobs"  icon={Wrench}        name="Services" />
              <NavLink href="/appointments"  icon={CalendarClock} name="Appointments" />
              <CollapsibleSection
                label="Inventory" icon={Boxes}
                isActive={isInventorySection} isOpen={invOpen} onToggle={() => setInvOpen((o) => !o)}
                items={INVENTORY_SUBNAV}
              />
              <NavLink href="/customers" icon={Users}    name="Customers" />
              {canManage && (
                <CollapsibleSection
                  label="Management" icon={BriefcaseBusiness}
                  isActive={isManagementSection} isOpen={mgmtOpen} onToggle={() => setMgmtOpen((o) => !o)}
                  items={MANAGEMENT_SUBNAV} accent
                />
              )}
              <NavLink href="/settings" icon={Settings} name="Settings" />
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t">
            <div className="flex flex-col gap-4">
              <div className="text-sm truncate">
                <p className="font-medium truncate">{user?.ownerName || "Merchant"}</p>
                <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
              </div>
              <Button
                variant="outline" className="w-full justify-start gap-2"
                onClick={handleLogout} disabled={logoutMutation.isPending}
              >
                <LogOut className="w-4 h-4" /> Sign out
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* ── Top header bar ── */}
          <header className="h-14 flex items-center gap-3 px-4 border-b bg-background shrink-0">
            {/* Mobile sidebar trigger */}
            <SidebarTrigger className="md:hidden shrink-0" />

            {/* Breadcrumbs — fade + collapse when search is open */}
            <div
              className={cn(
                "shrink-0 overflow-hidden transition-all duration-300 ease-in-out",
                searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "max-w-xs opacity-100",
              )}
            >
              <Breadcrumbs location={location} />
            </div>

            {/* Search bar — expands to fill all available space when focused */}
            <div className="flex-1 min-w-0 flex">
              <GlobalSearch onOpenChange={setSearchOpen} />
            </div>

            {/* Right actions — fade + collapse when search is open */}
            <div
              className={cn(
                "flex items-center gap-2 shrink-0 overflow-hidden transition-all duration-300 ease-in-out",
                searchOpen ? "max-w-0 opacity-0 pointer-events-none" : "max-w-xs opacity-100",
              )}
            >
              {/* POS quick link */}
              <Link href="/pos">
                <Button
                  variant={isPOSSection ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5 font-semibold rounded-full h-8 px-3"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">POS</span>
                </Button>
              </Link>

              {/* Dark/light toggle */}
              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-auto bg-muted/10">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
