import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cake } from "lucide-react";
import { api } from "@/lib/api";
import type { Account, Address } from "@/lib/auth";
import { Field, Notice } from "@/components/Form";

/* The customer's own record — the same row the POS shows — with everything
   the POS asks a customer for. Staff-only fields (notes, warnings, group,
   loyalty) are not here. Which fields are required is the business's POS
   setting (GET /shop/account/fields), so the shop never saves a customer the
   till would refuse; the server checks it again. */

type RequiredKey = "email" | "phone" | "dateOfBirth" | "company" | "abn" | "billingAddress";
interface Fields { required: Record<RequiredKey, boolean>; heardFromSources: { name: string; requiresDetails: boolean }[] }

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const same = (a: Address, b: Address) => (["street", "city", "state", "postcode"] as const).every((k) => a[k].trim() === b[k].trim());
const empty = (a: Address) => !a.street && !a.city && !a.postcode;

export function ProfileForm({ customer, onSaved }: { customer: Account; onSaved: (c: Account) => void }) {
  const { data: fields } = useQuery({ queryKey: ["shop-account-fields"], queryFn: () => api<Fields>("/shop/account/fields"), staleTime: 5 * 60_000 });
  const [f, setF] = useState<Account>(customer);
  const [postalSame, setPostalSame] = useState(empty(customer.shippingAddress) || same(customer.shippingAddress, customer.address));
  const [friendCode, setFriendCode] = useState(customer.referredByCode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => {
    setF(customer);
    setFriendCode(customer.referredByCode);
    setPostalSame(empty(customer.shippingAddress) || same(customer.shippingAddress, customer.address));
  }, [customer]);

  const req = fields?.required;
  const heard = fields?.heardFromSources ?? [];
  // A source the POS recorded that has since left the list still shows.
  const heardOptions = f.heardFrom && !heard.some((h) => h.name === f.heardFrom) ? [...heard, { name: f.heardFrom, requiresDetails: false }] : heard;
  // "Friend" asks for the friend's name and, optionally, their referral code,
  // which credits them through the POS referral programme.
  const isFriend = f.heardFrom.trim().toLowerCase() === "friend";
  const needsDetails = isFriend || (heardOptions.find((h) => h.name === f.heardFrom)?.requiresDetails ?? false);
  const linked = !!customer.referredByCode;

  const set = <K extends keyof Account>(k: K) => (v: Account[K]) => setF({ ...f, [k]: v });
  const addr = (which: "address" | "shippingAddress", k: keyof Address) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [which]: { ...f[which], [k]: e.target.value } });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ customer: Account }>("/shop/account/profile", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: f.firstName, lastName: f.lastName, email: f.email || undefined, phone: f.phone,
          // "Same" stores a copy, as the POS keeps both: a blank would wipe one a
          // cashier entered.
          address: f.address, shippingAddress: postalSame ? f.address : f.shippingAddress,
          dateOfBirth: f.dateOfBirth ?? "", company: f.company, abn: f.abn, whatsapp: f.whatsapp,
          agreedToMarketing: f.agreedToMarketing, heardFrom: f.heardFrom, heardFromDetails: needsDetails ? f.heardFromDetails : "",
          friendReferralCode: isFriend && !linked && friendCode.trim() ? friendCode.trim() : undefined,
        }),
      });
      onSaved(r.customer);
      setMsg({ tone: "ok", text: "Saved." });
    } catch (err) { setMsg({ tone: "error", text: (err as Error).message }); } finally { setBusy(false); }
  };

  const select = "w-full h-11 rounded-xl border border-stone-300 bg-white px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand-light/40";
  const addressFields = (which: "address" | "shippingAddress", required: boolean) => (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2"><Field label="Street address" required={required} autoComplete={`${which === "address" ? "billing" : "shipping"} street-address`} value={f[which].street} onChange={addr(which, "street")} /></div>
      <Field label="Suburb" required={required} value={f[which].city} onChange={addr(which, "city")} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">State</span>
        <select required={required} value={f[which].state} onChange={addr(which, "state")} className={select}>
          <option value="">—</option>
          {/* A state the POS stored that isn't on the list still shows. */}
          {[...STATES, ...(f[which].state && !STATES.includes(f[which].state) ? [f[which].state] : [])].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <Field label="Postcode" required={required} inputMode="numeric" maxLength={10} value={f[which].postcode} onChange={addr(which, "postcode")} />
      <Field label="Country" value={f[which].country} onChange={addr(which, "country")} />
    </div>
  );
  const star = (k: RequiredKey) => (req?.[k] ? " *" : "");

  return (
    <form onSubmit={save} className="rounded-2xl bg-white border border-stone-200 p-6 space-y-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold mr-auto">Your details</h2>
        <p className="text-xs text-stone-500">Kept in step with our records in store. * required</p>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-stone-700 mb-3">About you</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="First name *" required autoComplete="given-name" value={f.firstName} onChange={(e) => set("firstName")(e.target.value)} />
          <Field label="Last name" autoComplete="family-name" value={f.lastName} onChange={(e) => set("lastName")(e.target.value)} />
          <Field label={`Email${star("email")}`} type="email" autoComplete="email" required={!!req?.email} value={f.email} onChange={(e) => set("email")(e.target.value)} />
          <div>
            <Field label={`Mobile${star("phone")}`} type="tel" autoComplete="tel" required={!!req?.phone} value={f.phone} onChange={(e) => set("phone")(e.target.value)} />
            <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={f.whatsapp} onChange={(e) => set("whatsapp")(e.target.checked)} className="w-4 h-4 accent-[var(--color-brand,#007b7d)]" />
              This number is also on WhatsApp
            </label>
          </div>
          <div>
            <Field label={`Birthday${star("dateOfBirth")}`} type="date" required={!!req?.dateOfBirth && !customer.dateOfBirth} value={f.dateOfBirth ?? ""} max={new Date().toISOString().slice(0, 10)}
              disabled={!!customer.dateOfBirth} onChange={(e) => set("dateOfBirth")(e.target.value || null)} />
            <p className="mt-1 text-xs text-stone-500 flex items-center gap-1.5">
              <Cake className="w-3.5 h-3.5" />
              {customer.dateOfBirth ? "Set — contact us if it needs correcting." : "For your birthday reward. Once saved it can't be changed online."}
            </p>
          </div>
          <Field label={`Company${star("company")}`} autoComplete="organization" required={!!req?.company} value={f.company} onChange={(e) => set("company")(e.target.value)} />
          <Field label={`ABN${star("abn")}`} inputMode="numeric" maxLength={14} placeholder="11 digits" required={!!req?.abn} value={f.abn} onChange={(e) => set("abn")(e.target.value)} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-stone-700 mb-3">Address{star("billingAddress")}</legend>
        {addressFields("address", !!req?.billingAddress)}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-stone-700 mb-3">Postal / delivery address</legend>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={postalSame} onChange={(e) => setPostalSame(e.target.checked)} className="w-4 h-4" />
          Same as my address
        </label>
        {!postalSame && addressFields("shippingAddress", false)}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-stone-700 mb-3">Staying in touch</legend>
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={f.agreedToMarketing} onChange={(e) => set("agreedToMarketing")(e.target.checked)} className="w-4 h-4 mt-0.5" />
          <span>Send me offers, news and new arrivals by email and SMS. You can change this any time.</span>
        </label>
        {heardOptions.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">How did you hear about us?</span>
              <select value={f.heardFrom} onChange={(e) => setF({ ...f, heardFrom: e.target.value })} className={select}>
                <option value="">—</option>
                {heardOptions.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
              </select>
            </label>
            {needsDetails && <Field label={isFriend ? "Your friend's name" : "Tell us more"} maxLength={200} value={f.heardFromDetails} onChange={(e) => set("heardFromDetails")(e.target.value)} />}
            {isFriend && (
              <div>
                <Field label="Their referral code (optional)" maxLength={40} placeholder="e.g. SL-AB12" disabled={linked}
                  value={friendCode} onChange={(e) => setFriendCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
                <p className="mt-1 text-xs text-stone-500">
                  {linked ? "Linked — your friend gets the credit. Contact us if it needs changing." : "From their referral link or account. It gets them their referral reward."}
                </p>
              </div>
            )}
          </div>
        )}
      </fieldset>

      <button type="submit" disabled={busy} className="h-11 px-6 rounded-full bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
    </form>
  );
}
