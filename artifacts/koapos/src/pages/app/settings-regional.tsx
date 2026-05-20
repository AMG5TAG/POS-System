import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, useUpdateMerchant } from "@workspace/api-client-react";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, Hash, Clock4 } from "lucide-react";

// ── Locale data ────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "en-AU", label: "🇦🇺  English (Australia)" },
  { value: "en-US", label: "🇺🇸  English (United States)" },
  { value: "en-GB", label: "🇬🇧  English (United Kingdom)" },
  { value: "en-CA", label: "🇨🇦  English (Canada)" },
  { value: "en-NZ", label: "🇳🇿  English (New Zealand)" },
  { value: "en-SG", label: "🇸🇬  English (Singapore)" },
  { value: "en-IN", label: "🇮🇳  English (India)" },
  { value: "en-ZA", label: "🇿🇦  English (South Africa)" },
  { value: "fr",    label: "🇫🇷  French" },
  { value: "fr-CA", label: "🇨🇦  French (Canada)" },
  { value: "de",    label: "🇩🇪  German" },
  { value: "es",    label: "🇪🇸  Spanish" },
  { value: "es-MX", label: "🇲🇽  Spanish (Mexico)" },
  { value: "it",    label: "🇮🇹  Italian" },
  { value: "nl",    label: "🇳🇱  Dutch" },
  { value: "pt",    label: "🇵🇹  Portuguese" },
  { value: "pt-BR", label: "🇧🇷  Portuguese (Brazil)" },
  { value: "ja",    label: "🇯🇵  Japanese" },
  { value: "ko",    label: "🇰🇷  Korean" },
  { value: "zh-CN", label: "🇨🇳  Chinese (Simplified)" },
  { value: "zh-TW", label: "🇹🇼  Chinese (Traditional)" },
  { value: "ar",    label: "🇸🇦  Arabic" },
  { value: "hi",    label: "🇮🇳  Hindi" },
  { value: "id",    label: "🇮🇩  Indonesian" },
  { value: "ms",    label: "🇲🇾  Malay" },
  { value: "th",    label: "🇹🇭  Thai" },
  { value: "vi",    label: "🇻🇳  Vietnamese" },
  { value: "tr",    label: "🇹🇷  Turkish" },
  { value: "pl",    label: "🇵🇱  Polish" },
  { value: "sv",    label: "🇸🇪  Swedish" },
  { value: "no",    label: "🇳🇴  Norwegian" },
  { value: "da",    label: "🇩🇰  Danish" },
  { value: "fi",    label: "🇫🇮  Finnish" },
];

