import { lazy, Suspense, useEffect, useRef, useDeferredValue } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { AuthProvider } from "@/lib/auth";
import { AIProvider } from "@/lib/ai-context";
import { useAuth } from "@/lib/use-auth";
import { ThemeProvider } from "@/lib/theme";
import { BrandColorProvider } from "@/lib/brand-color-context";
import { AppThemeProvider } from "@/lib/app-theme";
import { ButtonStyleProvider } from "@/lib/button-style";
import { NavLayoutProvider } from "@/lib/nav-layout";
import { StaffSessionProvider } from "@/lib/staff-day-session";
import { AccessibilityProvider } from "@/lib/accessibility";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setOnUnauthorized } from "@workspace/api-client-react";

const CustomerDisplayPage = lazy(() => import("@/pages/app/customer-display"));
const PortalPage = lazy(() => import("@/pages/portal"));
const BookingPage = lazy(() => import("@/pages/booking"));
const TechAppPage = lazy(() => import("@/pages/tech"));
const DashboardAppPage = lazy(() => import("@/pages/dashboard-app"));
const MobilePosAppPage = lazy(() => import("@/pages/mobile-pos"));
const LandingPage = lazy(() => import("@/pages/marketing/landing"));
const LoginPage = lazy(() => import("@/pages/marketing/login"));
const RegisterPage = lazy(() => import("@/pages/marketing/register"));
const PricingPage = lazy(() => import("@/pages/marketing/pricing"));
const ForgotPasswordPage = lazy(() => import("@/pages/marketing/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/marketing/reset-password"));
const StaffResetPasswordPage = lazy(() => import("@/pages/marketing/staff-reset-password"));
const TermsPage = lazy(() => import("@/pages/marketing/terms"));
const PrivacyPage = lazy(() => import("@/pages/marketing/privacy"));

const DashboardPage = lazy(() => import("@/pages/app/dashboard"));

const POSPage = lazy(() => import("@/pages/app/pos"));
const POSHistoryPage = lazy(() => import("@/pages/app/pos-history"));
const POSInvoicesPage = lazy(() => import("@/pages/app/pos-invoices"));
const POSQuotesPage = lazy(() => import("@/pages/app/pos-quotes"));
const SalesSettingsPage = lazy(() => import("@/pages/app/settings-sales"));
const POSLaybuysPage = lazy(() => import("@/pages/app/pos-laybuys"));
const POSParkedPage = lazy(() => import("@/pages/app/pos-parked"));
const POSRefundPage = lazy(() => import("@/pages/app/pos-refund"));
const POSCashPage = lazy(() => import("@/pages/app/pos-cash"));

const ProductsPage = lazy(() => import("@/pages/app/products"));
const ProductsOverviewPage = lazy(() => import("@/pages/app/products-overview"));
const ProductsBundlesPage = lazy(() => import("@/pages/app/products-bundles"));
const ProductsStocktakePage = lazy(() => import("@/pages/app/products-stocktake"));
const ProductsPurchaseOrdersPage = lazy(() => import("@/pages/app/products-purchase-orders"));
const ProductsPreOrdersPage = lazy(() => import("@/pages/app/products-pre-orders"));
const ProductsReturnAuthPage = lazy(() => import("@/pages/app/products-return-auth"));
const ProductsSuppliersPage = lazy(() => import("@/pages/app/products-suppliers"));
const ProductsBrandsPage = lazy(() => import("@/pages/app/products-brands"));
const ProductsCategoriesPage = lazy(() => import("@/pages/app/products-categories"));
const ProductsTagsPage = lazy(() => import("@/pages/app/products-tags"));
const ProductsRecallsPage = lazy(() => import("@/pages/app/products-recalls"));
const ProductsWarrantyPage = lazy(() => import("@/pages/app/products-warranty"));

