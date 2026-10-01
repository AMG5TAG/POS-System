import { useState } from "react";
import { ChevronDown, ExternalLink, Loader2, Package, Store, Globe } from "lucide-react";
import { useOrders, type OrderLine } from "@/lib/account";
import { money } from "@/lib/format";

const date = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

const ONLINE_TONE: Record<string, string> = {
  new: "bg-blue-100 text-blue-800", processing: "bg-amber-100 text-amber-800", ready: "bg-violet-100 text-violet-800",
  shipped: "bg-sky-100 text-sky-800", delivered: "bg-emerald-100 text-emerald-800", cancelled: "bg-stone-200 text-stone-700",
};

type Tab = "in-store" | "online";

/* Orders: everything bought in store (the till's sales on any of the
   shopper's records) and everything ordered online, under two tabs. A paid
   online order shows only under Online (GET /shop/account/orders). */
export function OrdersCard() {
  const { data } = useOrders();
  const [tab, setTab] = useState<Tab>("in-store");

  const tabs: { key: Tab; label: string; icon: typeof Store; count: number | null }[] = [
    { key: "in-store", label: "In-Store", icon: Store, count: data?.inStore.length ?? null },
    { key: "online", label: "Online", icon: Globe, count: data?.online.length ?? null },
  ];

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Package className="w-5 h-5 text-brand" /> Orders</h2>
      <div role="tablist" aria-label="Orders" className="mt-4 inline-flex rounded-full bg-stone-100 p-1">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition ${tab === t.key ? "bg-white shadow-sm text-stone-900" : "text-stone-600 hover:text-stone-900"}`}>
            <t.icon className="w-4 h-4" /> {t.label}{t.count != null && <span className="text-stone-400 tabular-nums">{t.count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-2">
        {!data ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
          : tab === "in-store" ? (
            data.inStore.length === 0 ? <p className="text-sm text-stone-500 mt-3">No in-store purchases yet.</p>
            : <ul className="divide-y divide-stone-100">
                {data.inStore.map((s) => (
                  <OrderRow key={s.id} title={`Receipt ${s.receiptNumber}`} sub={[date(s.date), s.payment].filter(Boolean).join(" · ")}
                    total={s.total} lines={s.lines}
                    badge={s.status === "refunded" ? { label: "Refunded", tone: "bg-stone-200 text-stone-700" } : null} />
                ))}
              </ul>
          ) : (
            data.online.length === 0 ? <p className="text-sm text-stone-500 mt-3">No online orders yet.</p>
            : <ul className="divide-y divide-stone-100">
                {data.online.map((o) => (
                  <OrderRow key={o.id} title={`Order #${o.number}`} sub={[date(o.date), o.shippingMethod].filter(Boolean).join(" · ")}
                    total={o.total} lines={o.lines}
                    badge={{ label: o.statusLabel, tone: ONLINE_TONE[o.status] ?? "bg-stone-100 text-stone-700" }}
                    extra={o.tracking && (
                      <p className="text-sm text-stone-600">
                        Tracking{o.tracking.carrier ? ` (${o.tracking.carrier})` : ""}:{" "}
                        {o.tracking.url
                          ? <a href={o.tracking.url} target="_blank" rel="noreferrer" className="text-brand underline inline-flex items-center gap-1">{o.tracking.number} <ExternalLink className="w-3.5 h-3.5" /></a>
                          : <span className="font-mono">{o.tracking.number}</span>}
                      </p>
                    )} />
                ))}
              </ul>
          )}
      </div>
    </section>
  );
}

function OrderRow({ title, sub, total, lines, badge, extra }: {
  title: string; sub: string; total: number; lines: OrderLine[];
  badge: { label: string; tone: string } | null; extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const summary = lines.length === 0 ? "" : lines.length === 1 ? lines[0].name : `${lines[0].name} and ${lines.length - 1} more`;
  return (
    <li className="py-4 space-y-2">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-start gap-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-stone-500">{sub}</p>
          {summary && !open && <p className="text-sm text-stone-600 truncate mt-0.5">{summary}</p>}
        </div>
        <div className="shrink-0 text-right space-y-1">
          <p className="font-semibold tabular-nums">{money(total)}</p>
          {badge && <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.tone}`}>{badge.label}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && lines.length > 0 && (
        <ul className="text-sm rounded-xl bg-stone-50 px-3 py-2 space-y-1">
          {lines.map((l, n) => (
            <li key={n} className="flex gap-3">
              <span className="flex-1 min-w-0">{l.quantity !== 1 && <span className="text-stone-500">{l.quantity} × </span>}{l.name}</span>
              <span className="shrink-0 tabular-nums">{money(l.total)}</span>
            </li>
          ))}
        </ul>
      )}
      {extra}
    </li>
  );
}
