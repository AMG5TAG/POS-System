import { useState } from "react";
import { useLocation } from "wouter";
import { Menu, X, ChevronDown, Phone, Monitor, Globe, Star } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import AccessibilityMenu from "@/components/AccessibilityMenu";

type NavChild = { label: string; href: string; disabled?: boolean; featured?: boolean };
type NavItem = { label: string; href: string; children?: NavChild[]; color?: string };

const navItems: NavItem[] = [
  { label: "HOME", href: "/" },
  // The online shop lives beside this site under /shop (artifacts/shop); a plain
  // <a>, like every item here, so it is a full page load into the shop's app.
  { label: "SHOP", href: "/shop/" },
  {
    label: "COMPUTERS",
    href: "#it-services",
    children: [
      { label: "All Computer Services", href: "/computer-services" },
      { label: "Computer Repairs", href: "/computer-repairs" },
      { label: "Central Coast Repairs", href: "/computer-repairs/central-coast" },
      { label: "Lake Macquarie Repairs", href: "/computer-repairs/lake-macquarie" },
      { label: "Virus Removal", href: "/virus-removal" },
      { label: "Data Recovery", href: "/data-recovery" },
      { label: "Laptop Screen Repairs", href: "/laptop-screen-repairs" },
      { label: "MacBook & Apple Repairs", href: "/macbook-repair" },
      { label: "Custom Built Computers", href: "/custom-built-computers" },
      { label: "Refurbished Computers", href: "/refurbished-computers" },
      { label: "NBN & Wi-Fi Setup", href: "/nbn-wifi-setup" },
      { label: "On-Site Services", href: "/on-site-services" },
      { label: "Business IT Support", href: "/business-it-support" },
    ],
  },
  {
    label: "MEDIA",
    href: "/media",
    children: [
      { label: "Portfolio", href: "/media/portfolio", featured: true },
      { label: "Overview", href: "/media" },
      { label: "Website Design", href: "/media/website-design" },
      { label: "Domains", href: "/media/domains" },
      { label: "Apps", href: "/media/apps" },
      { label: "Email Hosting", href: "/media/email-hosting" },
      { label: "VHS to Digital", href: "/vhs-to-digital" },
      { label: "Digital Conversions", href: "/digital-conversions" },
      { label: "Photo Restoration", href: "/photo-restoration" },
      { label: "Funeral Slideshows", href: "/funeral-slideshows" },
    ],
  },
  { label: "POP CULTURE", href: "/pop-culture" },
  {
    label: "PARTNERS",
    href: "#",
    children: [
      { label: "SolvUp Retail Repair", href: "/solvup" },
      { label: "MATE Telecom NBN", href: "/mate-telecom" },
      { label: "Starlink Internet", href: "/starlink" },
      { label: "Kaspersky Security", href: "/kaspersky" },
      { label: "MacPaw CleanMyMac", href: "/macpaw" },
      { label: "AdGuard Privacy", href: "/adguard" },
      { label: "SyncBack Backup", href: "/syncback" },
    ],
  },
  { label: "TESTIMONIALS", href: "#testimonials" },
  {
    label: "DIREKTORIES",
    href: "#",
    color: "#800000",
    children: [
      { label: "Coming Soon", href: "#", disabled: true },
    ],
  },
  {
    label: "CONTACT",
    href: "#contact",
    children: [
      { label: "Contact", href: "#contact" },
      { label: "About Us", href: "/about" },
      { label: "Service Areas", href: "#service-areas" },
    ],
  },
];

