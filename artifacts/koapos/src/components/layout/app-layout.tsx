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
  Menu,
  CalendarClock,
  Wrench,
} from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarFooter } from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "POS", href: "/pos", icon: ShoppingCart },
  { name: "Products", href: "/products", icon: Package },
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

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        logout();
      }
    });
  };

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
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link href={item.href} className="flex items-center gap-3">
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t">
            <div className="flex flex-col gap-4">
              <div className="text-sm truncate">
                <p className="font-medium truncate">{user?.ownerName || "Merchant"}</p>
                <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
              </div>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={handleLogout} disabled={logoutMutation.isPending}>
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
