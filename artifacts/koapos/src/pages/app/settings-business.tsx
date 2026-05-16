import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, useUpdateMerchant } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useBusinessProfile, DAYS, type BusinessProfile, type CustomLink } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload, X, Plus, Trash2, Globe, Facebook, Instagram, Youtube, Linkedin, Twitter,
  Building2, Tag, Image, Palette, Phone, MapPin, Clock, Umbrella, CreditCard, Share2,
} from "lucide-react";
import { PageTabsNav } from "@/components/ui/page-tabs-nav";

const BUSINESS_TABS = [
  { href: "#business-info",  label: "Business Info",  icon: Building2   },
  { href: "#categories",     label: "Categories",     icon: Tag         },
  { href: "#logo",           label: "Logo",           icon: Image       },
  { href: "#branding",       label: "Branding",       icon: Palette     },
  { href: "#contact",        label: "Contact",        icon: Phone       },
  { href: "#address",        label: "Address",        icon: MapPin      },
  { href: "#hours",          label: "Hours",          icon: Clock       },
  { href: "#payments",       label: "Payments",       icon: CreditCard  },
  { href: "#social",         label: "Social",         icon: Share2      },
];

/* ─── Colour swatch ──────────────────────────────────────────────────────── */

function ColourSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="relative w-12 h-10 rounded border border-border overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring"
      style={{ backgroundColor: value }}
      title={value}
    >
      <input
        ref={ref}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
      />
    </button>
  );
}

/* ─── Section header ─────────────────────────────────────────────────────── */

/* ─── Payment types ──────────────────────────────────────────────────────── */