const CURRENCIES = [
  { value: "AUD", label: "AUD — Australian Dollar ($)" },
  { value: "NZD", label: "NZD — New Zealand Dollar ($)" },
  { value: "USD", label: "USD — US Dollar ($)" },
  { value: "CAD", label: "CAD — Canadian Dollar ($)" },
  { value: "GBP", label: "GBP — British Pound (£)" },
  { value: "EUR", label: "EUR — Euro (€)" },
  { value: "CHF", label: "CHF — Swiss Franc (Fr)" },
  { value: "SEK", label: "SEK — Swedish Krona (kr)" },
  { value: "NOK", label: "NOK — Norwegian Krone (kr)" },
  { value: "DKK", label: "DKK — Danish Krone (kr)" },
  { value: "JPY", label: "JPY — Japanese Yen (¥)" },
  { value: "CNY", label: "CNY — Chinese Yuan (¥)" },
  { value: "HKD", label: "HKD — Hong Kong Dollar ($)" },
  { value: "TWD", label: "TWD — Taiwan Dollar (NT$)" },
  { value: "KRW", label: "KRW — South Korean Won (₩)" },
  { value: "SGD", label: "SGD — Singapore Dollar ($)" },
  { value: "MYR", label: "MYR — Malaysian Ringgit (RM)" },
  { value: "IDR", label: "IDR — Indonesian Rupiah (Rp)" },
  { value: "PHP", label: "PHP — Philippine Peso (₱)" },
  { value: "THB", label: "THB — Thai Baht (฿)" },
  { value: "VND", label: "VND — Vietnamese Dong (₫)" },
  { value: "INR", label: "INR — Indian Rupee (₹)" },
  { value: "PKR", label: "PKR — Pakistani Rupee (₨)" },
  { value: "BDT", label: "BDT — Bangladeshi Taka (৳)" },
  { value: "LKR", label: "LKR — Sri Lankan Rupee (₨)" },
  { value: "AED", label: "AED — UAE Dirham (د.إ)" },
  { value: "SAR", label: "SAR — Saudi Riyal (﷼)" },
  { value: "QAR", label: "QAR — Qatari Riyal (﷼)" },
  { value: "KWD", label: "KWD — Kuwaiti Dinar (KD)" },
  { value: "BHD", label: "BHD — Bahraini Dinar (BD)" },
  { value: "OMR", label: "OMR — Omani Rial (﷼)" },
  { value: "ILS", label: "ILS — Israeli Shekel (₪)" },
  { value: "TRY", label: "TRY — Turkish Lira (₺)" },
  { value: "PLN", label: "PLN — Polish Złoty (zł)" },
  { value: "CZK", label: "CZK — Czech Koruna (Kč)" },
  { value: "HUF", label: "HUF — Hungarian Forint (Ft)" },
  { value: "ZAR", label: "ZAR — South African Rand (R)" },
  { value: "NGN", label: "NGN — Nigerian Naira (₦)" },
  { value: "KES", label: "KES — Kenyan Shilling (KSh)" },
  { value: "GHS", label: "GHS — Ghanaian Cedi (GH₵)" },
  { value: "EGP", label: "EGP — Egyptian Pound (E£)" },
  { value: "MAD", label: "MAD — Moroccan Dirham (MAD)" },
  { value: "MXN", label: "MXN — Mexican Peso ($)" },
  { value: "BRL", label: "BRL — Brazilian Real (R$)" },
  { value: "ARS", label: "ARS — Argentine Peso ($)" },
  { value: "CLP", label: "CLP — Chilean Peso ($)" },
  { value: "COP", label: "COP — Colombian Peso ($)" },
  { value: "PEN", label: "PEN — Peruvian Sol (S/.)" },
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  AUD:"$", NZD:"$", USD:"$", CAD:"$", HKD:"$", SGD:"$", MXN:"$", ARS:"$", CLP:"$", COP:"$",
  GBP:"£", EUR:"€", JPY:"¥", CNY:"¥", CHF:"Fr", SEK:"kr", NOK:"kr", DKK:"kr",
  TWD:"NT$", KRW:"₩", MYR:"RM", IDR:"Rp", PHP:"₱", THB:"฿", VND:"₫", INR:"₹",
  PKR:"₨", LKR:"₨", BDT:"৳", AED:"د.إ", SAR:"﷼", QAR:"﷼", OMR:"﷼", KWD:"KD",
  BHD:"BD", ILS:"₪", TRY:"₺", PLN:"zł", CZK:"Kč", HUF:"Ft", ZAR:"R", NGN:"₦",
  KES:"KSh", GHS:"GH₵", EGP:"E£", MAD:"MAD", BRL:"R$", PEN:"S/.",
};

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY — Australian / European" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY — US / Philippines" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD — ISO 8601" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY — Dashes" },
  { value: "DD.MM.YYYY", label: "DD.MM.YYYY — German / European" },
  { value: "D MMMM YYYY", label: "D MMMM YYYY — 25 December 2025" },
  { value: "MMMM D, YYYY", label: "MMMM D, YYYY — December 25, 2025" },
];

