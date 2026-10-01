import { useState } from "react";
import { useLocation } from "wouter";
import { Menu, X, Phone, Monitor, Globe } from "lucide-react";
import { SiteNavBar, SiteNavMobile } from "@workspace/site-nav";
import ThemeToggle from "@/components/ThemeToggle";
import AccessibilityMenu from "@/components/AccessibilityMenu";

/* The menu itself (items, tabs, drop-downs, the phone list) lives in
   @workspace/site-nav, shared with the online shop so both read as one site.
   It sits on its own row under the logo: with SHOP added it no longer fit
   beside it. */
export default function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoSrc = location.startsWith("/media")
    ? "/images/logo.png"
    : "/images/logo.png";

  const logoAlt = location.startsWith("/media")
    ? "Koastal Kollective Web & App Development"
    : "Koastal Kollective Central Coast Computer Repairs";

  const logoHref = location.startsWith("/media") ? "/media" : "/";

  return (
    <>
      {/* ─── Top Navigation Bar (hidden on mobile) ─── */}
      <header className="top-nav bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <a href={logoHref} className="flex-shrink-0">
              <img
                src={logoSrc}
                alt={logoAlt}
                className="h-16 w-auto"
              />
            </a>

            {/* Phone + Theme + Accessibility + Mobile toggle */}
            <div className="flex items-center gap-1">
              <a
                href="tel:+61493145179"
                className="hidden xl:flex items-center gap-1.5 text-[#007b7d] font-bold text-sm hover:text-[#005f61] transition-colors mr-1"
              >
                <Phone className="h-4 w-4" />
                0493 145 179
              </a>
              <div className="hidden md:flex items-center">
                <ThemeToggle />
                <AccessibilityMenu />
              </div>
              <button
                className="lg:hidden p-2 text-gray-700 hover:text-[#007b7d]"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
          {/* Desktop menu, on its own row */}
          <div className="hidden lg:flex pb-2 overflow-visible">
            <SiteNavBar />
          </div>
        </div>

      </header>

      {/* Mobile Menu overlay (rendered here so it survives the .top-nav hide rule) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 pt-20 bg-white border-t border-gray-200 shadow-lg overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <SiteNavMobile onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* ─── Mobile Bottom Navigation Bar ─── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#0b1616] border-t border-gray-200 dark:border-[#1c2e2e] shadow-[0_-2px_10px_rgba(0,0,0,0.10)]"
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch h-16 safe-area-pb">
          {/* Menu */}
          <button
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-500 dark:text-gray-400 active:bg-gray-50 dark:active:bg-[#111e1e] transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="h-5 w-5 text-[#007b7d]" /> : <Menu className="h-5 w-5" />}
            <span className="text-[10px] font-bold tracking-wide uppercase leading-none">
              Menu
            </span>
          </button>

          {/* IT */}
          <a
            href="/computer-repairs"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#007b7d] active:bg-teal-50 dark:active:bg-[#0e1e1e] transition-colors"
            aria-label="IT Repairs"
          >
            <Monitor className="h-5 w-5" />
            <span className="text-[10px] font-bold tracking-wide uppercase leading-none">
              IT
            </span>
          </a>

          {/* Web */}
          <a
            href="/media"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#007b7d] active:bg-teal-50 dark:active:bg-[#0e1e1e] transition-colors"
            aria-label="Koastal Kollective Web Services"
          >
            <Globe className="h-5 w-5" />
            <span className="text-[10px] font-bold tracking-wide uppercase leading-none">
              Web
            </span>
          </a>

          {/* Call */}
          <a
            href="tel:+61493145179"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-green-600 dark:text-green-400 active:bg-green-50 dark:active:bg-[#0a1e10] transition-colors"
            aria-label="Call 0493 145 179"
          >
            <Phone className="h-5 w-5" />
            <span className="text-[10px] font-bold tracking-wide uppercase leading-none">
              Call
            </span>
          </a>
        </div>
      </nav>
    </>
  );
}
