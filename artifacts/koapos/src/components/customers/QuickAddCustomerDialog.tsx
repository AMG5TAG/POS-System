import { useState, useEffect } from "react";
import { useCreateCustomer, Customer } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalisationDefaults } from "@/lib/localisation";

interface QuickAddCustomerDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  prefillName?: string;
}

export function QuickAddCustomerDialog({
  open,
  onClose,
  onCreated,
  prefillName = "",
}: QuickAddCustomerDialogProps) {
  const { countryName, stateOptions } = useLocalisationDefaults();

  const emptyForm = () => ({
    firstName: "", lastName: "", email: "", phone: "",
    billingStreet: "", billingCity: "", billingState: "", billingPostcode: "",
    billingCountry: countryName,
  });

  const [form, setForm] = useState(emptyForm);
  const createMutation = useCreateCustomer();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      const parts = prefillName.trim().split(/\s+/);
      setForm({
        ...emptyForm(),
        firstName: parts[0] ?? "",
        lastName:  parts.slice(1).join(" "),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillName, countryName]);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = () => {
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    createMutation.mutate(
      {
        data: {
          firstName:       form.firstName.trim()       || undefined,
          lastName:        form.lastName.trim()        || undefined,
          email:           form.email.trim()           || undefined,
          phone:           form.phone.trim()           || undefined,
          billingStreet:   form.billingStreet.trim()   || undefined,
          billingCity:     form.billingCity.trim()     || undefined,
          billingState:    form.billingState.trim()    || undefined,
          billingPostcode: form.billingPostcode.trim() || undefined,
          billingCountry:  form.billingCountry.trim()  || undefined,
          customerGroup: "Standard",
          agreedToMarketing: "false",
          whatsappSameAsPhone: "false",
        },
      },
      {
        onSuccess: (customer) => {
          toast.success(`${form.firstName} added`);
          queryClient.invalidateQueries({ queryKey: ["listCustomers"] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
          onCreated(customer);
          onClose();
        },
        onError: () => toast.error("Failed to add customer"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <UserPlus className="w-5 h-5 text-primary" />
            Add Customer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name <span className="text-destructive">*</span></Label>
              <Input autoFocus value={form.firstName} onChange={set("firstName")} placeholder="Jane" />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={set("lastName")} placeholder="Doe" />
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={set("phone")} placeholder="0400 000 000" />
          </div>

          {/* Address */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address</p>
            <div className="space-y-1.5">
              <Label>Street</Label>
              <Input value={form.billingStreet} onChange={set("billingStreet")} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.billingCity} onChange={set("billingCity")} placeholder="Sydney" />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                {stateOptions.length > 0 ? (
                  <Select
                    value={form.billingState}
                    onValueChange={(v) => setForm((f) => ({ ...f, billingState: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {stateOptions.map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.code} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.billingState} onChange={set("billingState")} placeholder="State" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Postcode</Label>
                <Input value={form.billingPostcode} onChange={set("billingPostcode")} placeholder="2000" />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.billingCountry} onChange={set("billingCountry")} placeholder="Australia" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding..." : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
