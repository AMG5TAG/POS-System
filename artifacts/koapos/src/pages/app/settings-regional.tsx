import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, useUpdateMerchant } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Hobart",
  "Pacific/Auckland",
];

export default function SettingsRegionalPage() {
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const updateMutation = useUpdateMerchant();

  const [form, setForm] = useState({
    currency: "AUD",
    timezone: "Australia/Sydney",
  });

  useEffect(() => {
    if (merchant) {
      setForm({
        currency: merchant.currency || "AUD",
        timezone: merchant.timezone || "Australia/Sydney",
      });
    }
  }, [merchant]);

  const handleSave = () => {
    updateMutation.mutate(
      {
        data: {
          currency: form.currency || undefined,
          timezone: form.timezone || undefined,
        },
      },
      {
        onSuccess: (updated) => {
          toast.success("Regional settings saved");
          login(updated);
          queryClient.invalidateQueries({ queryKey: ["merchant"] });
        },
        onError: () => toast.error("Failed to save"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Regional Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>Currency &amp; Timezone</CardTitle>
            <CardDescription>Controls how prices and times are displayed throughout the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                    <SelectItem value="NZD">NZD — New Zealand Dollar</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                    <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Timezone</Label>
                <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg">
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </AppLayout>
  );
}
