import { lazy, Suspense, useEffect, useRef, useDeferredValue } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { AuthProvider } from "@/lib/auth";
import { AIProvider } from "@/lib/ai-context";
import { useAuth } from "@/lib/use-auth";
import { ThemeProvider } from "@/lib/theme";
import { BrandColorProvider } from "@/lib/brand-color-context";
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
const TechAppPage = lazy(() => import("@/pages/tech"));
const DashboardAppPage = lazy(() => import("@/pages/dashboard-app"));
const LandingPage = lazy(() => import("@/pages/marketing/landing"));
const LoginPage = lazy(() => import("@/pages/marketing/login"));
const RegisterPage = lazy(() => import("@/pages/marketing/register"));
const PricingPage = lazy(() => import("@/pages/marketing/pricing"));
const ForgotPasswordPage = lazy(() => import("@/pages/marketing/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/marketing/reset-password"));
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
const SettingsCustomersPage = lazy(() => import("@/pages/app/settings-customers"));
const SettingsPOSPage = lazy(() => import("@/pages/app/settings-pos"));
const AppointmentsPage = lazy(() => import("@/pages/app/appointments"));
const ServiceJobsPage = lazy(() => import("@/pages/app/service-jobs"));
const ServiceJobNewPage = lazy(() => import("@/pages/app/service-jobs-new"));
const ManagementOverviewPage = lazy(() => import("@/pages/app/management-overview"));
const ManagementSalesPage = lazy(() => import("@/pages/app/management-sales"));
const ManagementRegistersPage = lazy(() => import("@/pages/app/management-registers"));
const ManagementIntegrationsPage = lazy(() => import("@/pages/app/management-integrations"));
const ManagementXeroPage = lazy(() => import("@/pages/app/management-xero"));
const ManagementImportExportPage = lazy(() => import("@/pages/app/management-import-export"));
const ManagementLoyaltyPage = lazy(() => import("@/pages/app/management-loyalty"));
const ManagementLoyaltyLeaderboardPage = lazy(() => import("@/pages/app/management-loyalty-leaderboard"));
const ManagementLaybyPage = lazy(() => import("@/pages/app/management-layby"));
const ManagementInventoryPage = lazy(() => import("@/pages/app/management-inventory"));
const ManagementDiscountsPage = lazy(() => import("@/pages/app/management-discounts"));
const ManagementTemplatesPage = lazy(() => import("@/pages/app/management-templates"));
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
const MarketingLoyaltyPromotionsPage = lazy(() => import("@/pages/app/marketing-loyalty-promotions"));
const ManagementMarketingReferralsPage = lazy(() => import("@/pages/app/management-marketing-referrals"));
const ManagementMarketingAutomationPage = lazy(() => import("@/pages/app/management-marketing-automation"));
const ManagementOnlineStorePage = lazy(() => import("@/pages/app/management-online-store"));
const OnlineDeliveryOrdersPage = lazy(() => import("@/pages/app/online-delivery-orders"));
const OnlineShippingPage = lazy(() => import("@/pages/app/online-shipping"));
const OnlineMarketplacePage = lazy(() => import("@/pages/app/online-marketplace"));
const ManagementKoaPOSPage = lazy(() => import("@/pages/app/management-koapos"));
const ManagementMiscPage = lazy(() => import("@/pages/app/management-misc"));
const ManagementSyncPage = lazy(() => import("@/pages/app/management-sync"));
const ManagementFeedbackPage = lazy(() => import("@/pages/app/management-feedback"));
const CamerasPage = lazy(() => import("@/pages/app/cameras"));
const ManagementCamerasPage = lazy(() => import("@/pages/app/management-cameras"));
const ManagementTechAppPage = lazy(() => import("@/pages/app/management-tech-app"));
const ManagementDashboardAppPage = lazy(() => import("@/pages/app/management-dashboard-app"));
const ManagementLegalPage = lazy(() => import("@/pages/app/management-legal"));
const ManagementGiftCardsPage = lazy(() => import("@/pages/app/management-gift-cards"));
const MarketingReferralsPage = lazy(() => import("@/pages/app/marketing-referrals"));
const LandingPagePublicView = lazy(() => import("@/pages/marketing/landing-page-public"));
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

const PUBLIC_PATHS = ["/", "/pricing", "/login", "/register", "/forgot-password", "/reset-password", "/terms", "/privacy"];

