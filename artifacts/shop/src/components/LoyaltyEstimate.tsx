import { Link } from "wouter";
import { Coins } from "lucide-react";
import { useLoyaltyEstimate } from "@/lib/loyalty";

/* "You've earned $X Koastal Koins" on the cart and checkout, from the same
   rule the till credits. A guest sees what signing in would earn them. */
export function LoyaltyEstimate({ lines, next = "/cart" }: { lines: { productId: number; variantId: number | null; qty: number }[]; next?: string }) {
  const { data } = useLoyaltyEstimate(lines);
  if (!data?.enabled || data.earned <= 0) return null;
  return (
    <div className="rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/60 border border-amber-200 p-3.5 flex gap-3 items-start">
      <span className="w-9 h-9 rounded-full bg-amber-400 text-white flex items-center justify-center shrink-0 shadow-sm"><Coins className="w-5 h-5" /></span>
      <div className="text-sm">
        {data.signedIn ? (
          <><p className="font-semibold text-amber-900">You've earned {data.formatted}</p><p className="text-amber-800/80">Added to your balance when this order is paid.</p></>
        ) : (
          <><p className="font-semibold text-amber-900">Earn {data.formatted} with this order</p>
            <p className="text-amber-800/80"><Link href={`/account/login?next=${encodeURIComponent(next)}`} className="underline font-medium">Sign in</Link> to collect them.</p></>
        )}
      </div>
    </div>
  );
}