const CustomersPage = lazy(() => import("@/pages/app/customers"));
const CustomersFormsPage = lazy(() => import("@/pages/app/customers-forms"));
const TransactionsPage = lazy(() => import("@/pages/app/transactions"));
const InventoryPage = lazy(() => import("@/pages/app/inventory"));
const StaffPage = lazy(() => import("@/pages/app/staff"));
const StaffOverviewPage = lazy(() => import("@/pages/app/staff-overview"));
const StaffTimesheetPage = lazy(() => import("@/pages/app/staff-timesheet"));
const StaffRosteringPage = lazy(() => import("@/pages/app/staff-rostering"));
const StaffLeaveRequestsPage = lazy(() => import("@/pages/app/staff-leave-requests"));
const StaffCostSummaryPage = lazy(() => import("@/pages/app/staff-cost-summary"));
const StaffPayrollPage = lazy(() => import("@/pages/app/staff-payroll"));
const StaffPayrollRunsPage = lazy(() => import("@/pages/app/staff-payroll-runs"));
const StaffPayrollPayslipsPage = lazy(() => import("@/pages/app/staff-payroll-payslips"));
const StaffPayrollLeavePage = lazy(() => import("@/pages/app/staff-payroll-leave"));
const SettingsPayrollPage = lazy(() => import("@/pages/app/settings-payroll"));
const ModulesPage = lazy(() => import("@/pages/app/modules"));
const SettingsPage = lazy(() => import("@/pages/app/settings"));
const SettingsBusinessPage = lazy(() => import("@/pages/app/settings-business"));
const SettingsRegionalPage = lazy(() => import("@/pages/app/settings-regional"));
const SettingsAccountPage = lazy(() => import("@/pages/app/settings-account"));
const SettingsThemesPage = lazy(() => import("@/pages/app/settings-themes"));
const SettingsCustomersPage = lazy(() => import("@/pages/app/settings-customers"));
const SettingsPOSPage = lazy(() => import("@/pages/app/settings-pos"));
const AppointmentsPage = lazy(() => import("@/pages/app/appointments"));
const ServiceJobsPage = lazy(() => import("@/pages/app/service-jobs"));
const ServiceJobNewPage = lazy(() => import("@/pages/app/service-jobs-new"));
const ManagementOverviewPage = lazy(() => import("@/pages/app/management-overview"));
const ManagementSalesPage = lazy(() => import("@/pages/app/management-sales"));
const ManagementRegistersPage = lazy(() => import("@/pages/app/management-registers"));
const ManagementIntegrationsPage = lazy(() => import("@/pages/app/management-integrations"));
const ManagementIntegrationsHelpPage = lazy(() => import("@/pages/app/management-integrations-help"));
const ManagementServiceOptionsPage = lazy(() => import("@/pages/app/management-service-options"));
const ManagementXeroPage = lazy(() => import("@/pages/app/management-xero"));
const ManagementImportExportPage = lazy(() => import("@/pages/app/management-import-export"));
const ManagementLoyaltyPage = lazy(() => import("@/pages/app/management-loyalty"));
const ManagementLoyaltyLeaderboardPage = lazy(() => import("@/pages/app/management-loyalty-leaderboard"));
const ManagementLaybyPage = lazy(() => import("@/pages/app/management-layby"));
const ManagementInventoryPage = lazy(() => import("@/pages/app/management-inventory"));
const ManagementDiscountsPage = lazy(() => import("@/pages/app/management-discounts"));
const ManagementTemplatesPage = lazy(() => import("@/pages/app/management-templates"));
const ManagementLoanersPage = lazy(() => import("@/pages/app/management-loaners"));
const ManagementPartsCompatibilityPage = lazy(() => import("@/pages/app/management-parts-compatibility"));
const ManagementTradeInsPage = lazy(() => import("@/pages/app/management-trade-ins"));
const ManagementServicePlansPage = lazy(() => import("@/pages/app/management-service-plans"));
const ManagementLocationsPage = lazy(() => import("@/pages/app/management-locations"));
/** Misc templates = the same editor scoped to the "misc" section (Customer PDF, …). */
const ManagementMiscTemplatesPage = () => <ManagementTemplatesPage section="misc" />;
const ManagementFormsPage = lazy(() => import("@/pages/app/management-forms"));
const ManagementStickersPage = lazy(() => import("@/pages/app/management-stickers"));
const InventoryWastagePage = lazy(() => import("@/pages/app/inventory-wastage"));
const SettingsTaxPage = lazy(() => import("@/pages/app/settings-tax"));
const SettingsEmailPage = lazy(() => import("@/pages/app/settings-email"));
const SettingsSmsPage = lazy(() => import("@/pages/app/settings-sms"));
const SettingsProductTypesPage = lazy(() => import("@/pages/app/settings-product-types"));
const POS3DPrintsPage = lazy(() => import("@/pages/app/pos-3d-prints"));
const ManagementCalculators3DPage = lazy(() => import("@/pages/app/management-calculators-3d"));
const POSPCBuilderPage = lazy(() => import("@/pages/app/pos-pc-builder"));
const ManagementCalculatorsPCBuilderPage = lazy(() => import("@/pages/app/management-calculators-pc-builder"));
const ManagementKpisPage = lazy(() => import("@/pages/app/management-kpis"));
const StaffNotesPage = lazy(() => import("@/pages/app/staff-notes"));
const StaffKpisPage = lazy(() => import("@/pages/app/staff-kpis"));
const StaffLinksPage = lazy(() => import("@/pages/app/staff-links"));
const StaffSocialFeedPage = lazy(() => import("@/pages/app/staff-social-feed"));
const ManagementMarketingSocialFeedPage = lazy(() => import("@/pages/app/management-marketing-social-feed"));
const ManagementMarketingAnalyticsPage = lazy(() => import("@/pages/app/management-marketing-analytics"));
const ManagementFloorPlanPage = lazy(() => import("@/pages/app/management-floor-plan"));
const ManagementAIPage = lazy(() => import("@/pages/app/management-ai"));

