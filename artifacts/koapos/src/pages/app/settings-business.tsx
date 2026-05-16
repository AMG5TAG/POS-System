import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, useUpdateMerchant } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsBusinessPage() {
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const updateMutation = useUpdateMerchant();

  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    phone: "",
    address: "",
    city: "",
    country: "AU",
  });

  useEffect(() => {
    if (merchant) {
      setForm({
        businessName: merchant.businessName || "",
        ownerName:    merchant.ownerName    || "",
        phone:        merchant.phone        || "",
        address:      merchant.address      || "",
        city:         merchant.city         || "",
        country:      merchant.country      || "AU",
      });
    }
  }, [merchant]);

  const handleSave = () => {
    updateMutation.mutate(
      {
        data: {
          businessName: form.businessName || undefined,
          ownerName:    form.ownerName    || undefined,
          phone:        form.phone        || undefined,
          address:      form.address      || undefined,
          city:         form.city         || undefined,
          country:      form.country      || undefined,
        },
      },
      {
        onSuccess: (updated) => {
          toast.success("Business details saved");
          login(updated);
          queryClient.invalidateQueries({ queryKey: ["merchant"] });
        },
        onError: () => toast.error("Failed to save"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 max-w-2xl space-y-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Business Details</h1>

        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
            <CardDescription>Shown on receipts, invoices, and reports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Business Name</Label>
                <Input
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  placeholder="Acme Retail"
                />
              </div>
              <div>
                <Label>Owner Name</Label>
                <Input
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  placeholder="John Smith"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+61 2 0000 0000"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Street Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St"
                />
              </div>
              <div>
                <Label>City / Suburb</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Sydney"
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  placeholder="AU"
                />
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
