import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Wrench } from "lucide-react";

interface ShopInfo { businessName: string; logoUrl: string | null; deviceTypes: string[] }

function useShop(username: string) {
  return useQuery<ShopInfo>({
    queryKey: ["booking-shop", username],
    queryFn: () => fetch(`/api/book/${username}`, { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("not found");
      return r.json();
    }),
  });
}

export default function BookingPage() {
  const { username = "" } = useParams<{ username: string }>();
  const { data: shop, isLoading, isError } = useShop(username);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", deviceType: "", deviceDescription: "", faultDescription: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ jobNumber: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.firstName.trim()) { setError("Please enter your name"); return; }
    if (!form.email.trim() && !form.phone.trim()) { setError("Please enter an email or phone"); return; }
    if (!form.faultDescription.trim()) { setError("Please describe the fault"); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/book/${username}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Booking failed"); }
      const j = await r.json();
      setDone({ jobNumber: j.jobNumber });
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (isError || !shop) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Shop not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          {shop.logoUrl
            ? <img src={shop.logoUrl} alt={shop.businessName} className="h-12 mx-auto mb-3 object-contain" />
            : <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3"><Wrench className="w-6 h-6 text-primary" /></div>}
          <h1 className="text-xl font-bold">{shop.businessName}</h1>
          <p className="text-sm text-gray-500">Book a repair</p>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl border p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="font-semibold text-lg">Booking received</h2>
            <p className="text-sm text-gray-600">Your reference is <span className="font-mono font-semibold">{done.jobNumber}</span>. We'll be in touch shortly with a quote.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl border p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name *"><input className={inputCls} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
              <Field label="Last name"><input className={inputCls} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            </div>
            <Field label="Device type">
              <select className={inputCls} value={form.deviceType} onChange={(e) => set("deviceType", e.target.value)}>
                <option value="">Select…</option>
                {shop.deviceTypes.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Device (make / model)"><input className={inputCls} value={form.deviceDescription} onChange={(e) => set("deviceDescription", e.target.value)} placeholder="e.g. iPhone 13, Dell XPS 15" /></Field>
            <Field label="What's wrong? *">
              <textarea className={inputCls} rows={3} value={form.faultDescription} onChange={(e) => set("faultDescription", e.target.value)} placeholder="Describe the fault or the repair you need" />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={submitting}
              className="w-full rounded-lg bg-primary text-primary-foreground font-medium py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Request booking
            </button>
            <p className="text-[11px] text-gray-400 text-center">We'll review your request and send a quote before any work begins.</p>
          </form>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full h-9 rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}
