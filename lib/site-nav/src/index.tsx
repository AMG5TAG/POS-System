import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Heart, Menu, Phone, Search, ShoppingCart, Star, User, X } from "lucide-react";
import { loadSiteIndex, searchPages, searchProducts, type PageHit, type ProductHit, type SitePage } from "./site-search";

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
/* `shop` marks the item whose drop-down is the online shop's category menu. */
export type NavItem = { label: string; href: string; children?: NavChild[]; color?: string; textColor?: string; shop?: boolean };

export const BRAND = "#007b7d";
/* Koastal's light teal (Mermaid Splash 317). White on it is too faint to
   read, so its label is the dark teal. */
export const LIGHT_TEAL = "#7bb8bd";
const SHOP_TEXT = "#00393a";
/* The website's typeface, so the menu is the same width and look in both apps
   (each loads it from Google Fonts in its index.html). */
const FONT = "'Atkinson Hyperlegible', Arial, Helvetica, sans-serif";
/* The tab for the section being viewed: the brand teal, darkened. */
const ACTIVE = "#004f51";

export const SITE_NAV: NavItem[] = [
  { label: "HOME", href: "/" },
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
  { label: "GAMING", href: "/gaming" },
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
      { label: "Testimonials", href: "#testimonials" },
      { label: "Service Areas", href: "#service-areas" },
    ],
  },
  // The online shop, in the light teal so it stands apart from the services.
  { label: "SHOP", href: "/shop/", shop: true, color: LIGHT_TEAL, textColor: SHOP_TEXT },
  // The shop's mail-in repair service (/shop/mail-in), last on purpose.
  { label: "MAIL-IN REPAIRS", href: "/shop/mail-in" },
];

/* ─── The shop's category menu (SHOP's drop-down) ───────────────────────── */

export type ShopCategory = { id: number; name: string; parentId: number | null; color: string | null; productCount: number };
type Node = ShopCategory & { children: Node[] };

/* Both apps fetch from the shop's public API (same origin in production), so
   a category hidden from the shop is hidden here too. Fetched once per page
   load and shared by every caller; failure (the website's pre-render, a dev
   server with no API) just leaves SHOP without categories. */
let categoriesPromise: Promise<ShopCategory[]> | null = null;
function loadCategories(): Promise<ShopCategory[]> {
  categoriesPromise ??= getJson("/api/shop/categories").then((d) => (Array.isArray(d) ? (d as ShopCategory[]) : []));
  return categoriesPromise;
}

/* Never throws, never rejects. The website's pre-render runs the app in jsdom,
   which has no fetch at all: a bare call there throws synchronously, inside a
   React effect, and every page renders empty. */
