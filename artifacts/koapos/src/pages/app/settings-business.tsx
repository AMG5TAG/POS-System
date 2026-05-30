import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetMerchant, useUpdateMerchant,
  useGetRegionalExtSettings, useUpdateRegionalExtSettings,
  useGetLowStockAlertSettings, useUpdateLowStockAlertSettings, useListLowStockAlertLog,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/use-auth";
import { useBusinessProfile, DAYS, type BusinessProfile, type CustomLink } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload, X, Plus, Trash2, Globe, Facebook, Instagram, Youtube, Linkedin, Twitter,
  Building2, Tag, Image, Palette, Phone, MapPin, Clock, Umbrella, CreditCard, Share2,
  Hash, DollarSign, Calendar, Bell, History,
} from "lucide-react";
import { ColourPicker } from "@/components/ui/colour-picker";
import { FontPicker } from "@/components/ui/font-picker";

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
  { href: "#low-stock-alerts", label: "Low-stock Alerts", icon: Bell      },
];

/* ─── Social handle helper ───────────────────────────────────────────────── */

function stripSocialHandle(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:www\.)?/, "")
    .replace(/^[a-z0-9-]+\.[a-z]{2,}\/(?:in\/|@)?/i, "")
    .replace(/\/$/, "");
}

/* ─── Regional locale data ───────────────────────────────────────────────── */

const REG_LANGUAGES = [
  { value: "en-AU", label: "🇦🇺  English (Australia)" }, { value: "en-US", label: "🇺🇸  English (United States)" },
  { value: "en-GB", label: "🇬🇧  English (United Kingdom)" }, { value: "en-NZ", label: "🇳🇿  English (New Zealand)" },
  { value: "en-SG", label: "🇸🇬  English (Singapore)" }, { value: "fr", label: "🇫🇷  French" },
  { value: "de", label: "🇩🇪  German" }, { value: "es", label: "🇪🇸  Spanish" },
  { value: "ja", label: "🇯🇵  Japanese" }, { value: "zh-CN", label: "🇨🇳  Chinese (Simplified)" },
  { value: "ar", label: "🇸🇦  Arabic" }, { value: "id", label: "🇮🇩  Indonesian" },
];

const REG_CURRENCIES = [
  { value: "AUD", label: "AUD — Australian Dollar ($)" }, { value: "NZD", label: "NZD — New Zealand Dollar ($)" },
  { value: "USD", label: "USD — US Dollar ($)" }, { value: "GBP", label: "GBP — British Pound (£)" },
  { value: "EUR", label: "EUR — Euro (€)" }, { value: "CAD", label: "CAD — Canadian Dollar ($)" },
  { value: "SGD", label: "SGD — Singapore Dollar ($)" }, { value: "JPY", label: "JPY — Japanese Yen (¥)" },
  { value: "CNY", label: "CNY — Chinese Yuan (¥)" }, { value: "INR", label: "INR — Indian Rupee (₹)" },
  { value: "MYR", label: "MYR — Malaysian Ringgit (RM)" }, { value: "IDR", label: "IDR — Indonesian Rupiah (Rp)" },
  { value: "THB", label: "THB — Thai Baht (฿)" }, { value: "VND", label: "VND — Vietnamese Dong (₫)" },
  { value: "AED", label: "AED — UAE Dirham (د.إ)" }, { value: "SAR", label: "SAR — Saudi Riyal (﷼)" },
  { value: "ZAR", label: "ZAR — South African Rand (R)" }, { value: "BRL", label: "BRL — Brazilian Real (R$)" },
  { value: "MXN", label: "MXN — Mexican Peso ($)" },
];

const REG_DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY — Australian / European" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY — US / Philippines" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD — ISO 8601" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY — Dashes" },
  { value: "D MMMM YYYY", label: "D MMMM YYYY — 25 December 2025" },
];

