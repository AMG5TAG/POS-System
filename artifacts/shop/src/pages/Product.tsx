import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { Loader2, Minus, Plus, ShieldCheck, Check, CalendarClock } from "lucide-react";
import { useCategories, useProduct, useShopInfo, formatDay } from "@/lib/shop";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { ProductTabs, type ProductTab } from "@/components/ProductTabs";
import { RelatedProducts } from "@/components/RelatedProducts";
import { Stars } from "@/components/Stars";
import { WishlistHeart } from "@/components/WishlistHeart";
import { ProductGallery } from "@/components/ProductGallery";
import type { MediaItem } from "@/lib/shop";

export default function Product() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading, isError } = useProduct(Number(id));
  const { data: cats } = useCategories();
  const { data: info } = useShopInfo();
  const { add } = useCart();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  // "#reviews" (the sign-in return path, or a link from the stars) opens Reviews.
  const [tab, setTab] = useState<ProductTab>(() => (window.location.hash === "#reviews" ? "reviews" : "description"));

  // A related product opens on this same page component: start it fresh.
  useEffect(() => {
    setVariantId(null); setQty(1); setAdded(false);
    if (window.location.hash !== "#reviews") setTab("description");
    window.scrollTo({ top: 0 });
  }, [id]);
  useEffect(() => {
    if (tab === "reviews" && window.location.hash === "#reviews" && p) document.getElementById("product-tabs")?.scrollIntoView();
  }, [p, tab]);

  const showReviews = () => {
    setTab("reviews");
    document.getElementById("product-tabs")?.scrollIntoView({ behavior: "smooth" });
  };

  if (isLoading) return <div className="py-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (isError || !p) return <div className="py-32 text-center text-stone-500">This product isn't available. <Link href="/products" className="text-brand underline">Keep shopping</Link></div>;

  const variant = p.variants.find((v) => v.id === variantId) ?? null;
  const needsVariant = p.variants.length > 0 && !variant;
  const price = variant?.price ?? p.price;
  const inStock = variant ? variant.inStock : p.inStock;
  const image = variant?.imageUrl ?? p.imageUrl;

  const addToCart = () => {
    add({ productId: p.id, variantId: variant?.id ?? null, name: p.name, variantName: variant?.name ?? null, price, imageUrl: image }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  // The product's category and every parent above it, top level first.
  const categoryPath: { id: number; name: string }[] = [];
  for (let c = cats?.find((x) => x.id === p.category?.id); c; c = cats?.find((x) => x.id === c!.parentId)) {
    categoryPath.unshift(c);
    if (categoryPath.length > 20) break; // guard against a parent cycle
  }
  if (categoryPath.length === 0 && p.category) categoryPath.push(p.category);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-stone-500 mb-6">
        <Link href="/products" className="hover:underline">Shop</Link>
        {categoryPath.map((c) => (
          <span key={c.id}> / <Link href={`/products?category=${c.id}`} className="hover:underline">{c.name}</Link></span>
        ))}
      </nav>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 lg:gap-12 items-start">
        {/* A chosen variant's own photo leads; the rest of the gallery follows. */}
        <ProductGallery alt={p.name} items={[
          ...(image ? [{ type: "image", url: image } as MediaItem] : []),
          ...p.media.filter((m) => m.url !== image),
        ]}>
          <WishlistHeart productId={p.id} name={p.name} className="absolute top-3 right-3 w-11 h-11" />
        </ProductGallery>
        <div className="space-y-5">
          {p.brand && <p className="text-sm uppercase tracking-wide text-stone-500">{p.brand}</p>}
          <div>
            <h1 className="text-3xl font-bold leading-tight break-words">{p.name}</h1>
            {p.category && (
              <p className="mt-1.5 text-sm text-stone-500 break-words">
                Category: <Link href={`/products?category=${p.category.id}`} className="hover:text-brand hover:underline">{p.category.name}</Link>
              </p>
            )}
          </div>
          {p.rating.count > 0 && (
            <button onClick={showReviews} className="flex items-center gap-2 text-sm text-stone-600 hover:text-brand">
              <Stars value={p.rating.average ?? 0} /> {p.rating.average?.toFixed(1)} · {p.rating.count} review{p.rating.count === 1 ? "" : "s"}
            </button>
          )}
          <p className="text-3xl font-extrabold">{money(price)} <span className="text-sm font-normal text-stone-500">inc. GST</span></p>
          {p.preOrder ? (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 space-y-1.5">
              <p className="font-semibold text-violet-800 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Available for pre-order</p>
              {p.preOrder.releaseDate && <p className="text-sm text-stone-700">Release date: <strong>{formatDay(p.preOrder.releaseDate)}</strong></p>}
              {p.preOrder.etaDate && <p className="text-sm text-stone-700">Estimated delivery: <strong>{formatDay(p.preOrder.etaDate)}</strong></p>}
              <p className="text-sm text-stone-600">
                Pre-order in store or call us{info?.phone ? <> on <a href={`tel:${info.phone}`} className="underline">{info.phone}</a></> : ""} — pay in full or leave a deposit, and we'll let you know the moment it arrives. Online pre-ordering is coming soon.
              </p>
            </div>
          ) : p.isService
            ? <p className="text-sky-700 text-sm font-medium">Service — we'll be in touch to arrange it after you order.</p>
            : inStock ? <p className="text-emerald-700 text-sm font-medium">In stock</p> : <p className="text-red-600 text-sm font-medium">Out of stock</p>}

          {p.variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Choose an option</p>
              <div className="flex flex-wrap gap-2">
                {p.variants.map((v) => (
                  <button key={v.id} onClick={() => setVariantId(v.id)} disabled={!v.inStock}
                    className={`px-4 h-10 rounded-full border text-sm ${variantId === v.id ? "border-brand bg-brand text-white" : "border-stone-300 hover:border-brand"} disabled:opacity-40 disabled:line-through`}>
                    {v.name}{v.price !== p.price ? ` · ${money(v.price)}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pre-orders can't go through the cart until online checkout exists. */}
          {!p.preOrder && <div className="flex items-center gap-3">
            <div className="flex items-center border border-stone-300 rounded-full h-11">
              <button className="px-3" aria-label="Less" onClick={() => setQty((n) => Math.max(1, n - 1))}><Minus className="w-4 h-4" /></button>
              <span className="w-8 text-center tabular-nums">{qty}</span>
              <button className="px-3" aria-label="More" onClick={() => setQty((n) => Math.min(99, n + 1))}><Plus className="w-4 h-4" /></button>
            </div>
            <button onClick={addToCart} disabled={needsVariant || (!inStock && !p.isService)}
              className="flex-1 h-11 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark disabled:opacity-40 flex items-center justify-center gap-2">
              {added ? <><Check className="w-4 h-4" /> Added</> : needsVariant ? "Choose an option" : "Add to cart"}
            </button>
          </div>}
          {added && <Link href="/cart" className="block text-sm text-brand underline">View cart</Link>}

          {p.warranty && (
            <p className="flex items-center gap-2 text-sm text-stone-600"><ShieldCheck className="w-4 h-4" />{p.warranty.duration} {p.warranty.unit} warranty</p>
          )}
          {p.sku && <p className="text-xs text-stone-400">SKU {p.sku}</p>}
        </div>
      </div>

      <ProductTabs product={p} tab={tab} onTab={setTab} />
      <RelatedProducts productId={p.id} />
    </div>
  );
}
