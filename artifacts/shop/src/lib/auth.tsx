import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface Address { street: string; city: string; state: string; postcode: string; country: string }

export interface Account {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: Address;
  /** Postal / delivery address (the POS's shipping fields); blank when it is the same as `address`. */
  shippingAddress: Address;
  company: string;
  abn: string;
  /** Their mobile is also their WhatsApp number. */
  whatsapp: boolean;
  /** Opted in to marketing email/SMS — campaigns only ever reach customers who have. */
  agreedToMarketing: boolean;
  heardFrom: string;
  heardFromDetails: string;
  loyaltyPoints: number;
  portalToken: string | null;
  /** YYYY-MM-DD; set once by the shopper, for the birthday reward. */
  dateOfBirth: string | null;
  /** False when they came in on an account link and never set a password. */
  hasPassword: boolean;
}

interface AuthCtx {
  customer: Account | null;
  /** The owner or staff: sees the whole shop while it is curtained (lib/launch.ts). */
  preview: boolean;
  loading: boolean;
  setCustomer: (c: Account | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = ["shop-me"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => api<{ customer: Account | null; preview?: boolean }>("/shop/auth/me"),
    staleTime: 60_000,
  });
  const value: AuthCtx = {
    customer: data?.customer ?? null,
    preview: data?.preview ?? false,
    loading: isLoading,
    // Whether the new shopper may preview is the server's call, so ask again.
    setCustomer: (c) => {
      qc.setQueryData(KEY, { customer: c, preview: false });
      if (c) void qc.invalidateQueries({ queryKey: KEY });
    },
    logout: async () => {
      await api("/shop/auth/logout", { method: "POST" }).catch(() => {});
      qc.setQueryData(KEY, { customer: null, preview: false });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
