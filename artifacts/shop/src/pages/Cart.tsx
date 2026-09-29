import { Link } from "wouter";
import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { gstIn, money } from "@/lib/format";
import { ProductImage } from "@/components/ProductCard";

export default function Cart() {
  const { lines, subtotal, setQty, remove } = useCart();

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center space-y-4">
        <ShoppingCart className="w-10 h-10 mx-auto text-stone-300" />
        <p className="text-lg font-medium">Your cart is empty</p>
        <Link href="/shop" className="inline-flex h-11 items-center px-6 rounded-full bg-ink text-white">Start shopping</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 grid lg:grid-cols-[1fr_320px] gap-8 items-start">
      <div>
        <h1 className="text-2xl font-bold mb-5">Your cart</h1>
        <ul className="divide-y divide-stone-200 rounded-2xl bg-white border border-stone-200">
          {lines.map((l) => (
            <li key={`${l.productId}-${l.variantId}`} className="flex gap-4 p-4">
              <Link href={`/product/${l.productId}`} className="w-20 h-20 shrink-0 rounded-lg border border-stone-100 p-1"><ProductImage src={l.imageUrl} alt={l.name} /></Link>
              <div className="flex-1 min-w-0">
                <Link href={`/product/${l.productId}`} className="font-medium hover:underline line-clamp-2">{l.name}</Link>
                {l.variantName && <p className="text-sm text-stone-500">{l.variantName}</p>}
                <p className="text-sm text-stone-500">{money(l.price)} each</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center border border-stone-300 rounded-full h-9">
                    <button className="px-2.5" aria-label="Less" onClick={() => setQty(l.productId, l.variantId, l.qty - 1)}><Minus className="w-3.5 h-3.5" /></button>
                    <span className="w-7 text-center text-sm tabular-nums">{l.qty}</span>
                    <button className="px-2.5" aria-label="More" onClick={() => setQty(l.productId, l.variantId, l.qty + 1)}><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button onClick={() => remove(l.productId, l.variantId)} className="text-stone-400 hover:text-red-600" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <p className="font-semibold tabular-nums">{money(l.price * l.qty)}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-white border border-stone-200 p-5 space-y-3 lg:sticky lg:top-24">
        <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold tabular-nums">{money(subtotal)}</span></div>
        <div className="flex justify-between text-sm text-stone-500"><span>Includes GST</span><span className="tabular-nums">{money(gstIn(subtotal))}</span></div>
        <p className="text-sm text-stone-500">Shipping or click & collect is chosen at checkout.</p>
        <Link href="/checkout" className="flex h-11 items-center justify-center rounded-full bg-brand text-ink font-semibold hover:brightness-95">Checkout</Link>
        <Link href="/shop" className="block text-center text-sm text-stone-600 hover:underline">Continue shopping</Link>
      </div>
    </div>
  );
}
