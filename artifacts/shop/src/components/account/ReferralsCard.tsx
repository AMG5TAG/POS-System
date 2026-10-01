import { useState } from "react";
import { Check, Copy, Gift, Loader2, Users } from "lucide-react";
import { ShareMenu } from "./ShareMenu";
import { useReferrals, type Referee } from "@/lib/referral";

const date = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/* The customer's referral link (the POS referral programme: their own code)
   and the friends they have referred — each one's progress towards earning
   the reward, and what has been earned so far. A friend's spend is never
   shown, only whether it has reached the threshold. */
export function ReferralsCard() {
  const { data } = useReferrals();
  const [copied, setCopied] = useState(false);

  if (!data) {
    return (
      <section className="rounded-2xl bg-white border border-stone-200 p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Gift className="w-5 h-5 text-brand" /> Refer a friend</h2>
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
      </section>
    );
  }
  if (!data.enabled) return null;

  const { rules } = data;
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  // What a friend receives, whichever way it is shared.
  const shareText = `Join me at Koastal Kollective${rules.refereeReward ? ` — you'll get ${rules.refereeReward}` : ""}. Use my referral code ${data.code} or sign up with my link:`;
  const pending = data.referrals.filter((r) => !r.qualified && !r.expired).length;

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-6 space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Gift className="w-5 h-5 text-brand" /> Refer a friend</h2>
      <p className="text-sm text-stone-600">
        Share your link. You earn <strong>{rules.referrerReward}</strong> for each friend who spends ${rules.minSpend.toFixed(0)}
        {rules.minVisits > 0 && <> over {rules.minVisits} visit{rules.minVisits === 1 ? "" : "s"}</>} within {rules.qualifyDays} days of joining
        {rules.refereeReward && <> — and they get <strong>{rules.refereeReward}</strong> too</>}.
        Rewards go straight onto your loyalty balance as soon as your friend qualifies.
      </p>

      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
        <span className="flex-1 min-w-0 truncate font-mono text-sm">{data.url}</span>
        <button onClick={() => void copy()} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-stone-300 bg-white text-sm hover:bg-stone-50 shrink-0">
          {copied ? <><Check className="w-4 h-4 text-emerald-600" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
        </button>
        <ShareMenu url={data.url} text={shareText} subject="Join me at Koastal Kollective" />
      </div>
      <p className="text-xs text-stone-500">Your code is <strong className="font-mono">{data.code}</strong> — friends can also quote it in store.</p>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl bg-stone-50 px-3 py-2"><dt className="text-stone-500">Referred</dt><dd className="font-semibold text-base">{data.referrals.length}</dd></div>
        <div className="rounded-xl bg-stone-50 px-3 py-2"><dt className="text-stone-500">In progress</dt><dd className="font-semibold text-base">{pending}</dd></div>
        <div className="rounded-xl bg-brand-50 px-3 py-2"><dt className="text-stone-500">Rewards paid</dt><dd className="font-semibold text-base text-brand">{data.earned}</dd></div>
      </dl>

      {data.referrals.length === 0 ? (
        <p className="text-sm text-stone-500 flex items-center gap-2"><Users className="w-4 h-4" /> No referrals yet — share your link to get started.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {data.referrals.map((r, i) => <RefereeRow key={i} r={r} minVisits={rules.minVisits} />)}
        </ul>
      )}
    </section>
  );
}

function RefereeRow({ r, minVisits }: { r: Referee; minVisits: number }) {
  // Two steps to qualify — spend and visits — shown as a bar.
  const visitPart = minVisits > 0 ? Math.min(r.visits, minVisits) / minVisits : 1;
  const pct = r.qualified ? 100 : Math.round(((r.spendReached ? 1 : 0) + visitPart) / 2 * 100);
  const status = r.reward === "paid"
    ? { label: "Reward paid", tone: "bg-emerald-100 text-emerald-800" }
    : r.qualified
    ? { label: "Qualified", tone: "bg-emerald-100 text-emerald-800" }
    : r.expired ? { label: "Window closed", tone: "bg-stone-200 text-stone-700" }
    : { label: `${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} left`, tone: "bg-amber-100 text-amber-800" };
  return (
    <li className="py-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{r.name}</p>
          <p className="text-xs text-stone-500">Joined {date(r.joinedAt)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
      </div>
      {!r.qualified && !r.expired && (
        <>
          <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-stone-500">
            Spend {r.spendReached ? "✓ reached" : "not reached yet"}
            {minVisits > 0 && <> · visits {Math.min(r.visits, minVisits)} of {minVisits}</>}
          </p>
        </>
      )}
    </li>
  );
}
