import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/use-auth";

interface AIContextValue {
  aiEnabled: boolean;
  isLoading: boolean;
  setAiEnabled: (value: boolean) => Promise<void>;
}

const AIContext = createContext<AIContextValue>({
  aiEnabled: true,
  isLoading: true,
  setAiEnabled: async () => {},
});

export function AIProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [aiEnabled, setAiEnabledState] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    fetch("/api/ai/settings", { credentials: "include" })
      .then(r => r.ok ? r.json() : { aiEnabled: true })
      .then((data: { aiEnabled: boolean }) => setAiEnabledState(data.aiEnabled))
      .catch(() => setAiEnabledState(true))
      .finally(() => setIsLoading(false));
  }, [user]);

  const setAiEnabled = async (value: boolean) => {
    setAiEnabledState(value);
    await fetch("/api/ai/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiEnabled: value }),
    });
  };

  return (
    <AIContext.Provider value={{ aiEnabled, isLoading, setAiEnabled }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  return useContext(AIContext);
}
