import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey, useUpdateMerchant } from "@workspace/api-client-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { validateABN } from "@/lib/abn";
import { Building2, Receipt, Globe, Package, PartyPopper, ArrowRight, Loader2, ChevronLeft } from "lucide-react";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Building2, title: "Your Business",       desc: "Confirm your business name and ABN" },
  { icon: Receipt,   title: "Tax Settings",        desc: "Set your GST rate" },
  { icon: Globe,     title: "Store Address",       desc: "Claim your public web address" },
  { icon: Package,   title: "Add a Product",       desc: "Add your first product (optional)" },
  { icon: PartyPopper, title: "You're all set!",   desc: "Your account is ready to use" },
];

// Mirror of the username rules in settings-account.tsx so the address claimed
// here is accepted by the same PATCH /merchants/me validation.
const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
function formatUsernameInput(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
}
/** Derive a valid starter username from the business name, or "" if too short. */
function suggestUsername(businessName: string): string {
  const u = formatUsernameInput(businessName).replace(/^-+/, "").replace(/-+$/, "");
  return u.length >= 3 ? u : "";
}

async function completeOnboarding() {
  const res = await fetch("/api/auth/onboarding/complete", { method: "PATCH", credentials: "include" });
  if (!res.ok) throw new Error("Failed to mark onboarding complete");
  return res.json();
}

async function updateTaxSettings(gstRate: string) {
  await fetch("/api/tax-settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gstEnabled: "true", gstRate: parseFloat(gstRate) }),
  });
}

async function createProduct(name: string, price: string) {
  await fetch("/api/products", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, price: parseFloat(price), trackInventory: true }),
  });
}