setOnUnauthorized(() => {
  queryClient.clear();
  const path = window.location.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith("/b/") || path.startsWith("/c/"));
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
      <Route path="/b/:businessUsername/t/webapp">
        <PublicRoute component={TechAppPage} />
      </Route>
      <Route path="/b/:businessUsername/t/dashboard">
        <PublicRoute component={DashboardAppPage} />
      </Route>
      <Route path="/c/:token">
        <PublicRoute component={PortalPage} />
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
      <Route path="/products/warranty">
        <ProtectedRoute component={ProductsWarrantyPage} />
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
      <Route path="/service-jobs/:id">
        <ProtectedRoute component={ServiceJobsPage} />
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

      {/* Management — overview */}
      <Route path="/management/overview">
        <ManagementProtectedRoute component={ManagementOverviewPage} />
      </Route>

      {/* Hub entry redirects (old hub URLs → default leaf) */}
      <Route path="/management/customers-hub">   <Redirect to="/management/customers" />   </Route>
      <Route path="/management/products-hub">    <Redirect to="/management/inventory" />   </Route>
      <Route path="/management/operations-hub">  <Redirect to="/management/staff" />        </Route>
      <Route path="/management/marketing-hub">   <Redirect to="/management/sales-overview" /></Route>
      <Route path="/management/settings-hub">    <Redirect to="/management/account" />      </Route>

      {/* Customers */}
      <Route path="/management/customers/heard-from">
        <ManagementProtectedRoute component={ManagementCustomersHeardFromPage} />
      </Route>
      <Route path="/management/customers/portal">
        <ManagementProtectedRoute component={ManagementCustomersPortalPage} />
      </Route>
      <Route path="/management/customers">
        <ManagementProtectedRoute component={SettingsCustomersPage} />
      </Route>
      <Route path="/management/loyalty/leaderboard">
        <ManagementProtectedRoute component={ManagementLoyaltyLeaderboardPage} />
      </Route>
      <Route path="/management/loyalty">
        <ManagementProtectedRoute component={ManagementLoyaltyPage} />
      </Route>
      <Route path="/management/gift-cards">
        <ManagementProtectedRoute component={ManagementGiftCardsPage} />
      </Route>
      <Route path="/management/discounts">
        <ManagementProtectedRoute component={ManagementDiscountsPage} />
      </Route>
      <Route path="/management/pricing-rules">
        <ManagementProtectedRoute component={SettingsPricingRulesPage} />
      </Route>
      <Route path="/management/layby">
        <ManagementProtectedRoute component={ManagementLaybyPage} />
      </Route>
      <Route path="/management/feedback">
        <ManagementProtectedRoute component={ManagementFeedbackPage} />
      </Route>

      {/* Products & Inventory */}
      <Route path="/management/inventory">
        <ManagementProtectedRoute component={ManagementInventoryPage} />
      </Route>
      <Route path="/management/product-types">
        <ManagementProtectedRoute component={SettingsProductTypesPage} />
      </Route>
      <Route path="/management/modifier-groups">
        <ManagementProtectedRoute component={SettingsModifierGroupsPage} />
      </Route>
      <Route path="/management/templates">
        <ManagementProtectedRoute component={ManagementTemplatesPage} />
      </Route>
      <Route path="/management/misc-templates">
        <ManagementProtectedRoute component={ManagementMiscTemplatesPage} />
      </Route>
      <Route path="/management/stickers">
        <ManagementProtectedRoute component={ManagementStickersPage} />
      </Route>
      {/* Sticker Templates merged into the unified Labels page */}
      <Route path="/management/sticker-templates"><Redirect to="/management/stickers" /></Route>
      <Route path="/management/calculators">
        <Redirect to="/management/calculators/3d-printing" />
      </Route>
      <Route path="/management/calculators/3d-printing">
        <ManagementProtectedRoute component={ManagementCalculators3DPage} />
      </Route>
      <Route path="/management/calculators/pc-builder">
        <ManagementProtectedRoute component={ManagementCalculatorsPCBuilderPage} />
      </Route>

      {/* Staff & Operations */}
      <Route path="/management/staff/timesheet">
        <ManagementProtectedRoute component={StaffTimesheetPage} />
      </Route>
      <Route path="/management/staff/cost-summary">
        <ManagementProtectedRoute component={StaffCostSummaryPage} />
      </Route>
      <Route path="/management/staff">
        <ManagementProtectedRoute component={StaffPage} />
      </Route>
      <Route path="/management/registers">
        <ManagementProtectedRoute component={ManagementRegistersPage} />
      </Route>
      <Route path="/management/sales-settings">
        <ManagementProtectedRoute component={SalesSettingsPage} />
      </Route>
      <Route path="/management/floor-plan">
        <ManagementProtectedRoute component={ManagementFloorPlanPage} />
      </Route>
      <Route path="/management/cameras">
        <ManagementProtectedRoute component={ManagementCamerasPage} />
      </Route>
      <Route path="/management/tech-app">
        <ManagementProtectedRoute component={ManagementTechAppPage} />
      </Route>
      <Route path="/management/dashboard-app">
        <ManagementProtectedRoute component={ManagementDashboardAppPage} />
      </Route>
      <Route path="/management/legal">
        <ManagementProtectedRoute component={ManagementLegalPage} />
      </Route>

      {/* Marketing & Reports */}
      <Route path="/management/sales-overview">
        <ManagementProtectedRoute component={ManagementSalesPage} />
      </Route>
      <Route path="/management/reports">
        <Redirect to="/management/reports/bas" />
      </Route>
      <Route path="/management/reports/bas">
        <ManagementProtectedRoute component={ManagementReportsBasPage} />
      </Route>
      <Route path="/management/reports/void-audit">
        <ManagementProtectedRoute component={ManagementReportsVoidAuditPage} />
      </Route>
      <Route path="/management/reports/margin">
        <ManagementProtectedRoute component={ManagementReportsMarginPage} />
      </Route>
      <Route path="/management/reports/z-report">
        <ManagementProtectedRoute component={ManagementReportsZReportPage} />
      </Route>
      <Route path="/management/reports/staff-leaderboard">
        <ManagementProtectedRoute component={ManagementReportsStaffLeaderboardPage} />
      </Route>
      <Route path="/management/reports/product-performance">
        <ManagementProtectedRoute component={ManagementReportsProductPerformancePage} />
      </Route>
      <Route path="/management/daily-reports">
        <ManagementProtectedRoute component={ManagementDailyReportsPage} />
      </Route>
      <Route path="/management/kpis">
        <ManagementProtectedRoute component={ManagementKpisPage} />
      </Route>
      <Route path="/management/marketing/referrals">
        <ManagementProtectedRoute component={ManagementMarketingReferralsPage} />
      </Route>
      <Route path="/management/marketing/social-feed">
        <ManagementProtectedRoute component={ManagementMarketingSocialFeedPage} />
      </Route>
      <Route path="/management/online-store">
        <ManagementProtectedRoute component={ManagementOnlineStorePage} />
      </Route>
      <Route path="/management/email">
        <ManagementProtectedRoute component={SettingsEmailPage} />
      </Route>
      <Route path="/management/sms">
        <ManagementProtectedRoute component={SettingsSmsPage} />
      </Route>
      <Route path="/management/forms">
        <ManagementProtectedRoute component={ManagementFormsPage} />
      </Route>
      <Route path="/management/ai">
        <ManagementProtectedRoute component={ManagementAIPage} />
      </Route>

      {/* Settings & Integrations */}
      <Route path="/management/account">
        <ManagementProtectedRoute component={SettingsAccountPage} />
      </Route>
      <Route path="/management/business">
        <ManagementProtectedRoute component={SettingsBusinessPage} />
      </Route>
      <Route path="/management/regional">
        <ManagementProtectedRoute component={SettingsRegionalPage} />
      </Route>
      <Route path="/management/tax">
        <ManagementProtectedRoute component={SettingsTaxPage} />
      </Route>
      <Route path="/management/integrations">
        <ManagementProtectedRoute component={ManagementIntegrationsPage} />
      </Route>
      <Route path="/management/xero">
        <ManagementProtectedRoute component={ManagementXeroPage} />
      </Route>
      <Route path="/management/tyro-eftpos">
        <ManagementProtectedRoute component={SettingsTyroEftposPage} />
      </Route>
      <Route path="/management/import-export">
        <ManagementProtectedRoute component={ManagementImportExportPage} />
      </Route>
      <Route path="/management/sync">
        <ManagementProtectedRoute component={ManagementSyncPage} />
      </Route>
      {/* Backup now lives inside the consolidated Sync page */}
      <Route path="/management/backup"><Redirect to="/management/sync" /></Route>
      <Route path="/management/koapos">
        <ManagementProtectedRoute component={ManagementKoaPOSPage} />
      </Route>
      <Route path="/management/misc">
        <ManagementProtectedRoute component={ManagementMiscPage} />
      </Route>

      {/* Redirect legacy settings paths */}
      <Route path="/settings/tax">
        <Redirect to="/management/tax" />
      </Route>
      <Route path="/settings/email">
        <Redirect to="/management/email" />
      </Route>
      <Route path="/settings/customers">
        <Redirect to="/management/customers" />
      </Route>

      <Route path="/inventory/wastage">
        <ProtectedRoute component={InventoryWastagePage} />
      </Route>

      <Route path="/modules">
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

      {/* Marketing section */}
      <Route path="/marketing">
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
      {/* Moved under Management → Marketing & Reports (owner/manager only) */}
      <Route path="/management/marketing/landing-pages">
        <ManagementProtectedRoute component={MarketingLandingPagesPage} />
      </Route>
      <Route path="/management/marketing/landing-page-templates">
        <ManagementProtectedRoute component={MarketingLandingPagesPage} />
      </Route>
      <Route path="/management/marketing/generators/qr-codes">
        <ManagementProtectedRoute component={MarketingQRCodesPage} />
      </Route>
      <Route path="/management/marketing/generators/shortlinks">
        <ManagementProtectedRoute component={MarketingShortlinksPage} />
      </Route>
      {/* Legacy redirects from the old /marketing/* locations */}
      <Route path="/marketing/landing-pages">        <Redirect to="/management/marketing/landing-pages" />        </Route>
      <Route path="/marketing/generators/qr-codes">  <Redirect to="/management/marketing/generators/qr-codes" />  </Route>
      <Route path="/marketing/generators/shortlinks"><Redirect to="/management/marketing/generators/shortlinks" /></Route>
      <Route path="/marketing/loyalty/promotions">
        <ProtectedRoute component={MarketingLoyaltyPromotionsPage} />
      </Route>
      <Route path="/marketing/loyalty/leaderboard">
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
                      <AIProvider>
                        <a href="#main-content" className="skip-link">Skip to main content</a>
                        <RoutePrefetcher />
                        <Router />
                        <Toaster />
                      </AIProvider>
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
