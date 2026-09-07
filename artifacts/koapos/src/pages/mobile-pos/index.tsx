import { useState, useEffect, useCallback, useMemo } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setHomeScreenApp } from "@/lib/home-screen";
import {
  ShoppingCart, FileText, Package, Loader2, LogOut, Plus, Minus, Trash2,
  Search, X, Check, Banknote, CreditCard, User, Wrench, CalendarDays, Link2, Star,
} from "lucide-react";

/**
 * Mobile POS web app — served at /b/:businessUsername/t/posapp.
 * A staff member signs in with their PIN (scoped to the business); the session
 * unlocks only the /api/mobile-pos endpoints. Three tabs — Sell, Invoices,
 * Products — each gated by the merchant's Mobile POS settings.
 */

type Settings = { enabled: boolean; showSell: boolean; showInvoices: boolean; showProducts: boolean };
type Business = { businessName: string; logoUrl: string | null; username?: string | null };
type StaffInfo = { id: number; name: string; role: string };
type Product = { id: number; name: string; price: number; sku: string | null; imageUrl: string | null; taxRate: number; trackInventory: boolean; stockQuantity: number };
type InvoiceRow = { id: number; invoiceNumber: string; status: string; total: number; amountPaid: number; dueDate: string | null; createdAt: string; customerName: string | null };
type CartLine = { productId: number | null; name: string; unitPrice: number; quantity: number; taxRate: number };
type MposCustomer = { id: number; name: string; phone: string | null; email: string | null };
type MposService = { id: number; jobNumber: string; title: string; deviceType: string | null; deviceDescription: string | null; status: string };
type MposAppointment = { id: number; title: string; scheduledAt: string | null; status: string };
type SaleLink = { kind: "service" | "appointment"; id: number; label: string };

async function mpFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const r = await fetch(`/api/mobile-pos${path}`, {
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
    const data = (await r.json().catch(() => null)) as T | null;
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

const money = (n: number) => `$${n.toFixed(2)}`;

const STATUS_CLASS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700", sent: "bg-blue-100 text-blue-700",
  draft: "bg-slate-100 text-slate-600", overdue: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-700", cancelled: "bg-zinc-100 text-zinc-500",
};

export default function MobilePosAppPage() {
  const [, params] = useRoute("/b/:businessUsername/t/posapp");
  const username = params?.businessUsername ?? "";

  const [phase, setPhase] = useState<"boot" | "login" | "app" | "no-business">("boot");
  const [business, setBusiness] = useState<Business | null>(null);
  const [, setStaff] = useState<StaffInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pin, setPin] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  /* Boot: resolve existing session, else show login for this business. */
  useEffect(() => {
    let active = true;
    (async () => {
      const me = await mpFetch<{ staff: StaffInfo; business: Business; settings: Settings }>("/me");
      if (!active) return;
      if (me.ok && me.data) {
        setStaff(me.data.staff); setBusiness(me.data.business); setSettings(me.data.settings);
        setPhase("app");
        return;
      }
      const info = await mpFetch<Business>(`/b/${encodeURIComponent(username)}/info`);
      if (!active) return;
      if (info.ok && info.data) { setBusiness(info.data); setPhase("login"); }
      else setPhase("no-business");
    })();
    return () => { active = false; };
  }, [username]);

  /* Brand the home-screen icon for this business's Mobile POS. */
  useEffect(() => {
    if (business) setHomeScreenApp({ name: `${business.businessName} POS`, iconUrl: business.logoUrl });
  }, [business]);

  const handleLogin = async () => {
    if (!pin.trim() || loggingIn) return;
    setLoggingIn(true);
    const r = await mpFetch<{ staff: StaffInfo; business: Business; settings: Settings }>(`/b/${encodeURIComponent(username)}/login`, {
      method: "POST", body: JSON.stringify({ pin: pin.trim() }),
    });
    setLoggingIn(false);
    if (r.ok && r.data) {
      setStaff(r.data.staff); setBusiness(r.data.business); setSettings(r.data.settings);
      setPin(""); setPhase("app");
    } else {
      toast.error(r.data && (r.data as { error?: string }).error ? (r.data as { error?: string }).error : "Invalid PIN");
      setPin("");
    }
  };

  const handleLogout = async () => {
    await mpFetch("/logout", { method: "POST" });
    setStaff(null); setSettings(null); setPhase("login");
  };

  if (phase === "boot") {
    return <div className="min-h-screen flex items-center justify-center bg-muted/30"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>;
  }

  if (phase === "no-business") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center">
        <Package className="w-10 h-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Business not found</h1>
        <p className="text-sm text-muted-foreground">Check the link address and try again.</p>
      </div>
    );
  }

  if (phase === "login") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-xs bg-background rounded-2xl border shadow-sm p-6 space-y-5 text-center">
          {business?.logoUrl
            ? <img src={business.logoUrl} alt="" className="w-16 h-16 rounded-xl object-contain mx-auto" />
            : <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto"><ShoppingCart className="w-8 h-8 text-primary" /></div>}
          <div>
            <h1 className="text-lg font-bold">{business?.businessName ?? "Mobile POS"}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Enter your staff PIN to sign in</p>
          </div>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => { if (e.key === "Enter") void handleLogin(); }}
            type="password" inputMode="numeric" autoFocus
            placeholder="••••"
            className="w-full text-center text-2xl tracking-[0.5em] rounded-xl border py-3 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => void handleLogin()}
            disabled={!pin.trim() || loggingIn}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Sign in
          </button>
        </div>
      </div>
    );
  }

  return <MobilePosShell business={business} settings={settings} onLogout={() => void handleLogout()} />;
}