export function OnboardingWizard() {
  const qc = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const updateMerchant = useUpdateMerchant();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 state
  const [businessName, setBusinessName] = useState(me?.businessName ?? "");
  const [abn, setAbn] = useState("");
  const abnInvalid = abn.length > 0 && !validateABN(abn);

  // Step 2 (Tax) state
  const [gstRate, setGstRate] = useState("10");

  // Step 3 (Store Address) state
  const [storeUsername, setStoreUsername] = useState("");
  const usernameValid = storeUsername.length === 0 || USERNAME_RE.test(storeUsername);
  const usernameLongEnough = storeUsername.length >= 3;
  const usernameBlocksNext = storeUsername.length > 0 && (!usernameValid || !usernameLongEnough);
  const PORTAL_BASE = `${window.location.hostname}/b/`;

  // Step 4 (Add a Product) state
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [skipProduct, setSkipProduct] = useState(false);

  const isOpen = !!(me && !me.onboardingCompleted);

  const next = async () => {
    if (step === 0) {
      // Save business name
      if (!businessName.trim()) { toast.error("Business name is required"); return; }
      setSaving(true);
      try {
        await updateMerchant.mutateAsync({ data: { businessName: businessName.trim() } });
        if (abn) {
          await fetch("/api/business-profile", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ abn }),
          });
        }
      } catch { toast.error("Failed to save business details"); setSaving(false); return; }
      setSaving(false);
      // Pre-fill a starter store address from the business name so most merchants
      // just confirm one — fixing the "no public username" gap that leaves product
      // QR codes, the portal and the online store without a public address.
      setStoreUsername((cur) => cur || suggestUsername(businessName.trim()));
      setStep(1);
    } else if (step === 1) {
      setSaving(true);
      try { await updateTaxSettings(gstRate); } catch { /* non-critical */ }
      setSaving(false);
      setStep(2);
    } else if (step === 2) {
      // Claim the public username. Saving is best-effort-required: a valid entry
      // is saved via the same endpoint Settings uses (with its uniqueness check);
      // an empty entry is allowed through so onboarding is never hard-blocked.
      const u = storeUsername.trim();
      if (u) {
        if (!USERNAME_RE.test(u)) {
          toast.error("Choose a valid store address", { description: "3–30 lowercase letters, numbers and hyphens." });
          return;
        }
        setSaving(true);
        try {
          await updateMerchant.mutateAsync({ data: { username: u } });
          await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        } catch (err) {
          setSaving(false);
          const resp = err as { response?: { status?: number; data?: { error?: string } } };
          if (resp?.response?.status === 409) {
            toast.error("That store address is taken", { description: "Please choose another." });
          } else {
            toast.error("Couldn't save store address", { description: resp?.response?.data?.error ?? "Please try again." });
          }
          return;
        }
        setSaving(false);
      }
      setStep(3);
    } else if (step === 3) {
      if (!skipProduct && productName.trim() && productPrice) {
        setSaving(true);
        try { await createProduct(productName.trim(), productPrice); } catch { /* non-critical */ }
        setSaving(false);
      }
      setStep(4);
    } else if (step === 4) {
      setSaving(true);
      try {
        await completeOnboarding();
        await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast.success("Welcome to KoaPOS! 🎉");
      } catch { toast.error("Failed to complete setup"); }
      setSaving(false);
    }
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  if (!isOpen) return null;

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-lg p-0 overflow-hidden [&>button:last-child]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Step header */}
        <div className="px-6 pt-5 pb-4 border-b">
          <Stepper
            steps={STEPS.map((s) => ({ label: s.title, icon: s.icon }))}
            current={step}
          />
          <h2 className="text-lg font-bold mt-3">{STEPS[step]?.title}</h2>
          <p className="text-sm text-muted-foreground">{STEPS[step]?.desc}</p>
        </div>

        {/* Step content */}
        <div className="px-6 py-5 space-y-4 min-h-[180px]">
          {step === 0 && (
            <>
              <div>
                <Label>Business Name <span className="text-destructive">*</span></Label>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Acme Retail"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>ABN <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={abn}
                  onChange={(e) => setAbn(e.target.value)}
                  placeholder="12 345 678 901"
                  className={cn("mt-1", abnInvalid && "border-destructive")}
                />
                {abnInvalid && <p className="text-xs text-destructive mt-1">Invalid ABN — must be 11 digits with a valid checksum.</p>}
                <p className="text-xs text-muted-foreground mt-1">Your ABN appears on tax invoices and receipts.</p>
              </div>
            </>
          )}

          {step === 1 && (
            <div>
              <Label>GST Rate</Label>
              <Select value={gstRate} onValueChange={setGstRate}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0% — GST-free</SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="10">10% — Standard Australian GST</SelectItem>
                  <SelectItem value="15">15% — New Zealand GST</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">Australia's standard GST rate is 10%. You can change this anytime in Settings → Tax.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <Label>Store Address</Label>
                <div className="mt-1 flex items-stretch rounded-md border overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                  <span className="px-2.5 flex items-center text-xs text-muted-foreground bg-muted/50 border-r whitespace-nowrap">{PORTAL_BASE}</span>
                  <input
                    value={storeUsername}
                    onChange={(e) => setStoreUsername(formatUsernameInput(e.target.value))}
                    placeholder="your-store"
                    className="flex-1 min-w-0 px-2.5 py-2 text-sm bg-transparent outline-none"
                    autoFocus
                  />
                </div>
                {storeUsername.length > 0 && !usernameValid && (
                  <p className="text-xs text-destructive mt-1">Use 3–30 lowercase letters, numbers and hyphens (start and end with a letter or number).</p>
                )}
                {storeUsername.length > 0 && usernameValid && usernameLongEnough && (
                  <p className="text-xs text-muted-foreground mt-1">Your public page will be at <span className="font-medium text-foreground">{PORTAL_BASE}{storeUsername}</span></p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                This is your public web address — used for product QR pages, your customer portal and online store. You can change it later in Settings → Account.
              </p>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setStoreUsername(""); setStep(3); }}>
                Skip for now
              </Button>
            </div>
          )}

          {step === 3 && !skipProduct && (
            <>
              <div>
                <Label>Product Name</Label>
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Coffee — Large" className="mt-1" autoFocus />
              </div>
              <div>
                <Label>Sell Price (inc. GST)</Label>
                <Input type="number" min="0" step="0.01" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="0.00" className="mt-1" />
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSkipProduct(true)}>
                Skip — I'll add products later
              </Button>
            </>
          )}

          {step === 3 && skipProduct && (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
              <Package className="w-8 h-8 opacity-30" />
              <p className="text-sm">You can add products anytime from the <strong>Products</strong> menu.</p>
              <Button variant="ghost" size="sm" onClick={() => setSkipProduct(false)}>Add a product now</Button>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
              <PartyPopper className="w-12 h-12 text-primary" />
              <div>
                <p className="font-semibold text-base">Your account is ready!</p>
                <p className="text-sm text-muted-foreground mt-1">Head to your dashboard to start selling.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between border-t pt-4">
          <Button variant="ghost" size="sm" onClick={back} disabled={step === 0 || saving}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button onClick={next} disabled={saving || (step === 0 && abnInvalid) || (step === 2 && usernameBlocksNext)}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> :
             step === 4 ? "Go to Dashboard →" :
             <><ArrowRight className="w-4 h-4 mr-1" /> {step === 2 && storeUsername ? "Claim & Continue" : step === 3 && !skipProduct && productName ? "Add & Continue" : "Continue"}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
