import { Switch, Route, Redirect } from "wouter";
import { AuthProvider } from "@/lib/auth";
import { useAuth } from "@/lib/use-auth";
import { ThemeProvider } from "@/lib/theme";
import { NavLayoutProvider } from "@/lib/nav-layout";
import { AccessibilityProvider } from "@/lib/accessibility";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setOnUnauthorized } from "@workspace/api-client-react";

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
import CustomersFormsPage from "@/pages/app/customers-forms";
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
import ManagementOverviewPage from "@/pages/app/management-overview";
import ManagementSalesPage from "@/pages/app/management-sales";
import ManagementRegistersPage from "@/pages/app/management-registers";
import ManagementIntegrationsPage from "@/pages/app/management-integrations";
import ManagementXeroPage from "@/pages/app/management-xero";
import ManagementImportExportPage from "@/pages/app/management-import-export";
import ManagementLoyaltyPage from "@/pages/app/management-loyalty";
import ManagementLoyaltyLeaderboardPage from "@/pages/app/management-loyalty-leaderboard";
import ManagementLaybyPage from "@/pages/app/management-layby";
import ManagementInventoryPage from "@/pages/app/management-inventory";
import ManagementDiscountsPage from "@/pages/app/management-discounts";
import ManagementTemplatesPage from "@/pages/app/management-templates";
import ManagementFormsPage from "@/pages/app/management-forms";
import ManagementStickersPage from "@/pages/app/management-stickers";
import ManagementStickerTemplatesPage from "@/pages/app/management-sticker-templates";
import InventoryWastagePage from "@/pages/app/inventory-wastage";
import SettingsTaxPage from "@/pages/app/settings-tax";
import SettingsEmailPage from "@/pages/app/settings-email";
import POS3DPrintsPage from "@/pages/app/pos-3d-prints";
import ManagementCalculators3DPage from "@/pages/app/management-calculators-3d";
import POSPCBuilderPage from "@/pages/app/pos-pc-builder";
import ManagementCalculatorsPCBuilderPage from "@/pages/app/management-calculators-pc-builder";
import ManagementKpisPage from "@/pages/app/management-kpis";
import StaffNotesPage from "@/pages/app/staff-notes";
import StaffKpisPage from "@/pages/app/staff-kpis";
import StaffLinksPage from "@/pages/app/staff-links";

import MarketingPage from "@/pages/app/marketing";
import MarketingQRCodesPage from "@/pages/app/marketing-qr-codes";
import MarketingShortlinksPage from "@/pages/app/marketing-shortlinks";
import MarketingLandingPagesPage from "@/pages/app/marketing-landing-pages";
import MarketingEmailCampaignsPage from "@/pages/app/marketing-email-campaigns";
import MarketingEmailTemplatesPage from "@/pages/app/marketing-email-templates";
import MarketingLoyaltyPromotionsPage from "@/pages/app/marketing-loyalty-promotions";
import ManagementMarketingReferralsPage from "@/pages/app/management-marketing-referrals";
import ManagementMarketingAutomationPage from "@/pages/app/management-marketing-automation";
import ManagementOnlineStorePage from "@/pages/app/management-online-store";
import OnlineDeliveryOrdersPage from "@/pages/app/online-delivery-orders";
import OnlineShippingPage from "@/pages/app/online-shipping";
import OnlineMarketplacePage from "@/pages/app/online-marketplace";
import ManagementKoaPOSPage from "@/pages/app/management-koapos";
import ManagementMiscPage from "@/pages/app/management-misc";
import ManagementFeedbackPage from "@/pages/app/management-feedback";
import CamerasPage from "@/pages/app/cameras";
import ManagementCamerasPage from "@/pages/app/management-cameras";
import MarketingReferralsPage from "@/pages/app/marketing-referrals";
import LandingPagePublicView from "@/pages/marketing/landing-page-public";

import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

const PUBLIC_PATHS = ["/", "/pricing", "/login", "/register"];

