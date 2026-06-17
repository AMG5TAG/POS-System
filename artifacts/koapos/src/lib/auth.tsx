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
  //
  // For the SAME account (e.g. settings pages calling login() with a
  // merchant-update response), merge over the existing user instead of
  // replacing it. Update responses don't carry session-only fields such as
  // `staffRole`, `emailVerified` and `onboardingCompleted`, so a wholesale
  // replace would drop them — logging the owner out of owner-level access and
  // re-triggering the verify/onboarding prompts. A genuinely different account
  // (fresh sign-in / register) still replaces wholesale.
  const login = (newUser: Merchant) => {
    setUser((prev) =>
      prev && newUser && prev.id === newUser.id
        ? { ...prev, ...newUser }
        : newUser,
    );
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
