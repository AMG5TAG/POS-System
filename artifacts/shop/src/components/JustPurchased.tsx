import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingBag, X } from "lucide-react";
import { useRecentPurchases } from "@/lib/shop";

/* "Just purchased" pop-up, bottom-left: products sold in the last 24 hours
   (GET /shop/recent-purchases), one at a time. It says what sold and roughly
   when — never who bought it. Closing it keeps it away for the rest of the
   visit, and it stays off the cart and checkout-type pages where it would only
   distract. */

const FIRST_DELAY = 8_000;
const SHOW_FOR = 6_000;
const GAP = 25_000;
const DISMISS_KEY = "shop.justPurchased.dismissed";
const QUIET_PATHS = ["/cart", "/checkout", "/account"];

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return mins < 5 ? "just now" : `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? "an hour ago" : `${hrs} hours ago`;
}

export function JustPurchased() {
  const { data } = useRecentPurchases();
  const [location] = useLocation();
  const [index, setIndex] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const quiet = QUIET_PATHS.some((p) => location === p || location.startsWith(`${p}/`));
  const items = data ?? [];

  useEffect(() => {
    if (dismissed || quiet || items.length === 0) { setVisible(false); return; }
    let t: number;
    const cycle = (delay: number) => {
      t = window.setTimeout(() => {
        setIndex((i) => (i + 1) % items.length);
        setVisible(true);
        t = window.setTimeout(() => { setVisible(false); cycle(GAP); }, SHOW_FOR);
      }, delay);
    };
    cycle(FIRST_DELAY);
    return () => window.clearTimeout(t);
  }, [dismissed, quiet, items.length]);

  const item = index >= 0 ? items[index % items.length] : undefined;
  if (!item || dismissed || quiet) return null;

  const close = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* this visit only */ }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-4 z-40 w-[calc(100vw-2rem)] max-w-xs transition-all duration-300 motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="relative flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2.5 pr-8 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)]">
        <Link href={`/product/${item.id}`} className="flex items-center gap-3 min-w-0">
          <span className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-stone-100 flex items-center justify-center">
            {item.imageUrl
              ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
              : <ShoppingBag className="w-6 h-6 text-stone-400" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand">Just purchased</span>
            <span className="block text-sm font-medium leading-snug line-clamp-2 hover:text-brand">{item.name}</span>
            <span className="block text-xs text-stone-500">{ago(item.purchasedAt)}</span>
          </span>
        </Link>
        <button onClick={close} aria-label="Hide recent purchases" className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full text-stone-400 hover:text-ink hover:bg-stone-100">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
