import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Switch } from "@/components/ui/switch";
import { ShoppingCart } from "lucide-react";

export const FORCE_STAFF_LOGIN_KEY = "koapos_force_staff_login";

export default function SettingsPOSPage() {
  const [forceStaffLogin, setForceStaffLogin] = useState(() => {
    return localStorage.getItem(FORCE_STAFF_LOGIN_KEY) === "true";
  });

  useEffect(() => {
    localStorage.setItem(FORCE_STAFF_LOGIN_KEY, String(forceStaffLogin));
  }, [forceStaffLogin]);

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">POS Settings</h1>
            <p className="text-sm text-muted-foreground">Configure point of sale behaviour.</p>
          </div>
        </div>

        <div className="rounded-xl border divide-y">
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Force Staff Login</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Require a staff PIN to be entered before every sale is processed.
              </p>
            </div>
            <Switch checked={forceStaffLogin} onCheckedChange={setForceStaffLogin} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
