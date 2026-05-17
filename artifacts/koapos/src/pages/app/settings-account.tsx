import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, Merchant } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type MerchantWithPlan = Merchant & { plan?: string };

export default function SettingsAccountPage() {
  const { data: merchantData } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const merchant = merchantData as MerchantWithPlan | undefined;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Account</h1>

        <Card>
          <CardHeader>
            <CardTitle>Login Details</CardTitle>
            <CardDescription>Your account credentials for KoaPOS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email Address</Label>
              <Input value={merchant?.email || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">
                Contact support to change your email address.
              </p>
            </div>
            <div>
              <Label>Plan</Label>
              <Input value={merchant?.plan || "—"} disabled className="bg-muted capitalize" />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
