import { useState } from "react";
import { useLocation } from "wouter";
import { Menu, X, Phone, Monitor, Globe } from "lucide-react";
import { SiteHeader, SiteNavMobile } from "@workspace/site-nav";
import ThemeToggle from "@/components/ThemeToggle";

/* The header itself — logo, shop search, phone, shop account and cart, and
   the menu on its own row below — is @workspace/site-nav's SiteHeader, the
   same one the online shop renders, so the two read as one site. Phones keep
   this site's own bottom bar and menu overlay. */
export default function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoAlt = location.startsWith("/media")
    ? "Koastal Kollective Web & App Development"
    : "Koastal Kollective Central Coast Computer Repairs";

  return (
    <>
      {/* ─── Top Navigation Bar (hidden on mobile by .top-nav) ─── */}
      <SiteHeader
        className="top-nav"
        logoAlt={logoAlt}
        extras={<ThemeToggle />}
      />

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