const TIMEZONES: { group: string; zones: { value: string; label: string }[] }[] = [
  { group: "Australia & Pacific", zones: [
    { value: "Australia/Sydney",    label: "AEST — Sydney / Melbourne / Canberra" },
    { value: "Australia/Brisbane",  label: "AEST — Brisbane / Queensland" },
    { value: "Australia/Adelaide",  label: "ACST — Adelaide / South Australia" },
    { value: "Australia/Perth",     label: "AWST — Perth / Western Australia" },
    { value: "Australia/Darwin",    label: "ACST — Darwin / Northern Territory" },
    { value: "Australia/Hobart",    label: "AEST — Hobart / Tasmania" },
    { value: "Pacific/Auckland",    label: "NZST — Auckland / Wellington" },
    { value: "Pacific/Chatham",     label: "CHAST — Chatham Islands" },
    { value: "Pacific/Fiji",        label: "FJT — Fiji" },
    { value: "Pacific/Guam",        label: "ChST — Guam" },
    { value: "Pacific/Honolulu",    label: "HST — Hawaii" },
  ]},
  { group: "Americas", zones: [
    { value: "America/New_York",    label: "EST — New York / Miami / Atlanta" },
    { value: "America/Chicago",     label: "CST — Chicago / Houston / Dallas" },
    { value: "America/Denver",      label: "MST — Denver / Phoenix" },
    { value: "America/Los_Angeles", label: "PST — Los Angeles / Seattle" },
    { value: "America/Anchorage",   label: "AKST — Anchorage" },
    { value: "America/Toronto",     label: "EST — Toronto / Ottawa" },
    { value: "America/Vancouver",   label: "PST — Vancouver" },
    { value: "America/Winnipeg",    label: "CST — Winnipeg / Regina" },
    { value: "America/Halifax",     label: "AST — Halifax" },
    { value: "America/St_Johns",    label: "NST — St. John's" },
    { value: "America/Mexico_City", label: "CST — Mexico City" },
    { value: "America/Sao_Paulo",   label: "BRT — São Paulo / Rio de Janeiro" },
    { value: "America/Buenos_Aires",label: "ART — Buenos Aires" },
    { value: "America/Lima",        label: "PET — Lima / Bogotá" },
    { value: "America/Santiago",    label: "CLT — Santiago" },
    { value: "America/Caracas",     label: "VET — Caracas" },
  ]},
  { group: "Europe", zones: [
    { value: "Europe/London",       label: "GMT/BST — London / Edinburgh" },
    { value: "Europe/Dublin",       label: "GMT/IST — Dublin" },
    { value: "Europe/Lisbon",       label: "WET — Lisbon" },
    { value: "Europe/Paris",        label: "CET — Paris / Lyon" },
    { value: "Europe/Berlin",       label: "CET — Berlin / Frankfurt / Hamburg" },
    { value: "Europe/Madrid",       label: "CET — Madrid / Barcelona" },
    { value: "Europe/Rome",         label: "CET — Rome / Milan" },
    { value: "Europe/Amsterdam",    label: "CET — Amsterdam / Brussels" },
    { value: "Europe/Zurich",       label: "CET — Zurich / Geneva" },
    { value: "Europe/Vienna",       label: "CET — Vienna" },
    { value: "Europe/Warsaw",       label: "CET — Warsaw / Kraków" },
    { value: "Europe/Prague",       label: "CET — Prague / Bratislava" },
    { value: "Europe/Budapest",     label: "CET — Budapest" },
    { value: "Europe/Bucharest",    label: "EET — Bucharest / Sofia" },
    { value: "Europe/Athens",       label: "EET — Athens" },
    { value: "Europe/Helsinki",     label: "EET — Helsinki / Tallinn / Riga" },
    { value: "Europe/Stockholm",    label: "CET — Stockholm" },
    { value: "Europe/Oslo",         label: "CET — Oslo" },
    { value: "Europe/Copenhagen",   label: "CET — Copenhagen" },
    { value: "Europe/Moscow",       label: "MSK — Moscow / St. Petersburg" },
    { value: "Europe/Istanbul",     label: "TRT — Istanbul" },
  ]},
  { group: "Asia & Middle East", zones: [
    { value: "Asia/Dubai",          label: "GST — Dubai / Abu Dhabi" },
    { value: "Asia/Riyadh",         label: "AST — Riyadh / Kuwait" },
    { value: "Asia/Qatar",          label: "AST — Doha" },
    { value: "Asia/Jerusalem",      label: "IST — Tel Aviv / Jerusalem" },
    { value: "Asia/Kolkata",        label: "IST — Mumbai / Delhi / Bangalore" },
    { value: "Asia/Karachi",        label: "PKT — Karachi / Lahore" },
    { value: "Asia/Dhaka",          label: "BST — Dhaka" },
    { value: "Asia/Colombo",        label: "SLST — Colombo" },
    { value: "Asia/Kathmandu",      label: "NPT — Kathmandu" },
    { value: "Asia/Yangon",         label: "MMT — Yangon" },
    { value: "Asia/Bangkok",        label: "ICT — Bangkok / Jakarta / Hanoi" },
    { value: "Asia/Singapore",      label: "SGT — Singapore / Kuala Lumpur" },
    { value: "Asia/Hong_Kong",      label: "HKT — Hong Kong" },
    { value: "Asia/Shanghai",       label: "CST — Shanghai / Beijing" },
    { value: "Asia/Taipei",         label: "CST — Taipei" },
    { value: "Asia/Seoul",          label: "KST — Seoul" },
    { value: "Asia/Tokyo",          label: "JST — Tokyo / Osaka" },
    { value: "Asia/Manila",         label: "PHT — Manila / Cebu" },
  ]},
  { group: "Africa", zones: [
    { value: "Africa/Cairo",        label: "EET — Cairo / Alexandria" },
    { value: "Africa/Johannesburg", label: "SAST — Johannesburg / Cape Town" },
    { value: "Africa/Lagos",        label: "WAT — Lagos / Accra" },
    { value: "Africa/Nairobi",      label: "EAT — Nairobi / Kampala" },
    { value: "Africa/Casablanca",   label: "WET — Casablanca / Rabat" },
    { value: "Africa/Tunis",        label: "CET — Tunis" },
    { value: "Africa/Algiers",      label: "CET — Algiers" },
  ]},
];

