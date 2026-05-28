import { Switch, Route, Redirect, useLocation } from "wouter";
import { AuthProvider } from "@/lib/auth";
import { AIProvider } from "@/lib/ai-context";
import { useAuth } from "@/lib/use-auth";
import { ThemeProvider } from "@/lib/theme";
import { BrandColorProvider } from "@/lib/brand-color-context";
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
import StaffOverviewPage from "@/pages/app/staff-overview";
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
import StaffSocialFeedPage from "@/pages/app/staff-social-feed";
import ManagementMarketingSocialFeedPage from "@/pages/app/management-marketing-social-feed";
import ManagementFloorPlanPage from "@/pages/app/management-floor-plan";
import ManagementAIPage from "@/pages/app/management-ai";

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
import ManagementGiftCardsPage from "@/pages/app/management-gift-cards";
import MarketingReferralsPage from "@/pages/app/marketing-referrals";
import LandingPagePublicView from "@/pages/marketing/landing-page-public";
import PosEodPage from "@/pages/app/pos-eod";
import ManagementReportsBasPage from "@/pages/app/management-reports-bas";
import ManagementReportsMarginPage from "@/pages/app/management-reports-margin";

import { ManagementErrorBoundary } from "@/components/layout/management-error-boundary";
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

function ManagementProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [path] = useLocation();

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

  return (
    <ManagementErrorBoundary key={path}>
      <Component />
    </ManagementErrorBoundary>
  );
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
      <Route path="/pos/eod">
        <ProtectedRoute component={PosEodPage} />
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
      <Route path="/staff/overview">
        <ProtectedRoute component={StaffOverviewPage} />
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
      <Route path="/staff/social-feed">
        <ProtectedRoute component={StaffSocialFeedPage} />
      </Route>
      <Route path="/staff">
        <ProtectedRoute component={StaffPage} />
      </Route>

      {/* Management > Staff aliases (keep nav context in Management) */}
      <Route path="/management/staff/timesheet">
        <ManagementProtectedRoute component={StaffTimesheetPage} />
      </Route>
      <Route path="/management/staff/cost-summary">
        <ManagementProtectedRoute component={StaffCostSummaryPage} />
      </Route>
      <Route path="/management/staff">
        <ManagementProtectedRoute component={StaffPage} />
      </Route>

      {/* Management section */}
      <Route path="/management/overview">
        <ManagementProtectedRoute component={ManagementOverviewPage} />
      </Route>
      <Route path="/management/kpis">
        <ManagementProtectedRoute component={ManagementKpisPage} />
      </Route>
      <Route path="/management/misc">
        <ManagementProtectedRoute component={ManagementMiscPage} />
      </Route>
      <Route path="/management/registers">
        <ManagementProtectedRoute component={ManagementRegistersPage} />
      </Route>
      <Route path="/management/sales-overview">
        <ManagementProtectedRoute component={ManagementSalesPage} />
      </Route>
      <Route path="/management/reports/bas">
        <ManagementProtectedRoute component={ManagementReportsBasPage} />
      </Route>
      <Route path="/management/reports/margin">
        <ManagementProtectedRoute component={ManagementReportsMarginPage} />
      </Route>
      <Route path="/management/integrations">
        <ManagementProtectedRoute component={ManagementIntegrationsPage} />
      </Route>
      <Route path="/management/xero">
        <ManagementProtectedRoute component={ManagementXeroPage} />
      </Route>
      <Route path="/management/import-export">
        <ManagementProtectedRoute component={ManagementImportExportPage} />
      </Route>
      <Route path="/management/loyalty">
        <ManagementProtectedRoute component={ManagementLoyaltyPage} />
      </Route>
      <Route path="/management/loyalty/leaderboard">
        <ManagementProtectedRoute component={ManagementLoyaltyLeaderboardPage} />
      </Route>
      <Route path="/management/gift-cards">
        <ManagementProtectedRoute component={ManagementGiftCardsPage} />
      </Route>
      <Route path="/management/layby">
        <ManagementProtectedRoute component={ManagementLaybyPage} />
      </Route>
      <Route path="/management/inventory">
        <ManagementProtectedRoute component={ManagementInventoryPage} />
      </Route>
      <Route path="/management/floor-plan">
        <ManagementProtectedRoute component={ManagementFloorPlanPage} />
      </Route>
      <Route path="/management/discounts">
        <ManagementProtectedRoute component={ManagementDiscountsPage} />
      </Route>
      <Route path="/management/templates">
        <ManagementProtectedRoute component={ManagementTemplatesPage} />
      </Route>
      <Route path="/management/forms">
        <ManagementProtectedRoute component={ManagementFormsPage} />
      </Route>
      <Route path="/management/stickers">
        <ManagementProtectedRoute component={ManagementStickersPage} />
      </Route>
      <Route path="/management/sticker-templates">
        <ManagementProtectedRoute component={ManagementStickerTemplatesPage} />
      </Route>
      <Route path="/inventory/wastage">
        <ProtectedRoute component={InventoryWastagePage} />
      </Route>
      <Route path="/management/tax">
        <ManagementProtectedRoute component={SettingsTaxPage} />
      </Route>
      <Route path="/management/email">
        <ManagementProtectedRoute component={SettingsEmailPage} />
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
        <ManagementProtectedRoute component={SettingsBusinessPage} />
      </Route>
      <Route path="/management/regional">
        <ManagementProtectedRoute component={SettingsRegionalPage} />
      </Route>
      <Route path="/management/account">
        <ManagementProtectedRoute component={SettingsAccountPage} />
      </Route>
      <Route path="/settings/pos">
        <ProtectedRoute component={SettingsPOSPage} />
      </Route>
      <Route path="/management/customers">
        <ManagementProtectedRoute component={SettingsCustomersPage} />
      </Route>
      <Route path="/settings/customers">
        <Redirect to="/management/customers" />
      </Route>
      <Route path="/management/calculators/3d-printing">
        <ManagementProtectedRoute component={ManagementCalculators3DPage} />
      </Route>
      <Route path="/management/calculators/pc-builder">
        <ManagementProtectedRoute component={ManagementCalculatorsPCBuilderPage} />
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
        <ManagementProtectedRoute component={ManagementLoyaltyLeaderboardPage} />
      </Route>
      <Route path="/marketing/referrals">
        <ProtectedRoute component={MarketingReferralsPage} />
      </Route>
      <Route path="/management/koapos">
        <ManagementProtectedRoute component={ManagementKoaPOSPage} />
      </Route>
      <Route path="/management/marketing/referrals">
        <ManagementProtectedRoute component={ManagementMarketingReferralsPage} />
      </Route>
      <Route path="/management/marketing/social-feed">
        <ManagementProtectedRoute component={ManagementMarketingSocialFeedPage} />
      </Route>
      <Route path="/marketing/automation">
        <ManagementProtectedRoute component={ManagementMarketingAutomationPage} />
      </Route>
      <Route path="/management/online-store">
        <ManagementProtectedRoute component={ManagementOnlineStorePage} />
      </Route>

      <Route path="/management/feedback">
        <ManagementProtectedRoute component={ManagementFeedbackPage} />
      </Route>
      <Route path="/cameras">
        <ProtectedRoute component={CamerasPage} />
      </Route>
      <Route path="/management/cameras">
        <ManagementProtectedRoute component={ManagementCamerasPage} />
      </Route>
      <Route path="/management/ai">
        <ManagementProtectedRoute component={ManagementAIPage} />
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
                <BrandColorProvider>
                  <AIProvider>
                    <a href="#main-content" className="skip-link">Skip to main content</a>
                    <Router />
                    <Toaster />
                  </AIProvider>
                </BrandColorProvider>
              </AuthProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </NavLayoutProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}

export default App;
