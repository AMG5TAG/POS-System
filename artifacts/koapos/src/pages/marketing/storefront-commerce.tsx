import {
  createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode,
} from "react";
import { ShoppingCart, X, Plus, Minus, Trash2, Package, Loader2, CheckCircle2, Search, Star, BadgeCheck } from "lucide-react";
import type { Block, ThemeSettings } from "@/pages/app/management-online-store";
import { cn } from "@/lib/utils";

/*
 * Self-contained storefront commerce layer for the public website builder store.
 * Adds a real cart + checkout on top of the (display-only) block renderer without
 * touching the shared BlockPreview used by the builder. All visuals are inline-
 * styled from the merchant theme so the storefront keeps its own look.
 */

/* ── Catalog + cart types ────────────────────────────────────────────────── */

export interface CatalogItem {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  sku: string;
  categoryId: number | null;
  categoryName: string;
  inStock: boolean;
  avgRating: number;
  reviewCount: number;
}

export interface Catalog {
  storeName: string;
  checkoutEnabled: boolean;
  reviewsEnabled: boolean;
  items: CatalogItem[];
}

export interface CartLine {
  productId: number;
  name: string;
  price: number;
  imageUrl: string;
  qty: number;
}

interface CartCtxValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  checkoutEnabled: boolean;
  add: (item: CatalogItem, qty?: number) => void;
  setQty: (productId: number, qty: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  open: boolean;
  setOpen: (b: boolean) => void;
}

const CartContext = createContext<CartCtxValue | null>(null);
export const useCart = (): CartCtxValue => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};

const money = (n: number) => `$${n.toFixed(2)}`;

/* ── Provider (localStorage-backed, keyed per store) ─────────────────────── */

