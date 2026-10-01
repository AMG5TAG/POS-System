import { useState, type ReactNode } from "react";
import { ChevronDown, Star } from "lucide-react";

/*
 * The Koastal Kollective menu, shared by the website (artifacts/website) and
 * the online shop (artifacts/shop) so the two read as one site. Every link is
 * a plain <a> — a full page load — because the two are separate apps: the
 * website at "/", the shop under "/shop".
 *
 * Tailwind only generates classes it finds in a project's own sources, so
 * each app's index.css carries an @source line pointing here.
 */

export type NavChild = { label: string; href: string; disabled?: boolean; featured?: boolean };
export type NavItem = { label: string; href: string; children?: NavChild[]; color?: string };

export const BRAND = "#007b7d";
/* The website's typeface, so the menu is the same width and look in both apps
   (each loads it from Google Fonts in its index.html). */
const FONT = "'Atkinson Hyperlegible', Arial, Helvetica, sans-serif";
/* The tab for the section being viewed: the brand teal, darkened. */
const ACTIVE = "#004f51";

export const SITE_NAV: NavItem[] = [
  { label: "HOME", href: "/" },
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

/* "#contact"-style links name a section of the website's current page. Off the
   website (the shop) they must point at the website's home page instead:
   pass hashBase="/" there. A bare "#" is a placeholder and stays as it is. */
function resolve(href: string, hashBase: string) {
  return href.startsWith("#") && href.length > 1 ? `${hashBase}${href}` : href;
}

/* The desktop bar: slanted teal tabs with hover drop-downs. `active` names the
   tab for the section being viewed (the shop passes "SHOP"). */
export function SiteNavBar({ active, hashBase = "" }: { active?: string; hashBase?: string }) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  return (
    <nav className="h-11 flex items-stretch gap-[1px]" style={{ fontFamily: FONT }} aria-label="Main">
      {SITE_NAV.map((item) => {
        const isActive = item.label === active;
        return (
          <div
            key={item.label}
            className="relative flex"
            onMouseEnter={() => item.children && setOpenDropdown(item.label)}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <a
              href={resolve(item.href, hashBase)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex items-center justify-center gap-1 px-3 xl:px-5 text-xs font-bold text-white whitespace-nowrap tracking-wide ${isActive ? "" : "hover:brightness-110"}`}
              style={{ transform: "skewX(-20deg)", backgroundColor: isActive ? ACTIVE : item.color ?? BRAND }}
            >
              <span className="flex items-center gap-1" style={{ transform: "skewX(20deg)" }}>
                {item.label}
                {item.children && <ChevronDown className="h-4 w-4 mt-0.5" />}
              </span>
            </a>
            {/* Rendered unconditionally and hidden with CSS rather than
                unmounted. Crawlers never fire mouseenter, so gating these on
                `openDropdown` kept all 30 service and partner links — the
                website's primary internal linking — out of the DOM entirely.
                Visibility is unchanged for real users. */}
            {item.children && (
              <div
                className={`absolute top-full left-0 bg-white border border-gray-200 shadow-lg rounded-sm min-w-[200px] py-1 z-50 transition-opacity duration-100 ${
                  openDropdown === item.label ? "visible opacity-100" : "invisible opacity-0 pointer-events-none"
                }`}
                aria-hidden={openDropdown !== item.label}
              >
                {item.children.map((child) => (
                  <DropdownLink
                    key={child.label}
                    href={resolve(child.href, hashBase)}
                    label={child.label}
                    hoverColor={item.color ?? BRAND}
                    disabled={child.disabled}
                    featured={child.featured}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/* The same menu as a vertical list, for a phone's menu panel. `slots` puts
   extra content under an item, opened like a drop-down: the shop hangs its
   categories under SHOP. */
export function SiteNavMobile({ hashBase = "", onNavigate, slots = {}, initiallyOpen = null }: {
  hashBase?: string;
  onNavigate: () => void;
  slots?: Record<string, ReactNode>;
  initiallyOpen?: string | null;
}) {
  const [open, setOpen] = useState<string | null>(initiallyOpen);
  const rowClass = "w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-gray-700 dark:text-white hover:text-[#007b7d] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1a3024] rounded transition-colors";
  return (
    <div className="space-y-1" style={{ fontFamily: FONT }}>
      {SITE_NAV.map((item) => {
        const slot = slots[item.label];
        const expandable = !!item.children || !!slot;
        return (
          <div key={item.label}>
            {expandable ? (
              <>
                <button className={rowClass} aria-expanded={open === item.label} onClick={() => setOpen(open === item.label ? null : item.label)}>
                  {item.label}
                  <ChevronDown className={`h-4 w-4 transition-transform ${open === item.label ? "rotate-180" : ""}`} />
                </button>
                {open === item.label && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {slot}
                    {item.children?.map((child) => (
                      <MobileDropdownLink
                        key={child.label}
                        href={resolve(child.href, hashBase)}
                        label={child.label}
                        hoverColor={item.color ?? BRAND}
                        onNavigate={onNavigate}
                        disabled={child.disabled}
                        featured={child.featured}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <a href={resolve(item.href, hashBase)} className={`block ${rowClass}`} onClick={onNavigate}>
                {item.label}
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DropdownLink({ href, label, hoverColor, disabled, featured }: {
  href: string; label: string; hoverColor: string; disabled?: boolean; featured?: boolean;
}) {
  const [hover, setHover] = useState(false);
  if (disabled) {
    return <span className="block px-4 py-2 text-sm text-gray-400 dark:text-gray-500 cursor-default select-none italic">{label}</span>;
  }
  if (featured) {
    return (
      <a
        href={href}
        className="flex items-center gap-2 mx-1 mb-1 px-3 py-2 text-sm font-bold rounded-sm border-l-4 transition-colors"
        style={{ borderLeftColor: hoverColor, backgroundColor: hover ? hoverColor : `${hoverColor}1a`, color: hover ? "#ffffff" : hoverColor }}
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
      style={{ backgroundColor: hover ? hoverColor : "transparent", color: hover ? "#ffffff" : undefined }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </a>
  );
}

function MobileDropdownLink({ href, label, hoverColor, onNavigate, disabled, featured }: {
  href: string; label: string; hoverColor: string; onNavigate: () => void; disabled?: boolean; featured?: boolean;
}) {
  const [hover, setHover] = useState(false);
  if (disabled) {
    return <span className="block px-3 py-1.5 text-sm rounded text-gray-400 dark:text-gray-500 cursor-default select-none italic">{label}</span>;
  }
  if (featured) {
    return (
      <a
        href={href}
        className="flex items-center gap-2 mb-1 px-3 py-2 text-sm font-bold rounded border-l-4 transition-colors"
        style={{ borderLeftColor: hoverColor, backgroundColor: `${hoverColor}1a`, color: hoverColor }}
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
