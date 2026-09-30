import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Loader2, Mail, Package, ShieldCheck, Clock, MapPin, ClipboardList, Truck, Search,
  HardDrive, Smartphone, Layers, Box, Tag, BatteryWarning, CheckCircle2, Copy,
} from "lucide-react";
import { useMailInInfo, STATES, type MailInStatusView } from "@/lib/mail-in";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { MailInTrackingForm } from "@/components/MailInTrackingForm";

/* Mail-In repairs: how it works, how to pack a device safely, where to send
   it, and the form. Submitting gives a reference and a link to add the
   tracking number (also emailed); nothing is booked in until it arrives. */

const STEPS = [
  { icon: ClipboardList, title: "Fill in the form", text: "Tell us about your device and what's wrong." },
  { icon: Package, title: "Pack it securely", text: "Follow the packing guide below." },
  { icon: Truck, title: "Post it, registered", text: "Use a tracked service and send us the tracking number." },
  { icon: Search, title: "Free diagnostics", text: "We'll assess it and send you a quote — nothing is repaired without your OK." },
];

const PACKING = [
  { icon: HardDrive, title: "Back up and remove", text: "Back up your data first. Remove SIM and memory cards, cases and accessories unless we need them — list anything you do send on the form." },
  { icon: Smartphone, title: "Protect the screen", text: "Cover the screen with a piece of cardboard held on with low-tack tape, then seal the device in a zip-lock bag to keep out moisture." },
  { icon: Layers, title: "Wrap it well", text: "Wrap the device in at least two layers of bubble wrap and tape it closed. Padded satchels alone aren't enough." },
  { icon: Box, title: "Use a sturdy box", text: "Pick a rigid cardboard box with at least 5 cm of padding on every side. Give it a gentle shake — nothing should move." },
  { icon: Tag, title: "Label the inside", text: "Put a note inside with your reference number, name and phone number. Seal every seam with packing tape." },
  { icon: BatteryWarning, title: "Batteries go by road", text: "Devices with lithium batteries must be sent by road — choose a road service such as Australia Post Parcel Post rather than an air service. Never post a swollen or damaged battery; contact us first." },
];

type Form = {
  firstName: string; lastName: string; email: string; phone: string;
  street: string; suburb: string; state: string; postcode: string;
  deviceType: string; brandModel: string; serialNumber: string; fault: string; accessories: string;
};
const EMPTY: Form = {
  firstName: "", lastName: "", email: "", phone: "", street: "", suburb: "", state: "NSW", postcode: "",
  deviceType: "Phone", brandModel: "", serialNumber: "", fault: "", accessories: "",
};
const DEVICE_TYPES = ["Phone", "Tablet", "Laptop", "Desktop computer", "Game console", "Smartwatch", "Other"];

const field = "mt-1 w-full h-11 rounded-lg border border-stone-300 bg-white px-3";

