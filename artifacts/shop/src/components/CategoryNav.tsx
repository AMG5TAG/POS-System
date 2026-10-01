import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, ChevronLeft, ChevronRight, Home, Mail, Star } from "lucide-react";
import type { Category } from "@/lib/shop";

/* The shop's category bar, styled after koastal.com.au's menu: a row of
   slanted tabs, each in its category's colour (Products › Categories, the
   Koastal teal when none is set), and on hover a plain white list of that
   category's level-2 subcategories that fill with the same colour. The first
   item, "Shop all …", is the featured one — a coloured left edge on a light
   tint, as the website marks its featured link. A subcategory with its own
   subcategories pops out a flyout list beside it, to any depth — to the right,
   or to the left when the menu sits near the right edge of the window.
   Touch screens get the accordion in the mobile menu, since they can't hover.
   Both sit under the site-wide Koastal Kollective menu (@workspace/site-nav):
   the bar beneath its row of tabs, the accordion inside its SHOP item. */

type Node = Category & { children: Node[] };

function tree(cats: Category[]): Node[] {
  const byId = new Map<number, Node>(cats.map((c) => [c.id, { ...c, children: [] }]));
  const roots: Node[] = [];
  byId.forEach((n) => {
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n); else roots.push(n);
  });
  return roots;
}

const href = (id: number) => `/products?category=${id}`;
const CLOSE_DELAY = 160; // grace period to cross from a tab into its list
export const BRAND = "#007b7d";
const colourOf = (c: { color: string | null }) => c.color || BRAND;
// Any CSS colour a merchant saved, lightened for the featured item's tint.
const tint = (colour: string) => `color-mix(in srgb, ${colour} 10%, white)`;

/* One slanted tab: the box is skewed, its label skewed back upright. */
function Tab({ colour, active, children }: { colour: string; active?: boolean; children: React.ReactNode }) {
  return (
    <span className={`h-full flex items-center justify-center px-5 text-xs font-bold text-white whitespace-nowrap tracking-wide uppercase transition-[filter] ${active ? "brightness-110" : "hover:brightness-110"}`}
      style={{ backgroundColor: colour, transform: "skewX(-20deg)" }}>
      <span className="flex items-center gap-1" style={{ transform: "skewX(20deg)" }}>{children}</span>
    </span>
  );
}

function MenuItem({ to, colour, featured, active, onNavigate, children }: { to: string; colour: string; featured?: boolean; active?: boolean; onNavigate: () => void; children: React.ReactNode }) {
  const [hovered, setHover] = useState(false);
  // An item whose flyout is open stays lit while the pointer is in the flyout.
  const hover = hovered || !!active;
  if (featured) {
    return (
      <Link href={to} onClick={onNavigate} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="flex items-center gap-2 mx-1 mb-1 px-3 py-2 text-sm font-bold rounded-sm border-l-4 transition-colors"
        style={{ borderLeftColor: colour, backgroundColor: hover ? colour : tint(colour), color: hover ? "#fff" : colour }}>
        <Star className="w-4 h-4 shrink-0" fill="currentColor" />{children}
      </Link>
    );
  }
  return (
    <Link href={to} onClick={onNavigate} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm transition-colors"
      style={{ backgroundColor: hover ? colour : "transparent", color: hover ? "#fff" : undefined }}>
      {children}
    </Link>
  );
}

/* A list of subcategories; one with children of its own pops out another list
   beside it on hover (or keyboard focus inside it). */
