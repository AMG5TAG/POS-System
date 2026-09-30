import { useState } from "react";
import { Heart } from "lucide-react";
import { useWishlist } from "@/lib/wishlist";

/* Outlined heart on a product image; tap to save (fills) or unsave. Renders
   nothing unless a customer is signed in. Sits over a link, so it stops the
   click from opening the product. */
export function WishlistHeart({ productId, name, className = "" }: { productId: number; name: string; className?: string }) {
  const { enabled, has, toggle } = useWishlist();
  const [pop, setPop] = useState(false);
  if (!enabled) return null;
  const saved = has(productId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from your wishlist` : `Save ${name} to your wishlist`}
      title={saved ? "Saved to your wishlist" : "Save to wishlist"}
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        if (!saved) { setPop(true); setTimeout(() => setPop(false), 300); }
        toggle(productId);
      }}
      className={`z-10 w-9 h-9 rounded-full bg-white/90 backdrop-blur shadow-sm border border-stone-200 flex items-center justify-center hover:scale-110 active:scale-95 transition ${className}`}
    >
      <Heart className={`w-[18px] h-[18px] transition-all duration-300 ${saved ? "fill-rose-500 text-rose-500" : "text-stone-600"} ${pop ? "scale-125" : ""}`} />
    </button>
  );
}
