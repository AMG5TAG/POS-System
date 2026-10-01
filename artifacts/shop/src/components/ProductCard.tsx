import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Eye, ImageOff } from "lucide-react";
import { money } from "@/lib/format";
import { formatDay, type ProductSummary } from "@/lib/shop";
import { WishlistHeart } from "./WishlistHeart";
import { QuickView } from "./QuickView";

/* A missing or unreachable photo shows the placeholder, never a broken image. */
export function ProductImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed
    ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`w-full h-full object-contain ${className}`} />
    : <div className={`w-full h-full flex items-center justify-center text-stone-300 ${className}`}><ImageOff className="w-8 h-8" /></div>;
}

export function ProductCard({ p }: { p: ProductSummary }) {
  const [quick, setQuick] = useState(false);
  return (
    <div className="group relative flex flex-col w-full rounded-2xl bg-white border border-stone-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition">
    <WishlistHeart productId={p.id} name={p.name} className="absolute top-2.5 right-2.5" />
    {p.preOrder && <span className="absolute top-3 left-3 z-10 rounded-full bg-violet-600 text-white text-[11px] font-bold uppercase tracking-wide px-2.5 py-1">Pre-order</span>}
    {/* Quick view sits over the photo: shown on hover or keyboard focus where
        there is a pointer, always on touch screens (no hover to reveal it). */}
    <div className="relative">
      <Link href={`/product/${p.id}`} className="block aspect-square bg-white p-4" tabIndex={-1} aria-hidden="true">
        <ProductImage src={p.imageUrl} alt="" className="group-hover:scale-105 transition" />
      </Link>
      <button type="button" onClick={() => setQuick(true)} aria-label={`Quick view: ${p.name}`}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-white/95 border border-stone-200 shadow-sm text-sm font-medium text-stone-800 hover:bg-brand hover:text-white hover:border-brand transition
          [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100">
        <Eye className="w-4 h-4" /> Quick view
      </button>
    </div>
    <Link href={`/product/${p.id}`} className="flex flex-col flex-1">
      <div className="p-4 pt-0 flex flex-col gap-1 flex-1">
        {p.brand && <p className="text-xs uppercase tracking-wide text-stone-500">{p.brand}</p>}
        <p className="font-medium leading-snug line-clamp-2">{p.name}</p>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <span className="font-bold">{money(p.price)}</span>
          {p.preOrder
            ? <span className="text-xs font-semibold text-violet-700">Pre-order{p.preOrder.etaDate ? ` · ETA ${formatDay(p.preOrder.etaDate)}` : ""}</span>
            : p.isService
            ? <span className="text-xs text-sky-700">Service</span>
            : p.inStock ? <span className="text-xs text-emerald-700">In stock</span> : <span className="text-xs text-red-600">Out of stock</span>}
        </div>
      </div>
    </Link>
    {quick && <QuickView productId={p.id} onClose={() => setQuick(false)} />}
    </div>
  );
}
