import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { Category } from "@/lib/shop";

/* The shop's category bar. On desktop each top-level category opens a mega
   menu on hover (or keyboard focus): the category's picture and a "Shop all"
   link on the left, its subcategories as columns on the right, every level
   below listed under them. Touch screens get an accordion in the mobile menu
   instead, since there is no hover to open anything. */

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
const CLOSE_DELAY = 160; // grace period to cross from the bar into the panel

export function CategoryNav({ cats, onNavigate }: { cats: Category[]; onNavigate: () => void }) {
  const roots = useMemo(() => tree(cats), [cats]);
  const [openId, setOpenId] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [location] = useLocation();

  useEffect(() => { setOpenId(null); }, [location]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); window.clearTimeout(timer.current); };
  }, []);

  const openNow = (id: number | null) => { window.clearTimeout(timer.current); setOpenId(id); };
  const closeSoon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpenId(null), CLOSE_DELAY); };
  const active = roots.find((r) => r.id === openId && r.children.length > 0) ?? null;

  return (
    <>
      {/* Desktop bar + mega menu */}
      <div className="hidden md:block relative" onMouseLeave={closeSoon}>
        <nav className="mx-auto max-w-7xl px-4 flex items-center gap-1 text-sm overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Categories">
          <Link href="/products" onMouseEnter={() => openNow(null)} className="px-3 h-11 flex items-center font-semibold hover:text-brand">All products</Link>
          {roots.map((c) => {
            const has = c.children.length > 0;
            const isOpen = openId === c.id && has;
            return (
              <div key={c.id} onMouseEnter={() => openNow(c.id)} className="relative">
                <Link href={href(c.id)} onClick={onNavigate} onFocus={() => openNow(c.id)}
                  aria-haspopup={has || undefined} aria-expanded={has ? isOpen : undefined}
                  className={`px-3 h-11 flex items-center gap-1 transition-colors ${isOpen ? "text-brand" : "text-stone-700 hover:text-brand"}`}>
                  {c.name}
                  {has && <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />}
                </Link>
                <span className={`absolute left-3 right-3 bottom-0 h-0.5 rounded-full bg-brand origin-center transition-transform duration-200 ${isOpen ? "scale-x-100" : "scale-x-0"}`} />
              </div>
            );
          })}
        </nav>

        <div onMouseEnter={() => window.clearTimeout(timer.current)}
          className={`absolute inset-x-0 top-full z-40 transition-all duration-200 ease-out ${active ? "opacity-100 translate-y-0 visible" : "opacity-0 -translate-y-1 invisible pointer-events-none"}`}>
          {active && <MegaPanel node={active} onNavigate={() => { setOpenId(null); onNavigate(); }} />}
        </div>
      </div>

      {/* Mobile accordion */}
      <MobileCategories roots={roots} onNavigate={onNavigate} />
    </>
  );
}

function MegaPanel({ node, onNavigate }: { node: Node; onNavigate: () => void }) {
  const tint = node.color ?? "#007b7d";
  return (
    <div className="border-t border-stone-100 bg-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18)]">
      <div className="mx-auto max-w-7xl px-4 py-7 grid grid-cols-[220px_1fr] gap-8">
        <Link href={href(node.id)} onClick={onNavigate} className="group rounded-2xl overflow-hidden border border-stone-200 bg-white flex flex-col hover:shadow-md transition">
          <div className="aspect-[4/3] overflow-hidden" style={{ background: `linear-gradient(135deg, ${tint}26, ${tint}0d)` }}>
            {node.imageUrl
              ? <img src={node.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
              : <span className="w-full h-full flex items-center justify-center text-5xl font-extrabold" style={{ color: tint }}>{node.name.charAt(0)}</span>}
          </div>
          <div className="p-3.5">
            <p className="font-semibold leading-tight">{node.name}</p>
            <p className="text-xs text-stone-500 mt-0.5">{node.productCount} item{node.productCount === 1 ? "" : "s"}</p>
            <p className="mt-2 text-sm font-medium text-brand flex items-center gap-1">Shop all <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></p>
          </div>
        </Link>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-6 content-start max-h-[60vh] overflow-y-auto pr-1">
          {node.children.map((sub) => (
            <div key={sub.id} className="min-w-0">
              <Link href={href(sub.id)} onClick={onNavigate} className="flex items-baseline justify-between gap-2 font-semibold text-ink hover:text-brand pb-1.5 mb-1.5 border-b border-stone-100">
                <span className="truncate">{sub.name}</span>
                <span className="text-xs font-normal text-stone-400 tabular-nums">{sub.productCount}</span>
              </Link>
              <SubList nodes={sub.children} depth={0} onNavigate={onNavigate} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Every level below a column heading, indented one step per level. */
function SubList({ nodes, depth, onNavigate }: { nodes: Node[]; depth: number; onNavigate: () => void }) {
  if (nodes.length === 0) return null;
  return (
    <ul className={depth > 0 ? "ml-3 border-l border-stone-100 pl-2.5" : ""}>
      {nodes.map((n) => (
        <li key={n.id}>
          <Link href={href(n.id)} onClick={onNavigate} className="block py-1 text-sm text-stone-600 hover:text-brand hover:translate-x-0.5 transition truncate">{n.name}</Link>
          <SubList nodes={n.children} depth={depth + 1} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}

function MobileCategories({ roots, onNavigate }: { roots: Node[]; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const row = (n: Node, depth: number): React.ReactNode => (
    <div key={n.id}>
      <div className="flex items-center" style={{ paddingLeft: `${depth * 0.875}rem` }}>
        <Link href={href(n.id)} onClick={onNavigate} className={`flex-1 py-2.5 ${depth === 0 ? "font-medium" : "text-stone-600"}`}>{n.name}</Link>
        {n.children.length > 0 && (
          <button onClick={() => toggle(n.id)} aria-label={`${expanded.has(n.id) ? "Hide" : "Show"} ${n.name} subcategories`} aria-expanded={expanded.has(n.id)} className="w-10 h-10 flex items-center justify-center text-stone-500">
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded.has(n.id) ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {expanded.has(n.id) && n.children.map((k) => row(k, depth + 1))}
    </div>
  );
  return (
    <nav className="md:hidden px-4 pb-3 text-sm divide-y divide-stone-100" aria-label="Categories">
      <Link href="/products" onClick={onNavigate} className="block py-2.5 font-semibold">All products</Link>
      {roots.map((r) => row(r, 0))}
    </nav>
  );
}
