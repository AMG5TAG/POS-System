import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ImageOff } from "lucide-react";
import { money } from "@/lib/format";
import type { ProductSummary } from "@/lib/shop";
import { WishlistHeart } from "./WishlistHeart";

/* A missing or unreachable photo shows the placeholder, never a broken image. */
export function ProductImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed
    ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`w-full h-full object-contain ${className}`} />
    : <div className={`w-full h-full flex items-center justify-center text-stone-300 ${className}`}><ImageOff className="w-8 h-8" /></div>;
}

export function ProductCard({ p }: { p: ProductSummary }) {
  return (
    <div className="group relative flex flex-col w-full rounded-2xl bg-white border border-stone-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition">
    <WishlistHeart productId={p.id} name={p.name} className="absolute top-2.5 right-2.5" />
    <Link href={`/product/${p.id}`} className="flex flex-col flex-1">
      <div className="aspect-square bg-white p-4"><ProductImage src={p.imageUrl} alt={p.name} className="group-hover:scale-105 transition" /></div>
      <div className="p-4 pt-0 flex flex-col gap-1 flex-1">
        {p.brand && <p className="text-xs uppercase tracking-wide text-stone-500">{p.brand}</p>}
        <p className="font-medium leading-snug line-clamp-2">{p.name}</p>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <span className="font-bold">{money(p.price)}</span>
          {p.isService
            ? <span className="text-xs text-sky-700">Service</span>
            : p.inStock ? <span className="text-xs text-emerald-700">In stock</span> : <span className="text-xs text-red-600">Out of stock</span>}
        </div>
      </div>
    </Link>
    </div>
  );
}
