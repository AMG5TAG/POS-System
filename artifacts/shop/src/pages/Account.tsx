import { useState } from "react";
import { Redirect } from "wouter";
import { Link } from "wouter";
import { Loader2, Wrench, Coins, ShieldCheck, Heart, KeyRound } from "lucide-react";
import { useAccountOverview, type Overview } from "@/lib/loyalty";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ProfileForm } from "@/components/account/ProfileForm";
import { QuotesCard } from "@/components/account/QuotesCard";
import { AppointmentsCard } from "@/components/account/AppointmentsCard";
import { LoyaltyPass } from "@/components/account/LoyaltyPass";
import { ReferralsCard } from "@/components/account/ReferralsCard";
import { OrdersCard } from "@/components/account/OrdersCard";
import { FilesCard } from "@/components/account/FilesCard";
import { Notice } from "@/components/Form";

/* Where the new-email confirmation link (GET /shop/auth/confirm-email) lands. */
const EMAIL_CHANGE_RESULT: Record<string, { tone: "ok" | "error"; text: string }> = {
  changed: { tone: "ok", text: "Your email has been updated." },
  taken: { tone: "error", text: "That email is already on another account with us, so it wasn't changed. Contact us and we can combine them." },
  "link-expired": { tone: "error", text: "That link has expired or isn't valid. Save the new email on your profile again for a fresh one." },
};

export default function Account() {
  const { customer, loading, setCustomer, logout } = useAuth();
  const { data: overview } = useAccountOverview();
  const [emailResult] = useState(() => EMAIL_CHANGE_RESULT[new URLSearchParams(window.location.search).get("email") ?? ""]);

  if (loading) return <div className="py-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (!customer) return <Redirect to="/account/login?next=/account" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Hi {customer.firstName || "there"}</h1>
        {customer.customerGroup && (
          <span className="rounded-full bg-brand-50 text-brand px-3 py-1 text-xs font-semibold" title="Your customer group, set by our team">
            {customer.customerGroup} customer
          </span>
        )}
        <span className="mr-auto" />
        <Link href="/wishlist" className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50"><Heart className="w-4 h-4" /> Wishlist</Link>
        <button onClick={() => void logout()} className="h-8 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50">Sign out</button>
      </div>

      {emailResult && <Notice tone={emailResult.tone}>{emailResult.text}</Notice>}

      {!customer.hasPassword && <PasswordPrompt email={customer.email} />}

      {overview && <LoyaltyCard loyalty={overview.loyalty} />}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <RepairsCard repairs={overview?.repairs} />
        <QuotesCard />
        <AppointmentsCard />
        <WarrantiesCard warranties={overview?.warranties} />
      </div>

      {/* Stretched, not items-start: the two cards sit side by side on large
          screens and should match the taller one's height. */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ReferralsCard />
        {overview && (
          <LoyaltyPass portalToken={customer.portalToken} totalSpent={overview.loyalty.totalSpent} visitCount={overview.loyalty.visitCount} />
        )}
      </div>

      <FilesCard />

      <ProfileForm customer={customer} onSaved={setCustomer} />

      <OrdersCard />
    </div>
  );
}

/* ── Account overview cards ──────────────────────────────────────────── */

function LoyaltyCard({ loyalty }: { loyalty: Overview["loyalty"] }) {
  if (!loyalty.enabled) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white p-6 grid sm:grid-cols-[1fr_auto] gap-4 items-center">
      <Coins className="absolute -right-4 -bottom-6 w-36 h-36 text-white/10 rotate-12" aria-hidden />
      <div className="relative">
        <p className="text-sm text-white/80">{loyalty.name}</p>
        <p className="text-4xl font-extrabold tracking-tight mt-1">{loyalty.formatted}</p>
        <p className="text-sm text-white/85 mt-2">{loyalty.headline}</p>
      </div>
      <Link href="/rewards" className="relative inline-flex h-10 items-center px-5 rounded-full bg-white text-brand text-sm font-semibold hover:bg-brand-50 justify-self-start sm:justify-self-end">How it works</Link>
    </div>
  );
}

