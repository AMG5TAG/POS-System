import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/* The cart lives in this browser until checkout. Prices here are only for
   display — checkout reprices every line from the POS catalogue. */
export interface CartLine {
  productId: number;
  variantId: number | null;
  name: string;
  variantName: string | null;
  price: number;
  imageUrl: string | null;
  qty: number;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (productId: number, variantId: number | null, qty: number) => void;
  remove: (productId: number, variantId: number | null) => void;
  clear: () => void;
}

const KEY = "kkshop_cart_v1";
const Ctx = createContext<CartCtx | null>(null);
const same = (l: CartLine, p: number, v: number | null) => l.productId === p && l.variantId === v;

function load(): CartLine[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private mode */ } }, [lines]);

  const value = useMemo<CartCtx>(() => ({
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100,
    add: (line, qty = 1) => setLines((cur) => {
      const hit = cur.find((l) => same(l, line.productId, line.variantId));
      return hit
        ? cur.map((l) => (l === hit ? { ...l, qty: Math.min(99, l.qty + qty) } : l))
        : [...cur, { ...line, qty }];
    }),
    setQty: (p, v, qty) => setLines((cur) => cur.map((l) => (same(l, p, v) ? { ...l, qty: Math.max(1, Math.min(99, qty)) } : l))),
    remove: (p, v) => setLines((cur) => cur.filter((l) => !same(l, p, v))),
    clear: () => setLines([]),
  }), [lines]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