const MarketingPage = lazy(() => import("@/pages/app/marketing"));
const MarketingQRCodesPage = lazy(() => import("@/pages/app/marketing-qr-codes"));
const MarketingShortlinksPage = lazy(() => import("@/pages/app/marketing-shortlinks"));
const MarketingLandingPagesPage = lazy(() => import("@/pages/app/marketing-landing-pages"));
const MarketingEmailCampaignsPage = lazy(() => import("@/pages/app/marketing-email-campaigns"));
const MarketingEmailTemplatesPage = lazy(() => import("@/pages/app/marketing-email-templates"));
const MarketingSmsCampaignsPage = lazy(() => import("@/pages/app/marketing-sms-campaigns"));
const MarketingSmsTemplatesPage = lazy(() => import("@/pages/app/marketing-sms-templates"));
const MarketingSocialMediaPage = lazy(() => import("@/pages/app/marketing-social-media"));
const MarketingLoyaltyPromotionsPage = lazy(() => import("@/pages/app/marketing-loyalty-promotions"));
const ManagementMarketingReferralsPage = lazy(() => import("@/pages/app/management-marketing-referrals"));
const ManagementMarketingAutomationPage = lazy(() => import("@/pages/app/management-marketing-automation"));
const ManagementOnlineStorePage = lazy(() => import("@/pages/app/management-online-store"));
const OnlineDeliveryOrdersPage = lazy(() => import("@/pages/app/online-delivery-orders"));
const OnlineShippingPage = lazy(() => import("@/pages/app/online-shipping"));
const OnlineMarketplacePage = lazy(() => import("@/pages/app/online-marketplace"));
const ManagementMiscPage = lazy(() => import("@/pages/app/management-misc"));
const ManagementSyncPage = lazy(() => import("@/pages/app/management-sync"));
const ManagementFeedbackPage = lazy(() => import("@/pages/app/management-feedback"));
const CamerasPage = lazy(() => import("@/pages/app/cameras"));
const ManagementCamerasPage = lazy(() => import("@/pages/app/management-cameras"));
const ManagementTechAppPage = lazy(() => import("@/pages/app/management-tech-app"));
const ManagementMobilePosPage = lazy(() => import("@/pages/app/management-mobile-pos"));
const ManagementDashboardAppPage = lazy(() => import("@/pages/app/management-dashboard-app"));
const ManagementLegalPage = lazy(() => import("@/pages/app/management-legal"));
const ManagementGiftCardsPage = lazy(() => import("@/pages/app/management-gift-cards"));
const MarketingReferralsPage = lazy(() => import("@/pages/app/marketing-referrals"));
const LandingPagePublicView = lazy(() => import("@/pages/marketing/landing-page-public"));
const OnlineStorePublicView = lazy(() => import("@/pages/marketing/online-store-public"));
const PosEodPage = lazy(() => import("@/pages/app/pos-eod"));
const ManagementReportsBasPage = lazy(() => import("@/pages/app/management-reports-bas"));
const ManagementReportsVoidAuditPage = lazy(() => import("@/pages/app/management-reports-void-audit"));
const ManagementReportsMarginPage = lazy(() => import("@/pages/app/management-reports-margin"));
const ManagementDailyReportsPage = lazy(() => import("@/pages/app/management-daily-reports"));
const ManagementReportsZReportPage = lazy(() => import("@/pages/app/management-reports-z-report"));
const ManagementReportsStaffLeaderboardPage = lazy(() => import("@/pages/app/management-reports-staff-leaderboard"));
const ManagementReportsProductPerformancePage = lazy(() => import("@/pages/app/management-reports-product-performance"));
const ManagementCustomersHeardFromPage = lazy(() => import("@/pages/app/management-customers-heard-from"));
const ManagementCustomersPortalPage = lazy(() => import("@/pages/app/management-customers-portal"));
const SettingsPricingRulesPage = lazy(() => import("@/pages/app/settings-pricing-rules"));
const SettingsModifierGroupsPage = lazy(() => import("@/pages/app/settings-modifier-groups"));
const SettingsTyroEftposPage = lazy(() => import("@/pages/app/settings-tyro-eftpos"));


import { ManagementErrorBoundary } from "@/components/layout/management-error-boundary";
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

const PUBLIC_PATHS = ["/", "/pricing", "/login", "/register", "/forgot-password", "/reset-password", "/staff-reset-password", "/terms", "/privacy"];

setOnUnauthorized(() => {
  queryClient.clear();
  const path = window.location.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith("/b/") || path.startsWith("/c/") || path.startsWith("/book/"));
  if (!isPublic) {
    window.location.replace("/login");
  }
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
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

  if (!["owner", "manager"].includes(user.staffRole ?? "")) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <ManagementErrorBoundary key={path}>
      <Component />
    </ManagementErrorBoundary>
  );
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const [path] = useLocation();
  return (
    <ManagementErrorBoundary key={path}>
      <Component />
    </ManagementErrorBoundary>
  );
}