export function CartProvider({
  storeKey, checkoutEnabled, children,
}: { storeKey: string; checkoutEnabled: boolean; children: ReactNode }) {
  const lsKey = `koapos-cart:${storeKey}`;
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(lsKey) : null;
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch { return []; }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(lsKey, JSON.stringify(lines)); } catch { /* quota / private mode */ }
  }, [lines, lsKey]);

  const add = useCallback((item: CatalogItem, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === item.id);
      if (existing) return prev.map((l) => l.productId === item.id ? { ...l, qty: l.qty + qty } : l);
      return [...prev, { productId: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl, qty }];
    });
    setOpen(true);
  }, []);

  const setQty = useCallback((productId: number, qty: number) => {
    setLines((prev) => qty <= 0
      ? prev.filter((l) => l.productId !== productId)
      : prev.map((l) => l.productId === productId ? { ...l, qty } : l));
  }, []);

  const remove = useCallback((productId: number) => setLines((prev) => prev.filter((l) => l.productId !== productId)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartCtxValue>(() => ({
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: lines.reduce((s, l) => s + l.price * l.qty, 0),
    checkoutEnabled,
    add, setQty, remove, clear, open, setOpen,
  }), [lines, checkoutEnabled, add, setQty, remove, clear, open]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/* ── Cart button (for the header) ────────────────────────────────────────── */

export function CartButton({ theme }: { theme: ThemeSettings }) {
  const { count, setOpen, checkoutEnabled } = useCart();
  if (!checkoutEnabled) return null;
  return (
    <button
      onClick={() => setOpen(true)}
      className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full"
      style={{ backgroundColor: `${theme.primary}15`, color: theme.text }}
      aria-label="Open cart"
    >
      <ShoppingCart className="w-4 h-4" />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: theme.primary }}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Order tracking ──────────────────────────────────────────────────────── */

const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Order received", pending: "Order received", accepted: "Processing",
  preparing: "Processing", ready: "Ready for pickup", out_for_delivery: "On its way",
  delivered: "Delivered", cancelled: "Cancelled",
};

interface OrderResult {
  orderNumber: string; status: string; paymentStatus: string;
  subtotal: number; discountTotal: number; total: number;
  items: { name: string; qty: number; price: number }[];
}

export function OrderTracker({ theme, lookupPath }: { theme: ThemeSettings; lookupPath: string }) {
  const rc = radiusClass(theme);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OrderResult | null>(null);

  async function lookup() {
    setError(""); setResult(null);
    if (!email.trim() || !orderNumber.trim()) { setError("Enter your email and order number."); return; }
    setLoading(true);
    try {
      const r = await fetch(lookupPath, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
        body: JSON.stringify({ email: email.trim(), orderNumber: orderNumber.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data?.error ?? "Order not found."); return; }
      setResult(data as OrderResult);
    } catch { setError("Network error — please try again."); }
    finally { setLoading(false); }
  }

  const reset = () => { setResult(null); setEmail(""); setOrderNumber(""); setError(""); };

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-sm opacity-70 hover:opacity-100 whitespace-nowrap" style={{ color: theme.text }}>Track order</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Track your order">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setOpen(false); }} />
          <div className="relative w-full max-w-sm rounded-xl shadow-xl p-5 space-y-3" style={{ backgroundColor: theme.bg, color: theme.text }}>
            <div className="flex items-center justify-between">
              <span className="font-bold">Track your order</span>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            {!result ? (
              <>
                <p className="text-xs opacity-70">Enter the email and order number from your confirmation.</p>
                <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 text-sm border rounded bg-transparent outline-none" style={{ borderColor: `${theme.text}25`, color: theme.text }} />
                <input placeholder="Order number (e.g. WEB-…)" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="w-full px-3 py-2 text-sm border rounded bg-transparent outline-none" style={{ borderColor: `${theme.text}25`, color: theme.text }} />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button onClick={lookup} disabled={loading} className={cn("w-full py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60", rc)} style={{ backgroundColor: theme.primary }}>
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}{loading ? "Looking up…" : "Track order"}
                </button>
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="opacity-70">Order</span><span className="font-semibold">{result.orderNumber}</span></div>
                <div className="flex items-center justify-between"><span className="opacity-70">Status</span>
                  <span className="font-semibold px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: `${theme.primary}1a`, color: theme.primary }}>{ORDER_STATUS_LABEL[result.status] ?? result.status}</span>
                </div>
                <div className="flex items-center justify-between"><span className="opacity-70">Payment</span><span className="capitalize">{result.paymentStatus}</span></div>
                <div className="border-t pt-2 space-y-1" style={{ borderColor: `${theme.text}15` }}>
                  {result.items.map((it, i) => (
                    <div key={i} className="flex justify-between"><span className="opacity-80">{it.qty}× {it.name}</span><span>{money(it.price * it.qty)}</span></div>
                  ))}
                </div>
                {result.discountTotal > 0 && <div className="flex justify-between text-xs opacity-70"><span>Discount</span><span>−{money(result.discountTotal)}</span></div>}
                <div className="flex justify-between font-bold border-t pt-2" style={{ borderColor: `${theme.text}15` }}><span>Total</span><span>{money(result.total)}</span></div>
                <button onClick={reset} className="text-xs opacity-70 hover:opacity-100">Track another order</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Shoppable product grid (replaces placeholder product blocks) ────────── */

function radiusClass(theme: ThemeSettings) {
  return { none: "rounded-none", sm: "rounded", md: "rounded-lg", lg: "rounded-2xl" }[theme.radius] ?? "rounded-lg";
}

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} style={{ width: size, height: size }}
          className={n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-current opacity-25"} />
      ))}
    </span>
  );
}

/* Product detail drawer is opened from any product card via this context, so the
 * storefront finally has a product page (with reviews) without dedicated routing. */
interface ProductDetailCtxValue { open: (item: CatalogItem) => void; }
const ProductDetailContext = createContext<ProductDetailCtxValue | null>(null);
export const useProductDetail = (): ProductDetailCtxValue | null => useContext(ProductDetailContext);

