import { Link, Redirect } from "wouter";
import { Heart, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { ProductCard } from "@/components/ProductCard";

export default function Wishlist() {
  const { customer, loading } = useAuth();
  const { items, count } = useWishlist();
  if (loading) return <div className="py-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (!customer) return <Redirect to="/account/login?next=/wishlist" />;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Your wishlist</h1>
      <p className="text-sm text-stone-500 mb-6">{count} saved item{count === 1 ? "" : "s"}</p>
      {items.length === 0 ? (
        <div className="py-20 text-center text-stone-500 space-y-3">
          <Heart className="w-10 h-10 mx-auto text-stone-300" />
          <p>Nothing saved yet. Tap the heart on any product to keep it here.</p>
          <Link href="/products" className="inline-block text-brand font-medium underline">Browse products</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}
