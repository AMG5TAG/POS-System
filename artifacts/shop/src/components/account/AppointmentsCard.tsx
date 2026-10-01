import { useState } from "react";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { useAppointments, useBookAppointment, type Appointment } from "@/lib/account";
import { Field, Notice } from "@/components/Form";

const when = (d: string) => new Date(d).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

const STATUS: Record<string, { label: string; tone: string }> = {
  scheduled: { label: "Requested", tone: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmed", tone: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", tone: "bg-stone-200 text-stone-700" },
  cancelled: { label: "Cancelled", tone: "bg-stone-200 text-stone-700" },
  "no-show": { label: "Missed",    tone: "bg-stone-200 text-stone-700" },
};

/* The customer's appointments, and a request form. A booking lands in the POS
   calendar for staff to confirm or move — it is a request for a time, as it
   was in the customer portal, not a checked slot. */
export function AppointmentsCard() {
  const { data: appointments } = useAppointments();
  const book = useBookAppointment();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", at: "", notes: "" });
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const now = Date.now();
  const upcoming = (appointments ?? []).filter((a) => new Date(a.scheduledAt).getTime() >= now).reverse();
  const past = (appointments ?? []).filter((a) => new Date(a.scheduledAt).getTime() < now);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    // datetime-local has no zone; the browser's is the customer's.
    book.mutate({ title: f.title, scheduledAt: new Date(f.at).toISOString(), notes: f.notes || undefined }, {
      onSuccess: () => {
        setF({ title: "", at: "", notes: "" });
        setOpen(false);
        setMsg({ tone: "ok", text: "Thanks — we've got your request and will be in touch to confirm." });
      },
      onError: (err) => setMsg({ tone: "error", text: (err as Error).message }),
    });
  };

  const row = (a: Appointment) => {
    const s = STATUS[a.status] ?? { label: a.status, tone: "bg-stone-100 text-stone-700" };
    return (
      <li key={a.id} className="py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{a.title}</p>
          <p className="text-xs text-stone-500">{when(a.scheduledAt)}</p>
          {a.notes && <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{a.notes}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>
      </li>
    );
  };

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2 mr-auto"><CalendarDays className="w-5 h-5 text-brand" /> Appointments</h2>
        {!open && (
          <button onClick={() => { setOpen(true); setMsg(null); }} className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50">
            <Plus className="w-4 h-4" /> Book
          </button>
        )}
      </div>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-stone-50 p-4">
          <Field label="What's it for?" required maxLength={120} placeholder="e.g. Drop off laptop for repair" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Field label="Preferred date and time" type="datetime-local" required value={f.at}
            min={new Date(now - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
            onChange={(e) => setF({ ...f, at: e.target.value })} />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Anything we should know?</span>
            <textarea rows={3} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand-light/40" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={book.isPending} className="h-10 px-5 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">
              {book.isPending ? "Sending…" : "Request appointment"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-10 px-5 rounded-full border border-stone-300 text-sm hover:bg-white">Cancel</button>
          </div>
        </form>
      )}
      {!appointments ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        : appointments.length === 0 ? (!open && <p className="text-sm text-stone-500 mt-3">No appointments yet.</p>)
        : <>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mt-4">Upcoming</p>
            {upcoming.length ? <ul className="divide-y divide-stone-100">{upcoming.map(row)}</ul> : <p className="text-sm text-stone-500 py-2">Nothing booked.</p>}
            {past.length > 0 && <>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mt-4">Past</p>
              <ul className="divide-y divide-stone-100">{past.slice(0, 10).map(row)}</ul>
            </>}
          </>}
    </section>
  );
}
