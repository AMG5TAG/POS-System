import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { Check, Loader2, Minus, Plus, X, CalendarClock } from "lucide-react";
import { useProduct, formatDay } from "@/lib/shop";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { ProductImage } from "./ProductCard";

/* Quick view: a product's essentials — photos, price, stock, options and Add
   to cart — over the list the shopper is browsing, so they don't lose their
   place. It reads the same /shop/products/:id as the product page, so the two
   always agree; anything more (specs, reviews) is "View full details".
   Same cart rules as the product page: an option must be chosen when the
   product has them, out-of-stock items can't be added, pre-orders can't go
   through the cart yet. */
export function QuickView({ productId, onClose }: { productId: number; onClose: () => void }) {
  const { data: p, isLoading, isError } = useProduct(productId);
  const { add } = useCart();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [imageIdx, setImageIdx] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes; the page behind doesn't scroll; focus starts in the dialog
  // and goes back to the button that opened it.
  // (onClose is read through a ref: callers pass a new function each render,
  // and re-running this would bounce focus out of the dialog and back.)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const variant = p?.variants.find((v) => v.id === variantId) ?? null;
  const images = p ? [
    ...(variant?.imageUrl ? [variant.imageUrl] : []),
    ...(p.imageUrl ? [p.imageUrl] : []),
    ...p.media.filter((m) => m.type === "image").map((m) => m.url),
  ].filter((u, i, all) => all.indexOf(u) === i) : [];
  useEffect(() => { setImageIdx(0); }, [variantId]);

  const body = () => {
    if (isLoading) return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
    if (isError || !p) return <p className="py-24 text-center text-stone-500">This product isn't available.</p>;

    const needsVariant = p.variants.length > 0 && !variant;
    const price = variant?.price ?? p.price;
    const inStock = variant ? variant.inStock : p.inStock;
    const addToCart = () => {
      add({ productId: p.id, variantId: variant?.id ?? null, name: p.name, variantName: variant?.name ?? null, price, imageUrl: variant?.imageUrl ?? p.imageUrl }, qty);
      setAdded(true);
    };

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="aspect-square rounded-xl border border-stone-200 bg-white p-4">
            <ProductImage src={images[imageIdx] ?? null} alt={p.name} />
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.slice(0, 8).map((u, i) => (
                <button key={u} onClick={() => setImageIdx(i)} aria-label={`Photo ${i + 1}`}
                  className={`shrink-0 w-14 h-14 rounded-lg border bg-white p-1 ${i === imageIdx ? "border-brand ring-1 ring-brand" : "border-stone-200"}`}>
                  <ProductImage src={u} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <div className="sm:pr-8">
            {p.brand && <p className="text-xs uppercase tracking-wide text-stone-500">{p.brand}</p>}
            <h2 id="quick-view-title" className="text-xl font-bold leading-tight break-words">{p.name}</h2>
            {p.category && <p className="mt-1 text-sm text-stone-500">Category: {p.category.name}</p>}
          </div>
          <p className="text-2xl font-bold">{money(price)}</p>

          {p.preOrder ? (
            <p className="text-sm font-medium text-violet-700 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4" /> Pre-order{p.preOrder.etaDate ? ` · ETA ${formatDay(p.preOrder.etaDate)}` : ""}
            </p>
          ) : p.isService
            ? <p className="text-sky-700 text-sm font-medium">Service</p>
            : inStock ? <p className="text-emerald-700 text-sm font-medium">In stock</p> : <p className="text-red-600 text-sm font-medium">Out of stock</p>}

          {p.description && <p className="text-sm text-stone-600 whitespace-pre-line line-clamp-4 break-words">{p.description}</p>}

          {p.variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Choose an option</p>
              <div className="flex flex-wrap gap-2">
                {p.variants.map((v) => (
                  <button key={v.id} onClick={() => { setVariantId(v.id); setAdded(false); }} disabled={!v.inStock}
                    className={`px-3.5 h-9 rounded-full border text-sm ${variantId === v.id ? "border-brand bg-brand text-white" : "border-stone-300 hover:border-brand"} disabled:opacity-40 disabled:line-through`}>
                    {v.name}{v.price !== p.price ? ` · ${money(v.price)}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!p.preOrder && (
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-stone-300 rounded-full h-11">
                <button className="px-3" aria-label="Less" onClick={() => setQty((n) => Math.max(1, n - 1))}><Minus className="w-4 h-4" /></button>
                <span className="w-8 text-center tabular-nums">{qty}</span>
                <button className="px-3" aria-label="More" onClick={() => setQty((n) => Math.min(99, n + 1))}><Plus className="w-4 h-4" /></button>
              </div>
              <button onClick={addToCart} disabled={needsVariant || (!inStock && !p.isService)}
                className="flex-1 h-11 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark disabled:opacity-40 flex items-center justify-center gap-2">
                {added ? <><Check className="w-4 h-4" /> Added</> : needsVariant ? "Choose an option" : "Add to cart"}
              </button>
            </div>
          )}
          {added && <Link href="/cart" onClick={onClose} className="block text-sm text-brand underline">View cart</Link>}

          <Link href={`/product/${p.id}`} onClick={onClose} className="inline-block text-sm font-medium text-brand hover:underline">
            View full details →
          </Link>
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="quick-view-title"
        className="relative w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-7 shadow-2xl outline-none">
        <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100">
          <X className="w-5 h-5" />
        </button>
        {body()}
      </div>
    </div>,
    document.body,
  );
}
