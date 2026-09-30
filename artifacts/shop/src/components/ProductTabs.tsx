import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Star } from "lucide-react";
import { api } from "@/lib/api";
import { reviewsKey, useReviews, type ProductDetail } from "@/lib/shop";
import { Stars } from "./Stars";

export type ProductTab = "description" | "specs" | "reviews";

/* The product page body: Description, Specifications and Reviews tabs. */
export function ProductTabs({ product, tab, onTab }: { product: ProductDetail; tab: ProductTab; onTab: (t: ProductTab) => void }) {
  const tabs: { key: ProductTab; label: string }[] = [
    { key: "description", label: "Description" },
    { key: "specs", label: "Specifications" },
    { key: "reviews", label: `Reviews${product.rating.count ? ` (${product.rating.count})` : ""}` },
  ];
  return (
    <section id="product-tabs" className="mt-12 scroll-mt-24">
      <div role="tablist" className="flex gap-1 border-b border-stone-200 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => onTab(t.key)}
            className={`px-4 sm:px-5 h-11 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${tab === t.key ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="py-6">
        {tab === "description" && (
          product.description
            ? <div className="max-w-3xl whitespace-pre-line text-stone-700 leading-relaxed break-words">{product.description}</div>
            : <p className="text-stone-500">No description yet.</p>
        )}
        {tab === "specs" && <Specifications product={product} />}
        {tab === "reviews" && <Reviews productId={product.id} />}
      </div>
    </section>
  );
}

/* ── Specifications ──────────────────────────────────────────────────── */

/** "Label: value" lines become table rows; any other line is shown whole. */
export function specRows(text: string): { label: string | null; value: string }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = /^([^:]{1,60}):\s*(.+)$/.exec(line);
    return m ? { label: m[1]!.trim(), value: m[2]!.trim() } : { label: null, value: line };
  });
}

const trim = (n: number) => String(Math.round(n * 10) / 10);

function Specifications({ product: p }: { product: ProductDetail }) {
  const rows = specRows(p.technicalSpecs);
  const d = p.dimensionsCm;
  const dims = d ? [d.length, d.width, d.height].map((v) => (v == null ? "–" : trim(v))).join(" × ") + " cm" : null;
  const weight = p.weightKg == null ? null : p.weightKg < 1 ? `${Math.round(p.weightKg * 1000)} g` : `${trim(p.weightKg)} kg`;
  const warranty = p.warranty ? `${p.warranty.duration} ${p.warranty.duration === 1 ? p.warranty.unit.replace(/s$/, "") : p.warranty.unit}` : null;
  const general = [
    { label: "Dimensions (L × W × H)", value: dims },
    { label: "Weight", value: weight },
    { label: "Warranty", value: warranty },
  ].filter((r): r is { label: string; value: string } => !!r.value);

  if (rows.length === 0 && general.length === 0) return <p className="text-stone-500">No specifications listed for this product.</p>;
  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      {rows.length > 0 && <SpecTable title="Technical specifications" rows={rows} />}
      {general.length > 0 && <SpecTable title="General" rows={general} />}
    </div>
  );
}

function SpecTable({ title, rows }: { title: string; rows: { label: string | null; value: string }[] }) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-stone-100 last:border-0 odd:bg-stone-50/60">
                {r.label != null
                  ? <><th scope="row" className="text-left font-medium text-stone-600 px-4 py-2.5 w-2/5 align-top">{r.label}</th><td className="px-4 py-2.5 break-words">{r.value}</td></>
                  : <td colSpan={2} className="px-4 py-2.5 break-words">{r.value}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Reviews ─────────────────────────────────────────────────────────── */

function Reviews({ productId }: { productId: number }) {
  const { data, isLoading } = useReviews(productId);
  if (isLoading || !data) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>;
  const { rating, reviews, viewer } = data;

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-10 items-start">
      <div className="space-y-4">
        <div>
          <p className="text-4xl font-extrabold">{rating.average != null ? rating.average.toFixed(1) : "–"}</p>
          <Stars value={rating.average ?? 0} className="w-5 h-5" />
          <p className="text-sm text-stone-500 mt-1">{rating.count} review{rating.count === 1 ? "" : "s"}</p>
        </div>
        <ReviewGate productId={productId} viewer={viewer} />
      </div>
      <div className="space-y-6">
        {reviews.length === 0 ? (
          <p className="text-stone-500">No reviews yet.{viewer.canReview && !viewer.myReview ? " Be the first to review it." : ""}</p>
        ) : reviews.map((r) => (
          <article key={r.id} className="border-b border-stone-200 pb-5 last:border-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars value={r.rating} />
              {r.title && <h4 className="font-semibold">{r.title}</h4>}
            </div>
            <p className="mt-2 whitespace-pre-line text-stone-700 break-words">{r.body}</p>
            <p className="mt-2 text-xs text-stone-500 flex items-center gap-1.5">
              {r.author} · {new Date(r.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              {r.verified && <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck className="w-3.5 h-3.5" /> Verified buyer</span>}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

/* Who sees the form: only a signed-in customer who bought the product. */
function ReviewGate({ productId, viewer }: { productId: number; viewer: { signedIn: boolean; canReview: boolean; myReview: { rating: number; title: string; body: string } | null } }) {
  if (!viewer.signedIn) {
    const next = encodeURIComponent(`${window.location.pathname}#reviews`);
    return (
      <p className="text-sm text-stone-600 rounded-xl bg-stone-100 p-4">
        Bought this from us? <Link href={`/account/login?next=${next}`} className="text-brand font-medium underline">Sign in</Link> to leave a review.
      </p>
    );
  }
  if (!viewer.canReview) {
    return <p className="text-sm text-stone-600 rounded-xl bg-stone-100 p-4">Reviews are from customers who've bought this item from us. Once you have, you can review it here.</p>;
  }
  return <ReviewForm productId={productId} existing={viewer.myReview} />;
}

function ReviewForm({ productId, existing }: { productId: number; existing: { rating: number; title: string; body: string } | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(!existing);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setSaved(false); }, [rating, title, body]);

  const save = useMutation({
    mutationFn: () => api(`/shop/products/${productId}/reviews`, { method: "POST", body: JSON.stringify({ rating, title, body }) }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: reviewsKey(productId) });
      void qc.invalidateQueries({ queryKey: ["shop-product", productId] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1) { setError("Choose a star rating"); return; }
    if (!body.trim()) { setError("Please write a few words about the product"); return; }
    save.mutate();
  };

  if (!open) {
    return (
      <div className="text-sm rounded-xl bg-brand-50 p-4 space-y-2">
        <p>{saved ? "Thanks — your review is up." : "You've reviewed this product."}</p>
        <button onClick={() => setOpen(true)} className="text-brand font-medium underline">Edit your review</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <p className="font-semibold">{existing ? "Edit your review" : "Write a review"}</p>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} className="p-0.5">
            <Star className={`w-6 h-6 ${(hover || rating) >= n ? "text-amber-400 fill-amber-400" : "text-stone-300"}`} />
          </button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Headline (optional)"
        className="w-full h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-brand" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={5} placeholder="What did you like or dislike?"
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={save.isPending} className="h-10 px-5 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 flex items-center gap-2">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}{existing ? "Update review" : "Post review"}
        </button>
        {existing && <button type="button" onClick={() => setOpen(false)} className="h-10 px-4 rounded-full text-sm hover:bg-stone-100">Cancel</button>}
      </div>
      <p className="text-xs text-stone-500">Shown with your first name and last initial.</p>
    </form>
  );
}