export default function MailIn() {
  const { data: info, isLoading } = useMailInInfo();
  const { customer } = useAuth();
  const [form, setForm] = useState<Form>(EMPTY);
  const [agreed, setAgreed] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; token: string } | null>(null);
  const [tracked, setTracked] = useState<MailInStatusView | null>(null);

  // A signed-in shopper starts with their own details filled in.
  useEffect(() => {
    if (!customer) return;
    setForm((f) => ({
      ...f,
      firstName: f.firstName || customer.firstName || "",
      lastName: f.lastName || customer.lastName || "",
      email: f.email || customer.email || "",
      phone: f.phone || customer.phone || "",
      street: f.street || customer.address?.street || "",
      suburb: f.suburb || customer.address?.city || "",
      state: STATES.includes(customer.address?.state ?? "") ? customer.address.state : f.state,
      postcode: f.postcode || customer.address?.postcode || "",
    }));
  }, [customer]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const terms = info?.terms ?? [];
  const allAgreed = terms.length > 0 && terms.every((_, i) => agreed[i]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAgreed) { setError("Please tick every box to agree to the terms."); return; }
    setBusy(true); setError(null);
    try {
      const r = await api<{ reference: string; token: string }>("/shop/mail-in", {
        method: "POST",
        body: JSON.stringify({ ...form, agreed: terms.map(() => true) }),
      });
      setDone(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

  const address = (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-brand" /> Post your device to</h3>
      <address className="not-italic mt-2 leading-relaxed">
        {(info?.addressLines ?? []).map((l, i) => <span key={i} className={`block ${i === 0 ? "font-semibold" : ""}`}>{l}</span>)}
      </address>
      {(info?.addressLines?.length ?? 0) > 0 && (
        <button type="button" onClick={() => void navigator.clipboard?.writeText((info?.addressLines ?? []).join("\n"))}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
          <Copy className="w-3.5 h-3.5" /> Copy address
        </button>
      )}
    </div>
  );

  const hours = (info?.openingHours.length ?? 0) > 0 && (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-brand" /> Operating hours</h3>
      <dl className="mt-2 text-sm grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        {info!.openingHours.map((h) => (
          <div key={h.day} className="contents">
            <dt className="text-stone-600">{h.day}</dt>
            <dd className={h.hours === "Closed" ? "text-stone-400" : ""}>{h.hours}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-stone-500">Parcels are received on business days. Questions? {info?.phone ? `Call ${info.phone}` : ""}{info?.phone && info?.email ? " or email " : ""}{info?.email ?? ""}</p>
    </div>
  );

  if (done) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="rounded-3xl bg-brand-50 border border-brand/20 p-6 md:p-8">
          <CheckCircle2 className="w-10 h-10 text-brand" />
          <h1 className="text-2xl md:text-3xl font-bold mt-3">Request received</h1>
          <p className="mt-2 text-stone-700">Your reference is <strong className="text-ink">{done.reference}</strong>. Write it on the note inside your parcel. We've emailed you these details too.</p>
        </div>
        {address}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">
          <p className="font-semibold">Use registered, tracked post</p>
          <p className="mt-1 text-stone-700">We strongly recommend a registered or tracked service with extra cover for your device's value. Your device is your responsibility until it arrives with us, and a tracking number is the only way to find a parcel that goes missing.</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-semibold text-lg">Add your tracking number</h2>
          {tracked ? (
            <p className="mt-2 text-emerald-700 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Saved — we'll watch for {tracked.trackingNumber}.</p>
          ) : (
            <>
              <p className="text-sm text-stone-600 mt-1 mb-4">Once it's posted, add the tracking number here — or later, from the link in your email.</p>
              <MailInTrackingForm token={done.token} onSaved={setTracked} />
            </>
          )}
          <p className="text-xs text-stone-500 mt-4">You can check on it any time at <Link href={`/mail-in/track/${done.token}`} className="text-brand hover:underline">this page</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-light/25 border-b border-stone-200">
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand flex items-center gap-2"><Mail className="w-4 h-4" /> Mail-In Repairs</p>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mt-2">Post it to us — diagnostics are free</h1>
          <p className="text-lg text-stone-600 mt-3 max-w-2xl">Can't make it in store? Send your device and we'll diagnose it for free, then quote before doing any work.</p>
          <ol className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm">
                <span className="flex items-center gap-2 text-brand font-semibold"><span className="w-7 h-7 rounded-full bg-brand text-white text-sm flex items-center justify-center">{i + 1}</span><Icon className="w-5 h-5" /></span>
                <p className="font-semibold mt-3">{title}</p>
                <p className="text-sm text-stone-600 mt-1">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 grid lg:grid-cols-[1fr_340px] gap-8 items-start">
        <div className="space-y-10 min-w-0">
          <section>
            <h2 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-brand" /> How to pack your device</h2>
            <div className="mt-5 grid sm:grid-cols-2 gap-4">
              {PACKING.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-stone-200 bg-white p-5 flex gap-4">
                  <Icon className="w-6 h-6 text-brand shrink-0 mt-0.5" />
                  <div><p className="font-semibold">{title}</p><p className="text-sm text-stone-600 mt-1">{text}</p></div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">
              <p className="font-semibold">We recommend registered post</p>
              <p className="mt-1 text-stone-700">Send it with a registered or tracked service, with extra cover for the device's value, and add the tracking number after you submit this form. Don't write your passcode on the parcel — we'll ask for it if we need it.</p>
            </div>
          </section>

          {!info?.enabled ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <p className="font-semibold">Mail-in repairs aren't available right now.</p>
              <p className="text-sm text-stone-600 mt-1">Please contact us{info?.phone ? ` on ${info.phone}` : ""} or bring your device in store.</p>
            </div>
          ) : (
            <section>
              <h2 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6 text-brand" /> Mail-in request</h2>
              <p className="text-stone-600 mt-1">Every field marked * is required. We'll email you a reference and the address to post to.</p>
              <form onSubmit={submit} className="mt-5 space-y-6">
                <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 grid sm:grid-cols-2 gap-4">
                  <legend className="px-2 font-semibold">Your details</legend>
                  <label className="block"><span className="text-sm font-medium">First name *</span><input required maxLength={60} value={form.firstName} onChange={set("firstName")} className={field} autoComplete="given-name" /></label>
                  <label className="block"><span className="text-sm font-medium">Last name</span><input maxLength={60} value={form.lastName} onChange={set("lastName")} className={field} autoComplete="family-name" /></label>
                  <label className="block"><span className="text-sm font-medium">Email *</span><input required type="email" maxLength={254} value={form.email} onChange={set("email")} className={field} autoComplete="email" /></label>
                  <label className="block"><span className="text-sm font-medium">Mobile *</span><input required type="tel" minLength={6} maxLength={30} value={form.phone} onChange={set("phone")} className={field} autoComplete="tel" placeholder="0400 000 000" /></label>
                </fieldset>

                <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 grid sm:grid-cols-6 gap-4">
                  <legend className="px-2 font-semibold">Return address</legend>
                  <label className="block sm:col-span-6"><span className="text-sm font-medium">Street address *</span><input required minLength={3} maxLength={160} value={form.street} onChange={set("street")} className={field} autoComplete="street-address" /></label>
                  <label className="block sm:col-span-3"><span className="text-sm font-medium">Suburb *</span><input required minLength={2} maxLength={80} value={form.suburb} onChange={set("suburb")} className={field} autoComplete="address-level2" /></label>
                  <label className="block sm:col-span-1"><span className="text-sm font-medium">State *</span>
                    <select value={form.state} onChange={set("state")} className={field} autoComplete="address-level1">{STATES.map((s) => <option key={s}>{s}</option>)}</select>
                  </label>
                  <label className="block sm:col-span-2"><span className="text-sm font-medium">Postcode *</span><input required inputMode="numeric" pattern="\d{4}" maxLength={4} value={form.postcode} onChange={set("postcode")} className={field} autoComplete="postal-code" /></label>
                </fieldset>

                <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 grid sm:grid-cols-2 gap-4">
                  <legend className="px-2 font-semibold">Your device</legend>
                  <label className="block"><span className="text-sm font-medium">Device type *</span>
                    <select value={form.deviceType} onChange={set("deviceType")} className={field}>{DEVICE_TYPES.map((d) => <option key={d}>{d}</option>)}</select>
                  </label>
                  <label className="block"><span className="text-sm font-medium">Brand and model *</span><input required minLength={2} maxLength={120} value={form.brandModel} onChange={set("brandModel")} className={field} placeholder="e.g. iPhone 13 Pro" /></label>
                  <label className="block sm:col-span-2"><span className="text-sm font-medium">Serial number or IMEI</span><input maxLength={80} value={form.serialNumber} onChange={set("serialNumber")} className={field} placeholder="Optional — helps us match your parcel" /></label>
                  <label className="block sm:col-span-2"><span className="text-sm font-medium">What's wrong with it? *</span>
                    <textarea required minLength={10} maxLength={3000} rows={4} value={form.fault} onChange={set("fault")} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2" placeholder="What happened, what it does now, anything you've already tried." />
                  </label>
                  <label className="block sm:col-span-2"><span className="text-sm font-medium">Anything else in the parcel?</span><input maxLength={500} value={form.accessories} onChange={set("accessories")} className={field} placeholder="e.g. charger, case — leave blank if just the device" /></label>
                </fieldset>

                <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
                  <legend className="px-2 font-semibold">Before you send it *</legend>
                  {terms.map((t, i) => (
                    <label key={i} className="flex items-start gap-3 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!agreed[i]} onChange={(e) => setAgreed((a) => { const n = [...a]; n[i] = e.target.checked; return n; })}
                        className="mt-0.5 w-5 h-5 accent-[var(--color-brand,#007b7d)] shrink-0" />
                      <span>{t}</span>
                    </label>
                  ))}
                </fieldset>

                {error && <p className="text-sm text-red-600">{error}</p>}
                <button disabled={busy || !allAgreed} className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Submit mail-in request
                </button>
              </form>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-40">
          {address}
          {hours}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm">
            <h3 className="font-semibold">Returning your device</h3>
            <p className="mt-1 text-stone-600">{info?.returnText}</p>
            {info?.extraNotes && <p className="mt-3 text-stone-600 whitespace-pre-line">{info.extraNotes}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