function Router() {
  // Drive route matching off a *deferred* location so that, while the next
  // route's lazy chunk loads, React keeps the current page mounted instead of
  // swapping to the white Suspense fallback. The fallback then only appears on
  // the very first load (when there is no previous page to keep on screen).
  const [location] = useLocation();
  const deferredLocation = useDeferredValue(location);
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner /></div>}>
    <Switch location={deferredLocation}>
      <Route path="/">
        <PublicRoute component={LandingPage} />
      </Route>
      <Route path="/pricing">
        <PublicRoute component={PricingPage} />
      </Route>
      <Route path="/login">
        <PublicRoute component={LoginPage} />
      </Route>
      <Route path="/register">
        <PublicRoute component={RegisterPage} />
      </Route>
      <Route path="/forgot-password">
        <PublicRoute component={ForgotPasswordPage} />
      </Route>
      <Route path="/reset-password">
        <PublicRoute component={ResetPasswordPage} />
      </Route>
      <Route path="/staff-reset-password">
        <PublicRoute component={StaffResetPasswordPage} />
      </Route>
      <Route path="/terms">
        <TermsPage />
      </Route>
      <Route path="/privacy">
        <PrivacyPage />
      </Route>
      <Route path="/customer-display">
        <PublicRoute component={CustomerDisplayPage} />
      </Route>
      <Route path="/b/:businessUsername/c/:token">
        <PublicRoute component={PortalPage} />
      </Route>
      <Route path="/b/:businessUsername/t/techapp">
        <PublicRoute component={TechAppPage} />
      </Route>
      <Route path="/b/:businessUsername/t/webapp">
        <PublicRoute component={TechAppPage} />
      </Route>
      <Route path="/b/:businessUsername/t/dashboard">
        <PublicRoute component={DashboardAppPage} />
      </Route>
      <Route path="/b/:businessUsername/t/posapp">
        <PublicRoute component={MobilePosAppPage} />
      </Route>
      <Route path="/c/:token">
        <PublicRoute component={PortalPage} />
      </Route>
      <Route path="/book/:username">
        <PublicRoute component={BookingPage} />
      </Route>

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
      <Route path="/pos/quotes">
        <ProtectedRoute component={POSQuotesPage} />
      </Route>
      <Route path="/pos/laybys">
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
      <Route path="/pos/sell">
        <ProtectedRoute component={POSPage} />
      </Route>

      {/* Products section */}
      <Route path="/inventory/overview">
        <ProtectedRoute component={ProductsOverviewPage} />
      </Route>
      <Route path="/inventory/bundles">
        <ProtectedRoute component={ProductsBundlesPage} />
      </Route>
      <Route path="/inventory/stocktake">
        <ProtectedRoute component={ProductsStocktakePage} />
      </Route>
      <Route path="/inventory/purchase-orders">
        <ProtectedRoute component={ProductsPurchaseOrdersPage} />
      </Route>
      <Route path="/inventory/pre-orders">
        <ProtectedRoute component={ProductsPreOrdersPage} />
      </Route>
      <Route path="/inventory/return-auth">
        <ProtectedRoute component={ProductsReturnAuthPage} />
      </Route>
      <Route path="/inventory/suppliers">
        <ProtectedRoute component={ProductsSuppliersPage} />
      </Route>
      <Route path="/inventory/brands">
        <ProtectedRoute component={ProductsBrandsPage} />
      </Route>
      <Route path="/inventory/categories">
        <ProtectedRoute component={ProductsCategoriesPage} />
      </Route>
      <Route path="/inventory/tags">
        <ProtectedRoute component={ProductsTagsPage} />
      </Route>
      <Route path="/inventory/recalls">
        <ProtectedRoute component={ProductsRecallsPage} />
      </Route>
      <Route path="/inventory/warranty">
        <ProtectedRoute component={ProductsWarrantyPage} />
      </Route>
      <Route path="/inventory/products">
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
      <Route path="/services/new-job">
        <ProtectedRoute component={ServiceJobNewPage} />
      </Route>
      <Route path="/services/:id">
        <ProtectedRoute component={ServiceJobsPage} />
      </Route>
      <Route path="/services">
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
      <Route path="/staff/leave">
        <ProtectedRoute component={StaffLeaveRequestsPage} />
      </Route>
      <Route path="/staff/payroll/runs">
        <ProtectedRoute component={StaffPayrollRunsPage} />
      </Route>
      <Route path="/staff/payroll/payslips">
        <ProtectedRoute component={StaffPayrollPayslipsPage} />
      </Route>
      <Route path="/staff/payroll/leave">
        <ProtectedRoute component={StaffPayrollLeavePage} />
      </Route>
      <Route path="/staff/payroll">
        <ProtectedRoute component={StaffPayrollPage} />
      </Route>
      <Route path="/staff/costs">
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
      <Route path="/staff/employees">
        <ProtectedRoute component={StaffPage} />
      </Route>

      {/* Management — overview */}
      <Route path="/management/overview">
        <ManagementProtectedRoute component={ManagementOverviewPage} />
      </Route>

      {/* Hub entry redirects (old hub URLs → default leaf) */}
      <Route path="/management/customers-hub">   <Redirect to="/management/customers/settings" />   </Route>
      <Route path="/management/products-hub">    <Redirect to="/management/products-inventory/inventory" />   </Route>
      <Route path="/management/operations-hub">  <Redirect to="/management/staff-operations/employees" />        </Route>
      <Route path="/management/marketing-hub">   <Redirect to="/management/marketing-reports/sales-overview" /></Route>
      <Route path="/management/settings-hub">    <Redirect to="/management/settings-integrations/account" />      </Route>

      {/* Customers */}
      <Route path="/management/customers/heard-from">
        <ManagementProtectedRoute component={ManagementCustomersHeardFromPage} />
      </Route>
      <Route path="/management/customers/portal">
        <ManagementProtectedRoute component={ManagementCustomersPortalPage} />
      </Route>
      <Route path="/management/customers/settings">
        <ManagementProtectedRoute component={SettingsCustomersPage} />
      </Route>
      <Route path="/management/customers/loyalty/leaderboard">
        <ManagementProtectedRoute component={ManagementLoyaltyLeaderboardPage} />
      </Route>
      <Route path="/management/customers/loyalty">
        <ManagementProtectedRoute component={ManagementLoyaltyPage} />
      </Route>
      <Route path="/management/invoices-services/service-options">
        <ManagementProtectedRoute component={ManagementServiceOptionsPage} />
      </Route>
      <Route path="/management/customers/gift-cards">
        <ManagementProtectedRoute component={ManagementGiftCardsPage} />
      </Route>
      <Route path="/management/customers/discounts-pricing">
        <ManagementProtectedRoute component={ManagementDiscountsPage} />
      </Route>
      <Route path="/management/customers/discounts-pricing/pricing-rules">
        <ManagementProtectedRoute component={SettingsPricingRulesPage} />
      </Route>
      <Route path="/management/customers/discounts-pricing/layby">
        <ManagementProtectedRoute component={ManagementLaybyPage} />
      </Route>
      <Route path="/management/settings-integrations/feedback">
        <ManagementProtectedRoute component={ManagementFeedbackPage} />
      </Route>

      {/* Products & Inventory */}
      <Route path="/management/products-inventory/inventory">
        <ManagementProtectedRoute component={ManagementInventoryPage} />
      </Route>
      <Route path="/management/products-inventory/product-types">
        <ManagementProtectedRoute component={SettingsProductTypesPage} />
      </Route>
      <Route path="/management/products-inventory/modifier-groups">
        <ManagementProtectedRoute component={SettingsModifierGroupsPage} />
      </Route>
      <Route path="/management/products-inventory/sales">
        <ManagementProtectedRoute component={ManagementTemplatesPage} />
      </Route>
      <Route path="/management/products-inventory/loaners">
        <ManagementProtectedRoute component={ManagementLoanersPage} />
      </Route>
      <Route path="/management/products-inventory/parts-compatibility">
        <ManagementProtectedRoute component={ManagementPartsCompatibilityPage} />
      </Route>
      <Route path="/management/products-inventory/trade-ins">
        <ManagementProtectedRoute component={ManagementTradeInsPage} />
      </Route>
      <Route path="/management/customers/service-plans">
        <ManagementProtectedRoute component={ManagementServicePlansPage} />
      </Route>
      <Route path="/management/settings-integrations/locations">
        <ManagementProtectedRoute component={ManagementLocationsPage} />
      </Route>
      <Route path="/management/templates/misc">
        <ManagementProtectedRoute component={ManagementMiscTemplatesPage} />
      </Route>
      <Route path="/management/products-inventory/stickers">
        <ManagementProtectedRoute component={ManagementStickersPage} />
      </Route>
      {/* Sticker Templates merged into the unified Labels page */}
      <Route path="/management/sticker-templates"><Redirect to="/management/products-inventory/stickers" /></Route>
      <Route path="/management/calculators">
        <Redirect to="/management/products-inventory/3d-prints" />
      </Route>
      <Route path="/management/products-inventory/3d-prints">
        <ManagementProtectedRoute component={ManagementCalculators3DPage} />
      </Route>
      <Route path="/management/products-inventory/pc-builder">
        <ManagementProtectedRoute component={ManagementCalculatorsPCBuilderPage} />
      </Route>

      {/* Staff & Operations */}
      <Route path="/management/staff-operations/timesheets">
        <ManagementProtectedRoute component={StaffTimesheetPage} />
      </Route>
      <Route path="/management/staff-operations/cost-summary">
        <ManagementProtectedRoute component={StaffCostSummaryPage} />
      </Route>
      <Route path="/management/staff-operations/employees">
        <ManagementProtectedRoute component={StaffPage} />
      </Route>
      <Route path="/management/staff-operations/pos-registers">
        <ManagementProtectedRoute component={ManagementRegistersPage} />
      </Route>
      <Route path="/management/sales-settings">
        <ManagementProtectedRoute component={SalesSettingsPage} />
      </Route>
      <Route path="/management/staff-operations/floor-plan">
        <ManagementProtectedRoute component={ManagementFloorPlanPage} />
      </Route>
      <Route path="/management/staff-operations/cameras">
        <ManagementProtectedRoute component={ManagementCamerasPage} />
      </Route>
      <Route path="/management/staff-operations/tech-app">
        <ManagementProtectedRoute component={ManagementTechAppPage} />
      </Route>
      <Route path="/management/staff-operations/mobile-pos">
        <ManagementProtectedRoute component={ManagementMobilePosPage} />
      </Route>
      <Route path="/management/staff-operations/dashboard">
        <ManagementProtectedRoute component={ManagementDashboardAppPage} />
      </Route>
      <Route path="/management/staff-operations/legal">
        <ManagementProtectedRoute component={ManagementLegalPage} />
      </Route>

      {/* Marketing & Reports */}
      <Route path="/management/marketing-reports/sales-overview">
        <ManagementProtectedRoute component={ManagementSalesPage} />
      </Route>
      <Route path="/management/marketing-reports/analytics">
        <ManagementProtectedRoute component={ManagementMarketingAnalyticsPage} />
      </Route>
      <Route path="/management/reports">
        <Redirect to="/management/marketing-reports/reports" />
      </Route>
      <Route path="/management/marketing-reports/reports">
        <ManagementProtectedRoute component={ManagementReportsBasPage} />
      </Route>
      <Route path="/management/marketing-reports/reports/void-audit">
        <ManagementProtectedRoute component={ManagementReportsVoidAuditPage} />
      </Route>
      <Route path="/management/marketing-reports/reports/margin">
        <ManagementProtectedRoute component={ManagementReportsMarginPage} />
      </Route>
      <Route path="/management/marketing-reports/reports/z-report">
        <ManagementProtectedRoute component={ManagementReportsZReportPage} />
      </Route>
      <Route path="/management/marketing-reports/reports/staff-leaderboard">
        <ManagementProtectedRoute component={ManagementReportsStaffLeaderboardPage} />
      </Route>
      <Route path="/management/marketing-reports/reports/product-performance">
        <ManagementProtectedRoute component={ManagementReportsProductPerformancePage} />
      </Route>
      <Route path="/management/marketing-reports/reports/daily">
        <ManagementProtectedRoute component={ManagementDailyReportsPage} />
      </Route>
      <Route path="/management/marketing-reports/kpis-targets">
        <ManagementProtectedRoute component={ManagementKpisPage} />
      </Route>
      <Route path="/management/marketing-reports/referrals">
        <ManagementProtectedRoute component={ManagementMarketingReferralsPage} />
      </Route>
      <Route path="/management/marketing-reports/social-feed">
        <ManagementProtectedRoute component={ManagementMarketingSocialFeedPage} />
      </Route>
      <Route path="/management/marketing-reports/online-store">
        <ManagementProtectedRoute component={ManagementOnlineStorePage} />
      </Route>
      <Route path="/management/marketing-reports/email">
        <ManagementProtectedRoute component={SettingsEmailPage} />
      </Route>
      <Route path="/management/settings-integrations/sms">
        <ManagementProtectedRoute component={SettingsSmsPage} />
      </Route>
      <Route path="/management/marketing-reports/forms-files">
        <ManagementProtectedRoute component={ManagementFormsPage} />
      </Route>
      <Route path="/management/marketing-reports/ai-assistant">
        <ManagementProtectedRoute component={ManagementAIPage} />
      </Route>

      {/* Settings & Integrations */}
      <Route path="/management/settings-integrations/account">
        <ManagementProtectedRoute component={SettingsAccountPage} />
      </Route>
      <Route path="/management/settings-integrations/business-details">
        <ManagementProtectedRoute component={SettingsBusinessPage} />
      </Route>
      <Route path="/management/settings-integrations/business-details/regional">
        <ManagementProtectedRoute component={SettingsRegionalPage} />
      </Route>
      <Route path="/management/settings-integrations/tax">
        <ManagementProtectedRoute component={SettingsTaxPage} />
      </Route>
      <Route path="/management/settings-integrations/themes">
        <ManagementProtectedRoute component={SettingsThemesPage} />
      </Route>
      <Route path="/management/settings-integrations/integrations">
        <ManagementProtectedRoute component={ManagementIntegrationsPage} />
      </Route>
      <Route path="/management/settings-integrations/integrations/help">
        <ManagementProtectedRoute component={ManagementIntegrationsHelpPage} />
      </Route>
      <Route path="/management/settings-integrations/integrations/xero">
        <ManagementProtectedRoute component={ManagementXeroPage} />
      </Route>
      <Route path="/management/settings-integrations/integrations/tyro-eftpos">
        <ManagementProtectedRoute component={SettingsTyroEftposPage} />
      </Route>
      <Route path="/management/settings-integrations/import-export">
        <ManagementProtectedRoute component={ManagementImportExportPage} />
      </Route>
      <Route path="/management/settings-integrations/sync">
        <ManagementProtectedRoute component={ManagementSyncPage} />
      </Route>
      {/* Backup now lives inside the consolidated Sync page */}
      <Route path="/management/backup"><Redirect to="/management/settings-integrations/sync" /></Route>
      <Route path="/management/settings-integrations/system">
        <Redirect to="/management/settings-integrations/system/misc" />
      </Route>
      <Route path="/management/settings-integrations/system/misc">
        <ManagementProtectedRoute component={ManagementMiscPage} />
      </Route>

      {/* Redirect legacy settings paths */}
      <Route path="/settings/tax">
        <Redirect to="/management/settings-integrations/tax" />
      </Route>
      <Route path="/settings/email">
        <Redirect to="/management/marketing-reports/email" />
      </Route>
      <Route path="/settings/customers">
        <Redirect to="/management/customers/settings" />
      </Route>

      <Route path="/inventory/wastage">
        <ProtectedRoute component={InventoryWastagePage} />
      </Route>

      <Route path="/management/settings-integrations/account/modules">
        <ProtectedRoute component={ModulesPage} />
      </Route>
      <Route path="/settings/pos">
        <ProtectedRoute component={SettingsPOSPage} />
      </Route>
      <Route path="/settings/payroll">
        <ProtectedRoute component={SettingsPayrollPage} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>

      {/* Public landing pages (no auth required) */}
      <Route path="/b/:businessUsername/a/:customName" component={LandingPagePublicView} />
      <Route path="/p/:slug" component={LandingPagePublicView} />

      {/* Public online store (no auth required) */}
      <Route path="/b/:businessUsername/o/:storeSlug" component={OnlineStorePublicView} />

      {/* Marketing section */}
      <Route path="/marketing/overview">
        <ProtectedRoute component={MarketingPage} />
      </Route>
      <Route path="/marketing/email">
        <Redirect to="/marketing/email/campaigns" />
      </Route>
      <Route path="/marketing/email/campaigns">
        <ProtectedRoute component={MarketingEmailCampaignsPage} />
      </Route>
      <Route path="/marketing/email/templates">
        <ProtectedRoute component={MarketingEmailTemplatesPage} />
      </Route>
      <Route path="/marketing/sms">
        <Redirect to="/marketing/sms/campaigns" />
      </Route>
      <Route path="/marketing/sms/campaigns">
        <ProtectedRoute component={MarketingSmsCampaignsPage} />
      </Route>
      <Route path="/marketing/sms/templates">
        <ProtectedRoute component={MarketingSmsTemplatesPage} />
      </Route>
      <Route path="/marketing/social">
        <ProtectedRoute component={MarketingSocialMediaPage} />
      </Route>
      {/* Moved under Management → Marketing & Reports (owner/manager only) */}
      <Route path="/management/marketing-reports/landing-pages/pages">
        <ManagementProtectedRoute component={MarketingLandingPagesPage} />
      </Route>
      <Route path="/management/marketing-reports/landing-pages/templates">
        <ManagementProtectedRoute component={MarketingLandingPagesPage} />
      </Route>
      <Route path="/management/marketing-reports/generators/qr-codes">
        <ManagementProtectedRoute component={MarketingQRCodesPage} />
      </Route>
      <Route path="/management/marketing-reports/generators/shortlinks">
        <ManagementProtectedRoute component={MarketingShortlinksPage} />
      </Route>
      {/* Legacy redirects from the old /marketing/* locations */}
      <Route path="/marketing/landing-pages">        <Redirect to="/management/marketing-reports/landing-pages/pages" />        </Route>
      <Route path="/marketing/generators/qr-codes">  <Redirect to="/management/marketing-reports/generators/qr-codes" />  </Route>
      <Route path="/marketing/generators/shortlinks"><Redirect to="/management/marketing-reports/generators/shortlinks" /></Route>
      <Route path="/marketing/loyalty/promos">
        <ProtectedRoute component={MarketingLoyaltyPromotionsPage} />
      </Route>
      <Route path="/marketing/loyalty/leaders">
        <ManagementProtectedRoute component={ManagementLoyaltyLeaderboardPage} />
      </Route>
      <Route path="/marketing/referrals">
        <ProtectedRoute component={MarketingReferralsPage} />
      </Route>
      <Route path="/marketing/automation">
        <ManagementProtectedRoute component={ManagementMarketingAutomationPage} />
      </Route>
      <Route path="/cameras">
        <ProtectedRoute component={CamerasPage} />
      </Route>
      <Route path="/online/deliveries">
        <ProtectedRoute component={OnlineDeliveryOrdersPage} />
      </Route>
      <Route path="/online/shipping">
        <ProtectedRoute component={OnlineShippingPage} />
      </Route>
      <Route path="/online/marketplace">
        <ProtectedRoute component={OnlineMarketplacePage} />
      </Route>


      {/* ── Legacy URL redirects (old paths → breadcrumb-aligned paths) ── */}
      <Route path="/pos/laybuys"><Redirect to="/pos/laybys" /></Route>
      <Route path="/pos"><Redirect to="/pos/sell" /></Route>
      <Route path="/products/overview"><Redirect to="/inventory/overview" /></Route>
      <Route path="/products/bundles"><Redirect to="/inventory/bundles" /></Route>
      <Route path="/products/stocktake"><Redirect to="/inventory/stocktake" /></Route>
      <Route path="/products/purchase-orders"><Redirect to="/inventory/purchase-orders" /></Route>
      <Route path="/products/pre-orders"><Redirect to="/inventory/pre-orders" /></Route>
      <Route path="/products/return-auth"><Redirect to="/inventory/return-auth" /></Route>
      <Route path="/products/suppliers"><Redirect to="/inventory/suppliers" /></Route>
      <Route path="/products/brands"><Redirect to="/inventory/brands" /></Route>
      <Route path="/products/categories"><Redirect to="/inventory/categories" /></Route>
      <Route path="/products/tags"><Redirect to="/inventory/tags" /></Route>
      <Route path="/products/recalls"><Redirect to="/inventory/recalls" /></Route>
      <Route path="/products/warranty"><Redirect to="/inventory/warranty" /></Route>
      <Route path="/products"><Redirect to="/inventory/products" /></Route>
      <Route path="/staff/leave-requests"><Redirect to="/staff/leave" /></Route>
      <Route path="/staff/cost-summary"><Redirect to="/staff/costs" /></Route>
      <Route path="/staff"><Redirect to="/staff/employees" /></Route>
      <Route path="/management/customers"><Redirect to="/management/customers/settings" /></Route>
      <Route path="/management/loyalty/leaderboard"><Redirect to="/management/customers/loyalty/leaderboard" /></Route>
      <Route path="/management/loyalty"><Redirect to="/management/customers/loyalty" /></Route>
      <Route path="/management/gift-cards"><Redirect to="/management/customers/gift-cards" /></Route>
      <Route path="/management/discounts"><Redirect to="/management/customers/discounts-pricing" /></Route>
      <Route path="/management/pricing-rules"><Redirect to="/management/customers/discounts-pricing/pricing-rules" /></Route>
      <Route path="/management/layby"><Redirect to="/management/customers/discounts-pricing/layby" /></Route>
      <Route path="/management/feedback"><Redirect to="/management/settings-integrations/feedback" /></Route>
      <Route path="/management/inventory"><Redirect to="/management/products-inventory/inventory" /></Route>
      <Route path="/management/product-types"><Redirect to="/management/products-inventory/product-types" /></Route>
      <Route path="/management/modifier-groups"><Redirect to="/management/products-inventory/modifier-groups" /></Route>
      <Route path="/management/templates"><Redirect to="/management/products-inventory/sales" /></Route>
      <Route path="/management/misc-templates"><Redirect to="/management/templates/misc" /></Route>
      <Route path="/management/stickers"><Redirect to="/management/products-inventory/stickers" /></Route>
      <Route path="/management/calculators/3d-printing"><Redirect to="/management/products-inventory/3d-prints" /></Route>
      <Route path="/management/calculators/pc-builder"><Redirect to="/management/products-inventory/pc-builder" /></Route>
      <Route path="/management/staff/timesheet"><Redirect to="/management/staff-operations/timesheets" /></Route>
      <Route path="/management/staff/cost-summary"><Redirect to="/management/staff-operations/cost-summary" /></Route>
      <Route path="/management/staff"><Redirect to="/management/staff-operations/employees" /></Route>
      <Route path="/management/registers"><Redirect to="/management/staff-operations/pos-registers" /></Route>
      <Route path="/management/floor-plan"><Redirect to="/management/staff-operations/floor-plan" /></Route>
      <Route path="/management/cameras"><Redirect to="/management/staff-operations/cameras" /></Route>
      <Route path="/management/tech-app"><Redirect to="/management/staff-operations/tech-app" /></Route>
      <Route path="/management/dashboard-app"><Redirect to="/management/staff-operations/dashboard" /></Route>
      <Route path="/management/legal"><Redirect to="/management/staff-operations/legal" /></Route>
      <Route path="/management/sales-overview"><Redirect to="/management/marketing-reports/sales-overview" /></Route>
      <Route path="/management/reports/bas"><Redirect to="/management/marketing-reports/reports" /></Route>
      <Route path="/management/reports/void-audit"><Redirect to="/management/marketing-reports/reports/void-audit" /></Route>
      <Route path="/management/reports/margin"><Redirect to="/management/marketing-reports/reports/margin" /></Route>
      <Route path="/management/reports/z-report"><Redirect to="/management/marketing-reports/reports/z-report" /></Route>
      <Route path="/management/reports/staff-leaderboard"><Redirect to="/management/marketing-reports/reports/staff-leaderboard" /></Route>
      <Route path="/management/reports/product-performance"><Redirect to="/management/marketing-reports/reports/product-performance" /></Route>
      <Route path="/management/daily-reports"><Redirect to="/management/marketing-reports/reports/daily" /></Route>
      <Route path="/management/kpis"><Redirect to="/management/marketing-reports/kpis-targets" /></Route>
      <Route path="/management/marketing/referrals"><Redirect to="/management/marketing-reports/referrals" /></Route>
      <Route path="/management/marketing/social-feed"><Redirect to="/management/marketing-reports/social-feed" /></Route>
      <Route path="/management/online-store"><Redirect to="/management/marketing-reports/online-store" /></Route>
      <Route path="/management/email"><Redirect to="/management/marketing-reports/email" /></Route>
      <Route path="/management/sms"><Redirect to="/management/settings-integrations/sms" /></Route>
      <Route path="/management/forms"><Redirect to="/management/marketing-reports/forms-files" /></Route>
      <Route path="/management/ai"><Redirect to="/management/marketing-reports/ai-assistant" /></Route>
      <Route path="/management/account"><Redirect to="/management/settings-integrations/account" /></Route>
      <Route path="/management/business"><Redirect to="/management/settings-integrations/business-details" /></Route>
      <Route path="/management/regional"><Redirect to="/management/settings-integrations/business-details/regional" /></Route>
      <Route path="/management/tax"><Redirect to="/management/settings-integrations/tax" /></Route>
      <Route path="/management/integrations"><Redirect to="/management/settings-integrations/integrations" /></Route>
      <Route path="/management/xero"><Redirect to="/management/settings-integrations/integrations/xero" /></Route>
      <Route path="/management/tyro-eftpos"><Redirect to="/management/settings-integrations/integrations/tyro-eftpos" /></Route>
      <Route path="/management/import-export"><Redirect to="/management/settings-integrations/import-export" /></Route>
      <Route path="/management/sync"><Redirect to="/management/settings-integrations/sync" /></Route>
      <Route path="/management/koapos"><Redirect to="/management/settings-integrations/system/misc" /></Route>
      <Route path="/management/misc"><Redirect to="/management/settings-integrations/system/misc" /></Route>
      <Route path="/modules"><Redirect to="/management/settings-integrations/account/modules" /></Route>
      <Route path="/marketing"><Redirect to="/marketing/overview" /></Route>
      <Route path="/management/marketing/landing-pages"><Redirect to="/management/marketing-reports/landing-pages/pages" /></Route>
      <Route path="/management/marketing/landing-page-templates"><Redirect to="/management/marketing-reports/landing-pages/templates" /></Route>
      <Route path="/management/marketing/generators/qr-codes"><Redirect to="/management/marketing-reports/generators/qr-codes" /></Route>
      <Route path="/management/marketing/generators/shortlinks"><Redirect to="/management/marketing-reports/generators/shortlinks" /></Route>
      <Route path="/marketing/loyalty/promotions"><Redirect to="/marketing/loyalty/promos" /></Route>
      <Route path="/marketing/loyalty/leaderboard"><Redirect to="/marketing/loyalty/leaders" /></Route>
      <Route path="/online/delivery-orders"><Redirect to="/online/deliveries" /></Route>
      <Route path="/service-jobs/new"><Redirect to="/services/new-job" /></Route>
      <Route path="/service-jobs/:id">{(p) => <Redirect to={`/services/${p.id}`} />}</Route>
      <Route path="/service-jobs"><Redirect to="/services" /></Route>

      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

