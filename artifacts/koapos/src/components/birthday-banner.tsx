import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Gift, X } from "lucide-react";
import { toast } from "sonner";

interface BirthdayCustomer {
  id: number; firstName: string; lastName: string;
  email: string | null; loyaltyPoints: number;
}

export function BirthdayBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [awarded, setAwarded] = useState<Set<number>>(new Set());
  const qc = useQueryClient();

  const { data } = useQuery<{ customers: BirthdayCustomer[] }>({
    queryKey: ["birthdays-today"],
    queryFn: async () => {
      const r = await fetch("/api/customers/birthdays-today", { credentials: "include" });
      if (!r.ok) return { customers: [] };
      return r.json();
    },
  });

  const awardMutation = useMutation({
    mutationFn: async ({ id, points }: { id: number; points: number }) => {
      const r = await fetch(`/api/customers/${id}/birthday-reward`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data, vars) => {
      setAwarded(prev => new Set([...prev, vars.id]));
      toast.success(`🎂 Birthday reward sent! New total: ${data.newTotal} pts`);
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: () => toast.error("Failed to award birthday points"),
  });

  if (dismissed || !data?.customers.length) return null;

  return (
    <div className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 border border-pink-200 dark:border-pink-800 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🎂</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-pink-900 dark:text-pink-100 text-sm">
            {data.customers.length === 1
              ? `${data.customers[0].firstName} ${data.customers[0].lastName} has a birthday today!`
              : `${data.customers.length} customers have birthdays today!`}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {data.customers.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 bg-white dark:bg-gray-800/70 border border-pink-100 dark:border-pink-900 rounded-md px-2.5 py-1 shadow-sm">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.firstName} {c.lastName}</span>
                {awarded.has(c.id) ? (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Sent</span>
                ) : (
                  <Button size="sm" variant="ghost"
                    className="h-5 text-[11px] text-pink-700 dark:text-pink-300 hover:text-pink-800 px-1.5 font-medium"
                    onClick={() => awardMutation.mutate({ id: c.id, points: 100 })}
                    disabled={awardMutation.isPending}>
                    <Gift className="w-2.5 h-2.5 mr-1" />
                    +100 pts
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-pink-400 hover:text-pink-600 shrink-0" onClick={() => setDismissed(true)}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
