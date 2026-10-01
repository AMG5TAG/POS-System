import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Gift, Globe, Loader2, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { rememberReferral } from "@/lib/referral";
import { AuthCard, Notice } from "@/components/Form";

/* /r/<code> — a customer's referral link (shared from their account). It
   remembers the code in this browser so the friend who shared it is credited
   when the visitor signs up (now or later), and introduces the business.
   Open while the shop is curtained (lib/launch.ts). */
export default function Referral() {
  const { code } = useParams<{ code: string }>();
  const { customer } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shop-referral", code],
    queryFn: () => api<{ code: string; firstName: string | null; businessName: string; refereeReward: string | null; rules: { minSpend: number; minVisits: number; qualifyDays: number } }>(`/shop/referral/${encodeURIComponent(code)}`),
    retry: false,
  });
  useEffect(() => { if (data?.code && !customer) rememberReferral(data.code); }, [data?.code, customer]);

  if (isLoading) return <div className="py-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (isError || !data) {
    return (
      <AuthCard title="Referral link not found">
        <Notice>That referral link isn't valid. You're still welcome to visit us!</Notice>
        <a href="/" className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-brand text-white font-medium hover:bg-brand-dark"><Globe className="w-4 h-4" /> Visit our website</a>
      </AuthCard>
    );
  }
  const who = data.firstName ?? "A friend";
  return (
    <AuthCard title={`${who} invited you to ${data.businessName}`}>
      <div className="rounded-xl bg-brand-50 p-4 flex gap-3 text-sm">
        <Gift className="w-5 h-5 text-brand shrink-0 mt-0.5" />
        <p className="text-stone-700">
          We're a family-run computer repair, web and media business on the Central Coast — with pop culture and gaming on the way.
          {data.refereeReward && <> Create an account, and once you've spent ${data.rules.minSpend.toFixed(0)}{data.rules.minVisits > 0 ? ` over ${data.rules.minVisits} visit${data.rules.minVisits === 1 ? "" : "s"}` : ""} within {data.rules.qualifyDays} days, you'll get <strong>{data.refereeReward}</strong> — and {who} gets a reward too.</>}
        </p>
      </div>
      {customer ? (
        <Notice tone="ok">You're already signed in, so this link can't be applied here. Thanks for coming back!</Notice>
      ) : (
        <Link href="/account/register" className="flex items-center justify-center w-full h-11 rounded-full bg-brand text-white font-medium hover:bg-brand-dark">Create an account</Link>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a href="/" className="flex items-center justify-center gap-1.5 h-10 rounded-full border border-stone-300 text-sm hover:bg-stone-50"><Globe className="w-4 h-4" /> Our website</a>
        <Link href="/mail-in" className="flex items-center justify-center gap-1.5 h-10 rounded-full border border-stone-300 text-sm hover:bg-stone-50"><Wrench className="w-4 h-4" /> Mail-in repair</Link>
      </div>
      <p className="text-xs text-stone-500 text-center">Visiting in store? Mention code <strong className="font-mono">{data.code}</strong>.</p>
    </AuthCard>
  );
}
