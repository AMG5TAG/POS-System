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

import CustomerDisplayPage from "@/pages/app/customer-display";
import PortalPage from "@/pages/portal";
import TechAppPage from "@/pages/tech";
import LandingPage from "@/pages/marketing/landing";
import LoginPage from "@/pages/marketing/login";
import RegisterPage from "@/pages/marketing/register";
import PricingPage from "@/pages/marketing/pricing";
import ForgotPasswordPage from "@/pages/marketing/forgot-password";
import ResetPasswordPage from "@/pages/marketing/reset-password";
import TermsPage from "@/pages/marketing/terms";
import PrivacyPage from "@/pages/marketing/privacy";

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
/** Misc templates = the same editor scoped to the "misc" section (Customer PDF, …). */
const ManagementMiscTemplatesPage = () => <ManagementTemplatesPage section="misc" />;
import ManagementFormsPage from "@/pages/app/management-forms";
import ManagementStickersPage from "@/pages/app/management-stickers";
import InventoryWastagePage from "@/pages/app/inventory-wastage";
import SettingsTaxPage from "@/pages/app/settings-tax";
import SettingsEmailPage from "@/pages/app/settings-email";
import SettingsSmsPage from "@/pages/app/settings-sms";
import SettingsProductTypesPage from "@/pages/app/settings-product-types";
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
import MarketingSmsCampaignsPage from "@/pages/app/marketing-sms-campaigns";
import MarketingSmsTemplatesPage from "@/pages/app/marketing-sms-templates";
import MarketingLoyaltyPromotionsPage from "@/pages/app/marketing-loyalty-promotions";
import ManagementMarketingReferralsPage from "@/pages/app/management-marketing-referrals";
import ManagementMarketingAutomationPage from "@/pages/app/management-marketing-automation";
import ManagementOnlineStorePage from "@/pages/app/management-online-store";
import OnlineDeliveryOrdersPage from "@/pages/app/online-delivery-orders";
import OnlineShippingPage from "@/pages/app/online-shipping";
import OnlineMarketplacePage from "@/pages/app/online-marketplace";
import ManagementKoaPOSPage from "@/pages/app/management-koapos";
import ManagementMiscPage from "@/pages/app/management-misc";
import ManagementBackupPage from "@/pages/app/management-backup";
import ManagementFeedbackPage from "@/pages/app/management-feedback";
import CamerasPage from "@/pages/app/cameras";
import ManagementCamerasPage from "@/pages/app/management-cameras";
import ManagementTechAppPage from "@/pages/app/management-tech-app";
import ManagementLegalPage from "@/pages/app/management-legal";
import ManagementGiftCardsPage from "@/pages/app/management-gift-cards";
import MarketingReferralsPage from "@/pages/app/marketing-referrals";
import LandingPagePublicView from "@/pages/marketing/landing-page-public";
import PosEodPage from "@/pages/app/pos-eod";
import ManagementReportsBasPage from "@/pages/app/management-reports-bas";
import ManagementReportsVoidAuditPage from "@/pages/app/management-reports-void-audit";
import ManagementReportsMarginPage from "@/pages/app/management-reports-margin";
import ManagementDailyReportsPage from "@/pages/app/management-daily-reports";
import ManagementReportsZReportPage from "@/pages/app/management-reports-z-report";
import ManagementReportsStaffLeaderboardPage from "@/pages/app/management-reports-staff-leaderboard";
import ManagementReportsProductPerformancePage from "@/pages/app/management-reports-product-performance";
import ManagementCustomersHeardFromPage from "@/pages/app/management-customers-heard-from";
import ManagementCustomersPortalPage from "@/pages/app/management-customers-portal";
import SettingsPricingRulesPage from "@/pages/app/settings-pricing-rules";
import SettingsModifierGroupsPage from "@/pages/app/settings-modifier-groups";
import SettingsTyroEftposPage from "@/pages/app/settings-tyro-eftpos";


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
  return (
    <Switch>
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
      <Route path="/management/floor-plan">
        <ManagementProtectedRoute component={ManagementFloorPlanPage} />
      </Route>
      <Route path="/management/cameras">
        <ManagementProtectedRoute component={ManagementCamerasPage} />
      </Route>
      <Route path="/management/tech-app">
        <ManagementProtectedRoute component={ManagementTechAppPage} />
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
      <Route path="/management/backup">
        <ManagementProtectedRoute component={ManagementBackupPage} />
      </Route>
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
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>

      {/* Public landing pages (no auth required) */}
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
                <StaffSessionProvider>
                  <ButtonStyleProvider>
                    <BrandColorProvider>
                      <AIProvider>
                        <a href="#main-content" className="skip-link">Skip to main content</a>
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
