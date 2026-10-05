import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { retiredSuburbTarget } from "@/data/suburbs";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/HomePage";
import SuburbPage from "@/pages/SuburbPage";
import RegionPage from "@/pages/RegionPage";
import VirusRemovalPage from "@/pages/VirusRemovalPage";
import OnSiteServicesPage from "@/pages/OnSiteServicesPage";
import CustomBuiltComputersPage from "@/pages/CustomBuiltComputersPage";
import LaptopScreenRepairPage from "@/pages/LaptopScreenRepairPage";
import RefurbishedComputersPage from "@/pages/RefurbishedComputersPage";
import VhsToDigitalPage from "@/pages/VhsToDigitalPage";
import DigitalConversionsPage from "@/pages/DigitalConversionsPage";
import FuneralSlideshowsPage from "@/pages/FuneralSlideshowsPage";
import AllComputerServicesPage from "@/pages/AllComputerServicesPage";
import ComputerRepairsPage from "@/pages/ComputerRepairsPage";
import MacBookRepairPage from "@/pages/MacBookRepairPage";
import DataRecoveryPage from "@/pages/DataRecoveryPage";
import NbnWifiPage from "@/pages/NbnWifiPage";
import PhotoRestorationPage from "@/pages/PhotoRestorationPage";
import BusinessItSupportPage from "@/pages/BusinessItSupportPage";
import KasperskyPage from "@/pages/KasperskyPage";
import StarlinkPage from "@/pages/StarlinkPage";
import MacPawPage from "@/pages/MacPawPage";
import AdGuardPage from "@/pages/AdGuardPage";
import SyncBackPage from "@/pages/SyncBackPage";
import MateTelecomPage from "@/pages/MateTelecomPage";
import SolvUpPage from "@/pages/SolvUpPage";
import SearchPage from "@/pages/SearchPage";
import SiteSearchPage from "@/pages/SiteSearchPage";
import PopCulturePage from "@/pages/PopCulturePage";
import GamingPage from "@/pages/GamingPage";
import MediaHomePage from "@/pages/media/MediaHomePage";
import MediaWebsiteDesignPage from "@/pages/media/WebsiteDesignPage";
import MediaDomainsPage from "@/pages/media/DomainsPage";
import MediaAppsPage from "@/pages/media/AppsPage";
import MediaEmailHostingPage from "@/pages/media/EmailHostingPage";
import MediaPortfolioPage from "@/pages/media/PortfolioPage";
import AboutPage from "@/pages/AboutPage";
import Navbar from "@/components/Navbar";
import { usePageTracking, useContactLinkTracking } from "@/hooks/use-analytics";

const queryClient = new QueryClient();

// Hostnames the business still owns. These are matched against the browser's
// hostname, so they must stay spelled as the real domains even after the
// rebrand — renaming them would drop inbound traffic on the floor.
const DOMAIN_ENTRY_POINTS: Record<string, string> = {
  "koasoft.com.au": "/media",
  "www.koasoft.com.au": "/media",
  "koastalkollective.com.au": "/about",
  "www.koastalkollective.com.au": "/about",
  "toukleycomputerrepairs.com.au": "/computer-repairs/toukley",
  "www.toukleycomputerrepairs.com.au": "/computer-repairs/toukley",
  "toukleyphonerepairs.com.au": "/computer-repairs/toukley",
  "www.toukleyphonerepairs.com.au": "/computer-repairs/toukley",
};

/**
 * Legacy URLs from before the KoaSOFT-to-Koastal rebrand. `scripts/redirects.mjs` emits a
 * static stub at each of these paths, which is what crawlers and cold hits
 * actually get; this mirrors the same rules inside the SPA so an old URL still
 * resolves if the app boots on one — a client-side navigation, or a host whose
 * catch-all rewrite serves index.html before the stub is matched.
 *
 * Expressed as patterns rather than a table so any /koasoft/* URL not in the
 * old sitemap is covered too.
 */
function legacyTarget(path: string): string | null {
  // The per-suburb Kollective pages were retired; suburbs live only under
  // /computer-repairs now.
  const kollective = path.match(/^\/kollective\/(.+)$/);
  if (kollective) return retiredSuburbTarget(kollective[1]) ?? `/computer-repairs/${kollective[1]}`;
  const webServices = path.match(/^\/koasoft\/web-services\/(.+)$/);
  // The per-suburb Media pages were retired; their content now lives on the
  // combined suburb page.
  if (webServices) return retiredSuburbTarget(webServices[1]) ?? `/computer-repairs/${webServices[1]}`;
  // Suburbs without a page of their own go to their nearest hub suburb.
  const suburb = path.match(/^\/computer-repairs\/([^/]+)\/?$/);
  if (suburb) return retiredSuburbTarget(suburb[1]);
  if (path === "/koasoft") return "/media";
  if (path.startsWith("/koasoft/")) return `/media/${path.slice("/koasoft/".length)}`;
  return null;
}

function LegacyRedirect() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    const target = legacyTarget(location);
    if (target) navigate(target, { replace: true });
  }, [location]);
  return null;
}

function DomainRedirect() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    if (location !== "/") return;
    const target = DOMAIN_ENTRY_POINTS[window.location.hostname];
    if (target) navigate(target, { replace: true });
  }, []);
  return null;
}

