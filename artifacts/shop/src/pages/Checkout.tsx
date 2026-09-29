import { Link } from "wouter";
import { useShopInfo } from "@/lib/shop";

/* Stage 2 builds checkout (payment, shipping / click & collect). Until then the
   cart can't be paid for online — say so plainly rather than half-work. */
export default function Checkout() {
  const { data: info } = useShopInfo();
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center space-y-4">
      <h1 className="text-2xl font-bold">Online checkout is coming soon</h1>
      <p className="text-stone-600">Your cart is saved. To order now, call us{info?.phone ? <> on <a href={`tel:${info.phone}`} className="underline">{info.phone}</a></> : ""} or visit the store.</p>
      <Link href="/cart" className="inline-flex h-11 items-center px-6 rounded-full border border-stone-300">Back to cart</Link>
    </div>
  );
}
