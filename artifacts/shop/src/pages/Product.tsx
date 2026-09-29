import { useState } from "react";
import { Link, useParams } from "wouter";
import { Loader2, Minus, Plus, ShieldCheck, Check } from "lucide-react";
import { useProduct } from "@/lib/shop";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { ProductImage } from "@/components/ProductCard";

export default function Product() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading, isError } = useProduct(Number(id));
  const { add } = useCart();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  if (isLoading) return <div className="py-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (isError || !p) return <div className="py-32 text-center text-stone-500">This product isn't available. <Link href="/shop" className="text-brand-dark underline">Keep shopping</Link></div>;

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-stone-500 mb-6">
        <Link href="/shop" className="hover:underline">Shop</Link>
        {p.category && <> / <Link href={`/shop?category=${p.category.id}`} className="hover:underline">{p.category.name}</Link></>}
      </nav>
      <div className="grid md:grid-cols-2 gap-10">
        <div className="aspect-square rounded-2xl bg-white border border-stone-200 p-8"><ProductImage src={image} alt={p.name} /></div>
        <div className="space-y-5">
          {p.brand && <p className="text-sm uppercase tracking-wide text-stone-500">{p.brand}</p>}
          <h1 className="text-3xl font-bold leading-tight break-words">{p.name}</h1>
          <p className="text-3xl font-extrabold">{money(price)} <span className="text-sm font-normal text-stone-500">inc. GST</span></p>
          {p.isService
            ? <p className="text-sky-700 text-sm font-medium">Service — we'll be in touch to arrange it after you order.</p>
            : inStock ? <p className="text-emerald-700 text-sm font-medium">In stock</p> : <p className="text-stone-500 text-sm font-medium">Out of stock</p>}

          {p.variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Choose an option</p>
              <div className="flex flex-wrap gap-2">
                {p.variants.map((v) => (
                  <button key={v.id} onClick={() => setVariantId(v.id)} disabled={!v.inStock}
                    className={`px-4 h-10 rounded-full border text-sm ${variantId === v.id ? "border-ink bg-ink text-white" : "border-stone-300 hover:border-ink"} disabled:opacity-40 disabled:line-through`}>
                    {v.name}{v.price !== p.price ? ` · ${money(v.price)}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center border border-stone-300 rounded-full h-11">
              <button className="px-3" aria-label="Less" onClick={() => setQty((n) => Math.max(1, n - 1))}><Minus className="w-4 h-4" /></button>
              <span className="w-8 text-center tabular-nums">{qty}</span>
              <button className="px-3" aria-label="More" onClick={() => setQty((n) => Math.min(99, n + 1))}><Plus className="w-4 h-4" /></button>
            </div>
            <button onClick={addToCart} disabled={needsVariant || (!inStock && !p.isService)}
              className="flex-1 h-11 rounded-full bg-brand text-ink font-semibold hover:brightness-95 disabled:opacity-40 flex items-center justify-center gap-2">
              {added ? <><Check className="w-4 h-4" /> Added</> : needsVariant ? "Choose an option" : "Add to cart"}
            </button>
          </div>
          {added && <Link href="/cart" className="block text-sm text-brand-dark underline">View cart</Link>}

          {p.warranty && (
            <p className="flex items-center gap-2 text-sm text-stone-600"><ShieldCheck className="w-4 h-4" />{p.warranty.duration} {p.warranty.unit} warranty</p>
          )}
          {p.description && <div className="prose prose-sm max-w-none whitespace-pre-line text-stone-700 break-words">{p.description}</div>}
          {p.sku && <p className="text-xs text-stone-400">SKU {p.sku}</p>}
        </div>
      </div>
    </div>
  );
}
