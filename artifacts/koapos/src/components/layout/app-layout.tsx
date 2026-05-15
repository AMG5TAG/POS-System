import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Receipt,
  Boxes,
  UserSquare2,
  Settings,
  Blocks,
  LogOut,
  CalendarClock,
  Wrench,
  ChevronDown,
  LayoutGrid,
  Layers,
  ClipboardList,
  Clock,
  RotateCcw,
  Truck,
  Bookmark,
  Tag,
  Hash,
  AlertTriangle,
  History,
  FileText,
  Package2,
  ParkingCircle,
  Coins,
} from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";

const POS_SUBNAV = [
  { name: "Sell", href: "/pos", icon: ShoppingCart },
  { name: "History", href: "/pos/history", icon: History },
  { name: "Invoices", href: "/pos/invoices", icon: FileText },
  { name: "Laybuys", href: "/pos/laybuys", icon: Package2 },
  { name: "Parked", href: "/pos/parked", icon: ParkingCircle },
  { name: "Refund", href: "/pos/refund", icon: RotateCcw },
  { name: "Cash", href: "/pos/cash", icon: Coins },
];

const PRODUCTS_SUBNAV = [
  { name: "Overview", href: "/products/overview", icon: LayoutGrid },
  { name: "Products", href: "/products", icon: Package },
  { name: "Bundles", href: "/products/bundles", icon: Layers },
  { name: "Stocktake", href: "/products/stocktake", icon: ClipboardList },
  { name: "Purchase Orders", href: "/products/purchase-orders", icon: ShoppingCart },
  { name: "Pre-Orders", href: "/products/pre-orders", icon: Clock },
  { name: "Return Auth.", href: "/products/return-auth", icon: RotateCcw },
  { name: "Suppliers", href: "/products/suppliers", icon: Truck },
  { name: "Brands", href: "/products/brands", icon: Bookmark },
  { name: "Categories", href: "/products/categories", icon: Tag },
  { name: "Tags", href: "/products/tags", icon: Hash },
  { name: "Recalls", href: "/products/recalls", icon: AlertTriangle },
];

const BOTTOM_NAV = [
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Appointments", href: "/appointments", icon: CalendarClock },
  { name: "Services", href: "/service-jobs", icon: Wrench },
  { name: "Transactions", href: "/transactions", icon: Receipt },
  { name: "Inventory", href: "/inventory", icon: Boxes },
  { name: "Staff", href: "/staff", icon: UserSquare2 },
  { name: "Modules", href: "/modules", icon: Blocks },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const logoutMutation = useLogout();

  const isPOSSection = location === "/pos" || location.startsWith("/pos/");
  const isProductsSection = location === "/products" || location.startsWith("/products/");

  const [posOpen, setPosOpen] = useState(isPOSSection);
  const [productsOpen, setProductsOpen] = useState(isProductsSection);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => logout(),
    });
  };

  const NavLink = ({ href, icon: Icon, name }: { href: string; icon: React.ComponentType<{ className?: string }>; name: string }) => {
    const active = location === href;
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={name}>
          <Link href={href} className="flex items-center gap-3">
            <Icon className="w-4 h-4 shrink-0" />
            <span>{name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const CollapsibleSection = ({
    label,
    icon: Icon,
    isActive,
    isOpen,
    onToggle,
    items,
  }: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    isActive: boolean;
    isOpen: boolean;
    onToggle: () => void;
    items: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
  }) => (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        onClick={onToggle}
        className="flex items-center gap-3 cursor-pointer w-full"
        tooltip={label}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
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
              <NavLink href="/dashboard" icon={LayoutDashboard} name="Dashboard" />

              {/* POS — collapsible */}
              <CollapsibleSection
                label="POS"
                icon={ShoppingCart}
                isActive={isPOSSection}
                isOpen={posOpen}
                onToggle={() => setPosOpen((o) => !o)}
                items={POS_SUBNAV}
              />

              {/* Products — collapsible */}
              <CollapsibleSection
                label="Products"
                icon={Package}
                isActive={isProductsSection}
                isOpen={productsOpen}
                onToggle={() => setProductsOpen((o) => !o)}
                items={PRODUCTS_SUBNAV}
              />

              {BOTTOM_NAV.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t">
            <div className="flex flex-col gap-4">
              <div className="text-sm truncate">
                <p className="font-medium truncate">{user?.ownerName || "Merchant"}</p>
                <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
              </div>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 flex items-center px-4 border-b bg-background shrink-0 md:hidden">
            <SidebarTrigger />
            <span className="ml-4 font-semibold">KoaPOS</span>
          </header>
          <main className="flex-1 overflow-auto bg-muted/10">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
