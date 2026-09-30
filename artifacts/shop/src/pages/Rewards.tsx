import { RewardsSection } from "@/components/RewardsSection";
import { useLoyaltyInfo } from "@/lib/loyalty";

export default function Rewards() {
  const { data, isLoading } = useLoyaltyInfo();
  if (!isLoading && !data?.enabled) {
    return <div className="mx-auto max-w-lg px-4 py-24 text-center text-stone-500">Our rewards program isn't running at the moment.</div>;
  }
  return (
    <div>
      <RewardsSection />
      {data?.enabled && (
        <div className="mx-auto max-w-5xl px-4 pb-6 grid sm:grid-cols-3 gap-4 text-sm">
          {[
            { n: "1", t: "Sign up", d: "Create a free account online or give us your details in store." },
            { n: "2", t: "Shop", d: `Earn ${data.unit} on every purchase, in store and online.` },
            { n: "3", t: "Spend", d: `Use your ${data.unit} towards your next purchase.` },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl bg-white border border-stone-200 p-5">
              <span className="w-8 h-8 rounded-full bg-brand-50 text-brand font-bold flex items-center justify-center mb-3">{s.n}</span>
              <p className="font-semibold">{s.t}</p>
              <p className="text-stone-600 mt-1">{s.d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
