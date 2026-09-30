import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Search, ShoppingCart, User, Menu, X, Phone, Mail, MapPin } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useCategories, useShopInfo } from "@/lib/shop";

function Header() {
  const { data: info } = useShopInfo();
  const { data: cats } = useCategories();
  const { count } = useCart();
  const { customer } = useAuth();
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const topCats = (cats ?? []).filter((c) => c.parentId == null).slice(0, 8);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/products?search=${encodeURIComponent(q.trim())}` : "/products");
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-4">
        <button className="md:hidden p-2 -ml-2" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {info?.logoUrl ? <img src={info.logoUrl} alt="" className="w-9 h-9 rounded-full object-contain" /> : null}
          <span className="font-bold text-lg tracking-tight">{info?.businessName ?? "Shop"}</span>
        </Link>
        <form onSubmit={submit} className="hidden md:flex flex-1 max-w-xl mx-auto">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products and services"
              className="w-full h-10 rounded-full border border-stone-300 bg-stone-50 pl-9 pr-4 text-sm outline-none focus:border-brand focus:bg-white" />
          </div>
        </form>
        <nav className="ml-auto flex items-center gap-1">
          <Link href={customer ? "/account" : "/account/login"} className="flex items-center gap-1.5 px-3 h-10 rounded-full hover:bg-stone-100 text-sm">
            <User className="w-4 h-4" /><span className="hidden sm:inline">{customer ? customer.firstName || "Account" : "Sign in"}</span>
          </Link>
          <Link href="/cart" className="relative flex items-center gap-1.5 px-3 h-10 rounded-full hover:bg-stone-100 text-sm" aria-label="Cart">
            <ShoppingCart className="w-4 h-4" /><span className="hidden sm:inline">Cart</span>
            {count > 0 && (
              <span className="absolute -top-0.5 right-0.5 min-w-5 h-5 px-1 rounded-full bg-brand-light text-ink text-[11px] font-bold flex items-center justify-center">{count}</span>
            )}
          </Link>
        </nav>
      </div>
      <div className={`${open ? "block" : "hidden"} md:block border-t border-stone-100`}>
        <div className="mx-auto max-w-7xl px-4 py-2 flex flex-col md:flex-row md:items-center gap-1 md:gap-5 text-sm">
          <form onSubmit={submit} className="md:hidden mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
              className="w-full h-10 rounded-full border border-stone-300 px-4 text-sm outline-none focus:border-brand" />
          </form>
          <Link href="/products" onClick={() => setOpen(false)} className="py-1 font-medium hover:text-brand">All products</Link>
          {topCats.map((c) => (
            <Link key={c.id} href={`/products?category=${c.id}`} onClick={() => setOpen(false)} className="py-1 text-stone-600 hover:text-brand">{c.name}</Link>
          ))}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { data: info } = useShopInfo();
  const hours = Object.entries(info?.openingHours ?? {}).filter(([, v]) => typeof v === "string" && v);
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto max-w-7xl px-4 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="space-y-2">
          <p className="font-bold text-base">{info?.businessName}</p>
          {info?.tagline && <p className="text-stone-600">{info.tagline}</p>}
          {info?.abn && <p className="text-stone-500">ABN {info.abn}</p>}
        </div>
        <div className="space-y-2">
          <p className="font-semibold">Contact</p>
          {info?.phone && <a href={`tel:${info.phone}`} className="flex items-center gap-2 text-stone-600 hover:text-ink"><Phone className="w-4 h-4" />{info.phone}</a>}
          {info?.email && <a href={`mailto:${info.email}`} className="flex items-center gap-2 text-stone-600 hover:text-ink"><Mail className="w-4 h-4" />{info.email}</a>}
          {info?.address && <p className="flex items-start gap-2 text-stone-600"><MapPin className="w-4 h-4 mt-0.5 shrink-0" />{info.address}</p>}
        </div>
        {hours.length > 0 && (
          <div className="space-y-1">
            <p className="font-semibold mb-1">Opening hours</p>
            {hours.map(([d, v]) => <p key={d} className="text-stone-600 flex justify-between gap-4 max-w-56"><span className="capitalize">{d}</span><span>{String(v)}</span></p>)}
          </div>
        )}
        <div className="space-y-2">
          <p className="font-semibold">Shop</p>
          <Link href="/products" className="block text-stone-600 hover:text-ink">All products</Link>
          <Link href="/account" className="block text-stone-600 hover:text-ink">My account</Link>
          <Link href="/cart" className="block text-stone-600 hover:text-ink">Cart</Link>
        </div>
      </div>
      <p className="text-center text-xs text-stone-400 pb-6">© {new Date().getFullYear()} {info?.businessName}. Prices include GST.</p>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