setOnUnauthorized(() => {
  queryClient.clear();
  const path = window.location.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith("/b/"));
  if (!isPublic) {
    window.location.replace("/login");
  }
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
      <Route path="/pos/3d-prints">
        <ProtectedRoute component={POS3DPrintsPage} />
      </Route>
      <Route path="/pos/pc-builder">
        <ProtectedRoute component={POSPCBuilderPage} />
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

      <Route path="/customers/forms">
        <ProtectedRoute component={CustomersFormsPage} />
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
      <Route path="/staff/notes">
        <ProtectedRoute component={StaffNotesPage} />
      </Route>
      <Route path="/staff/kpis">
        <ProtectedRoute component={StaffKpisPage} />
      </Route>
      <Route path="/staff/links">
        <ProtectedRoute component={StaffLinksPage} />
      </Route>
      <Route path="/staff">
        <ProtectedRoute component={StaffPage} />
      </Route>

      {/* Management > Staff aliases (keep nav context in Management) */}
      <Route path="/management/staff/timesheet">
        <ProtectedRoute component={StaffTimesheetPage} />
      </Route>
      <Route path="/management/staff/cost-summary">
        <ProtectedRoute component={StaffCostSummaryPage} />
      </Route>
      <Route path="/management/staff">
        <ProtectedRoute component={StaffPage} />
      </Route>

      {/* Management section */}
      <Route path="/management/overview">
        <ProtectedRoute component={ManagementOverviewPage} />
      </Route>
      <Route path="/management/kpis">
        <ProtectedRoute component={ManagementKpisPage} />
      </Route>
      <Route path="/management/misc">
        <ProtectedRoute component={ManagementMiscPage} />
      </Route>
      <Route path="/management/registers">
        <ProtectedRoute component={ManagementRegistersPage} />
      </Route>
      <Route path="/management/sales-overview">
        <ProtectedRoute component={ManagementSalesPage} />
      </Route>
      <Route path="/management/integrations">
        <ProtectedRoute component={ManagementIntegrationsPage} />
      </Route>
      <Route path="/management/xero">
        <ProtectedRoute component={ManagementXeroPage} />
      </Route>
      <Route path="/management/import-export">
        <ProtectedRoute component={ManagementImportExportPage} />
      </Route>
      <Route path="/management/loyalty">
        <ProtectedRoute component={ManagementLoyaltyPage} />
      </Route>
      <Route path="/management/loyalty/leaderboard">
        <ProtectedRoute component={ManagementLoyaltyLeaderboardPage} />
      </Route>
      <Route path="/management/layby">
        <ProtectedRoute component={ManagementLaybyPage} />
      </Route>
      <Route path="/management/inventory">
        <ProtectedRoute component={ManagementInventoryPage} />
      </Route>
      <Route path="/management/discounts">
        <ProtectedRoute component={ManagementDiscountsPage} />
      </Route>
      <Route path="/management/templates">
        <ProtectedRoute component={ManagementTemplatesPage} />
      </Route>
      <Route path="/management/forms">
        <ProtectedRoute component={ManagementFormsPage} />
      </Route>
      <Route path="/management/stickers">
        <ProtectedRoute component={ManagementStickersPage} />
      </Route>
      <Route path="/management/sticker-templates">
        <ProtectedRoute component={ManagementStickerTemplatesPage} />
      </Route>
      <Route path="/inventory/wastage">
        <ProtectedRoute component={InventoryWastagePage} />
      </Route>
      <Route path="/management/tax">
        <ProtectedRoute component={SettingsTaxPage} />
      </Route>
      <Route path="/management/email">
        <ProtectedRoute component={SettingsEmailPage} />
      </Route>
      <Route path="/settings/tax">
        <Redirect to="/management/tax" />
      </Route>
      <Route path="/settings/email">
        <Redirect to="/management/email" />
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
      <Route path="/management/calculators/3d-printing">
        <ProtectedRoute component={ManagementCalculators3DPage} />
      </Route>
      <Route path="/management/calculators/pc-builder">
        <ProtectedRoute component={ManagementCalculatorsPCBuilderPage} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>

      {/* Public landing pages (no auth required) */}
      <Route path="/p/:slug" component={LandingPagePublicView} />

      {/* Marketing section */}
      <Route path="/marketing">
        <ProtectedRoute component={MarketingPage} />
      </Route>
      <Route path="/marketing/email/campaigns">
        <ProtectedRoute component={MarketingEmailCampaignsPage} />
      </Route>
      <Route path="/marketing/email/templates">
        <ProtectedRoute component={MarketingEmailTemplatesPage} />
      </Route>
      <Route path="/marketing/landing-pages">
        <ProtectedRoute component={MarketingLandingPagesPage} />
      </Route>
      <Route path="/marketing/generators/qr-codes">
        <ProtectedRoute component={MarketingQRCodesPage} />
      </Route>
      <Route path="/marketing/generators/shortlinks">
        <ProtectedRoute component={MarketingShortlinksPage} />
      </Route>
      <Route path="/marketing/loyalty/promotions">
        <ProtectedRoute component={MarketingLoyaltyPromotionsPage} />
      </Route>
      <Route path="/marketing/loyalty/leaderboard">
        <ProtectedRoute component={ManagementLoyaltyLeaderboardPage} />
      </Route>
      <Route path="/marketing/referrals">
        <ProtectedRoute component={MarketingReferralsPage} />
      </Route>
      <Route path="/management/koapos">
        <ProtectedRoute component={ManagementKoaPOSPage} />
      </Route>
      <Route path="/management/marketing/referrals">
        <ProtectedRoute component={ManagementMarketingReferralsPage} />
      </Route>
      <Route path="/marketing/automation">
        <ProtectedRoute component={ManagementMarketingAutomationPage} />
      </Route>
      <Route path="/management/online-store">
        <ProtectedRoute component={ManagementOnlineStorePage} />
      </Route>

      <Route path="/management/feedback">
        <ProtectedRoute component={ManagementFeedbackPage} />
      </Route>
      <Route path="/cameras">
        <ProtectedRoute component={CamerasPage} />
      </Route>
      <Route path="/management/cameras">
        <ProtectedRoute component={ManagementCamerasPage} />
      </Route>
      <Route path="/online/delivery-orders">
        <ProtectedRoute component={OnlineDeliveryOrdersPage} />
      </Route>
      <Route path="/online/shipping">
        <ProtectedRoute component={OnlineShippingPage} />
      </Route>
      <Route path="/online/marketplace">
        <ProtectedRoute component={OnlineMarketplacePage} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AccessibilityProvider>
        <NavLayoutProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AuthProvider>
                <a href="#main-content" className="skip-link">Skip to main content</a>
                <Router />
                <Toaster />
              </AuthProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </NavLayoutProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}

export default App;
