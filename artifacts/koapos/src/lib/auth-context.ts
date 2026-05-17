import { createContext } from "react";
import type { Merchant } from "@workspace/api-client-react";

export interface AuthContextType {
  user: Merchant | null;
  isLoading: boolean;
  login: (user: Merchant) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
