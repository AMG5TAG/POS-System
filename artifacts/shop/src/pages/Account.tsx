import { useEffect, useState } from "react";
import { Redirect } from "wouter";
import { Link } from "wouter";
import { Loader2, Package, Wrench, CalendarDays, FileText, Coins, ShieldCheck, Heart, Cake } from "lucide-react";
import { useAccountOverview, type Overview } from "@/lib/loyalty";
import { api } from "@/lib/api";
import { useAuth, type Account as AccountT } from "@/lib/auth";
import { Field, Notice } from "@/components/Form";

export default function Account() {
  const { customer, loading, setCustomer, logout } = useAuth();
  const { data: overview } = useAccountOverview();
  const [f, setF] = useState<AccountT | null>(customer);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => { setF(customer); }, [customer]);

  // The form copy (`f`) fills one render after sign-in resolves; wait for it
  // rather than treating it as signed out, which bounced a direct visit to
  // /account to the login page.
  if (loading || (customer && !f)) return <div className="py-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (!customer || !f) return <Redirect to="/account/login?next=/account" />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ customer: AccountT }>("/shop/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName: f.firstName, lastName: f.lastName, phone: f.phone, address: f.address, dateOfBirth: f.dateOfBirth ?? "" }),
      });
      setCustomer(r.customer);
      setMsg({ tone: "ok", text: "Saved." });
    } catch (err) { setMsg({ tone: "error", text: (err as Error).message }); } finally { setBusy(false); }
  };
  const addr = (k: keyof AccountT["address"]) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, address: { ...f.address, [k]: e.target.value } });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-auto">Hi {customer.firstName || "there"}</h1>
        <Link href="/wishlist" className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50"><Heart className="w-4 h-4" /> Wishlist</Link>
        <button onClick={() => void logout()} className="h-8 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50">Sign out</button>
      </div>

      {overview && <LoyaltyCard loyalty={overview.loyalty} />}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <RepairsCard repairs={overview?.repairs} />
        <WarrantiesCard warranties={overview?.warranties} />
      </div>

      <form onSubmit={save} className="rounded-2xl bg-white border border-stone-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Your details</h2>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="First name" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
          <Field label="Last name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
          <Field label="Email" value={f.email} disabled />
          <Field label="Mobile" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Field label="Street address" value={f.address.street} onChange={addr("street")} />
          <Field label="Suburb" value={f.address.city} onChange={addr("city")} />
          <Field label="State" value={f.address.state} onChange={addr("state")} />
          <Field label="Postcode" value={f.address.postcode} onChange={addr("postcode")} />
          <div>
            <Field label="Birthday" type="date" value={f.dateOfBirth ?? ""} max={new Date().toISOString().slice(0, 10)}
              disabled={!!customer.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value || null })} />
            <p className="mt-1 text-xs text-stone-500 flex items-center gap-1.5">
              <Cake className="w-3.5 h-3.5" />
              {customer.dateOfBirth ? "Set — contact us if it needs correcting." : "For your birthday reward. Once saved it can't be changed online."}
            </p>
          </div>
        </div>
        <button type="submit" disabled={busy} className="h-11 px-6 rounded-full bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
      </form>

      <div className="grid sm:grid-cols-3 gap-3">
        {[{ icon: Package, title: "Orders" }, { icon: CalendarDays, title: "Appointments" }, { icon: FileText, title: "Quotes & invoices" }].map(({ icon: Icon, title }) => (
          <div key={title} className="rounded-2xl bg-white border border-stone-200 p-4 flex items-center gap-3 text-sm">
            <Icon className="w-5 h-5 text-stone-400" /><span><span className="font-medium">{title}</span> <span className="text-stone-500">— coming soon</span></span>
          </div>
        ))}
      </div>
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
