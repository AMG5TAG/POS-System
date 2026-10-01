import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Globe, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useShopInfo } from "@/lib/shop";
import { COMING_SOON, OPEN_WHILE_CLOSED } from "@/lib/launch";

/* Covers the shop until launch. Shown while the sign-in check is still
   loading too, so a visitor never glimpses the shop behind it; a signed-in
   shopper sees it vanish once /shop/auth/me answers. This is a curtain, not
   access control — the catalogue API is public either way. */
export function ComingSoon() {
  const { customer, loading } = useAuth();
  const { data: info } = useShopInfo();
  const [path] = useLocation();
  const show = COMING_SOON && !customer && !OPEN_WHILE_CLOSED.includes(path);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md px-4"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      role="dialog" aria-modal="true" aria-labelledby="coming-soon-title">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-stone-200 p-8 text-center">
        {info?.logoUrl && <img src={info.logoUrl} alt={info.businessName ?? ""} className="h-12 w-auto mx-auto mb-6 object-contain" />}
        <p className="inline-block rounded-full bg-brand-50 text-brand px-3 py-1 text-xs font-bold uppercase tracking-wider">Coming soon</p>
        <h1 id="coming-soon-title" className="mt-4 text-2xl font-bold tracking-tight">Our online shop is on its way</h1>
        <p className="mt-3 text-stone-600">We're putting the finishing touches on the {info?.businessName ?? "Koastal Kollective"} shop. Check back soon — in the meantime, we're open in store and online.</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          {/* The website sits outside the shop's /shop router base: a plain link. */}
          <a href="/" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark">
            <Globe className="w-4 h-4" /> Visit our website
          </a>
          {!loading && (
            <Link href="/account/login" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full border border-stone-300 font-semibold hover:bg-stone-50">
              <LogIn className="w-4 h-4" /> Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
