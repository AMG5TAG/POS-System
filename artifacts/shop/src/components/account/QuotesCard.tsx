import { useState } from "react";
import { FileText, Loader2, Check, X } from "lucide-react";
import { useQuotes, useRespondToQuote, type Quote } from "@/lib/account";
import { Notice } from "@/components/Form";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const date = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

const STATUS: Record<Quote["status"], { label: string; tone: string }> = {
  sent:     { label: "Awaiting your reply", tone: "bg-amber-100 text-amber-800" },
  accepted: { label: "Approved",            tone: "bg-emerald-100 text-emerald-800" },
  declined: { label: "Declined",            tone: "bg-stone-200 text-stone-700" },
  expired:  { label: "Expired",             tone: "bg-stone-200 text-stone-700" },
};

/* Quotes sent to the customer. A sent, unexpired quote can be approved or
   declined here; approving one tied to a repair is the go-ahead for that job. */
export function QuotesCard() {
  const { data: quotes } = useQuotes();
  const respond = useRespondToQuote();
  const [confirm, setConfirm] = useState<{ id: number; decision: "accept" | "decline" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = (id: number, decision: "accept" | "decline") => {
    setError(null);
    respond.mutate({ id, decision }, {
      onSuccess: () => setConfirm(null),
      onError: (e) => { setError((e as Error).message); setConfirm(null); },
    });
  };

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-brand" /> Quotes</h2>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      {!quotes ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        : quotes.length === 0 ? <p className="text-sm text-stone-500 mt-3">No quotes from us yet.</p>
        : <ul className="divide-y divide-stone-100 mt-2">
            {quotes.map((q) => {
              const s = STATUS[q.status] ?? { label: q.status, tone: "bg-stone-100 text-stone-700" };
              const asking = confirm?.id === q.id ? confirm.decision : null;
              return (
                <li key={q.id} className="py-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">Quote {q.quoteNumber}</p>
                      <p className="text-xs text-stone-500">
                        {date(q.createdAt)}{q.expiryDate && q.status === "sent" ? ` · valid until ${date(q.expiryDate)}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>
                  </div>
                  {q.items.length > 0 && (
                    <ul className="text-sm rounded-xl bg-stone-50 px-3 py-2 space-y-1">
                      {q.items.map((i, n) => (
                        <li key={n} className="flex gap-3">
                          <span className="flex-1 min-w-0">{i.quantity !== 1 && <span className="text-stone-500">{i.quantity} × </span>}{i.description}</span>
                          <span className="shrink-0 tabular-nums">{aud(i.quantity * i.unitPrice)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                    <span className="font-semibold">Total {aud(q.total)}</span>
                    {q.depositRequired != null && q.depositRequired > 0 && (
                      <span className="text-stone-600">Deposit {aud(q.depositRequired)}, payable in store</span>
                    )}
                  </div>
                  {q.notes && <p className="text-sm text-stone-600 whitespace-pre-line">{q.notes}</p>}
                  {q.status === "sent" && (
                    asking ? (
                      <div className="rounded-xl border border-stone-200 p-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className="mr-auto">{asking === "accept" ? `Approve this quote for ${aud(q.total)}?` : "Decline this quote?"}</span>
                        <button onClick={() => setConfirm(null)} className="h-8 px-4 rounded-full border border-stone-300 hover:bg-stone-50">Cancel</button>
                        <button onClick={() => answer(q.id, asking)} disabled={respond.isPending}
                          className={`h-8 px-4 rounded-full text-white font-medium disabled:opacity-50 ${asking === "accept" ? "bg-brand hover:bg-brand-dark" : "bg-stone-700 hover:bg-stone-800"}`}>
                          {respond.isPending ? "Saving…" : asking === "accept" ? "Yes, approve" : "Yes, decline"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setConfirm({ id: q.id, decision: "accept" })}
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-dark">
                          <Check className="w-4 h-4" /> Approve
                        </button>
                        <button onClick={() => setConfirm({ id: q.id, decision: "decline" })}
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50">
                          <X className="w-4 h-4" /> Decline
                        </button>
                      </div>
                    )
                  )}
                </li>
              );
            })}
          </ul>}
    </section>
  );
}