function getJson(url: string): Promise<unknown> {
  if (typeof fetch !== "function") return Promise.resolve(null);
  try {
    return fetch(url, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

export function useShopCategories(): ShopCategory[] {
  const [cats, setCats] = useState<ShopCategory[]>([]);
  useEffect(() => {
    let live = true;
    loadCategories().then((c) => { if (live) setCats(c); });
    return () => { live = false; };
  }, []);
  return cats;
}

function tree(cats: ShopCategory[]): Node[] {
  const byId = new Map<number, Node>(cats.map((c) => [c.id, { ...c, children: [] }]));
  const roots: Node[] = [];
  byId.forEach((n) => {
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n); else roots.push(n);
  });
  return roots;
}

const categoryHref = (id: number) => `/shop/products?category=${id}`;
const colourOf = (c: { color: string | null }) => c.color || BRAND;
// Any CSS colour a merchant saved, lightened for a featured item's tint.
const tint = (colour: string) => `color-mix(in srgb, ${colour} 10%, white)`;
const FLYOUT = 240; // width a flyout list needs beside its parent

/* A link into the shop. Inside the shop app, `onShopNavigate` routes it
   client-side (given the path below /shop); elsewhere it is a page load. */
type ShopNav = ((path: string) => void) | undefined;
function shopClick(href: string, onShopNavigate: ShopNav, after?: () => void) {
  return (e: MouseEvent) => {
    after?.();
    if (!onShopNavigate || !href.startsWith("/shop/") || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onShopNavigate(href.slice("/shop".length));
  };
}

function ShopMenuItem({ href, colour, featured, active, onClick, children }: {
  href: string; colour: string; featured?: boolean; active?: boolean; onClick: (e: MouseEvent) => void; children: ReactNode;
}) {
  const [hovered, setHover] = useState(false);
  // An item whose flyout is open stays lit while the pointer is in the flyout.
  const hover = hovered || !!active;
  if (featured) {
    return (
      <a href={href} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="flex items-center gap-2 mx-1 mb-1 px-3 py-2 text-sm font-bold rounded-sm border-l-4 transition-colors"
        style={{ borderLeftColor: colour, backgroundColor: hover ? colour : tint(colour), color: hover ? "#fff" : colour }}>
        <Star className="w-4 h-4 shrink-0" fill="currentColor" />{children}
      </a>
    );
  }
  return (
    <a href={href} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="flex items-center justify-between gap-4 px-4 py-2 text-sm transition-colors dark:text-white"
      style={{ backgroundColor: hover ? colour : "transparent", color: hover ? "#fff" : undefined }}>
      {children}
    </a>
  );
}

/* A list of categories; one with subcategories pops out another list beside
   it on hover, to any depth — rightwards, or leftwards when there is no room.
   Top-level rows take their own colour; everything below takes its root's. */
function CategoryList({ nodes, colour, onShopNavigate, close }: { nodes: Node[]; colour?: string; onShopNavigate: ShopNav; close: () => void }) {
  const [open, setOpen] = useState<{ id: number; left: boolean } | null>(null);
  return (
    <>
      {nodes.map((n) => {
        const c = colour ?? colourOf(n);
        const has = n.children.length > 0;
        const isOpen = has && open?.id === n.id;
        const show = (el: HTMLElement) => setOpen({ id: n.id, left: el.getBoundingClientRect().right + FLYOUT > window.innerWidth });
        return (
          <div key={n.id} className="relative"
            onMouseEnter={(e) => show(e.currentTarget)}
            onMouseLeave={() => setOpen((o) => (o?.id === n.id ? null : o))}
            onFocus={(e) => show(e.currentTarget)}>
            <ShopMenuItem href={categoryHref(n.id)} colour={c} active={isOpen} onClick={shopClick(categoryHref(n.id), onShopNavigate, close)}>
              <span className="truncate">{n.name}</span>
              <span className="flex items-center gap-1 text-xs opacity-60 tabular-nums">
                {n.productCount}
                {has && (isOpen && open?.left ? <ChevronLeft className="w-3.5 h-3.5 -order-1" /> : <ChevronRight className="w-3.5 h-3.5" />)}
              </span>
            </ShopMenuItem>
            {isOpen && (
              <div className={`absolute top-0 ${open?.left ? "right-full" : "left-full"} -mt-1 bg-white border border-gray-200 shadow-lg rounded-sm min-w-[220px] max-w-[320px] py-1 z-10`}>
                <ShopMenuItem href={categoryHref(n.id)} colour={c} featured onClick={shopClick(categoryHref(n.id), onShopNavigate, close)}>All {n.name}</ShopMenuItem>
                <CategoryList nodes={n.children} colour={c} onShopNavigate={onShopNavigate} close={close} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* SHOP's drop-down: all products and the category tree. (Mail-in repairs is
   its own item at the end of the menu.) */
function ShopMenu({ categories, onShopNavigate, close }: { categories: ShopCategory[]; onShopNavigate: ShopNav; close: () => void }) {
  const roots = tree(categories);
  return (
    <>
      <ShopMenuItem href="/shop/products" colour={BRAND} featured onClick={shopClick("/shop/products", onShopNavigate, close)}>All products</ShopMenuItem>
      <CategoryList nodes={roots} onShopNavigate={onShopNavigate} close={close} />
    </>
  );
}

/* The phone version: top-level categories with their colour as a left bar,
   each opening its subcategories (one level, like the old shop menu). */
function ShopMobileMenu({ categories, onShopNavigate, onNavigate }: { categories: ShopCategory[]; onShopNavigate: ShopNav; onNavigate: () => void }) {
  const roots = tree(categories);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const link = (href: string, className: string, children: ReactNode, style?: CSSProperties) => (
    <a href={href} onClick={shopClick(href, onShopNavigate, onNavigate)} className={className} style={style}>{children}</a>
  );
  return (
    <div className="text-sm divide-y divide-gray-100">
      {link("/shop/", "block py-2.5 font-semibold dark:text-white", "Shop home")}
      {link("/shop/products", "block py-2.5 font-semibold dark:text-white", "All products")}
      {roots.map((r) => (
        <div key={r.id}>
          <div className="flex items-center">
            {link(categoryHref(r.id), "flex-1 py-2.5 font-bold border-l-4 pl-2.5 dark:text-white", r.name, { borderLeftColor: colourOf(r) })}
            {r.children.length > 0 && (
              <button onClick={() => toggle(r.id)} aria-label={`${expanded.has(r.id) ? "Hide" : "Show"} ${r.name} subcategories`} aria-expanded={expanded.has(r.id)}
                className="w-10 h-10 flex items-center justify-center text-gray-500">
                <ChevronDown className={`w-4 h-4 transition-transform ${expanded.has(r.id) ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
          {expanded.has(r.id) && r.children.map((k) => (
            <div key={k.id} className="pl-4">{link(categoryHref(k.id), "block py-2 text-gray-600 dark:text-gray-300", k.name)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* "#contact"-style links name a section of the website's current page. Off the
   website (the shop) they must point at the website's home page instead:
   pass hashBase="/" there. A bare "#" is a placeholder and stays as it is. */
/* HOME is the home page of whichever app you are in: the shop passes
   homeHref="/shop/", the website keeps "/". (The header's logo always goes
   to the website's home page.) */
const hrefOf = (item: NavItem, homeHref: string) => (item.label === "HOME" ? homeHref : item.href);

function resolve(href: string, hashBase: string) {
  return href.startsWith("#") && href.length > 1 ? `${hashBase}${href}` : href;
}

/* The desktop bar: slanted teal tabs with hover drop-downs; SHOP's is the
   shop's category menu. `active` names the tab for the section being viewed
   (the shop passes "SHOP"); `onShopNavigate` lets the shop route its own
   links without a page load. */
export function SiteNavBar({ active, hashBase = "", homeHref = "/", onShopNavigate }: { active?: string; hashBase?: string; homeHref?: string; onShopNavigate?: (path: string) => void }) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  // A drop-down near the window's right edge opens right-aligned to its tab.
  const [alignRight, setAlignRight] = useState(false);
  const categories = useShopCategories();
  const close = () => setOpenDropdown(null);
  return (
    // Wraps rather than overflowing when a wider face (the website's
    // dyslexia font, large text) no longer fits one row; each tab keeps h-11.
    <nav className="flex flex-wrap items-stretch gap-x-[1px] gap-y-1" style={{ fontFamily: FONT }} aria-label="Main">
      {SITE_NAV.map((item) => {
        const isActive = item.label === active;
        return (
          <div
            key={item.label}
            className="relative flex h-11"
            onMouseEnter={(e) => {
              if (!item.children && !item.shop) return;
              setAlignRight(e.currentTarget.getBoundingClientRect().left + 320 > window.innerWidth);
              setOpenDropdown(item.label);
            }}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <a
              href={resolve(hrefOf(item, homeHref), hashBase)}
              onClick={hrefOf(item, homeHref).startsWith("/shop/") ? shopClick(hrefOf(item, homeHref), onShopNavigate, close) : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex items-center justify-center gap-1 px-2 xl:px-5 text-xs font-bold whitespace-nowrap tracking-normal xl:tracking-wide ${isActive ? "" : "hover:brightness-110"}`}
              style={{
                transform: "skewX(-20deg)",
                // The section being viewed: brand-teal tabs go dark; a tab with
                // its own colour (SHOP's light teal) keeps it exactly.
                backgroundColor: isActive && !item.color ? ACTIVE : item.color ?? BRAND,
                color: item.textColor ?? "#ffffff",
              }}
            >
              <span className="flex items-center gap-1" style={{ transform: "skewX(20deg)" }}>
                {item.label}
                {(item.children || item.shop) && <ChevronDown className="h-4 w-4 mt-0.5" />}
              </span>
            </a>
            {/* Rendered unconditionally and hidden with CSS rather than
                unmounted. Crawlers never fire mouseenter, so gating these on
                `openDropdown` kept all 30 service and partner links — the
                website's primary internal linking — out of the DOM entirely.
                Visibility is unchanged for real users. */}
            {item.shop && (
              /* No overflow here: it would clip the category flyouts. */
              <div
                className={`absolute top-full ${alignRight && openDropdown === item.label ? "right-0" : "left-0"} bg-white border border-gray-200 shadow-lg rounded-sm min-w-[220px] max-w-[320px] py-1 z-50 transition-opacity duration-100 ${
                  openDropdown === item.label ? "visible opacity-100" : "invisible opacity-0 pointer-events-none"
                }`}
                aria-hidden={openDropdown !== item.label}
              >
                <ShopMenu categories={categories} onShopNavigate={onShopNavigate} close={close} />
              </div>
            )}
            {item.children && (
              <div
                className={`absolute top-full ${alignRight && openDropdown === item.label ? "right-0" : "left-0"} bg-white border border-gray-200 shadow-lg rounded-sm min-w-[200px] py-1 z-50 transition-opacity duration-100 ${
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

/* The same menu as a vertical list, for a phone's menu panel. SHOP opens into
   the shop's categories. */
export function SiteNavMobile({ hashBase = "", homeHref = "/", onNavigate, onShopNavigate, initiallyOpen = null }: {
  hashBase?: string;
  homeHref?: string;
  onNavigate: () => void;
  onShopNavigate?: (path: string) => void;
  initiallyOpen?: string | null;
}) {
  const [open, setOpen] = useState<string | null>(initiallyOpen);
  const categories = useShopCategories();
  const rowClass = "w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-gray-700 dark:text-white hover:text-[#007b7d] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1a3024] rounded transition-colors";
  return (
    <div className="space-y-1" style={{ fontFamily: FONT }}>
      {SITE_NAV.map((item) => {
        const slot = item.shop ? <ShopMobileMenu categories={categories} onShopNavigate={onShopNavigate} onNavigate={onNavigate} /> : null;
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
              <a href={resolve(hrefOf(item, homeHref), hashBase)} className={`block ${rowClass}`} onClick={shopClick(hrefOf(item, homeHref), onShopNavigate, onNavigate)}>
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

/* ─── The whole header ───────────────────────────────────────────────────── */

/* Who is signed in to the shop, and what is in their cart — shown in the
   header on both apps. The shop passes its own live state; the website reads
   the same things the shop does: /api/shop/auth/me (same origin, same
   session cookie) and the cart the shop keeps in this browser. */
export type ShopSession = { firstName: string | null; signedIn: boolean; cartCount: number; wishlistCount: number };

const CART_KEY = "kkshop_cart_v1"; // artifacts/shop/src/lib/cart.tsx
function cartCount(): number {
  try {
    const v = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
    return Array.isArray(v) ? v.reduce((n: number, l: { qty?: number }) => n + (Number(l?.qty) || 0), 0) : 0;
  } catch { return 0; }
}

export function useShopSession(): ShopSession {
  const [session, setSession] = useState<ShopSession>({ firstName: null, signedIn: false, cartCount: 0, wishlistCount: 0 });
  useEffect(() => {
    let live = true;
    setSession((s) => ({ ...s, cartCount: cartCount() }));
    getJson("/api/shop/auth/me").then((d) => {
      const customer = (d as { customer?: { firstName?: string } | null } | null)?.customer;
      if (live && customer) setSession((s) => ({ ...s, signedIn: true, firstName: customer.firstName || null }));
    });
    const onStorage = (e: StorageEvent) => { if (e.key === CART_KEY) setSession((s) => ({ ...s, cartCount: cartCount() })); };
    window.addEventListener("storage", onStorage);
    return () => { live = false; window.removeEventListener("storage", onStorage); };
  }, []);
  return session;
}

const PHONE = { display: "0493 145 179", tel: "+61493145179" };
/* ─── Header search ─────────────────────────────────────────────────────── */

const RESULTS_PATH = "/site-search";
export const siteSearchHref = (q: string) => `${RESULTS_PATH}?q=${encodeURIComponent(q.trim())}`;
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

/* The search box, with a drop-down of the website's pages and the shop's
   products as you type (site-search.ts). Enter opens the highlighted result,
   or the full results page when none is highlighted. */
function HeaderSearch({ className, go }: { className: string; go: (href: string) => void }) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState<SitePage[]>([]);
  const [products, setProducts] = useState<{ q: string; items: ProductHit[] }>({ q: "", items: [] });
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);

  const query = q.trim();
  const pages: PageHit[] = query.length >= 2 ? searchPages(index, query, 5) : [];
  const shown = products.q === query ? products.items : [];

  // Products ask the API, so wait for a pause in typing.
  useEffect(() => {
    if (query.length < 2) return;
    let live = true;
    const t = setTimeout(() => searchProducts(query, 4).then((r) => live && setProducts({ q: query, items: r.items })), 200);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  // Close when the click lands anywhere else.
  useEffect(() => {
    if (!focused) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as globalThis.Node)) setFocused(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [focused]);

  const items = [
    ...pages.map((p) => p.path),
    ...shown.map((p) => `/shop/product/${p.id}`),
    siteSearchHref(query),
  ];
  const open = focused && query.length >= 2;
  const follow = (href: string) => { setFocused(false); setActive(-1); go(href); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!query) return;
    follow(active >= 0 && active < items.length ? items[active] : siteSearchHref(query));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === "Escape") { setFocused(false); setActive(-1); }
  };
  const row = (i: number) => `flex items-start gap-3 px-4 py-2.5 text-left ${active === i ? "bg-[#e8f4f5] dark:bg-white/10" : "hover:bg-gray-50 dark:hover:bg-white/5"}`;
  const click = (href: string) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    follow(href);
  };

  return (
    <form ref={box} onSubmit={submit} className={className} role="search">
      <div className="relative w-full">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} type="search" placeholder="Search the site, services and products" aria-label="Search the site"
          aria-expanded={open} aria-controls="site-search-results" aria-autocomplete="list" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setActive(-1); setFocused(true); }}
          onFocus={() => { setFocused(true); loadSiteIndex().then(setIndex); }}
          onKeyDown={onKey}
          className="w-full h-10 rounded-full border border-gray-300 bg-gray-50 text-gray-900 pl-9 pr-4 text-sm outline-none focus:border-[#007b7d] focus:bg-white" />
        {open && (
          <div id="site-search-results" role="listbox"
            className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-[#1c2e2e] bg-white dark:bg-[#0b1616] text-gray-900 dark:text-white shadow-xl">
            {pages.length > 0 && (
              <div className="py-1">
                <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#007b7d]">Pages</p>
                {pages.map((p, i) => (
                  <a key={p.path} href={p.path} onClick={click(p.path)} className={row(i)} role="option" aria-selected={active === i}>
                    <FileText className="w-4 h-4 mt-0.5 shrink-0 text-[#007b7d]" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold truncate">{p.title}</span>
                      {p.snippet && <span className="block text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{p.snippet}</span>}
                    </span>
                  </a>
                ))}
              </div>
            )}
            {shown.length > 0 && (
              <div className="py-1 border-t border-gray-100 dark:border-[#1c2e2e]">
                <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#007b7d]">Shop</p>
                {shown.map((p, j) => {
                  const i = pages.length + j;
                  const href = `/shop/product/${p.id}`;
                  return (
                    <a key={p.id} href={href} onClick={click(href)} className={`${row(i)} items-center`} role="option" aria-selected={active === i}>
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0 bg-gray-100" />
                        : <ShoppingCart className="w-4 h-4 shrink-0 text-[#007b7d]" />}
                      <span className="min-w-0 flex-1 text-sm font-semibold truncate">{p.name}</span>
                      <span className="text-sm font-bold text-[#007b7d] shrink-0">{aud(p.price)}</span>
                    </a>
                  );
                })}
              </div>
            )}
            {pages.length === 0 && shown.length === 0 && (
              <p className="px-4 py-3 text-sm text-gray-500">No quick matches for &ldquo;{query}&rdquo;.</p>
            )}
            <a href={siteSearchHref(query)} onClick={click(siteSearchHref(query))}
              className={`${row(items.length - 1)} border-t border-gray-100 dark:border-[#1c2e2e] text-sm font-bold text-[#007b7d]`}
              role="option" aria-selected={active === items.length - 1}>
              <Search className="w-4 h-4 mt-0.5 shrink-0" /> See all results for &ldquo;{query}&rdquo;
            </a>
          </div>
        )}
      </div>
    </form>
  );
}

/* The website's logo file, served at the root of koastal.com.au — the same
   origin as the shop, so both headers show the same image. */
const SITE_LOGO = "/images/logo.png";

/* The header both apps render: logo, site search, phone and shop account on
   one row, the menu on the row below (desktop), and a collapsible menu panel
   on narrower screens. `extras` is for controls only one app can honour (the
   website's dark mode and accessibility toggles). */
export function SiteHeader({
  logoSrc = SITE_LOGO, logoFallback, logoAlt, active, hashBase = "", homeHref = "/", onShopNavigate, session, extras, className = "",
}: {
  logoSrc?: string;
  /** Shown if logoSrc fails to load (the shop's dev preview has no /images). */
  logoFallback?: string | null;
  logoAlt: string;
  /** Where the menu's HOME goes: this app's home page. */
  homeHref?: string;
  active?: string;
  hashBase?: string;
  onShopNavigate?: (path: string) => void;
  /** The shop's live state; omitted on the website, which reads it itself. */
  session?: ShopSession;
  extras?: ReactNode;
  className?: string;
}) {
  const own = useShopSession();
  const s = session ?? own;
  const [open, setOpen] = useState(false);
  const go = (href: string) => {
    setOpen(false);
    if (onShopNavigate && href.startsWith("/shop/")) onShopNavigate(href.slice("/shop".length));
    else window.location.assign(href);
  };
  const pill = "relative flex items-center gap-1.5 px-3 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-sm";
  const badge = "absolute -top-0.5 right-0.5 min-w-5 h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center";
  const searchBox = (cls: string) => <HeaderSearch className={cls} go={go} />;

  return (
    <header className={`sticky top-0 z-50 bg-white dark:bg-[#0b1616] dark:text-white border-b border-gray-200 dark:border-[#1c2e2e] shadow-sm ${className}`}
      style={{ fontFamily: FONT, paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center gap-3 md:gap-6">
        <button className="lg:hidden p-2 -ml-2" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        {/* The logo is always the website's home page, from either app. */}
        <a href="/" className="flex items-center shrink-0" aria-label={logoAlt}>
          <img src={logoSrc} alt={logoAlt} className="h-10 md:h-14 w-auto max-w-[160px] object-contain object-left"
            onError={(e) => { if (logoFallback && e.currentTarget.src !== logoFallback) e.currentTarget.src = logoFallback; }} />
        </a>
        {searchBox("hidden md:flex flex-1 min-w-0")}
        <nav className="ml-auto flex items-center gap-1" aria-label="Account">
          <a href={`tel:${PHONE.tel}`} className="hidden xl:flex items-center gap-1.5 text-[#007b7d] font-bold text-sm hover:text-[#005f61] mr-1">
            <Phone className="h-4 w-4" />{PHONE.display}
          </a>
          <a href={s.signedIn ? "/shop/account" : "/shop/account/login"} onClick={shopClick(s.signedIn ? "/shop/account" : "/shop/account/login", onShopNavigate)} className={pill}>
            <User className="w-4 h-4" /><span className="hidden sm:inline">{s.signedIn ? s.firstName || "Account" : "Sign in"}</span>
          </a>
          {s.signedIn && (
            <a href="/shop/wishlist" onClick={shopClick("/shop/wishlist", onShopNavigate)} className={pill} aria-label="Wishlist">
              <Heart className="w-4 h-4" /><span className="hidden sm:inline">Wishlist</span>
              {s.wishlistCount > 0 && <span className={`${badge} bg-rose-500 text-white`}>{s.wishlistCount}</span>}
            </a>
          )}
          <a href="/shop/cart" onClick={shopClick("/shop/cart", onShopNavigate)} className={pill} aria-label="Cart">
            <ShoppingCart className="w-4 h-4" /><span className="hidden sm:inline">Cart</span>
            {s.cartCount > 0 && <span className={`${badge} bg-[#7bb8bd] text-gray-900`}>{s.cartCount}</span>}
          </a>
          {/* App-only controls (the website's theme and accessibility), last. */}
          {extras && <div className="hidden md:flex items-center">{extras}</div>}
        </nav>
      </div>
      <div className="hidden lg:flex max-w-7xl mx-auto px-4 pb-2">
        <SiteNavBar active={active} hashBase={hashBase} homeHref={homeHref} onShopNavigate={onShopNavigate} />
      </div>
      {open && (
        <div className="lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-gray-100 dark:border-[#1c2e2e]">
          {searchBox("md:hidden px-4 pt-3 pb-1 flex")}
          <div className="px-4 py-3">
            <SiteNavMobile hashBase={hashBase} homeHref={homeHref} onNavigate={() => setOpen(false)} onShopNavigate={onShopNavigate}
              initiallyOpen={active === "SHOP" ? "SHOP" : null} />
          </div>
        </div>
      )}
    </header>
  );
}