/** Render real products for a product block, honouring its columns/count/category. */
export function ShoppableProducts({ block, catalog, theme }: { block: Block; catalog: Catalog; theme: ThemeSettings }) {
  const { add, checkoutEnabled } = useCart();
  const detail = useProductDetail();
  const rc = radiusClass(theme);

  const isFeatured = block.type === "featured-product";
  const cols = isFeatured ? 1 : (Number(block.data.columns) || 4);
  const count = isFeatured ? 1 : (Number(block.data.count) || 8);
  const baseCategory = String(block.data.category ?? "all");
  const headline = block.data.headline ? String(block.data.headline) : "";
  const searchable = !isFeatured && (block.data.search === true || block.data.search === "true");

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");

  const inBase = useCallback((p: CatalogItem) =>
    baseCategory === "all" || String(p.categoryId) === baseCategory || p.categoryName.toLowerCase() === baseCategory.toLowerCase(),
  [baseCategory]);

  // Categories available within this block's base scope, for the filter dropdown.
  const categories = useMemo(
    () => [...new Set(catalog.items.filter(inBase).map((p) => p.categoryName).filter(Boolean))].sort(),
    [catalog.items, inBase],
  );

  const items = useMemo(() => {
    let list = catalog.items.filter(inBase);
    if (searchable) {
      const q = query.trim().toLowerCase();
      if (cat !== "all") list = list.filter((p) => p.categoryName === cat);
      if (q) list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
      return list.slice(0, 60);
    }
    return list.slice(0, count);
  }, [catalog.items, inBase, searchable, query, cat, count]);

  const gridCols = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className="space-y-3">
      {headline && <h3 className="font-bold text-lg" style={{ color: theme.text }}>{headline}</h3>}
      {searchable && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" style={{ color: theme.text }} />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…"
              className="w-full pl-8 pr-3 py-2 text-sm border rounded bg-transparent outline-none"
              style={{ borderColor: `${theme.text}25`, color: theme.text }}
            />
          </div>
          {categories.length > 1 && (
            <select
              value={cat} onChange={(e) => setCat(e.target.value)}
              className="px-3 py-2 text-sm border rounded bg-transparent outline-none"
              style={{ borderColor: `${theme.text}25`, color: theme.text }}
            >
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}
      {items.length === 0 ? (
        <div className={cn("p-6 text-center text-sm opacity-60 border border-dashed", rc)} style={{ color: theme.text }}>
          <Package className="w-6 h-6 mx-auto mb-2 opacity-40" />
          {searchable && (query || cat !== "all") ? "No products match your search." : "No products to show yet."}
        </div>
      ) : (
      <div className={cn("grid gap-3", isFeatured ? "grid-cols-1" : gridCols)}>
        {items.map((p) => (
          <div key={p.id} className={cn("flex flex-col overflow-hidden border", rc)} style={{ borderColor: `${theme.text}15` }}>
            <button type="button" onClick={() => detail?.open(p)}
              className={cn("bg-muted/40 flex items-center justify-center overflow-hidden cursor-pointer", isFeatured ? "aspect-[16/9]" : "aspect-square")}>
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                : <Package className="w-8 h-8 opacity-30" />}
            </button>
            <div className="p-3 flex flex-col gap-1 flex-1">
              <button type="button" onClick={() => detail?.open(p)} className="font-medium text-sm leading-snug text-left hover:underline" style={{ color: theme.text }}>{p.name}</button>
              {p.reviewCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] opacity-70" style={{ color: theme.text }}>
                  <Stars value={p.avgRating} /> ({p.reviewCount})
                </span>
              )}
              {isFeatured && p.description && (
                <p className="text-xs opacity-70 line-clamp-3" style={{ color: theme.text }}>{p.description}</p>
              )}
              <div className="mt-auto flex items-center justify-between pt-2 gap-2">
                <span className="font-bold text-sm" style={{ color: theme.text }}>{money(p.price)}</span>
                {checkoutEnabled && (
                  p.inStock ? (
                    <button
                      onClick={() => add(p)}
                      className={cn("px-3 py-1.5 text-xs font-semibold text-white", rc)}
                      style={{ backgroundColor: theme.primary }}
                    >
                      Add to cart
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium opacity-50" style={{ color: theme.text }}>Sold out</span>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

/* ── Product detail drawer (with reviews) ────────────────────────────────── */

interface ReviewItem { id: number; authorName: string; rating: number; title: string; body: string; verified: boolean; createdAt: string; }

export function ProductDetailProvider({ base, reviewsEnabled, theme, children }: { base: string; reviewsEnabled: boolean; theme: ThemeSettings; children: ReactNode }) {
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const open = useCallback((item: CatalogItem) => setSelected(item), []);
  return (
    <ProductDetailContext.Provider value={{ open }}>
      {children}
      {selected && (
        <ProductDetailDrawer item={selected} base={base} reviewsEnabled={reviewsEnabled} theme={theme} onClose={() => setSelected(null)} />
      )}
    </ProductDetailContext.Provider>
  );
}

function ProductDetailDrawer({ item, base, reviewsEnabled, theme, onClose }: { item: CatalogItem; base: string; reviewsEnabled: boolean; theme: ThemeSettings; onClose: () => void }) {
  const { add, checkoutEnabled } = useCart();
  const rc = radiusClass(theme);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<{ average: number; count: number }>({ average: item.avgRating, count: item.reviewCount });
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ authorName: "", authorEmail: "", rating: 5, title: "", body: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${base}/products/${item.id}/reviews`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (active) { setReviews(d.items ?? []); if (d.summary) setSummary(d.summary); } })
      .catch(() => { /* keep card summary */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [base, item.id]);

  async function submitReview() {
    setError("");
    if (!form.authorName.trim()) { setError("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.authorEmail.trim())) { setError("Please enter a valid email."); return; }
    if (!form.body.trim()) { setError("Please write a few words."); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${base}/products/${item.id}/reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
        body: JSON.stringify({ authorName: form.authorName.trim(), authorEmail: form.authorEmail.trim(), rating: form.rating, title: form.title.trim(), body: form.body.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data?.error ?? "Could not submit your review."); return; }
      setReviews((prev) => [data as ReviewItem, ...prev]);
      setSummary((s) => { const count = s.count + 1; return { count, average: Math.round(((s.average * s.count + data.rating) / count) * 10) / 10 }; });
      setThanks(true); setShowForm(false);
      setForm({ authorName: "", authorEmail: "", rating: 5, title: "", body: "" });
    } catch { setError("Network error — please try again."); }
    finally { setSubmitting(false); }
  }

  const panelBg = theme.bg || "#ffffff";
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={item.name}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full overflow-y-auto shadow-xl" style={{ backgroundColor: panelBg, color: theme.text }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: `${theme.text}15` }}>
          <span className="font-bold truncate">{item.name}</span>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="aspect-[16/10] bg-muted/40 flex items-center justify-center overflow-hidden">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" /> : <Package className="w-10 h-10 opacity-30" />}
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-bold">{money(item.price)}</span>
            {summary.count > 0 && <span className="flex items-center gap-1 text-xs opacity-80"><Stars value={summary.average} /> {summary.average} ({summary.count})</span>}
          </div>
          {item.description && <p className="text-sm opacity-80 whitespace-pre-wrap">{item.description}</p>}
          {checkoutEnabled && (
            item.inStock
              ? <button onClick={() => { add(item); onClose(); }} className={cn("w-full py-2.5 text-sm font-semibold text-white", rc)} style={{ backgroundColor: theme.primary }}>Add to cart</button>
              : <p className="text-sm font-medium opacity-60">Sold out</p>
          )}

          <div className="pt-2 border-t" style={{ borderColor: `${theme.text}15` }}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">Reviews {summary.count > 0 && <span className="opacity-60">({summary.count})</span>}</h4>
              {reviewsEnabled && !showForm && <button onClick={() => { setShowForm(true); setThanks(false); }} className="text-xs font-medium" style={{ color: theme.primary }}>Write a review</button>}
            </div>
            {thanks && <p className="text-xs mb-2" style={{ color: theme.primary }}>Thanks for your review!</p>}

            {reviewsEnabled && showForm && (
              <div className="space-y-2 mb-3 p-3 rounded-lg border" style={{ borderColor: `${theme.text}15` }}>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setForm((f) => ({ ...f, rating: n }))} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
                      <Star className={n <= form.rating ? "w-5 h-5 fill-amber-400 text-amber-400" : "w-5 h-5 opacity-30"} />
                    </button>
                  ))}
                </div>
                <input placeholder="Your name" value={form.authorName} onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded bg-transparent outline-none" style={{ borderColor: `${theme.text}25`, color: theme.text }} />
                <input placeholder="Your email (not shown publicly)" value={form.authorEmail} onChange={(e) => setForm((f) => ({ ...f, authorEmail: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded bg-transparent outline-none" style={{ borderColor: `${theme.text}25`, color: theme.text }} />
                <input placeholder="Title (optional)" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded bg-transparent outline-none" style={{ borderColor: `${theme.text}25`, color: theme.text }} />
                <textarea placeholder="Your review" rows={3} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded bg-transparent outline-none" style={{ borderColor: `${theme.text}25`, color: theme.text }} />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="flex gap-2">
                  <button onClick={submitReview} disabled={submitting} className={cn("flex-1 py-2 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60", rc)} style={{ backgroundColor: theme.primary }}>
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}{submitting ? "Submitting…" : "Submit review"}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 text-sm opacity-70">Cancel</button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-xs opacity-60 py-3">Loading reviews…</p>
            ) : reviews.length === 0 ? (
              <p className="text-xs opacity-60 py-3">No reviews yet{reviewsEnabled ? " — be the first!" : "."}</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((rv) => (
                  <div key={rv.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Stars value={rv.rating} />
                      <span className="font-medium">{rv.authorName}</span>
                      {rv.verified && <span className="inline-flex items-center gap-0.5 text-[10px] opacity-70"><BadgeCheck className="w-3 h-3" /> Verified</span>}
                    </div>
                    {rv.title && <p className="font-medium mt-0.5">{rv.title}</p>}
                    <p className="opacity-80 mt-0.5 whitespace-pre-wrap">{rv.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Cart drawer + checkout ──────────────────────────────────────────────── */

const PRODUCT_BLOCK_TYPES = new Set<Block["type"]>(["product-grid", "featured-product", "product-category", "similar-products"]);
export const isProductBlock = (b: Block) => PRODUCT_BLOCK_TYPES.has(b.type);

interface CheckoutResult {
  orderNumber: string; subtotal: number; discountTotal: number; taxTotal: number; total: number; currency: string;
}

export function CartDrawer({ theme, checkoutPath }: { theme: ThemeSettings; checkoutPath: string }) {
  const { lines, subtotal, open, setOpen, setQty, remove, clear } = useCart();
  const rc = radiusClass(theme);
  const [checkingOut, setCheckingOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<CheckoutResult | null>(null);

  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    line: "", city: "", state: "", postcode: "",
    discountCode: "", notes: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  if (!open) return null;

  const closeAll = () => {
    setOpen(false);
    // Reset transient state after the drawer closes.
    setTimeout(() => { setCheckingOut(false); setError(""); }, 200);
  };

  async function placeOrder() {
    setError("");
    if (!form.name.trim()) { setError("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { setError("Please enter a valid email."); return; }
    setSubmitting(true);
    try {
      const r = await fetch(checkoutPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
          customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() },
          address: { line: form.line.trim(), city: form.city.trim(), state: form.state.trim(), postcode: form.postcode.trim() },
          discountCode: form.discountCode.trim() || undefined,
          notes: form.notes.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data?.error ?? "Could not place your order."); return; }
      setDone(data as CheckoutResult);
      clear();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const panelBg = theme.bg || "#ffffff";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Shopping cart">
      <div className="absolute inset-0 bg-black/40" onClick={closeAll} />
      <div className="relative w-full max-w-md h-full overflow-y-auto shadow-xl flex flex-col" style={{ backgroundColor: panelBg }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: `${theme.text}15` }}>
          <span className="font-bold" style={{ color: theme.text }}>
            {done ? "Order confirmed" : checkingOut ? "Checkout" : "Your cart"}
          </span>
          <button onClick={closeAll} aria-label="Close" style={{ color: theme.text }}><X className="w-5 h-5" /></button>
        </div>

        {/* Confirmation */}
        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8" style={{ color: theme.text }}>
            <CheckCircle2 className="w-14 h-14" style={{ color: theme.primary }} />
            <h3 className="text-lg font-bold">Thank you!</h3>
            <p className="text-sm opacity-80">Your order <strong>{done.orderNumber}</strong> has been placed.</p>
            <div className="w-full max-w-xs text-sm mt-2 space-y-1">
              <Row label="Subtotal" value={money(done.subtotal)} theme={theme} />
              {done.discountTotal > 0 && <Row label="Discount" value={`−${money(done.discountTotal)}`} theme={theme} />}
              <Row label="Total" value={money(done.total)} theme={theme} bold />
            </div>
            <p className="text-xs opacity-60 mt-2">A confirmation has been emailed to you. We'll be in touch about payment & delivery.</p>
            <button onClick={closeAll} className={cn("mt-3 px-5 py-2 text-sm font-semibold text-white", rc)} style={{ backgroundColor: theme.primary }}>
              Continue browsing
            </button>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-60" style={{ color: theme.text }}>
            <ShoppingCart className="w-10 h-10" />
            <p className="text-sm">Your cart is empty.</p>
          </div>
        ) : (
          <>
            {/* Line items */}
            <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: `${theme.text}10` }}>
              {lines.map((l) => (
                <div key={l.productId} className="flex gap-3 p-4">
                  <div className={cn("w-14 h-14 bg-muted/40 flex items-center justify-center overflow-hidden shrink-0", rc)}>
                    {l.imageUrl ? <img src={l.imageUrl} alt={l.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 opacity-30" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: theme.text }}>{l.name}</p>
                    <p className="text-xs opacity-70" style={{ color: theme.text }}>{money(l.price)}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => setQty(l.productId, l.qty - 1)} className="p-1 border rounded" style={{ borderColor: `${theme.text}25`, color: theme.text }} aria-label="Decrease"><Minus className="w-3 h-3" /></button>
                      <span className="text-sm w-6 text-center" style={{ color: theme.text }}>{l.qty}</span>
                      <button onClick={() => setQty(l.productId, l.qty + 1)} className="p-1 border rounded" style={{ borderColor: `${theme.text}25`, color: theme.text }} aria-label="Increase"><Plus className="w-3 h-3" /></button>
                      <button onClick={() => remove(l.productId)} className="p-1 ml-auto opacity-60 hover:opacity-100" style={{ color: theme.text }} aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="text-sm font-semibold shrink-0" style={{ color: theme.text }}>{money(l.price * l.qty)}</div>
                </div>
              ))}
            </div>

            {/* Checkout form */}
            {checkingOut && (
              <div className="px-4 py-3 space-y-2 border-t" style={{ borderColor: `${theme.text}15` }}>
                <FieldRow theme={theme}>
                  <ThemedInput theme={theme} placeholder="Full name *" value={form.name} onChange={(v) => set({ name: v })} />
                  <ThemedInput theme={theme} placeholder="Email *" value={form.email} onChange={(v) => set({ email: v })} />
                </FieldRow>
                <ThemedInput theme={theme} placeholder="Phone" value={form.phone} onChange={(v) => set({ phone: v })} />
                <ThemedInput theme={theme} placeholder="Address" value={form.line} onChange={(v) => set({ line: v })} />
                <FieldRow theme={theme}>
                  <ThemedInput theme={theme} placeholder="Suburb / City" value={form.city} onChange={(v) => set({ city: v })} />
                  <ThemedInput theme={theme} placeholder="State" value={form.state} onChange={(v) => set({ state: v })} />
                </FieldRow>
                <FieldRow theme={theme}>
                  <ThemedInput theme={theme} placeholder="Postcode" value={form.postcode} onChange={(v) => set({ postcode: v })} />
                  <ThemedInput theme={theme} placeholder="Discount code" value={form.discountCode} onChange={(v) => set({ discountCode: v })} />
                </FieldRow>
                <ThemedInput theme={theme} placeholder="Order notes (optional)" value={form.notes} onChange={(v) => set({ notes: v })} />
              </div>
            )}

            {/* Footer / totals */}
            <div className="p-4 border-t space-y-3" style={{ borderColor: `${theme.text}15` }}>
              <Row label="Subtotal" value={money(subtotal)} theme={theme} bold />
              {error && <p className="text-xs text-red-500">{error}</p>}
              {!checkingOut ? (
                <button onClick={() => setCheckingOut(true)} className={cn("w-full py-2.5 text-sm font-semibold text-white", rc)} style={{ backgroundColor: theme.primary }}>
                  Checkout
                </button>
              ) : (
                <button onClick={placeOrder} disabled={submitting} className={cn("w-full py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60", rc)} style={{ backgroundColor: theme.primary }}>
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Placing order…" : `Place order · ${money(subtotal)}`}
                </button>
              )}
              <p className="text-[11px] text-center opacity-60" style={{ color: theme.text }}>
                Payment is arranged after you order — we'll confirm by email.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Small themed helpers ────────────────────────────────────────────────── */

function Row({ label, value, theme, bold }: { label: string; value: string; theme: ThemeSettings; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between text-sm", bold && "font-bold")} style={{ color: theme.text }}>
      <span className={bold ? "" : "opacity-70"}>{label}</span><span>{value}</span>
    </div>
  );
}

function FieldRow({ children, theme }: { children: ReactNode; theme: ThemeSettings }) {
  void theme;
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function ThemedInput({ theme, placeholder, value, onChange }: { theme: ThemeSettings; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border rounded bg-transparent outline-none"
      style={{ borderColor: `${theme.text}25`, color: theme.text }}
    />
  );
}
