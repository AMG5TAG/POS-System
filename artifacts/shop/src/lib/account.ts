import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";

/* The account sections that came over from the customer portal
   (routes/shop-account.ts on the API). */

export interface Appointment {
  id: number; title: string; scheduledAt: string; durationMinutes: number; status: string; notes: string | null;
}
export interface Quote {
  id: number; quoteNumber: string; status: "sent" | "accepted" | "declined" | "expired"; total: number;
  depositRequired: number | null; items: { description: string; quantity: number; unitPrice: number }[];
  expiryDate: string | null; notes: string | null; createdAt: string;
}

export function useAppointments() {
  const { customer } = useAuth();
  return useQuery({ queryKey: ["shop-appointments", customer?.id], queryFn: () => api<Appointment[]>("/shop/account/appointments"), enabled: !!customer });
}

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title: string; scheduledAt: string; notes?: string }) =>
      api<Appointment>("/shop/account/appointments", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop-appointments"] }),
  });
}

export function useQuotes() {
  const { customer } = useAuth();
  return useQuery({ queryKey: ["shop-quotes", customer?.id], queryFn: () => api<Quote[]>("/shop/account/quotes"), enabled: !!customer });
}

export function useRespondToQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "accept" | "decline" }) =>
      api<{ id: number; status: string }>(`/shop/account/quotes/${id}/respond`, { method: "POST", body: JSON.stringify({ decision }) }),
    // Accepting moves the linked repair on, so its status changes too.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["shop-quotes"] });
      void qc.invalidateQueries({ queryKey: ["shop-account-overview"] });
    },
  });
}

export interface OrderLine { name: string; quantity: number; total: number }
export interface InStoreSale {
  id: number; receiptNumber: string; date: string; status: "completed" | "refunded" | string;
  total: number; payment: string; lines: OrderLine[];
}
export interface OnlineOrder {
  id: number; number: string; date: string; status: string; statusLabel: string; total: number;
  shippingMethod: string | null; tracking: { carrier: string | null; number: string; url: string | null } | null;
  shippedAt: string | null; deliveredAt: string | null; lines: OrderLine[];
}

export function useOrders() {
  const { customer } = useAuth();
  return useQuery({
    queryKey: ["shop-orders", customer?.id],
    queryFn: () => api<{ inStore: InStoreSale[]; online: OnlineOrder[] }>("/shop/account/orders"),
    enabled: !!customer,
  });
}
