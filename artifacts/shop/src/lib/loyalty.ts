import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";

/* The POS loyalty program as the website shows it. Name, unit and wording all
   come from the POS loyalty settings (routes/shop.ts → lib/loyalty.ts). */
export interface LoyaltyInfo {
  enabled: boolean; type: string; name: string; unit: string; monetary: boolean;
  headline: string; details: string[]; birthdayBonus: boolean;
}
export const useLoyaltyInfo = () =>
  useQuery({ queryKey: ["shop-loyalty"], queryFn: () => api<LoyaltyInfo>("/shop/loyalty"), staleTime: 5 * 60_000 });

export interface Estimate { enabled: boolean; earned: number; formatted: string; signedIn: boolean }
export function useLoyaltyEstimate(lines: { productId: number; variantId: number | null; qty: number }[]) {
  const { customer } = useAuth();
  const body = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.qty }));
  return useQuery({
    queryKey: ["shop-loyalty-estimate", customer?.id ?? 0, JSON.stringify(body)],
    queryFn: () => api<Estimate>("/shop/loyalty/estimate", { method: "POST", body: JSON.stringify({ lines: body }) }),
    enabled: body.length > 0,
    placeholderData: (prev) => prev,
  });
}

export interface Overview {
  loyalty: LoyaltyInfo & { balance: number; formatted: string; totalSpent: number; visitCount: number };
  repairs: {
    id: number; jobNumber: string; status: string; device: string; bookedIn: string; completedAt: string | null;
    workDescription: string | null; estimatedCost: number | null;
  }[];
  warranties: { key: string; kind: "product" | "repair"; name: string; label: string; startedAt: string; expiresAt: string; daysRemaining: number; reference: string | null }[];
}
export function useAccountOverview() {
  const { customer } = useAuth();
  return useQuery({ queryKey: ["shop-account-overview", customer?.id], queryFn: () => api<Overview>("/shop/account/overview"), enabled: !!customer });
}
