import { AppLayout } from "@/components/layout/app-layout";
import { Coins } from "lucide-react";

export default function StaffCostSummaryPage() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Costs</h1>

        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Coins className="h-10 w-10 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-base">Cost Summary</p>
          <p className="text-sm mt-1">View wage costs, payroll summaries, and labour percentages.</p>
          <p className="text-xs mt-3 opacity-60">Coming soon</p>
        </div>
      </div>
    </AppLayout>
  );
}