function SubMenu({ nodes, colour, flipLeft, onNavigate }: { nodes: Node[]; colour: string; flipLeft: boolean; onNavigate: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      {nodes.map((n) => {
        const has = n.children.length > 0;
        return (
          <div key={n.id} className="relative" onMouseEnter={() => setOpen(n.id)} onMouseLeave={() => setOpen((o) => (o === n.id ? null : o))}
            onFocus={() => setOpen(n.id)}>
            <MenuItem to={href(n.id)} colour={colour} onNavigate={onNavigate} active={has && open === n.id}>
              <span className="truncate">{n.name}</span>
              <span className="flex items-center gap-1 text-xs opacity-60 tabular-nums">
                {n.productCount}
                {has && (flipLeft ? <ChevronLeft className="w-3.5 h-3.5 -order-1" /> : <ChevronRight className="w-3.5 h-3.5" />)}
              </span>
            </MenuItem>
            {has && open === n.id && (
              <div className={`absolute top-0 ${flipLeft ? "right-full" : "left-full"} -mt-1 bg-white border border-stone-200 shadow-lg rounded-sm min-w-[220px] max-w-[320px] py-1 z-10`}>
                <MenuItem to={href(n.id)} colour={colour} featured onNavigate={onNavigate}>All {n.name}</MenuItem>
                <SubMenu nodes={n.children} colour={colour} flipLeft={flipLeft} onNavigate={onNavigate} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* `variant` picks the half to render: the header places the desktop bar beside
   the logo and the mobile accordion in the collapsible menu. */
export function CategoryNav({ cats, onNavigate, variant }: { cats: Category[]; onNavigate: () => void; variant: "desktop" | "mobile" }) {
  const roots = useMemo(() => tree(cats), [cats]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [flipLeft, setFlipLeft] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<number, HTMLElement>());
  const [location] = useLocation();

  useEffect(() => { setOpenId(null); }, [location]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); window.clearTimeout(timer.current); };
  }, []);

  /* The list is drawn outside the bar (which scrolls sideways, and so would
     clip it) and lined up under its tab — kept on screen at the right edge. */
  const openNow = (id: number | null) => {
    window.clearTimeout(timer.current);
    const tab = id != null ? tabs.current.get(id) : undefined;
    const box = wrap.current?.getBoundingClientRect();
    if (tab && box) {
      const t = tab.getBoundingClientRect();
      setLeft(Math.max(0, Math.min(t.left - box.left, box.width - 240)));
      // Flyouts need ~240px per level beside the list; open them leftwards
      // when there isn't room to the right.
      setFlipLeft(t.left + 240 + 480 > window.innerWidth);
    }
    setOpenId(id);
  };
  const closeSoon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpenId(null), CLOSE_DELAY); };
  const active = roots.find((r) => r.id === openId && r.children.length > 0) ?? null;
  const done = () => { setOpenId(null); onNavigate(); };

  if (variant === "mobile") return <MobileCategories roots={roots} onNavigate={onNavigate} />;

  return (
    <>
      {/* Desktop: slanted tabs + drop-down lists */}
      <div ref={wrap} className="relative" onMouseLeave={closeSoon}>
        <nav className="h-11 flex items-stretch gap-px overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Categories">
          <Link href="/" onClick={onNavigate} onMouseEnter={() => openNow(null)} className="flex shrink-0 pl-2"><Tab colour={BRAND}><Home className="w-3.5 h-3.5" /> Home</Tab></Link>
          <Link href="/products" onMouseEnter={() => openNow(null)} className="flex shrink-0"><Tab colour={BRAND}>All products</Tab></Link>
          {roots.map((c) => {
            const has = c.children.length > 0;
            const isOpen = openId === c.id && has;
            return (
              <Link key={c.id} href={href(c.id)} onClick={onNavigate}
                ref={(el: HTMLAnchorElement | null) => { if (el) tabs.current.set(c.id, el); else tabs.current.delete(c.id); }}
                onMouseEnter={() => openNow(c.id)} onFocus={() => openNow(c.id)}
                aria-haspopup={has || undefined} aria-expanded={has ? isOpen : undefined}
                className="flex shrink-0">
                <Tab colour={colourOf(c)} active={isOpen}>
                  {c.name}
                  {has && <ChevronDown className={`h-4 w-4 mt-0.5 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />}
                </Tab>
              </Link>
            );
          })}
          <Link href="/mail-in" onMouseEnter={() => openNow(null)} className="ml-auto flex shrink-0 pr-2">
            <Tab colour={BRAND}><Mail className="w-3.5 h-3.5" /> Mail-In Repairs</Tab>
          </Link>
        </nav>

        <div onMouseEnter={() => window.clearTimeout(timer.current)}
          style={{ left }}
          className={`absolute top-full z-40 transition-opacity duration-100 ${active ? "visible opacity-100" : "invisible opacity-0 pointer-events-none"}`}
          aria-hidden={!active}>
          {/* No overflow on the list: it would clip the flyouts beside it. */}
          {active && (
            <div className="bg-white border border-stone-200 shadow-lg rounded-sm min-w-[220px] max-w-[320px] py-1">
              <MenuItem to={href(active.id)} colour={colourOf(active)} featured onNavigate={done}>Shop all {active.name}</MenuItem>
              <SubMenu key={active.id} nodes={active.children} colour={colourOf(active)} flipLeft={flipLeft} onNavigate={done} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MobileCategories({ roots, onNavigate }: { roots: Node[]; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const row = (n: Node, depth: number): React.ReactNode => (
    <div key={n.id}>
      <div className="flex items-center" style={{ paddingLeft: `${depth * 0.875}rem` }}>
        {/* Top-level rows carry their category's colour as a left bar, like the desktop tabs. */}
        <Link href={href(n.id)} onClick={onNavigate}
          className={`flex-1 py-2.5 ${depth === 0 ? "font-bold border-l-4 pl-2.5" : "text-stone-600"}`}
          style={depth === 0 ? { borderLeftColor: colourOf(n) } : undefined}>{n.name}</Link>
        {depth === 0 && n.children.length > 0 && (
          <button onClick={() => toggle(n.id)} aria-label={`${expanded.has(n.id) ? "Hide" : "Show"} ${n.name} subcategories`} aria-expanded={expanded.has(n.id)} className="w-10 h-10 flex items-center justify-center text-stone-500">
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded.has(n.id) ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {depth === 0 && expanded.has(n.id) && n.children.map((k) => row(k, depth + 1))}
    </div>
  );
  return (
    <nav className="pl-3 text-sm divide-y divide-stone-100" aria-label="Categories">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 py-2.5 font-semibold"><Home className="w-4 h-4" /> Home</Link>
      <Link href="/products" onClick={onNavigate} className="block py-2.5 font-semibold">All products</Link>
      {roots.map((r) => row(r, 0))}
      <Link href="/mail-in" onClick={onNavigate} className="flex items-center gap-2 py-2.5 font-semibold text-brand"><Mail className="w-4 h-4" /> Mail-In Repairs</Link>
    </nav>
  );
}
