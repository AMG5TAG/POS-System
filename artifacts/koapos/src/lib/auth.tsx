import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, Merchant } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: Merchant | null;
  isLoading: boolean;
  login: (user: Merchant) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Merchant | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const { data: me, isLoading: meLoading, error } = useGetMe({
    query: {
      retry: false,
    }
  });

  useEffect(() => {
    if (!meLoading) {
      if (me) {
        setUser(me);
      } else {
        setUser(null);
      }
      setIsInitializing(false);
    }
  }, [me, meLoading, error]);

  const login = (newUser: Merchant) => {
    setUser(newUser);
  };

  const logout = () => {
    setUser(null);
  };

  const isLoading = isInitializing || meLoading;

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