export default function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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

            {/* Desktop Nav */}
            <div className="hidden lg:flex h-full overflow-visible">
              <nav className="flex items-stretch gap-[1px]">
                {navItems.map((item, index) => (
                  <div
                    key={item.label}
                    className="relative flex"
                    onMouseEnter={() => item.children && setOpenDropdown(item.label)}
                    onMouseLeave={() => setOpenDropdown(null)}
                  >
                    <a
                      href={item.href}
                      className="relative flex items-center justify-center gap-1 px-5 text-xs font-bold text-white whitespace-nowrap tracking-wide bg-[#007b7d]"
                      style={{ transform: "skewX(-20deg)", ...(item.color ? { backgroundColor: item.color } : {}) }}
                    >
                      <span className="flex items-center gap-1" style={{ transform: "skewX(20deg)" }}>
                        {item.label}
                        {item.children && <ChevronDown className="h-4 w-4 mt-0.5" />}
                      </span>
                    </a>
                  {/* Rendered unconditionally and hidden with CSS rather than
                      unmounted. Crawlers never fire mouseenter, so gating these
                      on `openDropdown` kept all 30 service and partner links —
                      the site's primary internal linking — out of the DOM
                      entirely. Visibility is unchanged for real users. */}
                  {item.children && (
                    <div
                      className={`absolute top-full left-0 bg-white border border-gray-200 shadow-lg rounded-sm min-w-[200px] py-1 z-50 transition-opacity duration-100 ${
                        openDropdown === item.label
                          ? "visible opacity-100"
                          : "invisible opacity-0 pointer-events-none"
                      }`}
                      aria-hidden={openDropdown !== item.label}
                    >
                      {item.children.map((child) => (
                        <DropdownLink
                          key={child.label}
                          href={child.href}
                          label={child.label}
                          hoverColor={item.color ?? "#007b7d"}
                          disabled={child.disabled}
                          featured={child.featured}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
            </div>

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
        </div>

      </header>

      {/* Mobile Menu overlay (rendered here so it survives the .top-nav hide rule) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 pt-20 bg-white border-t border-gray-200 shadow-lg overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <div key={item.label}>
                {item.children ? (
                  <>
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-gray-700 dark:text-white hover:text-[#007b7d] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1a3024] rounded transition-colors"
                      onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                    >
                      {item.label}
                      <ChevronDown className={`h-4 w-4 transition-transform ${openDropdown === item.label ? "rotate-180" : ""}`} />
                    </button>
                    {openDropdown === item.label && (
                      <div className="ml-4 mt-1 space-y-0.5">
                        {item.children.map((child) => (
                          <MobileDropdownLink
                            key={child.label}
                            href={child.href}
                            label={child.label}
                            hoverColor={item.color ?? "#007b7d"}
                            onNavigate={() => setMobileOpen(false)}
                            disabled={child.disabled}
                            featured={child.featured}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <a
                    href={item.href}
                    className="block w-full px-3 py-2 text-sm font-bold text-gray-700 dark:text-white hover:text-[#007b7d] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1a3024] rounded transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </a>
                )}
              </div>
            ))}
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

function DropdownLink({
  href,
  label,
  hoverColor,
  disabled,
  featured,
}: {
  href: string;
  label: string;
  hoverColor: string;
  disabled?: boolean;
  featured?: boolean;
}) {
  const [hover, setHover] = useState(false);
  if (disabled) {
    return (
      <span className="block px-4 py-2 text-sm text-gray-400 dark:text-gray-500 cursor-default select-none italic">
        {label}
      </span>
    );
  }
  if (featured) {
    return (
      <a
        href={href}
        className="flex items-center gap-2 mx-1 mb-1 px-3 py-2 text-sm font-bold rounded-sm border-l-4 transition-colors"
        style={{
          borderLeftColor: hoverColor,
          backgroundColor: hover ? hoverColor : `${hoverColor}1a`,
          color: hover ? "#ffffff" : hoverColor,
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Star className="h-4 w-4 shrink-0" fill="currentColor" />
        {label}
      </a>
    );
  }
  return (
    <a
      href={href}
      className="block px-4 py-2 text-sm transition-colors dark:text-white"
      style={{
        backgroundColor: hover ? hoverColor : "transparent",
        color: hover ? "#ffffff" : undefined,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </a>
  );
}

function MobileDropdownLink({
  href,
  label,
  hoverColor,
  onNavigate,
  disabled,
  featured,
}: {
  href: string;
  label: string;
  hoverColor: string;
  onNavigate: () => void;
  disabled?: boolean;
  featured?: boolean;
}) {
  const [hover, setHover] = useState(false);
  if (disabled) {
    return (
      <span className="block px-3 py-1.5 text-sm rounded text-gray-400 dark:text-gray-500 cursor-default select-none italic">
        {label}
      </span>
    );
  }
  if (featured) {
    return (
      <a
        href={href}
        className="flex items-center gap-2 mb-1 px-3 py-2 text-sm font-bold rounded border-l-4 transition-colors"
        style={{
          borderLeftColor: hoverColor,
          backgroundColor: `${hoverColor}1a`,
          color: hoverColor,
        }}
        onClick={onNavigate}
      >
        <Star className="h-4 w-4 shrink-0" fill="currentColor" />
        {label}
      </a>
    );
  }
  return (
    <a
      href={href}
      className="block px-3 py-1.5 text-sm rounded transition-colors dark:text-white"
      style={{ color: hover ? hoverColor : undefined }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onNavigate}
    >
      {label}
    </a>
  );
}
