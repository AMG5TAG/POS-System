import { Link } from "wouter";
import { Coins, Check, Cake } from "lucide-react";
import { useLoyaltyInfo } from "@/lib/loyalty";
import { useAuth } from "@/lib/auth";

/* The loyalty program explained, from the POS loyalty settings — shown on the
   home page and as the /rewards page. Hidden when the program is switched off. */
export function RewardsSection({ compact = false }: { compact?: boolean }) {
  const { data } = useLoyaltyInfo();
  const { customer } = useAuth();
  if (!data?.enabled || !data.headline) return null;
  return (
    <section className={compact ? "mx-auto max-w-7xl px-4 mt-14" : "mx-auto max-w-5xl px-4 py-10"} aria-labelledby="rewards-heading">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark text-white p-7 md:p-10">
        <Coins className="absolute -right-6 -bottom-8 w-56 h-56 text-white/10 rotate-12" aria-hidden />
        <div className="relative grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 h-8 text-sm font-medium"><Coins className="w-4 h-4" /> Rewards</p>
            <h2 id="rewards-heading" className="text-3xl md:text-4xl font-extrabold tracking-tight">{data.name}</h2>
            <p className="text-lg md:text-xl text-white/90">{data.headline}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              {customer
                ? <Link href="/account" className="inline-flex h-11 items-center px-6 rounded-full bg-white text-brand font-semibold hover:bg-brand-50">See my balance</Link>
                : <Link href="/account/register" className="inline-flex h-11 items-center px-6 rounded-full bg-white text-brand font-semibold hover:bg-brand-50">Join free</Link>}
              {compact && <Link href="/rewards" className="inline-flex h-11 items-center px-6 rounded-full border border-white/40 font-medium hover:bg-white/10">How it works</Link>}
            </div>
          </div>
          <ul className="space-y-3 text-white/90">
            {[
              `Every purchase earns ${data.unit} automatically, in store or online.`,
              ...data.details,
            ].map((d) => (
              <li key={d} className="flex gap-3 items-start">
                {d.startsWith("Shop on your birthday") ? <Cake className="w-5 h-5 shrink-0 mt-0.5" /> : <Check className="w-5 h-5 shrink-0 mt-0.5" />}
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
