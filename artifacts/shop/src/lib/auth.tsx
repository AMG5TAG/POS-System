import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface Account {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: { street: string; city: string; state: string; postcode: string; country: string };
  loyaltyPoints: number;
  portalToken: string | null;
}

interface AuthCtx {
  customer: Account | null;
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
    queryFn: () => api<{ customer: Account | null }>("/shop/auth/me"),
    staleTime: 60_000,
  });
  const value: AuthCtx = {
    customer: data?.customer ?? null,
    loading: isLoading,
    setCustomer: (c) => qc.setQueryData(KEY, { customer: c }),
    logout: async () => {
      await api("/shop/auth/logout", { method: "POST" }).catch(() => {});
      qc.setQueryData(KEY, { customer: null });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