const REG_TIMEZONES: { group: string; zones: { value: string; label: string }[] }[] = [
  { group: "Australia & Pacific", zones: [
    { value: "Australia/Sydney",    label: "AEST — Sydney / Melbourne / Canberra" },
    { value: "Australia/Brisbane",  label: "AEST — Brisbane / Queensland" },
    { value: "Australia/Adelaide",  label: "ACST — Adelaide / South Australia" },
    { value: "Australia/Perth",     label: "AWST — Perth / Western Australia" },
    { value: "Australia/Darwin",    label: "ACST — Darwin / Northern Territory" },
    { value: "Australia/Hobart",    label: "AEST — Hobart / Tasmania" },
    { value: "Pacific/Auckland",    label: "NZST — Auckland / Wellington" },
    { value: "Pacific/Honolulu",    label: "HST — Hawaii" },
  ]},
  { group: "Americas", zones: [
    { value: "America/New_York",    label: "EST — New York / Miami" },
    { value: "America/Chicago",     label: "CST — Chicago / Houston" },
    { value: "America/Los_Angeles", label: "PST — Los Angeles / Seattle" },
    { value: "America/Toronto",     label: "EST — Toronto / Ottawa" },
    { value: "America/Sao_Paulo",   label: "BRT — São Paulo / Rio" },
  ]},
  { group: "Europe", zones: [
    { value: "Europe/London",       label: "GMT/BST — London" },
    { value: "Europe/Paris",        label: "CET — Paris / Berlin" },
    { value: "Europe/Berlin",       label: "CET — Berlin / Frankfurt" },
    { value: "Europe/Moscow",       label: "MSK — Moscow" },
  ]},
  { group: "Asia & Middle East", zones: [
    { value: "Asia/Dubai",          label: "GST — Dubai / Abu Dhabi" },
    { value: "Asia/Kolkata",        label: "IST — Mumbai / Delhi" },
    { value: "Asia/Singapore",      label: "SGT — Singapore / Kuala Lumpur" },
    { value: "Asia/Shanghai",       label: "CST — Shanghai / Beijing" },
    { value: "Asia/Tokyo",          label: "JST — Tokyo / Osaka" },
    { value: "Asia/Seoul",          label: "KST — Seoul" },
  ]},
  { group: "Africa", zones: [
    { value: "Africa/Johannesburg", label: "SAST — Johannesburg / Cape Town" },
    { value: "Africa/Nairobi",      label: "EAT — Nairobi / Kampala" },
    { value: "Africa/Lagos",        label: "WAT — Lagos / Accra" },
  ]},
];

const REG_TAX_LABELS = [
  { value: "GST", label: "GST — Goods & Services Tax (AU, NZ, SG, IN)" },
  { value: "VAT", label: "VAT — Value Added Tax (EU, UAE, UK)" },
  { value: "HST", label: "HST — Harmonised Sales Tax (Canada)" },
  { value: "Sales Tax", label: "Sales Tax (United States)" },
  { value: "Custom", label: "Custom — Enter your own" },
];

const REG_TAX_NUMBER_LABELS = [
  { value: "ABN", label: "ABN — Australian Business Number" },
  { value: "NZBN", label: "NZBN — New Zealand Business Number" },
  { value: "VAT No.", label: "VAT No. (Europe / UK)" },
  { value: "GST No.", label: "GST No. (Canada / Singapore)" },
  { value: "TIN", label: "TIN — Taxpayer Identification Number (US)" },
  { value: "GSTIN", label: "GSTIN — GST Identification Number (India)" },
  { value: "Business No.", label: "Business No. (Generic)" },
];

const REG_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const REG_LS_KEY = "koapos_regional_ext";

interface RegExtSettings {
  language: string; dateFormat: string; timeFormat: "12" | "24";
  decimalSeparator: "." | ","; thousandsSeparator: "," | "." | " " | "'";
  measurementSystem: "metric" | "imperial"; paperSize: "A4" | "letter";
  firstDayOfWeek: "monday" | "sunday" | "saturday"; fiscalYearStart: number;
  taxLabel: string; customTaxLabel: string; taxNumberLabel: string;
  receiptPaperSize: "a4" | "80mm" | "58mm";
}