/* Customer-facing wording for service job statuses (the POS's own labels). */
const REPAIR_STATUS: Record<string, { label: string; tone: string }> = {
  "pending":                   { label: "Booked in",            tone: "bg-amber-100 text-amber-800" },
  "in-progress":               { label: "In progress",          tone: "bg-sky-100 text-sky-800" },
  "awaiting-parts":            { label: "Waiting on parts",     tone: "bg-rose-100 text-rose-800" },
  "awaiting-stock":            { label: "Waiting on stock",     tone: "bg-purple-100 text-purple-800" },
  "at-repairer":               { label: "With our repair partner", tone: "bg-yellow-100 text-yellow-800" },
  "awaiting-partner-approval": { label: "Awaiting approval",    tone: "bg-indigo-100 text-indigo-800" },
  "partner-replacement":       { label: "Replacement arranged", tone: "bg-teal-100 text-teal-800" },
  "awaiting-customer":         { label: "Waiting on you",       tone: "bg-orange-100 text-orange-800" },
  "awaiting-pickup":           { label: "Ready to collect",     tone: "bg-lime-100 text-lime-800" },
  "completed":                 { label: "Completed",            tone: "bg-emerald-100 text-emerald-800" },
  "cancelled":                 { label: "Cancelled",            tone: "bg-stone-200 text-stone-700" },
};
const DONE = new Set(["completed", "cancelled", "partner-replacement"]);
const date = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function RepairsCard({ repairs }: { repairs: Overview["repairs"] | undefined }) {
  const current = (repairs ?? []).filter((r) => !DONE.has(r.status));
  const previous = (repairs ?? []).filter((r) => DONE.has(r.status));
  const row = (r: Overview["repairs"][number]) => {
    const s = REPAIR_STATUS[r.status] ?? { label: r.status.replace(/-/g, " "), tone: "bg-stone-100 text-stone-700" };
    return (
      <li key={r.id} className="py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{r.device}</p>
          <p className="text-xs text-stone-500">Job {r.jobNumber} · booked in {date(r.bookedIn)}{r.completedAt ? ` · completed ${date(r.completedAt)}` : ""}</p>
          {r.workDescription && <p className="text-sm text-stone-600 mt-1 line-clamp-3">{r.workDescription}</p>}
          {r.estimatedCost != null && r.estimatedCost > 0 && (
            <p className="text-xs text-stone-500 mt-0.5">Estimate {r.estimatedCost.toLocaleString("en-AU", { style: "currency", currency: "AUD" })}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>
      </li>
    );
  };
  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Wrench className="w-5 h-5 text-brand" /> Repairs</h2>
      {!repairs ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        : repairs.length === 0 ? <p className="text-sm text-stone-500 mt-3">No repairs with us yet.</p>
        : <>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mt-4">Current</p>
            {current.length ? <ul className="divide-y divide-stone-100">{current.map(row)}</ul> : <p className="text-sm text-stone-500 py-2">Nothing in for repair right now.</p>}
            {previous.length > 0 && <>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mt-4">Previous</p>
              <ul className="divide-y divide-stone-100">{previous.slice(0, 10).map(row)}</ul>
            </>}
          </>}
    </section>
  );
}

function WarrantiesCard({ warranties }: { warranties: Overview["warranties"] | undefined }) {
  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brand" /> Warranties</h2>
      {!warranties ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        : warranties.length === 0 ? <p className="text-sm text-stone-500 mt-3">No products or repairs currently under warranty.</p>
        : <ul className="divide-y divide-stone-100 mt-2">
            {warranties.map((w) => (
              <li key={w.key} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{w.name}</p>
                  <p className="text-xs text-stone-500">{w.label} · {w.kind === "repair" ? "job" : "receipt"} {w.reference} · until {date(w.expiresAt)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${w.daysRemaining <= 30 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {w.daysRemaining} day{w.daysRemaining === 1 ? "" : "s"} left
                </span>
              </li>
            ))}
          </ul>}
    </section>
  );
}

/* Shown to a customer who came in on an account link and has never set a
   password: with one they can sign in by email, from any device. The link
   goes to the email on file — the inbox is the proof it is theirs. */
function PasswordPrompt({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const send = async () => {
    setState("busy");
    try { await api("/shop/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }); setState("sent"); }
    catch { setState("error"); }
  };
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center gap-3 text-sm">
      <KeyRound className="w-5 h-5 text-amber-700 shrink-0" />
      <p className="flex-1 min-w-[14rem] text-amber-900">
        {state === "sent" ? `We've emailed a link to ${email} — open it to set your password.`
          : state === "error" ? "Something went wrong sending the link. Please try again."
          : email ? "Set a password so you can sign in with your email from any device, and only you can open your account."
          : "Ask us to add your email address so you can set a password and sign in from any device."}
      </p>
      {email && state !== "sent" && (
        <button onClick={() => void send()} disabled={state === "busy"} className="h-9 px-4 rounded-full bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50">
          {state === "busy" ? "Sending…" : "Email me a link"}
        </button>
      )}
    </div>
  );
}