// ── Helpers ────────────────────────────────────────────────────────────────

const LS_KEY = "koapos_regional_ext";

interface ExtSettings {
  language: string;
  dateFormat: string;
  timeFormat: "12" | "24";
  decimalSeparator: "." | ",";
  thousandsSeparator: "," | "." | " " | "'";
  measurementSystem: "metric" | "imperial";
  paperSize: "A4" | "letter";
  firstDayOfWeek: "monday" | "sunday" | "saturday";
}

const DEFAULT_EXT: ExtSettings = {
  language: "en-AU",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "12",
  decimalSeparator: ".",
  thousandsSeparator: ",",
  measurementSystem: "metric",
  paperSize: "A4",
  firstDayOfWeek: "monday",
};

function loadExt(): ExtSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_EXT, ...(JSON.parse(raw) as Partial<ExtSettings>) };
  } catch { /* ignore */ }
  return { ...DEFAULT_EXT };
}

function saveExt(s: ExtSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function formatPreview(currency: string, tz: string, ext: ExtSettings): string {
  const sym    = CURRENCY_SYMBOLS[currency] ?? currency;
  const dec    = ext.decimalSeparator;
  const thou   = ext.thousandsSeparator;
  const amount = `${sym}1${thou}234${dec}56`;

  const now      = new Date("2025-12-25T14:30:00");
  const d        = 25, m = 12, y = 2025;
  const mm       = String(m).padStart(2, "0");
  const dd       = String(d).padStart(2, "0");
  let dateStr    = "";
  switch (ext.dateFormat) {
    case "DD/MM/YYYY":   dateStr = `${dd}/${mm}/${y}`; break;
    case "MM/DD/YYYY":   dateStr = `${mm}/${dd}/${y}`; break;
    case "YYYY-MM-DD":   dateStr = `${y}-${mm}-${dd}`; break;
    case "DD-MM-YYYY":   dateStr = `${dd}-${mm}-${y}`; break;
    case "DD.MM.YYYY":   dateStr = `${dd}.${mm}.${y}`; break;
    case "D MMMM YYYY":  dateStr = `${d} December ${y}`; break;
    case "MMMM D, YYYY": dateStr = `December ${d}, ${y}`; break;
    default:             dateStr = `${dd}/${mm}/${y}`;
  }

  let timeStr = "";
  if (ext.timeFormat === "12") {
    timeStr = `2:30 PM`;
  } else {
    timeStr = `14:30`;
  }

  const shortTz = tz.replace("Australia/", "").replace("America/", "").replace("Europe/", "");

  void now;
  return `Preview: ${amount}  ·  ${dateStr}  ·  ${timeStr}  (${shortTz})`;
}

// ── Toggle component ───────────────────────────────────────────────────────

function SegmentToggle<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-primary/10 text-primary border-primary"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function SettingsRegionalPage() {
  const queryClient  = useQueryClient();
  const { login }    = useAuth();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const updateMutation     = useUpdateMerchant();

  const [currency, setCurrency] = useState("AUD");
  const [timezone, setTimezone] = useState("Australia/Sydney");
  const [ext,      setExt]      = useState<ExtSettings>(loadExt);

  useEffect(() => {
    if (merchant) {
      setCurrency(merchant.currency || "AUD");
      setTimezone(merchant.timezone || "Australia/Sydney");
    }
  }, [merchant]);

  const patchExt = (patch: Partial<ExtSettings>) => setExt(prev => ({ ...prev, ...patch }));

  const handleSave = () => {
    updateMutation.mutate(
      { data: { currency: currency || undefined, timezone: timezone || undefined } },
      {
        onSuccess: (updated) => {
          saveExt(ext);
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
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold">Regional Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure how your store displays language, currency, dates, and other regional preferences.
          </p>
        </div>

        {/* ── Section 1: Localisation ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Localisation
            </CardTitle>
            <CardDescription>
              Set your regional defaults for currency, dates, and time across the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Row 1: Language + Currency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>App Language</Label>
                <Select value={ext.language} onValueChange={v => patchExt({ language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {LANGUAGES.map(l => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Date Format + Time Format */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>Date Format</Label>
                <Select value={ext.dateFormat} onValueChange={v => patchExt({ dateFormat: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATE_FORMATS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Time Format</Label>
                <SegmentToggle
                  options={[
                    { value: "12", label: "12-hour (AM/PM)" },
                    { value: "24", label: "24-hour" },
                  ]}
                  value={ext.timeFormat}
                  onChange={v => patchExt({ timeFormat: v })}
                />
              </div>
            </div>

            {/* Row 3: Timezone */}
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {TIMEZONES.map(group => (
                    <SelectGroup key={group.group}>
                      <SelectLabel>{group.group}</SelectLabel>
                      {group.zones.map(z => (
                        <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview */}
            <div className="rounded-lg bg-muted/40 border px-4 py-2.5 text-sm text-muted-foreground font-mono">
              {formatPreview(currency, timezone, ext)}
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: Number & Measurement ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              Numbers &amp; Units
            </CardTitle>
            <CardDescription>
              Control how numbers are formatted and what units are used throughout the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>Decimal Separator</Label>
                <SegmentToggle
                  options={[
                    { value: ".", label: "Period  1,234.56" },
                    { value: ",", label: "Comma  1.234,56" },
                  ]}
                  value={ext.decimalSeparator}
                  onChange={v => patchExt({ decimalSeparator: v, thousandsSeparator: v === "." ? "," : "." })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Thousands Separator</Label>
                <Select
                  value={ext.thousandsSeparator}
                  onValueChange={v => patchExt({ thousandsSeparator: v as ExtSettings["thousandsSeparator"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Comma  (1,000)</SelectItem>
                    <SelectItem value=".">Period  (1.000)</SelectItem>
                    <SelectItem value=" ">Space  (1 000)</SelectItem>
                    <SelectItem value="'">Apostrophe  (1'000)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>Measurement System</Label>
                <SegmentToggle
                  options={[
                    { value: "metric",   label: "Metric (kg, cm, L)" },
                    { value: "imperial", label: "Imperial (lb, in, gal)" },
                  ]}
                  value={ext.measurementSystem}
                  onChange={v => patchExt({ measurementSystem: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Default Paper Size</Label>
                <SegmentToggle
                  options={[
                    { value: "A4",     label: "A4  (210 × 297 mm)" },
                    { value: "letter", label: "US Letter  (8.5 × 11\")" },
                  ]}
                  value={ext.paperSize}
                  onChange={v => patchExt({ paperSize: v })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>First Day of Week</Label>
              <SegmentToggle
                options={[
                  { value: "monday",   label: "Monday" },
                  { value: "sunday",   label: "Sunday" },
                  { value: "saturday", label: "Saturday" },
                ]}
                value={ext.firstDayOfWeek}
                onChange={v => patchExt({ firstDayOfWeek: v })}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Section 3: Clock & Calendar ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock4 className="h-5 w-5 text-primary" />
              Clock &amp; Calendar Display
            </CardTitle>
            <CardDescription>
              These settings affect how dates and times are shown in reports, rosters, and appointments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-muted/30 border p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                { label: "Language",          value: LANGUAGES.find(l => l.value === ext.language)?.label.replace(/^.{4}\s+/, "") ?? ext.language },
                { label: "Currency",          value: currency },
                { label: "Date format",       value: ext.dateFormat },
                { label: "Time format",       value: ext.timeFormat === "12" ? "12-hour AM/PM" : "24-hour" },
                { label: "Decimal",           value: ext.decimalSeparator === "." ? "Period (1,234.56)" : "Comma (1.234,56)" },
                { label: "Measurement",       value: ext.measurementSystem === "metric" ? "Metric" : "Imperial" },
                { label: "Paper size",        value: ext.paperSize },
                { label: "Week starts",       value: ext.firstDayOfWeek.charAt(0).toUpperCase() + ext.firstDayOfWeek.slice(1) },
              ].map(row => (
                <div key={row.label}>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{row.label}</p>
                  <p className="font-medium text-sm">{row.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg">
            {updateMutation.isPending ? "Saving…" : "Save Regional Settings"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
