import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Phone, Mail, MapPin } from "lucide-react";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useShopInfo } from "@/lib/shop";
import { SiteHeader, ThemeToggle } from "@workspace/site-nav";
import { JustPurchased } from "./JustPurchased";
import { ComingSoon } from "./ComingSoon";
import { installLinkTracking, trackPageView } from "@/lib/track";

/* The header is the one the Koastal Kollective website uses too
   (@workspace/site-nav): logo, search, account and the site-wide menu, SHOP
   lit, its drop-down holding the categories. The shop hands it its live
   account, cart and wishlist state and routes its links without a reload. */
function Header() {
  const { data: info } = useShopInfo();
  const { count } = useCart();
  const { customer } = useAuth();
  const wishlist = useWishlist();
  const [, navigate] = useLocation();
  return (
    <SiteHeader
      logoFallback={info?.logoUrl ?? null}
      logoAlt={info?.businessName ?? "Koastal Kollective"}
      active="SHOP"
      hashBase="/"
      homeHref="/shop/"
      onShopNavigate={navigate}
      session={{ signedIn: !!customer, firstName: customer?.firstName || null, cartCount: count, wishlistCount: customer ? wishlist.count : 0 }}
      extras={<ThemeToggle />}
    />
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
          <a href="/" className="block text-stone-600 hover:text-ink">Koastal Kollective website</a>
          <Link href="/products" className="block text-stone-600 hover:text-ink">All products</Link>
          <Link href="/rewards" className="block text-stone-600 hover:text-ink">Rewards</Link>
          <Link href="/mail-in" className="block text-stone-600 hover:text-ink">Mail-in repairs</Link>
          <Link href="/account" className="block text-stone-600 hover:text-ink">My account</Link>
          <Link href="/cart" className="block text-stone-600 hover:text-ink">Cart</Link>
        </div>
      </div>
      <p className="text-center text-xs text-stone-400 pb-6">© {new Date().getFullYear()} {info?.businessName}. Prices include GST.</p>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  // Shop statistics: a page view per route, and every link click (lib/track.ts).
  const [location] = useLocation();
  useEffect(() => { trackPageView(location); }, [location]);
  useEffect(() => installLinkTracking(), []);
  return (
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <JustPurchased />
      <ComingSoon />
    </div>
  );
}
