import { useEffect, useState } from "react";
import { Redirect } from "wouter";
import { Loader2, Package, Wrench, CalendarDays, FileText, Gift } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, type Account as AccountT } from "@/lib/auth";
import { Field, Notice } from "@/components/Form";

export default function Account() {
  const { customer, loading, setCustomer, logout } = useAuth();
  const [f, setF] = useState<AccountT | null>(customer);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => { setF(customer); }, [customer]);

  if (loading) return <div className="py-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (!customer || !f) return <Redirect to="/account/login?next=/account" />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ customer: AccountT }>("/shop/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName: f.firstName, lastName: f.lastName, phone: f.phone, address: f.address }),
      });
      setCustomer(r.customer);
      setMsg({ tone: "ok", text: "Saved." });
    } catch (err) { setMsg({ tone: "error", text: (err as Error).message }); } finally { setBusy(false); }
  };
  const addr = (k: keyof AccountT["address"]) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, address: { ...f.address, [k]: e.target.value } });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-auto">Hi {customer.firstName || "there"}</h1>
        <span className="inline-flex items-center gap-1.5 text-sm rounded-full bg-amber-100 px-3 h-8"><Gift className="w-4 h-4" />{customer.loyaltyPoints} points</span>
        <button onClick={() => void logout()} className="h-8 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50">Sign out</button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Package, title: "Orders" }, { icon: Wrench, title: "Repairs" },
          { icon: CalendarDays, title: "Appointments" }, { icon: FileText, title: "Quotes & invoices" },
        ].map(({ icon: Icon, title }) => (
          <div key={title} className="rounded-2xl bg-white border border-stone-200 p-4">
            <Icon className="w-5 h-5 text-brand-dark mb-2" />
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-stone-500">Coming soon to your online account.</p>
          </div>
        ))}
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
        </div>
        <button type="submit" disabled={busy} className="h-11 px-6 rounded-full bg-ink text-white font-medium disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
      </form>
    </div>
  );
}
