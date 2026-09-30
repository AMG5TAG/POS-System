import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { CheckCircle2, Circle, Loader2, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { CARRIERS, type MailInStatusView } from "@/lib/mail-in";
import { MailInTrackingForm } from "@/components/MailInTrackingForm";

/* The link from the confirmation email: where the parcel is up to, and the
   place to add or correct its tracking number while it's on the way. */

const STAGES = [
  { key: "awaiting_postage", label: "Request received" },
  { key: "in_transit", label: "Posted — tracking added" },
  { key: "received", label: "Arrived with us" },
];

export default function MailInTrack() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const key = ["shop-mail-in-track", token];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api<MailInStatusView>(`/shop/mail-in/track/${token}`),
    retry: false,
  });

  if (isLoading) return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="font-semibold">We couldn't find that mail-in request.</p>
        <p className="text-stone-600 mt-1">Check the link in your email, or <Link href="/mail-in" className="text-brand hover:underline">start a new request</Link>.</p>
      </div>
    );
  }

  const reached = STAGES.findIndex((s) => s.key === data.status);
  const open = data.status === "awaiting_postage" || data.status === "in_transit";
  const carrier = CARRIERS.find((c) => c.id === data.trackingCarrier)?.name ?? data.trackingCarrier;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">Mail-in {data.reference}</p>
        <h1 className="text-2xl md:text-3xl font-bold mt-1">{data.device}</h1>
      </div>

      {data.status === "cancelled" ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5">This request was cancelled. Please contact us if that's unexpected.</div>
      ) : (
        <ol className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
          {STAGES.map((s, i) => (
            <li key={s.key} className={`flex items-center gap-3 ${i <= reached ? "text-ink" : "text-stone-400"}`}>
              {i <= reached ? <CheckCircle2 className="w-5 h-5 text-brand" /> : <Circle className="w-5 h-5" />}
              <span className={i === reached ? "font-semibold" : ""}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}

      {data.status === "received" && (
        <p className="text-stone-700">Your device has arrived. We'll diagnose it and send you a quote — nothing is repaired without your approval.</p>
      )}

      {open && (
        <>
          {(data.addressLines?.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-brand" /> Post it to</h2>
              <address className="not-italic mt-2">{data.addressLines!.map((l, i) => <span key={i} className="block">{l}</span>)}</address>
              <p className="text-sm text-stone-600 mt-3">Include a note with <strong>{data.reference}</strong> inside. We recommend registered, tracked post.</p>
            </div>
          )}
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold text-lg">{data.trackingNumber ? "Tracking number" : "Add your tracking number"}</h2>
            {data.trackingNumber && <p className="mt-1 text-stone-700">{carrier}: <strong>{data.trackingNumber}</strong> — you can correct it below.</p>}
            <div className="mt-4">
              <MailInTrackingForm key={data.trackingNumber ?? ""} token={token} initial={{ carrier: data.trackingCarrier, number: data.trackingNumber }}
                onSaved={(v) => qc.setQueryData(key, (old: MailInStatusView | undefined) => ({ ...old, ...v }))} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