function AnalyticsTracker() {
  usePageTracking();
  useContactLinkTracking();
  return null;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white pb-16 lg:pb-0">
      <Navbar />
      {children}
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route
        path="/"
        component={() => (
          <Layout>
            <HomePage />
          </Layout>
        )}
      />
      <Route
        path="/computer-repairs"
        component={() => (
          <Layout>
            <ComputerRepairsPage />
          </Layout>
        )}
      />
      {/* Region hubs sit between /computer-repairs and the individual suburb
          pages, and MUST be declared before the :suburb route — Switch takes
          the first match, and /computer-repairs/:suburb would otherwise
          swallow them and render a 404. Declared as literal paths so
          generate-sitemap.mjs discovers them automatically. */}
      <Route
        path="/computer-repairs/central-coast"
        component={() => (
          <Layout>
            <RegionPage />
          </Layout>
        )}
      />
      <Route
        path="/computer-repairs/lake-macquarie"
        component={() => (
          <Layout>
            <RegionPage />
          </Layout>
        )}
      />
      <Route
        path="/computer-repairs/:suburb"
        component={() => (
          <Layout>
            <SuburbPage />
          </Layout>
        )}
      />
      <Route
        path="/virus-removal"
        component={() => (
          <Layout>
            <VirusRemovalPage />
          </Layout>
        )}
      />
      <Route
        path="/on-site-services"
        component={() => (
          <Layout>
            <OnSiteServicesPage />
          </Layout>
        )}
      />
      <Route
        path="/custom-built-computers"
        component={() => (
          <Layout>
            <CustomBuiltComputersPage />
          </Layout>
        )}
      />
      <Route
        path="/laptop-screen-repairs"
        component={() => (
          <Layout>
            <LaptopScreenRepairPage />
          </Layout>
        )}
      />
      <Route
        path="/refurbished-computers"
        component={() => (
          <Layout>
            <RefurbishedComputersPage />
          </Layout>
        )}
      />
      <Route
        path="/vhs-to-digital"
        component={() => (
          <Layout>
            <VhsToDigitalPage />
          </Layout>
        )}
      />
      <Route
        path="/digital-conversions"
        component={() => (
          <Layout>
            <DigitalConversionsPage />
          </Layout>
        )}
      />
      <Route
        path="/funeral-slideshows"
        component={() => (
          <Layout>
            <FuneralSlideshowsPage />
          </Layout>
        )}
      />
      <Route
        path="/computer-services"
        component={() => (
          <Layout>
            <AllComputerServicesPage />
          </Layout>
        )}
      />
      <Route
        path="/macbook-repair"
        component={() => (
          <Layout>
            <MacBookRepairPage />
          </Layout>
        )}
      />
      <Route
        path="/data-recovery"
        component={() => (
          <Layout>
            <DataRecoveryPage />
          </Layout>
        )}
      />
      <Route
        path="/nbn-wifi-setup"
        component={() => (
          <Layout>
            <NbnWifiPage />
          </Layout>
        )}
      />
      <Route
        path="/photo-restoration"
        component={() => (
          <Layout>
            <PhotoRestorationPage />
          </Layout>
        )}
      />
      <Route
        path="/business-it-support"
        component={() => (
          <Layout>
            <BusinessItSupportPage />
          </Layout>
        )}
      />
      <Route
        path="/kaspersky"
        component={() => (
          <Layout>
            <KasperskyPage />
          </Layout>
        )}
      />
      <Route
        path="/starlink"
        component={() => (
          <Layout>
            <StarlinkPage />
          </Layout>
        )}
      />
      <Route
        path="/macpaw"
        component={() => (
          <Layout>
            <MacPawPage />
          </Layout>
        )}
      />
      <Route
        path="/adguard"
        component={() => (
          <Layout>
            <AdGuardPage />
          </Layout>
        )}
      />
      <Route
        path="/syncback"
        component={() => (
          <Layout>
            <SyncBackPage />
          </Layout>
        )}
      />
      <Route
        path="/mate-telecom"
        component={() => (
          <Layout>
            <MateTelecomPage />
          </Layout>
        )}
      />
      <Route
        path="/solvup"
        component={() => (
          <Layout>
            <SolvUpPage />
          </Layout>
        )}
      />
      <Route
        path="/media"
        component={() => (
          <Layout>
            <MediaHomePage />
          </Layout>
        )}
      />
      <Route
        path="/media/website-design"
        component={() => (
          <Layout>
            <MediaWebsiteDesignPage />
          </Layout>
        )}
      />
      <Route
        path="/media/domains"
        component={() => (
          <Layout>
            <MediaDomainsPage />
          </Layout>
        )}
      />
      <Route
        path="/media/apps"
        component={() => (
          <Layout>
            <MediaAppsPage />
          </Layout>
        )}
      />
      <Route
        path="/media/email-hosting"
        component={() => (
          <Layout>
            <MediaEmailHostingPage />
          </Layout>
        )}
      />
      <Route
        path="/media/portfolio"
        component={() => (
          <Layout>
            <MediaPortfolioPage />
          </Layout>
        )}
      />
      <Route
        path="/pop-culture"
        component={() => (
          <Layout>
            <PopCulturePage />
          </Layout>
        )}
      />
      <Route
        path="/gaming"
        component={() => (
          <Layout>
            <GamingPage />
          </Layout>
        )}
      />
      <Route
        path="/about"
        component={() => (
          <Layout>
            <AboutPage />
          </Layout>
        )}
      />
      <Route path="/search" component={SearchPage} />
      <Route
        path="/site-search"
        component={() => (
          <Layout>
            <SiteSearchPage />
          </Layout>
        )}
      />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <DomainRedirect />
          <LegacyRedirect />
          <Router />
          <AnalyticsTracker />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
