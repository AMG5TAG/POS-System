import { AppLayout } from "@/components/layout/app-layout";
import { ClipboardList } from "lucide-react";

export default function StaffLeaveRequestsPage() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <h1 className="text-2xl font-bold">Leave</h1>
        <p className="text-sm text-muted-foreground">Manage staff leave requests, approvals, and entitlements.</p>

        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-base">Leave Requests</p>
          <p className="text-sm mt-1">Review and approve employee leave and absence requests.</p>
          <p className="text-xs mt-3 opacity-60">Coming soon</p>
        </div>
      </div>
    </AppLayout>
  );
}
