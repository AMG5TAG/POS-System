import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { Gift, ShoppingCart } from "lucide-react";

const DISPLAY_KEY = "koapos_pos_display";

interface DisplayItem {
  name: string;
  qty: number;
  unitPrice: number;
  itemDiscount: number;
  lineTotal: number;
}

interface DisplayPayload {
  items: DisplayItem[];
  cartSubtotal: number;
  discountTotal: number;
  subtotal: number;
  taxTotal: number;
  total: number;
  loyaltyAmount: number;
  loyaltyLabel: string;
  loyaltyUnit: string;
  customerName: string | null;
  updatedAt: number;
}

function readPayload(): DisplayPayload | null {
  try {
    const raw = localStorage.getItem(DISPLAY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DisplayPayload;
  } catch {
    return null;
  }
}

export default function CustomerDisplayPage() {
  const [payload, setPayload] = useState<DisplayPayload | null>(readPayload);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISPLAY_KEY) {
        try { setPayload(e.newValue ? JSON.parse(e.newValue) : null); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    const interval = setInterval(() => setPayload(readPayload()), 1500);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(interval); };
  }, []);

  const isEmpty = !payload || payload.items.length === 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">
      {/* Header */}
      <div className="border-b border-white/10 px-10 py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="KoaPOS" className="w-9 h-9 object-contain opacity-90" />
          <span className="text-xl font-bold text-white/90 tracking-tight">KoaPOS</span>
        </div>
        {payload?.customerName && (
          <div className="text-sm text-white/50">
            Customer: <span className="text-white/80 font-medium">{payload.customerName}</span>
          </div>
        )}
      </div>

      {isEmpty ? (
        /* Idle screen */
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center">
            <ShoppingCart className="w-12 h-12 text-white/20" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-white/30">Welcome</p>
            <p className="text-white/20 mt-1">Waiting for items to be scanned...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Items list */}
          <div className="flex-1 overflow-y-auto px-10 py-6">
            <div className="space-y-2 max-w-2xl">
              {payload!.items.map((item, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-white/8">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-white/60 shrink-0">
                    {item.qty}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white/90 truncate">{item.name}</p>
                    <p className="text-sm text-white/40">{formatCurrency(item.unitPrice)} each</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-white/90">{formatCurrency(item.lineTotal)}</p>
                    {item.itemDiscount > 0 && (
                      <p className="text-xs text-red-400">−{formatCurrency(item.itemDiscount)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals panel */}
          <div className="w-80 border-l border-white/10 bg-white/5 flex flex-col justify-end px-8 py-8 shrink-0">
            <div className="space-y-3 text-sm">
              {payload!.discountTotal > 0 && (
                <div className="flex justify-between text-white/50">
                  <span>Before discounts</span>
                  <span>{formatCurrency(payload!.cartSubtotal)}</span>
                </div>
              )}
              {payload!.discountTotal > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Discount</span>
                  <span>−{formatCurrency(payload!.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-white/60">
                <span>Subtotal</span>
                <span>{formatCurrency(payload!.subtotal)}</span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>GST (10%)</span>
                <span>{formatCurrency(payload!.taxTotal)}</span>
              </div>
              <div className="flex justify-between text-3xl font-bold text-white pt-4 border-t border-white/20">
                <span>Total</span>
                <span style={{ color: "#efbf04" }}>{formatCurrency(payload!.total)}</span>
              </div>

              {payload!.loyaltyAmount > 0 && payload!.loyaltyUnit !== "" && (
                <div className="mt-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 flex items-center gap-3">
                  <Gift className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs text-emerald-400 font-medium">{payload!.loyaltyLabel}</p>
                    <p className="text-sm text-emerald-300 font-semibold">
                      {payload!.loyaltyUnit === "$"
                        ? `+${formatCurrency(payload!.loyaltyAmount)}`
                        : payload!.loyaltyUnit === "pts"
                        ? `+${payload!.loyaltyAmount} pts`
                        : "+1 stamp"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-white/10 px-10 py-3 text-center shrink-0">
        <p className="text-xs text-white/20">Thank you for shopping with us</p>
      </div>
    </div>
  );
}