/**
 * Once a user is signed in, warm every lazily-loaded route chunk in the
 * background during idle time. This keeps the initial bundle small (fast first
 * paint, fixes the mobile blank-screen) while making in-app navigation instant
 * instead of flashing the Suspense fallback on each first visit to a page.
 *
 * Gated on `user` so public/landing visitors never download the whole app.
 */
function RoutePrefetcher() {
  const { user } = useAuth();
  const started = useRef(false);
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    const modules = import.meta.glob("./pages/**/*.tsx");
    const thunks = Object.values(modules);
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const schedule = (cb: () => void) => (ric ? ric(cb, { timeout: 2000 }) : window.setTimeout(cb, 300));
    let i = 0;
    const pump = () => {
      if (i >= thunks.length) return;
      const load = thunks[i++];
      load().catch(() => {}).finally(() => schedule(pump));
    };
    schedule(pump);
  }, [user]);
  return null;
}

function App() {
  return (
    <ThemeProvider>
      <AccessibilityProvider>
        <NavLayoutProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AuthProvider>
                <StaffSessionProvider>
                  <ButtonStyleProvider>
                    <BrandColorProvider>
                      <AppThemeProvider>
                        <AIProvider>
                          <a href="#main-content" className="skip-link">Skip to main content</a>
                          <RoutePrefetcher />
                          <Router />
                          <Toaster />
                        </AIProvider>
                      </AppThemeProvider>
                    </BrandColorProvider>
                  </ButtonStyleProvider>
                </StaffSessionProvider>
              </AuthProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </NavLayoutProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}

export default App;
