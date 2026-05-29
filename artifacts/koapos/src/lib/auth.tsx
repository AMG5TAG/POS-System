import React, { useEffect, useState } from "react";
import { useGetMe, Merchant } from "@workspace/api-client-react";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Merchant | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const { data: me, isLoading: meLoading, error } = useGetMe({
    query: {
      queryKey: ["me"],
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

  // Auth state is sourced from the server session via useGetMe() on every mount,
  // so there is no cached user in localStorage to trust or clear.
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
