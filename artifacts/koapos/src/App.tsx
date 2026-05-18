import { Switch, Route, Redirect } from "wouter";
import { AuthProvider } from "@/lib/auth";
import { useAuth } from "@/lib/use-auth";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import CustomerDisplayPage from "@/pages/app/customer-display";
import PortalPage from "@/pages/portal";
import LandingPage from "@/pages/marketing/landing";
import LoginPage from "@/pages/marketing/login";
import RegisterPage from "@/pages/marketing/register";
import PricingPage from "@/pages/marketing/pricing";

import DashboardPage from "@/pages/app/dashboard";

import POSPage from "@/pages/app/pos";
import POSHistoryPage from "@/pages/app/pos-history";
import POSInvoicesPage from "@/pages/app/pos-invoices";
import POSLaybuysPage from "@/pages/app/pos-laybuys";
import POSParkedPage from "@/pages/app/pos-parked";
import POSRefundPage from "@/pages/app/pos-refund";
import POSCashPage from "@/pages/app/pos-cash";

import ProductsPage from "@/pages/app/products";
import ProductsOverviewPage from "@/pages/app/products-overview";
import ProductsBundlesPage from "@/pages/app/products-bundles";
import ProductsStocktakePage from "@/pages/app/products-stocktake";
import ProductsPurchaseOrdersPage from "@/pages/app/products-purchase-orders";
import ProductsPreOrdersPage from "@/pages/app/products-pre-orders";
import ProductsReturnAuthPage from "@/pages/app/products-return-auth";
import ProductsSuppliersPage from "@/pages/app/products-suppliers";
import ProductsBrandsPage from "@/pages/app/products-brands";
import ProductsCategoriesPage from "@/pages/app/products-categories";
import ProductsTagsPage from "@/pages/app/products-tags";
import ProductsRecallsPage from "@/pages/app/products-recalls";

import CustomersPage from "@/pages/app/customers";
import TransactionsPage from "@/pages/app/transactions";
import InventoryPage from "@/pages/app/inventory";
import StaffPage from "@/pages/app/staff";
import StaffTimesheetPage from "@/pages/app/staff-timesheet";
import StaffRosteringPage from "@/pages/app/staff-rostering";
import StaffLeaveRequestsPage from "@/pages/app/staff-leave-requests";
import StaffCostSummaryPage from "@/pages/app/staff-cost-summary";
import ModulesPage from "@/pages/app/modules";
import SettingsPage from "@/pages/app/settings";
import SettingsBusinessPage from "@/pages/app/settings-business";
import SettingsRegionalPage from "@/pages/app/settings-regional";
import SettingsAccountPage from "@/pages/app/settings-account";
import SettingsCustomersPage from "@/pages/app/settings-customers";
import SettingsPOSPage from "@/pages/app/settings-pos";
import AppointmentsPage from "@/pages/app/appointments";
import ServiceJobsPage from "@/pages/app/service-jobs";
import ServiceJobNewPage from "@/pages/app/service-jobs-new";
import ManagementSalesPage from "@/pages/app/management-sales";
import ManagementRegistersPage from "@/pages/app/management-registers";
import ManagementIntegrationsPage from "@/pages/app/management-integrations";
import ManagementImportExportPage from "@/pages/app/management-import-export";
import ManagementLoyaltyPage from "@/pages/app/management-loyalty";
import ManagementLaybyPage from "@/pages/app/management-layby";
import ManagementInventoryPage from "@/pages/app/management-inventory";