const ALL_PAYMENT_TYPES = [
  "Cash", "EFTPOS", "Mastercard", "Visa", "American Express",
  "PayPal", "Google Pay", "Apple Pay", "Bank Transfer",
  "Afterpay", "Zip", "Cryptocurrency", "Cheque",
];

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function SettingsBusinessPage() {
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const updateMutation = useUpdateMerchant();
  const { profile, save } = useBusinessProfile();

  /* API-backed fields */
  const [apiForm, setApiForm] = useState({
    businessName: "",
    phone: "",
    address: "",
    city: "",
    country: "AU",
  });

  /* Extended localStorage-backed fields */
  const [ext, setExt] = useState<BusinessProfile>(profile);

  /* Category input */
  const [catInput, setCatInput] = useState("");

  /* Custom link draft */
  const [linkDraft, setLinkDraft] = useState<CustomLink>({ label: "", url: "" });

  /* Hydrate API fields from merchant */
  useEffect(() => {
    if (merchant) {
      setApiForm({
        businessName: merchant.businessName || "",
        phone:        merchant.phone        || "",
        address:      merchant.address      || "",
        city:         merchant.city         || "",
        country:      merchant.country      || "AU",
      });
    }
  }, [merchant]);

  /* Helpers */
  const setExtField = <K extends keyof BusinessProfile>(key: K, val: BusinessProfile[K]) =>
    setExt((p) => ({ ...p, [key]: val }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setExtField("logo", reader.result as string);
    reader.readAsDataURL(file);
  };

  const addCategory = () => {
    const trimmed = catInput.trim();
    if (trimmed && !ext.categories.includes(trimmed)) {
      setExtField("categories", [...ext.categories, trimmed]);
    }
    setCatInput("");
  };

  const removeCategory = (cat: string) =>
    setExtField("categories", ext.categories.filter((c) => c !== cat));

  const togglePayment = (type: string) => {
    setExtField(
      "paymentTypes",
      ext.paymentTypes.includes(type)
        ? ext.paymentTypes.filter((p) => p !== type)
        : [...ext.paymentTypes, type]
    );
  };

  const setDayHours = (day: string, field: "enabled" | "open" | "close", val: string | boolean) =>
    setExt((p) => ({
      ...p,
      openingHours: { ...p.openingHours, [day]: { ...p.openingHours[day], [field]: val } },
    }));

  const setSocial = (platform: string, val: string) =>
    setExt((p) => ({ ...p, socialLinks: { ...p.socialLinks, [platform]: val } }));

  const addCustomLink = () => {
    if (linkDraft.label && linkDraft.url) {
      setExtField("customLinks", [...ext.customLinks, linkDraft]);
      setLinkDraft({ label: "", url: "" });
    }
  };

  const removeCustomLink = (i: number) =>
    setExtField("customLinks", ext.customLinks.filter((_, idx) => idx !== i));

  const setBrandColor = (idx: number, val: string) => {
    const next = [...ext.brandColors];
    next[idx] = val;
    setExtField("brandColors", next);
  };

  const setBgColor = (idx: number, val: string) => {
    const next = [...ext.bgColors];
    next[idx] = val;
    setExtField("bgColors", next);
  };

  const setTextColor = (idx: number, val: string) => {
    const next = [...ext.textColors];
    next[idx] = val;
    setExtField("textColors", next);
  };

  /* Save */
  const handleSave = () => {
    updateMutation.mutate(
      {
        data: {
          businessName: apiForm.businessName || undefined,
          phone:        apiForm.phone        || undefined,
          address:      apiForm.address      || undefined,
          city:         apiForm.city         || undefined,
          country:      apiForm.country      || undefined,
        },
      },
      {
        onSuccess: (updated) => {
          login(updated);
          queryClient.invalidateQueries({ queryKey: ["merchant"] });
          save(ext);
          toast.success("Business profile saved");
        },
        onError: () => toast.error("Failed to save"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Business Details</h1>
          <Button onClick={handleSave} disabled={updateMutation.isPending} size="sm" className="bg-[#efbf04] hover:bg-[#d4aa03] text-black font-semibold">
            {updateMutation.isPending ? "Saving…" : "Save Business Info"}
          </Button>
        </div>

        <PageTabsNav tabs={BUSINESS_TABS} />

        {/* ── Business Details ──────────────────────────────────────────────── */}
        <Card id="business-info">
          <CardHeader><CardTitle className="text-base">Business Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Business Name</Label>
                <Input value={apiForm.businessName} onChange={(e) => setApiForm({ ...apiForm, businessName: e.target.value })} placeholder="Your Business Name" />
              </div>
              <div>
                <Label>ABN</Label>
                <Input value={ext.abn} onChange={(e) => setExtField("abn", e.target.value)} placeholder="12 345 678 901" />
              </div>
              <div>
                <Label>Tagline</Label>
                <Input value={ext.tagline} onChange={(e) => setExtField("tagline", e.target.value)} placeholder="Your business tagline" />
              </div>
              <div className="sm:col-span-2">
                <Label>Business Description</Label>
                <Textarea
                  value={ext.description}
                  onChange={(e) => setExtField("description", e.target.value)}
                  placeholder="Describe your business…"
                  rows={4}
                />
              </div>
              <div>
                <Label>Business Opening Date</Label>
                <Input type="date" value={ext.openingDate} onChange={(e) => setExtField("openingDate", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Business Categories ───────────────────────────────────────────── */}
        <Card id="categories">
          <CardHeader><CardTitle className="text-base">Business Categories</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={catInput}
                onChange={(e) => setCatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
                placeholder="e.g. Computer Repair Service"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addCategory}><Plus className="h-4 w-4" /></Button>
            </div>
            {ext.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {ext.categories.map((cat) => (
                  <Badge key={cat} variant="secondary" className="flex items-center gap-1 pr-1">
                    {cat}
                    <button onClick={() => removeCategory(cat)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Logo ─────────────────────────────────────────────────────────── */}
        <Card id="logo">
          <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {ext.logo ? (
                <div className="relative w-20 h-20 rounded-lg border border-border overflow-hidden">
                  <img src={ext.logo} alt="Logo" className="w-full h-full object-contain" />
                  <button
                    onClick={() => setExtField("logo", "")}
                    className="absolute top-0.5 right-0.5 bg-background rounded-full p-0.5 shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                  <Upload className="h-6 w-6" />
                </div>
              )}
              <div>
                <label>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span className="cursor-pointer"><Upload className="h-3.5 w-3.5 mr-1" />Upload Logo</span>
                  </Button>
                  <input type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} />
                </label>
                <p className="text-xs text-muted-foreground mt-1">PNG or SVG recommended. Max 2 MB.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Branding ─────────────────────────────────────────────────────── */}
        <Card id="branding">
          <CardHeader><CardTitle className="text-base">Branding</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {/* Font */}
            <div>
              <Label>Brand Font</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={ext.brandFont}
                  onChange={(e) => setExtField("brandFont", e.target.value)}
                  placeholder="e.g. Inter, Roboto"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm">
                  <Upload className="h-3.5 w-3.5 mr-1" />Upload Font File
                </Button>
              </div>
            </div>

            {/* Brand Colours */}
            <div>
              <Label className="block mb-2">Brand Colours</Label>
              <p className="text-xs text-muted-foreground mb-2">These are applied as the default colours throughout the app.</p>
              <div className="flex flex-wrap gap-2">
                {ext.brandColors.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <ColourSwatch value={c} onChange={(v) => setBrandColor(i, v)} />
                    <span className="text-[10px] text-muted-foreground font-mono">{c.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Background & UI Colours */}
            <div>
              <Label className="block mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Background &amp; UI Colours</Label>
              <div className="flex flex-wrap gap-2">
                {ext.bgColors.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <ColourSwatch value={c} onChange={(v) => setBgColor(i, v)} />
                    <span className="text-[10px] text-muted-foreground font-mono">{c.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Text Colours */}
            <div>
              <Label className="block mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Text Colours</Label>
              <div className="flex flex-wrap gap-2">
                {ext.textColors.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <ColourSwatch value={c} onChange={(v) => setTextColor(i, v)} />
                    <span className="text-[10px] text-muted-foreground font-mono">{c.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Contact Information ───────────────────────────────────────────── */}
        <Card id="contact">
          <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input value={apiForm.phone} onChange={(e) => setApiForm({ ...apiForm, phone: e.target.value })} placeholder="+61 2 0000 0000" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={ext.contactEmail} onChange={(e) => setExtField("contactEmail", e.target.value)} placeholder="info@yourbusiness.com.au" />
              </div>
              <div className="sm:col-span-2">
                <Label>Website</Label>
                <Input type="url" value={ext.website} onChange={(e) => setExtField("website", e.target.value)} placeholder="https://www.yourbusiness.com.au" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Address ──────────────────────────────────────────────────────── */}
        <Card id="address">
          <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Street Address</Label>
                <Input value={apiForm.address} onChange={(e) => setApiForm({ ...apiForm, address: e.target.value })} placeholder="123 Main St" />
              </div>
              <div>
                <Label>Suburb / City</Label>
                <Input value={apiForm.city} onChange={(e) => setApiForm({ ...apiForm, city: e.target.value })} placeholder="Sydney" />
              </div>
              <div>
                <Label>State</Label>
                <Input value={ext.state} onChange={(e) => setExtField("state", e.target.value)} placeholder="NSW" />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input value={ext.postcode} onChange={(e) => setExtField("postcode", e.target.value)} placeholder="2000" />
              </div>
              <div>
                <Label>Country</Label>
                <Input value={apiForm.country} onChange={(e) => setApiForm({ ...apiForm, country: e.target.value })} placeholder="Australia" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Opening Hours ─────────────────────────────────────────────────── */}
        <Card id="hours">
          <CardHeader><CardTitle className="text-base">Opening Hours</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {DAYS.map((day) => {
                const hours = ext.openingHours[day] ?? { enabled: false, open: "09:00", close: "17:00" };
                return (
                  <div key={day} className="grid grid-cols-[120px_1fr] sm:grid-cols-[120px_auto_1fr_auto_1fr] items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={hours.enabled}
                        onCheckedChange={(v) => setDayHours(day, "enabled", v)}
                      />
                      <span className="text-sm font-medium w-20">{day.slice(0, 3)}</span>
                    </div>
                    {hours.enabled ? (
                      <>
                        <span className="hidden sm:block text-xs text-muted-foreground">From</span>
                        <Input
                          type="time"
                          value={hours.open}
                          onChange={(e) => setDayHours(day, "open", e.target.value)}
                          className="text-sm"
                        />
                        <span className="hidden sm:block text-xs text-muted-foreground">To</span>
                        <Input
                          type="time"
                          value={hours.close}
                          onChange={(e) => setDayHours(day, "close", e.target.value)}
                          className="text-sm"
                        />
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground col-span-4">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Holiday Operating Hours ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Holiday Operating Hours</CardTitle>
              <Button variant="outline" size="sm" disabled><Plus className="h-3.5 w-3.5 mr-1" />Add Holiday</Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No holidays configured. Click 'Add Holiday' to add specific dates.</p>
          </CardContent>
        </Card>

        {/* ── Accepted Payment Types ────────────────────────────────────────── */}
        <Card id="payments">
          <CardHeader><CardTitle className="text-base">Accepted Payment Types</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ALL_PAYMENT_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ext.paymentTypes.includes(type)}
                    onChange={() => togglePayment(type)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">{type}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Social Media Links ────────────────────────────────────────────── */}
        <Card id="social">
          <CardHeader><CardTitle className="text-base">Social Media Links</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                { key: "facebook",  label: "Facebook",  icon: Facebook,  placeholder: "facebook.com/yourbusiness"  },
                { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "instagram.com/yourbusiness" },
                { key: "twitter",   label: "X / Twitter", icon: Twitter, placeholder: "x.com/yourhandle"          },
                { key: "linkedin",  label: "LinkedIn",  icon: Linkedin,  placeholder: "linkedin.com/company/…"    },
                { key: "youtube",   label: "YouTube",   icon: Youtube,   placeholder: "youtube.com/@yourchannel"  },
                { key: "tiktok",    label: "TikTok",    icon: Globe,     placeholder: "tiktok.com/@yourhandle"    },
              ] as { key: keyof typeof ext.socialLinks; label: string; icon: React.ElementType; placeholder: string }[]
            ).map(({ key, label, icon: Icon, placeholder }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="w-8 flex justify-center text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <Input
                    value={ext.socialLinks[key]}
                    onChange={(e) => setSocial(key, e.target.value)}
                    placeholder={placeholder}
                    className="text-sm"
                  />
                </div>
              </div>
            ))}

            {/* Custom links */}
            {ext.customLinks.length > 0 && (
              <div className="pt-2 space-y-2">
                <SectionTitle>Custom Links</SectionTitle>
                {ext.customLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium w-24 truncate">{link.label}</span>
                    <span className="text-muted-foreground flex-1 truncate">{link.url}</span>
                    <button onClick={() => removeCustomLink(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Add a custom link (for Twitter, Discord, or any other platform)</p>
              <div className="flex gap-2">
                <Input
                  value={linkDraft.label}
                  onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })}
                  placeholder="Label"
                  className="w-32 text-sm"
                />
                <Input
                  value={linkDraft.url}
                  onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
                  placeholder="https://…"
                  className="flex-1 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addCustomLink}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="pb-8 flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-[#efbf04] hover:bg-[#d4aa03] text-black font-semibold px-8">
            {updateMutation.isPending ? "Saving…" : "Save Business Info"}
          </Button>
        </div>

      </div>
    </AppLayout>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
  );
}