const REG_DEFAULT: RegExtSettings = {
  language: "en-AU", dateFormat: "DD/MM/YYYY", timeFormat: "12",
  decimalSeparator: ".", thousandsSeparator: ",",
  measurementSystem: "metric", paperSize: "A4", firstDayOfWeek: "monday",
  fiscalYearStart: 7, taxLabel: "GST", customTaxLabel: "", taxNumberLabel: "ABN",
  receiptPaperSize: "80mm",
};

function loadRegExt(): RegExtSettings {
  return { ...REG_DEFAULT };
}

function saveRegExt(_s: RegExtSettings) { /* no-op */ }

function RegSegmentToggle<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border overflow-hidden">
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
          }`}>{opt.label}</button>
      ))}
    </div>
  );
}

/* ─── Section header ─────────────────────────────────────────────────────── */

/* ─── Payment types ──────────────────────────────────────────────────────── */

const ALL_PAYMENT_TYPES = [
  "Cash", "EFTPOS", "Mastercard", "Visa", "American Express",
  "PayPal", "Google Pay", "Apple Pay", "Bank Transfer",
  "Afterpay", "Zip", "Cryptocurrency", "Cheque",
];

/* ─── Country code ↔ full name ───────────────────────────────────────────── */

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  AU: "Australia",  NZ: "New Zealand",  US: "United States",  GB: "United Kingdom",
  CA: "Canada",     SG: "Singapore",    IN: "India",          ZA: "South Africa",
  FR: "France",     DE: "Germany",      IT: "Italy",          ES: "Spain",
  NL: "Netherlands",PT: "Portugal",     JP: "Japan",          KR: "South Korea",
  CN: "China",      TW: "Taiwan",       HK: "Hong Kong",      MY: "Malaysia",
  ID: "Indonesia",  TH: "Thailand",     VN: "Vietnam",        PH: "Philippines",
  AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar",
  BR: "Brazil",     MX: "Mexico",       AR: "Argentina",      CL: "Chile",
  SE: "Sweden",     NO: "Norway",       DK: "Denmark",        FI: "Finland",
  CH: "Switzerland",AT: "Austria",      BE: "Belgium",        IE: "Ireland",
  PL: "Poland",     TR: "Turkey",       NG: "Nigeria",        KE: "Kenya",
  EG: "Egypt",      GH: "Ghana",        PK: "Pakistan",       BD: "Bangladesh",
  LK: "Sri Lanka",  NP: "Nepal",
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code])
);

function expandCountryCode(value: string): string {
  const trimmed = value.trim();
  return COUNTRY_CODE_TO_NAME[trimmed.toUpperCase()] ?? trimmed;
}

function collapseCountryName(value: string): string {
  const trimmed = value.trim();
  return COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()] ?? trimmed;
}

function looksLikeCode(value: string): boolean {
  return /^[A-Z]{2,3}$/.test(value.trim().toUpperCase()) && value.trim().length <= 3;
}

const STATE_CODE_TO_NAME: Record<string, string> = {
  /* Australia */
  NSW: "New South Wales",      VIC: "Victoria",             QLD: "Queensland",
  WA:  "Western Australia",    SA:  "South Australia",      TAS: "Tasmania",
  ACT: "Australian Capital Territory", NT: "Northern Territory",
  /* United States */
  AL: "Alabama",    AK: "Alaska",        AZ: "Arizona",      AR: "Arkansas",
  CA: "California", CO: "Colorado",      CT: "Connecticut",  DE: "Delaware",
  FL: "Florida",    GA: "Georgia",       HI: "Hawaii",       ID: "Idaho",
  IL: "Illinois",   IN: "Indiana",       IA: "Iowa",         KS: "Kansas",
  KY: "Kentucky",   LA: "Louisiana",     ME: "Maine",        MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan",   MN: "Minnesota",    MS: "Mississippi",
  MO: "Missouri",   MT: "Montana",       NE: "Nebraska",     NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",   NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio",      OK: "Oklahoma",
  OR: "Oregon",     PA: "Pennsylvania",  RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee",   TX: "Texas",        UT: "Utah",
  VT: "Vermont",    VA: "Virginia",      WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",    DC: "District of Columbia",
  /* Canada */
  AB: "Alberta",    BC: "British Columbia", MB: "Manitoba",  NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia",       ON: "Ontario",
  PE: "Prince Edward Island",      QC: "Quebec",            SK: "Saskatchewan",
  YT: "Yukon",
  /* United Kingdom */
  ENG: "England",   SCT: "Scotland",     WLS: "Wales",       NIR: "Northern Ireland",
};

const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code])
);

function expandStateCode(value: string): string {
  const trimmed = value.trim();
  return STATE_CODE_TO_NAME[trimmed.toUpperCase()] ?? trimmed;
}

function collapseStateName(value: string): string {
  const trimmed = value.trim();
  return STATE_NAME_TO_CODE[trimmed.toLowerCase()] ?? trimmed;
}

function looksLikeStateCode(value: string): boolean {
  return /^[A-Z]{2,3}$/.test(value.trim().toUpperCase()) && value.trim().length <= 3;
}

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

  /* Extended fields */
  const [ext, setExt] = useState<BusinessProfile>(profile);

  /* Low-stock alert settings */
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertEmails, setAlertEmails] = useState<string[]>([]);
  const [alertEmailInput, setAlertEmailInput] = useState("");
  const [alertMode, setAlertMode] = useState<"immediate" | "digest">("immediate");
  const [alertThreshold, setAlertThreshold] = useState<string>("");
  const { data: alertSettingsData } = useGetLowStockAlertSettings({ query: { queryKey: ["low-stock-alert-settings"] } });
  const updateAlertMutation = useUpdateLowStockAlertSettings();
  const { data: alertLogData } = useListLowStockAlertLog({ limit: 10, offset: 0 }, { query: { queryKey: ["low-stock-alert-log"] } });

  useEffect(() => {
    if (alertSettingsData) {
      setAlertEnabled(alertSettingsData.enabled === "true");
      setAlertEmails(alertSettingsData.emailAddresses ?? []);
      setAlertMode((alertSettingsData.mode as "immediate" | "digest") ?? "immediate");
      setAlertThreshold(alertSettingsData.globalThreshold != null ? String(alertSettingsData.globalThreshold) : "");
    }
  }, [alertSettingsData]);

  const handleAlertSave = () => {
    const threshold = alertThreshold.trim() !== "" ? parseInt(alertThreshold, 10) : null;
    updateAlertMutation.mutate({
      data: {
        enabled: alertEnabled ? "true" : "false",
        emailAddresses: alertEmails,
        mode: alertMode,
        globalThreshold: threshold !== null && !isNaN(threshold) ? threshold : null,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["low-stock-alert-settings"] });
        toast.success("Low-stock alert settings saved");
      },
      onError: () => toast.error("Failed to save low-stock alert settings"),
    });
  };

  const addAlertEmail = () => {
    const email = alertEmailInput.trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !alertEmails.includes(email)) {
      setAlertEmails([...alertEmails, email]);
    }
    setAlertEmailInput("");
  };

  /* Regional settings */
  const [regCurrency, setRegCurrency] = useState("AUD");
  const [regTimezone, setRegTimezone] = useState("Australia/Sydney");
  const [regExt, setRegExt] = useState<RegExtSettings>(REG_DEFAULT);
  const patchRegExt = (patch: Partial<RegExtSettings>) => setRegExt(prev => ({ ...prev, ...patch }));

  const { data: regExtData } = useGetRegionalExtSettings({ query: { queryKey: ["regional-ext-settings"] } });
  const updateRegExtMutation = useUpdateRegionalExtSettings();
  useEffect(() => {
    if (regExtData) {
      setRegExt({
        language:           regExtData.language,
        dateFormat:         regExtData.dateFormat,
        timeFormat:         regExtData.timeFormat as "12" | "24",
        decimalSeparator:   regExtData.decimalSeparator as "." | ",",
        thousandsSeparator: regExtData.thousandsSeparator as RegExtSettings["thousandsSeparator"],
        measurementSystem:  regExtData.measurementSystem as "metric" | "imperial",
        paperSize:          regExtData.paperSize as "A4" | "letter",
        firstDayOfWeek:     regExtData.firstDayOfWeek as RegExtSettings["firstDayOfWeek"],
        fiscalYearStart:    regExtData.fiscalYearStart,
        taxLabel:           regExtData.taxLabel,
        customTaxLabel:     regExtData.customTaxLabel,
        taxNumberLabel:     regExtData.taxNumberLabel,
        receiptPaperSize:   regExtData.receiptPaperSize as RegExtSettings["receiptPaperSize"],
      });
    }
  }, [regExtData]);

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
      setRegCurrency(merchant.currency || "AUD");
      setRegTimezone(merchant.timezone || "Australia/Sydney");
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
    const cats = ext.categories ?? [];
    if (trimmed && !cats.includes(trimmed)) {
      setExtField("categories", [...cats, trimmed]);
    }
    setCatInput("");
  };

  const removeCategory = (cat: string) =>
    setExtField("categories", (ext.categories ?? []).filter((c) => c !== cat));

  const togglePayment = (type: string) => {
    const types = ext.paymentTypes ?? [];
    setExtField(
      "paymentTypes",
      types.includes(type)
        ? types.filter((p) => p !== type)
        : [...types, type]
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
      setExtField("customLinks", [...(ext.customLinks ?? []), linkDraft]);
      setLinkDraft({ label: "", url: "" });
    }
  };

  const removeCustomLink = (i: number) =>
    setExtField("customLinks", (ext.customLinks ?? []).filter((_, idx) => idx !== i));

  const setBrandColor = (idx: number, val: string) => {
    const next = [...(ext.brandColors ?? [])];
    next[idx] = val;
    setExtField("brandColors", next);
  };

  const setBgColor = (idx: number, val: string) => {
    const next = [...(ext.bgColors ?? [])];
    next[idx] = val;
    setExtField("bgColors", next);
  };

  const setTextColor = (idx: number, val: string) => {
    const next = [...(ext.textColors ?? [])];
    next[idx] = val;
    setExtField("textColors", next);
  };

  /* Save regional */
  const handleRegionalSave = () => {
    updateMutation.mutate(
      { data: { currency: regCurrency || undefined, timezone: regTimezone || undefined } },
      {
        onSuccess: (updated) => {
          updateRegExtMutation.mutate({ data: regExt }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: ["regional-ext-settings"] });
            },
          });
          login(updated);
          queryClient.invalidateQueries({ queryKey: ["merchant"] });
          toast.success("Regional settings saved");
        },
        onError: () => toast.error("Failed to save regional settings"),
      }
    );
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
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Business Info</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Update your business name, logo, contact details, and branding.</p>
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending} size="sm" className="shrink-0 bg-[#efbf04] hover:bg-[#d4aa03] text-black font-semibold">
            {updateMutation.isPending ? "Saving…" : "Save Business Info"}
          </Button>
        </div>

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
            {(ext.categories ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(ext.categories ?? []).map((cat) => (
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
            <LogoSection logo={ext.logo} onLogoChange={(val) => setExtField("logo", val)} onFileUpload={handleLogoUpload} />
          </CardContent>
        </Card>

        {/* ── Branding ─────────────────────────────────────────────────────── */}
        <Card id="branding">
          <CardHeader><CardTitle className="text-base">Branding</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {/* Font */}
            <div>
              <Label className="block mb-1.5">Brand Font</Label>
              <FontPicker
                value={ext.brandFont}
                onChange={(v) => setExtField("brandFont", v)}
              />
              {ext.brandFont && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Preview:{" "}
                  <span style={{ fontFamily: `"${ext.brandFont}", sans-serif` }} className="font-medium">
                    The quick brown fox jumps over the lazy dog
                  </span>
                </p>
              )}
            </div>

            {/* Brand Colours */}
            <div>
              <Label className="block mb-1">Brand Colours</Label>
              <p className="text-xs text-muted-foreground mb-2">These are applied as the default colours throughout the app.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(ext.brandColors ?? []).map((c, i) => (
                  <ColourPicker key={i} value={c} onChange={(v) => setBrandColor(i, v)} />
                ))}
              </div>
            </div>

            {/* Background & UI Colours */}
            <div>
              <Label className="block mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Background &amp; UI Colours</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(ext.bgColors ?? []).map((c, i) => (
                  <ColourPicker key={i} value={c} onChange={(v) => setBgColor(i, v)} />
                ))}
              </div>
            </div>

            {/* Text Colours */}
            <div>
              <Label className="block mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Text Colours</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(ext.textColors ?? []).map((c, i) => (
                  <ColourPicker key={i} value={c} onChange={(v) => setTextColor(i, v)} />
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
                <Input type="url" value={ext.website} onChange={(e) => setExtField("website", e.target.value)} placeholder="https://www.yourbusiness.com.au" className="truncate" />
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
              <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 pt-0.5">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={!looksLikeStateCode(ext.state)}
                    onCheckedChange={(checked) => {
                      setExtField("state", checked ? expandStateCode(ext.state) : collapseStateName(ext.state));
                    }}
                  />
                  Use full state name (e.g. NSW → New South Wales)
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={!looksLikeCode(apiForm.country)}
                    onCheckedChange={(checked) => {
                      setApiForm((prev) => ({
                        ...prev,
                        country: checked ? expandCountryCode(prev.country) : collapseCountryName(prev.country),
                      }));
                    }}
                  />
                  Use full country name (e.g. AU → Australia)
                </label>
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
                    checked={(ext.paymentTypes ?? []).includes(type)}
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
          <CardHeader>
            <CardTitle className="text-base">Social Media Links</CardTitle>
            <p className="text-xs text-muted-foreground">Enter your username or handle only — no need for the full URL.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                { key: "facebook",  label: "Facebook",   icon: Facebook,  baseUrl: "facebook.com/",    placeholder: "yourbusiness" },
                { key: "instagram", label: "Instagram",  icon: Instagram, baseUrl: "instagram.com/",   placeholder: "yourbusiness" },
                { key: "twitter",   label: "X / Twitter",icon: Twitter,   baseUrl: "x.com/",           placeholder: "yourhandle"   },
                { key: "linkedin",  label: "LinkedIn",   icon: Linkedin,  baseUrl: "linkedin.com/in/", placeholder: "yourhandle"   },
                { key: "youtube",   label: "YouTube",    icon: Youtube,   baseUrl: "youtube.com/@",    placeholder: "yourchannel"  },
                { key: "tiktok",    label: "TikTok",     icon: Globe,     baseUrl: "tiktok.com/@",     placeholder: "yourhandle"   },
              ] as { key: keyof typeof ext.socialLinks; label: string; icon: React.ElementType; baseUrl: string; placeholder: string }[]
            ).map(({ key, label, icon: Icon, baseUrl, placeholder }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="w-8 flex justify-center text-muted-foreground shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 flex items-center rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
                  <span className="text-xs text-muted-foreground bg-muted px-2.5 py-2 border-r border-input whitespace-nowrap select-none shrink-0">{baseUrl}</span>
                  <Input
                    value={stripSocialHandle(ext.socialLinks[key])}
                    onChange={(e) => setSocial(key, stripSocialHandle(e.target.value))}
                    placeholder={placeholder}
                    className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm rounded-none"
                    aria-label={label}
                  />
                </div>
              </div>
            ))}

            {/* Custom links */}
            {(ext.customLinks ?? []).length > 0 && (
              <div className="pt-2 space-y-2">
                <SectionTitle>Custom Links</SectionTitle>
                {(ext.customLinks ?? []).map((link, i) => (
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


        {/* ── Low-stock Alerts ─────────────────────────────────────────────── */}
        <Card id="low-stock-alerts">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Low-stock Alerts
                </CardTitle>
                <CardDescription className="mt-1">
                  Get notified when products drop at or below their stock threshold.
                </CardDescription>
              </div>
              <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Email addresses */}
            <div>
              <Label className="mb-1.5 block">Notify email addresses</Label>
              <div className="flex gap-2">
                <Input
                  value={alertEmailInput}
                  onChange={(e) => setAlertEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlertEmail(); } }}
                  placeholder="email@example.com"
                  type="email"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addAlertEmail}><Plus className="h-4 w-4" /></Button>
              </div>
              {alertEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {alertEmails.map((email) => (
                    <Badge key={email} variant="secondary" className="flex items-center gap-1 pr-1">
                      {email}
                      <button onClick={() => setAlertEmails(alertEmails.filter((e) => e !== email))} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Frequency */}
            <div>
              <Label className="mb-1.5 block">Alert frequency</Label>
              <Select value={alertMode} onValueChange={(v) => setAlertMode(v as "immediate" | "digest")}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate — alert for each product as it crosses threshold</SelectItem>
                  <SelectItem value="digest">Daily digest — one email per day with all low-stock items</SelectItem>
                </SelectContent>
              </Select>
              {alertMode === "digest" && (
                <p className="text-xs text-muted-foreground mt-1.5">The digest runs once every 24 hours and lists all products currently at or below threshold.</p>
              )}
            </div>

            {/* Global threshold override */}
            <div>
              <Label className="mb-1.5 block">Global threshold fallback</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                  placeholder="5"
                  className="w-28"
                />
                <p className="text-sm text-muted-foreground">Used when a product has no per-product threshold set. Defaults to 5 if left blank.</p>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button onClick={handleAlertSave} disabled={updateAlertMutation.isPending} size="sm" className="bg-[#efbf04] hover:bg-[#d4aa03] text-black font-semibold">
                {updateAlertMutation.isPending ? "Saving…" : "Save Alert Settings"}
              </Button>
            </div>

            {/* Alert history */}
            {(alertLogData?.items?.length ?? 0) > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-3 flex items-center gap-2"><History className="h-4 w-4" /> Recent alert history</p>
                  <div className="space-y-2">
                    {alertLogData!.items.map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                        <div>
                          <p className="font-medium">{entry.itemCount} {entry.itemCount === 1 ? "product" : "products"} alerted</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.mode === "digest" ? "Daily digest" : "Immediate"} · sent to {(entry.emailAddresses as string[]).join(", ")}
                          </p>
                          {(entry.items as Array<{ productName: string; stockQuantity: number }>).slice(0, 3).map((item, i) => (
                            <p key={i} className="text-xs text-muted-foreground">{item.productName} ({item.stockQuantity} left)</p>
                          ))}
                          {(entry.items as unknown[]).length > 3 && (
                            <p className="text-xs text-muted-foreground">+{(entry.items as unknown[]).length - 3} more</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {new Date(entry.sentAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
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

function LogoSection({
  logo,
  onLogoChange,
  onFileUpload,
}: {
  logo: string;
  onLogoChange: (val: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div
          className="relative w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer hover:bg-muted/20 transition-colors shrink-0"
          onClick={() => inputRef.current?.click()}
        >
          {logo ? (
            <img src={logo} alt="Logo" className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground/40" />
          )}
          {logo && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onLogoChange(""); }}
              className="absolute top-0.5 right-0.5 bg-background rounded-full p-0.5 shadow hover:bg-destructive hover:text-white transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label>
            <Button type="button" variant="outline" size="sm" asChild>
              <span className="cursor-pointer"><Upload className="h-3.5 w-3.5 mr-1" />{logo ? "Replace Logo" : "Upload Logo"}</span>
            </Button>
            <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={onFileUpload} />
          </label>
          {!urlMode && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => { setUrlMode(true); setUrlInput(logo); }}
            >
              <Globe className="w-3 h-3" /> Use URL instead
            </button>
          )}
          <p className="text-xs text-muted-foreground">PNG or SVG recommended. Max 2 MB.</p>
        </div>
      </div>
      {urlMode && (
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://example.com/logo.png"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && urlInput.trim()) { onLogoChange(urlInput.trim()); setUrlMode(false); setUrlInput(""); }
            }}
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
            autoFocus
          />
          <Button type="button" size="sm" onClick={() => { if (urlInput.trim()) { onLogoChange(urlInput.trim()); setUrlMode(false); setUrlInput(""); } }}>Apply</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setUrlMode(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
