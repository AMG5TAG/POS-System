import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";

/* A friend's referral code from their link (/r/<code>), remembered in this
   browser until the visitor signs up — which may be days later — so the friend
   still gets the credit. Sent with sign-up (POST /shop/auth/register). */
const KEY = "kk-referral";
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export function rememberReferral(code: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage blocked */ }
}

export function rememberedReferral(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code?: string; at?: number } | null;
    if (v?.code && typeof v.at === "number" && Date.now() - v.at < KEEP_MS) return v.code;
  } catch { /* noop */ }
  return null;
}

export function forgetReferral() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

export interface Referee {
  name: string; joinedAt: string; qualified: boolean; visits: number; spendReached: boolean; daysLeft: number; expired: boolean;
  /** "paid" once credited to their balance; "pre_automation" for one that qualified before automatic rewards. */
  reward: "paid" | "pre_automation" | null;
}
export interface Referrals {
  enabled: boolean; code: string; url: string;
  rules: { minSpend: number; minVisits: number; qualifyDays: number; referrerReward: string; refereeReward: string };
  referrals: Referee[]; qualified: number; earned: string;
}

export function useReferrals() {
  const { customer } = useAuth();
  return useQuery({ queryKey: ["shop-referrals", customer?.id], queryFn: () => api<Referrals>("/shop/account/referrals"), enabled: !!customer });
}
