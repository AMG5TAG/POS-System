import { useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { addTracking, CARRIERS, type MailInStatusView } from "@/lib/mail-in";

/* The customer's tracking number, entered straight after submitting or later
   from the link in their confirmation email. */
export function MailInTrackingForm({ token, initial, onSaved }: {
  token: string;
  initial?: { carrier: string | null; number: string | null };
  onSaved: (v: MailInStatusView) => void;
}) {
  const [carrier, setCarrier] = useState(initial?.carrier ?? "auspost");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { onSaved(await addTracking(token, carrier, number)); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid sm:grid-cols-[180px_1fr] gap-3">
        <label className="block">
          <span className="text-sm font-medium">Carrier</span>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="mt-1 w-full h-11 rounded-lg border border-stone-300 bg-white px-3">
            {CARRIERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Tracking number</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} required minLength={4} maxLength={60}
            placeholder="As printed on your postage receipt" className="mt-1 w-full h-11 rounded-lg border border-stone-300 px-3 uppercase placeholder:normal-case" />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy || number.trim().length < 4} className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} Save tracking number
      </button>
    </form>
  );
}