/* ── Authenticated shell with bottom nav ──────────────────────────────── */

function MobilePosShell({ business, settings, onLogout }: { business: Business | null; settings: Settings | null; onLogout: () => void }) {
  const tabs = useMemo(() => {
    const t: { key: "sell" | "invoices" | "products"; label: string; icon: typeof ShoppingCart }[] = [];
    if (settings?.showSell)     t.push({ key: "sell",     label: "Sell",     icon: ShoppingCart });
    if (settings?.showInvoices) t.push({ key: "invoices", label: "Invoices", icon: FileText });
    if (settings?.showProducts) t.push({ key: "products", label: "Products", icon: Package });
    return t;
  }, [settings]);

  const [tab, setTab] = useState<"sell" | "invoices" | "products">("sell");
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.key === tab)) setTab(tabs[0]!.key);
  }, [tabs, tab]);

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-background border-b px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {business?.logoUrl
            ? <img src={business.logoUrl} alt="" className="w-7 h-7 rounded-lg object-contain" />
            : <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><ShoppingCart className="w-4 h-4 text-primary" /></div>}
          <span className="font-semibold text-sm truncate">{business?.businessName ?? "Mobile POS"}</span>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </header>

      <main className="flex-1 min-h-0 overflow-auto pb-24">
        {tab === "sell" && settings?.showSell && <SellTab />}
        {tab === "invoices" && settings?.showInvoices && <InvoicesTab />}
        {tab === "products" && settings?.showProducts && <ProductsTab />}
        {tabs.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No tabs are enabled for this app. Ask your manager to enable Sell, Invoices or Products.</div>
        )}
      </main>

      {tabs.length > 0 && (
        <nav className="fixed bottom-0 inset-x-0 z-10 bg-background border-t flex">
          {tabs.map((t) => {
            const active = t.key === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn("flex-1 flex flex-col items-center gap-1 py-3.5 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="w-6 h-6" /> {t.label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/* ── Link a sale/invoice to a Service or Appointment ─────────────────────── */

function LinkSelector({ value, onChange }: { value: SaleLink | null; onChange: (l: SaleLink | null) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"service" | "appointment">("service");
  const [search, setSearch] = useState("");
  const [services, setServices] = useState<MposService[] | null>(null);
  const [appts, setAppts] = useState<MposAppointment[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (mode === "service") {
        const r = await mpFetch<{ items: MposService[] }>(`/service-jobs${search ? `?search=${encodeURIComponent(search)}` : ""}`);
        setServices(r.ok && r.data ? r.data.items : []);
      } else {
        const r = await mpFetch<{ items: MposAppointment[] }>(`/appointments${search ? `?search=${encodeURIComponent(search)}` : ""}`);
        setAppts(r.ok && r.data ? r.data.items : []);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [open, mode, search]);

  const pick = (l: SaleLink) => { onChange(l); setOpen(false); setSearch(""); };

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
        {value.kind === "service" ? <Wrench className="w-4 h-4 text-primary shrink-0" /> : <CalendarDays className="w-4 h-4 text-primary shrink-0" />}
        <p className="flex-1 min-w-0 text-sm font-medium truncate">{value.label}</p>
        <button onClick={() => onChange(null)} aria-label="Remove link" className="text-muted-foreground"><X className="w-4 h-4" /></button>
      </div>
    );
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <Link2 className="w-4 h-4" /> Link service or appointment
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border p-2 bg-muted/20">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
          {(["service", "appointment"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setSearch(""); }}
              className={cn("px-3 py-1.5", mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
              {m === "service" ? "Services" : "Appointments"}
            </button>
          ))}
        </div>
        <button onClick={() => { setOpen(false); setSearch(""); }} aria-label="Cancel" className="ml-auto text-muted-foreground"><X className="w-4 h-4" /></button>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={mode === "service" ? "Search service jobs…" : "Search appointments…"}
          className="w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div className="max-h-44 overflow-auto rounded-lg divide-y bg-background border">
        {mode === "service" ? (
          services == null
            ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            : services.length === 0
              ? <p className="py-6 text-center text-xs text-muted-foreground">No service jobs found.</p>
              : services.map((s) => (
                <button key={s.id} onClick={() => pick({ kind: "service", id: s.id, label: `${s.jobNumber} — ${s.title || s.deviceDescription || s.deviceType || "Service"}` })}
                  className="w-full text-left px-3 py-2 active:bg-muted/60">
                  <p className="text-sm font-medium truncate">{s.jobNumber} · {s.title || s.deviceDescription || s.deviceType || "Service"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{s.status}</p>
                </button>
              ))
        ) : (
          appts == null
            ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            : appts.length === 0
              ? <p className="py-6 text-center text-xs text-muted-foreground">No appointments found.</p>
              : appts.map((a) => (
                <button key={a.id} onClick={() => pick({ kind: "appointment", id: a.id, label: a.title })}
                  className="w-full text-left px-3 py-2 active:bg-muted/60">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.scheduledAt ? new Date(a.scheduledAt).toLocaleString() : ""}</p>
                </button>
              ))
        )}
      </div>
    </div>
  );
}

/* ── Sell ─────────────────────────────────────────────────────────────── */

function SellTab() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [filterFav, setFilterFav] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<"cash" | "card" | "eftpos">("cash");
  const [checkout, setCheckout] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* Optional customer attached to the sale. */
  const [customer, setCustomer] = useState<MposCustomer | null>(null);
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState<MposCustomer[]>([]);
  const [custOpen, setCustOpen] = useState(false);
  const [link, setLink] = useState<SaleLink | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await mpFetch<{ items: Product[] }>(`/products${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setProducts(r.ok && r.data ? r.data.items : []);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  /* Load the merchant's pinned favourites once. */
  useEffect(() => {
    void mpFetch<{ productIds: number[] }>("/favourites").then((r) => {
      if (r.ok && r.data) setFavIds(new Set(r.data.productIds));
    });
  }, []);

  /* Toggle a favourite and persist the new list immediately. */
  const toggleFav = (id: number) => {
    setFavIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      void mpFetch("/favourites", { method: "PUT", body: JSON.stringify({ productIds: [...next] }) });
      return next;
    });
  };

  /* Customer search (server requires ≥2 chars). */
  useEffect(() => {
    if (!custOpen) return;
    const q = custSearch.trim();
    if (q.length < 2) { setCustResults([]); return; }
    const t = setTimeout(async () => {
      const r = await mpFetch<{ items: MposCustomer[] }>(`/customers?search=${encodeURIComponent(q)}`);
      setCustResults(r.ok && r.data ? r.data.items : []);
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch, custOpen]);

  const addToCart = (p: Product) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) { const next = [...c]; next[i] = { ...next[i]!, quantity: next[i]!.quantity + 1 }; return next; }
      return [...c, { productId: p.id, name: p.name, unitPrice: p.price, quantity: 1, taxRate: p.taxRate }];
    });
  };
  const setQty = (idx: number, delta: number) => {
    setCart((c) => c.flatMap((l, i) => {
      if (i !== idx) return [l];
      const q = l.quantity + delta;
      return q <= 0 ? [] : [{ ...l, quantity: q }];
    }));
  };

  const total = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  const submitSale = async () => {
    if (!cart.length || submitting) return;
    setSubmitting(true);
    const r = await mpFetch<{ receiptNumber: string; changeDue: number | null }>("/sale", {
      method: "POST",
      body: JSON.stringify({
        items: cart, paymentMethod: payment, customerId: customer?.id ?? null,
        serviceJobId: link?.kind === "service" ? link.id : null,
        appointmentId: link?.kind === "appointment" ? link.id : null,
      }),
    });
    setSubmitting(false);
    if (r.ok && r.data) {
      toast.success(`Sale complete — ${r.data.receiptNumber}${r.data.changeDue ? ` · change ${money(r.data.changeDue)}` : ""}`);
      setCart([]); setCheckout(false);
      setCustomer(null); setCustOpen(false); setCustSearch(""); setCustResults([]);
      setLink(null);
    } else {
      toast.error(r.data && (r.data as { error?: string }).error ? (r.data as { error?: string }).error! : "Sale failed");
    }
  };

  return (
    <div className="flex flex-col">
      <div className="sticky top-[49px] z-[5] bg-muted/20 px-3 py-2 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilterFav(false)}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors",
              !filterFav ? "bg-primary text-primary-foreground" : "bg-background border text-muted-foreground")}
          >
            All
          </button>
          <button
            onClick={() => setFilterFav(true)}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1",
              filterFav ? "bg-primary text-primary-foreground" : "bg-background border text-muted-foreground")}
          >
            <Star className={cn("w-3.5 h-3.5", filterFav && "fill-current")} />
            Favourites{favIds.size ? ` (${favIds.size})` : ""}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
        {(() => {
          if (products == null) return <div className="col-span-full py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
          const shown = filterFav ? products.filter((p) => favIds.has(p.id)) : products;
          if (shown.length === 0) {
            return (
              <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                {filterFav ? "No favourites yet — tap the star on a product to pin it here." : "No products found."}
              </p>
            );
          }
          return shown.map((p) => (
            <div key={p.id} className="relative">
              <button onClick={() => addToCart(p)}
                className="w-full rounded-xl border bg-background p-2.5 text-left active:scale-95 transition-transform">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt="" className="w-full h-16 object-cover rounded-lg mb-1.5" />
                  : <div className="w-full h-16 rounded-lg bg-muted mb-1.5 flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>}
                <p className="text-xs font-medium leading-tight line-clamp-2">{p.name}</p>
                <p className="text-sm font-semibold mt-0.5">{money(p.price)}</p>
              </button>
              <button
                onClick={() => toggleFav(p.id)}
                aria-label={favIds.has(p.id) ? "Remove from favourites" : "Add to favourites"}
                className="absolute top-1 right-1 w-7 h-7 rounded-full bg-background/90 border flex items-center justify-center shadow-sm active:scale-90 transition-transform"
              >
                <Star className={cn("w-3.5 h-3.5", favIds.has(p.id) ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              </button>
            </div>
          ));
        })()}
      </div>

      {/* Cart bar */}
      {count > 0 && !checkout && (
        <button onClick={() => setCheckout(true)}
          className="fixed bottom-[76px] inset-x-3 z-[8] rounded-xl bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-lg">
          <span className="flex items-center gap-2 text-sm font-medium"><ShoppingCart className="w-4 h-4" /> {count} item{count !== 1 ? "s" : ""}</span>
          <span className="text-sm font-bold">{money(total)} · Checkout</span>
        </button>
      )}

      {/* Checkout sheet */}
      {checkout && (
        <div className="fixed inset-0 z-20 bg-black/40 flex items-end" onClick={() => setCheckout(false)}>
          <div className="w-full bg-background rounded-t-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold">Cart ({count})</h2>
              <button onClick={() => setCheckout(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-auto divide-y">
              {cart.map((l, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{money(l.unitPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQty(i, -1)} className="w-7 h-7 rounded-lg border flex items-center justify-center">{l.quantity === 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}</button>
                    <span className="w-5 text-center text-sm font-medium">{l.quantity}</span>
                    <button onClick={() => setQty(i, 1)} className="w-7 h-7 rounded-lg border flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="w-16 text-right text-sm font-semibold">{money(l.unitPrice * l.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t p-4 space-y-3">
              {/* Customer (optional) */}
              <div>
                {customer ? (
                  <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
                    <User className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{customer.name}</p>
                      {(customer.phone || customer.email) && (
                        <p className="text-xs text-muted-foreground truncate">{customer.phone || customer.email}</p>
                      )}
                    </div>
                    <button onClick={() => setCustomer(null)} aria-label="Remove customer" className="text-muted-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : custOpen ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={custSearch} onChange={(e) => setCustSearch(e.target.value)} autoFocus
                        placeholder="Search name or phone…"
                        className="w-full rounded-xl border bg-background pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        onClick={() => { setCustOpen(false); setCustSearch(""); setCustResults([]); }}
                        aria-label="Cancel customer search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {custResults.length > 0 && (
                      <div className="rounded-xl border divide-y max-h-40 overflow-auto">
                        {custResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => { setCustomer(c); setCustOpen(false); setCustSearch(""); setCustResults([]); }}
                            className="w-full text-left px-3 py-2 active:bg-muted/60"
                          >
                            <p className="text-sm font-medium truncate">{c.name}</p>
                            {(c.phone || c.email) && <p className="text-xs text-muted-foreground truncate">{c.phone || c.email}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                    {custSearch.trim().length >= 2 && custResults.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1">No customers found.</p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setCustOpen(true)}
                    className="w-full flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground"
                  >
                    <User className="w-4 h-4" /> Add customer (optional)
                  </button>
                )}
              </div>
              {/* Link to a service or appointment (optional) */}
              <LinkSelector value={link} onChange={setLink} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total (inc. GST)</span>
                <span className="text-lg font-bold">{money(total)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([["cash", Banknote, "Cash"], ["card", CreditCard, "Card"], ["eftpos", CreditCard, "EFTPOS"]] as const).map(([m, Icon, label]) => (
                  <button key={m} onClick={() => setPayment(m)}
                    className={cn("rounded-xl border py-2.5 flex flex-col items-center gap-1 text-xs font-medium",
                      payment === m ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
              <button onClick={() => void submitSale()} disabled={submitting}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Take {money(total)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Invoices ───────────────────────────────────────────────────────────── */

function InvoicesTab() {
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    const r = await mpFetch<{ items: InvoiceRow[] }>("/invoices");
    setRows(r.ok && r.data ? r.data.items : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div className="sticky top-[49px] z-[5] flex items-center justify-between bg-background border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Invoices</h2>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1 text-sm font-medium text-primary">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {rows == null ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No invoices yet. Tap “New” to create one.</p>
      ) : (
        <div className="divide-y">
          {rows.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-background">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{inv.invoiceNumber}</p>
                <p className="text-xs text-muted-foreground truncate">{inv.customerName ?? "No customer"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{money(inv.total)}</p>
                <span className={cn("inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 capitalize", STATUS_CLASS[inv.status] ?? "bg-slate-100 text-slate-600")}>{inv.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <NewInvoiceSheet onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />
      )}
    </div>
  );
}

/* ── New invoice (create from the mobile app) ───────────────────────────── */

function NewInvoiceSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);

  const [customer, setCustomer] = useState<MposCustomer | null>(null);
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState<MposCustomer[]>([]);
  const [custOpen, setCustOpen] = useState(false);

  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState<SaleLink | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!showProductSearch) return;
    const t = setTimeout(async () => {
      const r = await mpFetch<{ items: Product[] }>(`/products${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setProducts(r.ok && r.data ? r.data.items : []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, showProductSearch]);

  useEffect(() => {
    if (!custOpen) return;
    const q = custSearch.trim();
    if (q.length < 2) { setCustResults([]); return; }
    const t = setTimeout(async () => {
      const r = await mpFetch<{ items: MposCustomer[] }>(`/customers?search=${encodeURIComponent(q)}`);
      setCustResults(r.ok && r.data ? r.data.items : []);
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch, custOpen]);

  const addToCart = (p: Product) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) { const next = [...c]; next[i] = { ...next[i]!, quantity: next[i]!.quantity + 1 }; return next; }
      return [...c, { productId: p.id, name: p.name, unitPrice: p.price, quantity: 1, taxRate: p.taxRate }];
    });
  };
  const setQty = (idx: number, delta: number) => {
    setCart((c) => c.flatMap((l, i) => {
      if (i !== idx) return [l];
      const q = l.quantity + delta;
      return q <= 0 ? [] : [{ ...l, quantity: q }];
    }));
  };

  const total = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);

  const submit = async () => {
    if (!customer) { toast.error("Select a customer for the invoice"); return; }
    if (!cart.length || submitting) return;
    setSubmitting(true);
    const r = await mpFetch<{ invoiceNumber: string }>("/invoices", {
      method: "POST",
      body: JSON.stringify({
        items: cart, customerId: customer.id, dueDate: dueDate || null, notes: notes || undefined,
        serviceJobId: link?.kind === "service" ? link.id : null,
        appointmentId: link?.kind === "appointment" ? link.id : null,
      }),
    });
    setSubmitting(false);
    if (r.ok && r.data) {
      toast.success(`Invoice ${r.data.invoiceNumber} created`);
      onCreated();
    } else {
      toast.error(r.data && (r.data as { error?: string }).error ? (r.data as { error?: string }).error! : "Failed to create invoice");
    }
  };

  return (
    <div className="fixed inset-0 z-20 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-background rounded-t-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold">New Invoice</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Customer */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Customer</label>
            {customer ? (
              <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
                <User className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{customer.name}</p>
                  {(customer.phone || customer.email) && <p className="text-xs text-muted-foreground truncate">{customer.phone || customer.email}</p>}
                </div>
                <button onClick={() => setCustomer(null)} aria-label="Remove customer" className="text-muted-foreground"><X className="w-4 h-4" /></button>
              </div>
            ) : custOpen ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={custSearch} onChange={(e) => setCustSearch(e.target.value)} autoFocus
                    placeholder="Search name or phone…"
                    className="w-full rounded-xl border bg-background pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button onClick={() => { setCustOpen(false); setCustSearch(""); setCustResults([]); }} aria-label="Cancel" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-4 h-4" /></button>
                </div>
                {custResults.length > 0 && (
                  <div className="rounded-xl border divide-y max-h-40 overflow-auto">
                    {custResults.map((c) => (
                      <button key={c.id} onClick={() => { setCustomer(c); setCustOpen(false); setCustSearch(""); setCustResults([]); }} className="w-full text-left px-3 py-2 active:bg-muted/60">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {(c.phone || c.email) && <p className="text-xs text-muted-foreground truncate">{c.phone || c.email}</p>}
                      </button>
                    ))}
                  </div>
                )}
                {custSearch.trim().length >= 2 && custResults.length === 0 && <p className="text-xs text-muted-foreground px-1">No customers found.</p>}
              </div>
            ) : (
              <button onClick={() => setCustOpen(true)} className="w-full flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
                <User className="w-4 h-4" /> Select customer
              </button>
            )}
          </div>

          {/* Line items */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Items</label>
              <button onClick={() => setShowProductSearch((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-primary">
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>

            {showProductSearch && (
              <div className="space-y-2 rounded-xl border p-2 bg-muted/20">
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
                    className="w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="max-h-44 overflow-auto rounded-lg divide-y bg-background border">
                  {products == null
                    ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    : products.length === 0
                      ? <p className="py-6 text-center text-xs text-muted-foreground">No products found.</p>
                      : products.map((p) => (
                        <button key={p.id} onClick={() => addToCart(p)} className="w-full flex items-center gap-2 px-3 py-2 text-left active:bg-muted/60">
                          {p.imageUrl
                            ? <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                            : <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                          <span className="flex-1 min-w-0 text-sm truncate">{p.name}</span>
                          <span className="text-sm font-semibold">{money(p.price)}</span>
                        </button>
                      ))}
                </div>
              </div>
            )}

            {cart.length === 0 ? (
              <p className="text-xs text-muted-foreground">No items added yet.</p>
            ) : (
              <div className="rounded-xl border divide-y">
                {cart.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{money(l.unitPrice)} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setQty(i, -1)} className="w-7 h-7 rounded-lg border flex items-center justify-center">{l.quantity === 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}</button>
                      <span className="w-5 text-center text-sm font-medium">{l.quantity}</span>
                      <button onClick={() => setQty(i, 1)} className="w-7 h-7 rounded-lg border flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                    <span className="w-16 text-right text-sm font-semibold">{money(l.unitPrice * l.quantity)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Link to service / appointment */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Link (optional)</label>
            <LinkSelector value={link} onChange={setLink} />
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Due date (optional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes shown on the invoice…"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>

        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total (inc. GST)</span>
            <span className="text-lg font-bold">{money(total)}</span>
          </div>
          <button onClick={() => void submit()} disabled={submitting || !customer || cart.length === 0}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create invoice
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Products ───────────────────────────────────────────────────────────── */

function ProductsTab() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await mpFetch<{ items: Product[] }>(`/products${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setProducts(r.ok && r.data ? r.data.items : []);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <div className="sticky top-[49px] z-[5] bg-muted/20 px-3 py-2">
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>
      {products == null
        ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        : products.length === 0
          ? <p className="py-12 text-center text-sm text-muted-foreground">No products found.</p>
          : (
            <div className="divide-y">
              {products.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 bg-background">
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku ?? ""}{p.trackInventory ? `${p.sku ? " · " : ""}${p.stockQuantity} in stock` : ""}</p>
                  </div>
                  <span className="text-sm font-semibold">{money(p.price)}</span>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}