import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/customer-display" component={CustomerDisplayPage} />
      <Route path="/b/:businessUsername/c/:token" component={PortalPage} />

      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>

      {/* POS section */}
      <Route path="/pos/history">
        <ProtectedRoute component={POSHistoryPage} />
      </Route>
      <Route path="/pos/invoices">
        <ProtectedRoute component={POSInvoicesPage} />
      </Route>
      <Route path="/pos/laybuys">
        <ProtectedRoute component={POSLaybuysPage} />
      </Route>
      <Route path="/pos/parked">
        <ProtectedRoute component={POSParkedPage} />
      </Route>
      <Route path="/pos/refund">
        <ProtectedRoute component={POSRefundPage} />
      </Route>
      <Route path="/pos/cash">
        <ProtectedRoute component={POSCashPage} />
      </Route>
      <Route path="/pos">
        <ProtectedRoute component={POSPage} />
      </Route>

      {/* Products section */}
      <Route path="/products/overview">
        <ProtectedRoute component={ProductsOverviewPage} />
      </Route>
      <Route path="/products/bundles">
        <ProtectedRoute component={ProductsBundlesPage} />
      </Route>
      <Route path="/products/stocktake">
        <ProtectedRoute component={ProductsStocktakePage} />
      </Route>
      <Route path="/products/purchase-orders">
        <ProtectedRoute component={ProductsPurchaseOrdersPage} />
      </Route>
      <Route path="/products/pre-orders">
        <ProtectedRoute component={ProductsPreOrdersPage} />
      </Route>
      <Route path="/products/return-auth">
        <ProtectedRoute component={ProductsReturnAuthPage} />
      </Route>
      <Route path="/products/suppliers">
        <ProtectedRoute component={ProductsSuppliersPage} />
      </Route>
      <Route path="/products/brands">
        <ProtectedRoute component={ProductsBrandsPage} />
      </Route>
      <Route path="/products/categories">
        <ProtectedRoute component={ProductsCategoriesPage} />
      </Route>
      <Route path="/products/tags">
        <ProtectedRoute component={ProductsTagsPage} />
      </Route>
      <Route path="/products/recalls">
        <ProtectedRoute component={ProductsRecallsPage} />
      </Route>
      <Route path="/products">
        <ProtectedRoute component={ProductsPage} />
      </Route>

      <Route path="/customers">
        <ProtectedRoute component={CustomersPage} />
      </Route>
      <Route path="/transactions">
        <ProtectedRoute component={TransactionsPage} />
      </Route>
      <Route path="/inventory">
        <ProtectedRoute component={InventoryPage} />
      </Route>
      <Route path="/appointments">
        <ProtectedRoute component={AppointmentsPage} />
      </Route>
      <Route path="/service-jobs/new">
        <ProtectedRoute component={ServiceJobNewPage} />
      </Route>
      <Route path="/service-jobs">
        <ProtectedRoute component={ServiceJobsPage} />
      </Route>
      <Route path="/staff/timesheet">
        <ProtectedRoute component={StaffTimesheetPage} />
      </Route>
      <Route path="/staff/rostering">
        <ProtectedRoute component={StaffRosteringPage} />
      </Route>
      <Route path="/staff/leave-requests">
        <ProtectedRoute component={StaffLeaveRequestsPage} />
      </Route>
      <Route path="/staff/cost-summary">
        <ProtectedRoute component={StaffCostSummaryPage} />
      </Route>
      <Route path="/staff">
        <ProtectedRoute component={StaffPage} />
      </Route>

      {/* Management section */}
      <Route path="/management/registers">
        <ProtectedRoute component={ManagementRegistersPage} />
      </Route>
      <Route path="/management/sales-overview">
        <ProtectedRoute component={ManagementSalesPage} />
      </Route>
      <Route path="/management/integrations">
        <ProtectedRoute component={ManagementIntegrationsPage} />
      </Route>
      <Route path="/management/import-export">
        <ProtectedRoute component={ManagementImportExportPage} />
      </Route>
      <Route path="/management/loyalty">
        <ProtectedRoute component={ManagementLoyaltyPage} />
      </Route>
      <Route path="/management/layby">
        <ProtectedRoute component={ManagementLaybyPage} />
      </Route>
      <Route path="/management/inventory">
        <ProtectedRoute component={ManagementInventoryPage} />
      </Route>

      <Route path="/modules">
        <ProtectedRoute component={ModulesPage} />
      </Route>
      <Route path="/management/business">
        <ProtectedRoute component={SettingsBusinessPage} />
      </Route>
      <Route path="/management/regional">
        <ProtectedRoute component={SettingsRegionalPage} />
      </Route>
      <Route path="/management/account">
        <ProtectedRoute component={SettingsAccountPage} />
      </Route>
      <Route path="/settings/pos">
        <ProtectedRoute component={SettingsPOSPage} />
      </Route>
      <Route path="/management/customers">
        <ProtectedRoute component={SettingsCustomersPage} />
      </Route>
      <Route path="/settings/customers">
        <Redirect to="/management/customers" />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
