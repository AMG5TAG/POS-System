import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import Barcode from "react-barcode";
import {
  Receipt, FileText, Mail, MessageSquare, Tag, Printer,
  Check, Star, Sparkles, Minimize2, Zap, Building2,
  Copy, User, ShoppingCart, Percent, Eye, EyeOff,
  Settings2, ClipboardList,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Category = "receipts" | "invoices" | "emails" | "sms" | "service";

interface TemplateOption {
  id: string;
  name: string;
  style: "professional" | "casual" | "minimal" | "bold";
  description: string;
}

/* ─── Per-template options ─────────────────────────────────────────────────── */

export interface TplOpts {
  // Text fields
  headerText:           string;
  footerText:           string;
  thankYouMsg:          string;
  customGreeting:       string;
  customSignOff:        string;
  paymentTerms:         string;
  invoiceNotes:         string;
  customMessage:        string;
  subjectLine:          string;
  messageText:          string;
  bankDetails:          string;
  paymentSectionHeading: string;
  loyaltyQrText:        string;
  // Toggles
  showLogo:             boolean;
  showAbn:              boolean;
  showWebsite:          boolean;
  showTagline:          boolean;
  showPaymentMethods:   boolean;
  showGstBreakdown:     boolean;
  showSocialLinks:      boolean;
  showLoyaltyEarned:    boolean;
  showCustomerQr:       boolean;
  showAllCustomerDetails: boolean;
  sendAfterSale:        boolean;
  sendForLayby:         boolean;
  printCustomerCopy:    boolean;
  showBarcode:          boolean;
  // Service Sheet
  showCustomerDetails:  boolean;
  showDeviceDetails:    boolean;
  showWorkDescription:  boolean;
  showPhotos:           boolean;
  showSignature:        boolean;
  showCallHistory:      boolean;
  callHistoryRows:      string;
  warrantyText:         string;
  jobNoFontSize:        string;
}

export const DEFAULT_OPTS: TplOpts = {
  headerText: "", footerText: "", thankYouMsg: "Thank you for your purchase!",
  customGreeting: "Hi {{customer.first_name}},", customSignOff: "— The team at {{business.name}}",
  paymentTerms: "", invoiceNotes: "",
  customMessage: "", subjectLine: "Your receipt from {{business.name}} — {{transaction.number}}",
  messageText: "Hi {{customer.first_name}}! Thanks for visiting {{business.name}}. Total: {{transaction.total}} on {{transaction.date}}. {{business.website}}",
  bankDetails: "",
  paymentSectionHeading: "",
  loyaltyQrText: "",
  showLogo: true, showAbn: true, showWebsite: true, showTagline: false,
  showPaymentMethods: true, showGstBreakdown: true, showSocialLinks: false,
  showLoyaltyEarned: false, showCustomerQr: false, showAllCustomerDetails: false,
  sendAfterSale: true, sendForLayby: true, printCustomerCopy: false, showBarcode: false,
  showCustomerDetails: true, showDeviceDetails: true, showWorkDescription: true,
  showPhotos: true, showSignature: true, showCallHistory: true,
  callHistoryRows: "6", warrantyText: "", jobNoFontSize: "normal",
};

function useTplOpts(templateId: string) {
  const key = `koapos_tpl_opts_${templateId}`;
  const [opts, setOpts] = useState<TplOpts>(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) return { ...DEFAULT_OPTS, ...JSON.parse(s) as Partial<TplOpts> };
    } catch {}
    return { ...DEFAULT_OPTS };
  });

  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      setOpts(s ? { ...DEFAULT_OPTS, ...JSON.parse(s) as Partial<TplOpts> } : { ...DEFAULT_OPTS });
    } catch {
      setOpts({ ...DEFAULT_OPTS });
    }
  }, [templateId, key]);

  const update = useCallback(<K extends keyof TplOpts>(k: K, v: TplOpts[K]) => {
    setOpts((prev) => {
      const next = { ...prev, [k]: v };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  const reset = useCallback(() => {
    try { localStorage.removeItem(key); } catch {}
    setOpts({ ...DEFAULT_OPTS });
  }, [key]);

  return { opts, update, reset };
}

/* ─── Options config per category ─────────────────────────────────────────── */

interface FieldDef {
  key: keyof TplOpts;
  label: string;
  type: "text" | "textarea" | "toggle" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  quickCodes?: boolean;
  section?: string;
}

function getOptionsConfig(category: Category): FieldDef[] {
  switch (category) {
    case "receipts": return [
      { section: "Header", key: "showLogo",          label: "Show Business Logo",  type: "toggle" },
      { section: "Header", key: "showTagline",        label: "Show Tagline",        type: "toggle" },
      { section: "Header", key: "showAbn",            label: "Show ABN",            type: "toggle" },
      { section: "Header", key: "headerText",         label: "Custom Header Text",  type: "text",     placeholder: "e.g. Welcome to {{business.name}}", quickCodes: true },
      { section: "Body",   key: "showGstBreakdown",   label: "Show GST Breakdown",  type: "toggle" },
      { section: "Body",   key: "showPaymentMethods", label: "Show Payment Method", type: "toggle" },
      { section: "Body",   key: "showLoyaltyEarned",  label: "Show Loyalty Earned", type: "toggle" },
      { section: "Body",   key: "showBarcode",        label: "Show Sale Barcode",   type: "toggle", hint: "Scannable barcode to retrieve this sale" },
      { section: "Body",   key: "showCustomerQr",     label: "Show Customer QR",    type: "toggle", hint: "QR code linked to customer loyalty profile" },
      { section: "Body",   key: "loyaltyQrText",      label: "QR Scan Label",       type: "text",   placeholder: "Scan to view customer loyalty profile" },
      { section: "Footer", key: "thankYouMsg",        label: "Thank You Message",   type: "text",     placeholder: "Thank you for your purchase!", quickCodes: true },
      { section: "Footer", key: "footerText",         label: "Footer Text",         type: "text",     placeholder: "e.g. Returns within 30 days", quickCodes: true },
      { section: "Footer", key: "showWebsite",        label: "Show Website",        type: "toggle" },
      { section: "Print",  key: "printCustomerCopy",  label: "Print Customer Copy", type: "toggle", hint: "Prints a duplicate copy for the customer" },
    ];
    case "invoices": return [
      { section: "Header",   key: "showLogo",                label: "Show Business Logo",        type: "toggle" },
      { section: "Header",   key: "showAbn",                 label: "Show ABN",                  type: "toggle" },
      { section: "Header",   key: "showTagline",             label: "Show Tagline",              type: "toggle" },
      { section: "Header",   key: "headerText",              label: "Custom Header Text",        type: "text",     placeholder: "e.g. TAX INVOICE / RECEIPT", quickCodes: true },
      { section: "Customer", key: "showAllCustomerDetails",  label: "Show All Customer Details", type: "toggle", hint: "Name, email, phone, address on the invoice" },
      { section: "Customer", key: "showCustomerQr",          label: "Show Customer QR Code",     type: "toggle", hint: "QR code linked to customer loyalty profile" },
      { section: "Customer", key: "loyaltyQrText",           label: "QR Scan Label",             type: "text",   placeholder: "Scan to view customer loyalty profile" },
      { section: "Body",     key: "showGstBreakdown",        label: "Show GST Breakdown",        type: "toggle" },
      { section: "Body",     key: "showLoyaltyEarned",       label: "Show Loyalty Earned",       type: "toggle" },
      { section: "Body",     key: "showBarcode",             label: "Show Sale Barcode",         type: "toggle", hint: "Scannable barcode to retrieve this sale" },
      { section: "Payment",  key: "showPaymentMethods",      label: "Show Accepted Methods",     type: "toggle", hint: "Shows methods enabled in POS Registers" },
      { section: "Payment",  key: "paymentSectionHeading",   label: "Payment Heading",           type: "text",     placeholder: "PAYMENT DETAILS" },
      { section: "Payment",  key: "bankDetails",             label: "Bank Transfer Details",     type: "textarea", placeholder: "Bank: ANZ\nBSB: 012-345\nAccount: 123456789\nRef: Invoice #" },
      { section: "Terms",    key: "paymentTerms",            label: "Payment Terms",             type: "text",     placeholder: "Payment due within 30 days.", quickCodes: true },
      { section: "Terms",    key: "invoiceNotes",            label: "Invoice Notes",             type: "textarea", placeholder: "e.g. Thank you for your business. Late fees apply.", quickCodes: true },
      { section: "Footer",   key: "thankYouMsg",             label: "Thank You Message",         type: "text",     placeholder: "Thank you for your purchase!", quickCodes: true },
      { section: "Footer",   key: "customMessage",           label: "Custom Message",            type: "textarea", placeholder: "e.g. Return policy, loyalty info, special offers…", quickCodes: true },
      { section: "Footer",   key: "showSocialLinks",         label: "Show Business Socials",     type: "toggle", hint: "Pulls social links from Business Info" },
      { section: "Footer",   key: "footerText",              label: "Footer Text",               type: "text",     placeholder: "Thank you for your business!", quickCodes: true },
      { section: "Footer",   key: "showWebsite",             label: "Show Website",              type: "toggle" },
    ];
    case "emails": return [
      { section: "Subject", key: "subjectLine",       label: "Subject Line",        type: "text",     placeholder: "Your receipt from {{business.name}}", quickCodes: true },
      { section: "Header",  key: "showLogo",          label: "Show Logo",           type: "toggle" },
      { section: "Header",  key: "showAbn",           label: "Show ABN",            type: "toggle" },
      { section: "Body",    key: "customGreeting",    label: "Opening Greeting",    type: "text",     placeholder: "Hi {{customer.first_name}},", quickCodes: true },
      { section: "Body",    key: "customMessage",     label: "Custom Message Body", type: "textarea", placeholder: "e.g. Thank you for shopping with us…", quickCodes: true },
      { section: "Body",    key: "showGstBreakdown",  label: "Show GST Breakdown",  type: "toggle" },
      { section: "Footer",  key: "customSignOff",     label: "Sign-off Text",       type: "text",     placeholder: "— The team at {{business.name}}", quickCodes: true },
      { section: "Footer",  key: "footerText",        label: "Footer Text",         type: "text",     placeholder: "e.g. Questions? Email {{business.email}}", quickCodes: true },
      { section: "Footer",  key: "showWebsite",       label: "Show Website",        type: "toggle" },
      { section: "Footer",  key: "showSocialLinks",   label: "Show Social Links",   type: "toggle" },
    ];
    case "sms": return [
      { section: "Message", key: "messageText",       label: "Message Text",        type: "textarea", placeholder: "Hi {{customer.first_name}}! Thanks for visiting…", quickCodes: true },
      { section: "Send",    key: "sendAfterSale",     label: "Send After Each Sale",type: "toggle" },
      { section: "Send",    key: "sendForLayby",      label: "Send for Layby Payments", type: "toggle" },
    ];
    case "service": return [
      { section: "Header",   key: "showLogo",             label: "Show Business Logo",       type: "toggle" },
      { section: "Header",   key: "showAbn",              label: "Show ABN",                 type: "toggle" },
      { section: "Header",   key: "headerText",           label: "Sheet Title",              type: "text",     placeholder: "SERVICE JOB SHEET" },
      { section: "Job No",   key: "jobNoFontSize",        label: "Job No Font Size",         type: "select",   options: [{ value: "normal", label: "Normal" }, { value: "large", label: "Large" }, { value: "xlarge", label: "X-Large" }] },
      { section: "Sections", key: "showCustomerDetails",  label: "Show Customer Details",    type: "toggle" },
      { section: "Sections", key: "showDeviceDetails",    label: "Show Device Details",      type: "toggle" },
      { section: "Sections", key: "showWorkDescription",  label: "Show Fault / Work Req.",   type: "toggle" },
      { section: "Sections", key: "showPhotos",           label: "Show Device Photos",       type: "toggle" },
      { section: "Sections", key: "showSignature",        label: "Show Signature Area",      type: "toggle" },
      { section: "Sections", key: "showCallHistory",      label: "Show Call History",        type: "toggle" },
      { section: "Sections", key: "callHistoryRows",      label: "Call History Rows",        type: "text",     placeholder: "6", hint: "Number of blank rows for manual notes" },
      { section: "Footer",   key: "warrantyText",         label: "Warranty / Terms",         type: "textarea", placeholder: "e.g. Warranty: 90 days on parts and labour. No liability for pre-existing data loss." },
      { section: "Footer",   key: "footerText",           label: "Footer Text",              type: "text",     placeholder: "Thank you for your business!", quickCodes: true },
    ];
    default: return [];
  }
}

/* ─── Quick Codes ─────────────────────────────────────────────────────────── */

interface QuickCode   { code: string; label: string; example: string }
interface QuickCodeGroup { id: string; label: string; icon: React.ElementType; color: string; chipBg: string; codes: QuickCode[] }

function buildQuickCodeGroups(businessName: string, abn: string, email: string, website: string, tagline: string, address: string): QuickCodeGroup[] {
  return [
    {
      id: "business", label: "Business Details", icon: Building2,
      color: "text-blue-700", chipBg: "bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700",
      codes: [
        { code: "{{business.name}}",    label: "Business Name", example: businessName || "Your Business"      },
        { code: "{{business.abn}}",     label: "ABN",           example: abn          || "12 345 678 901"     },
        { code: "{{business.email}}",   label: "Email",         example: email        || "hello@biz.com.au"   },
        { code: "{{business.phone}}",   label: "Phone",         example: "(03) 9000 0000"                     },
        { code: "{{business.website}}", label: "Website",       example: website      || "www.yourbiz.com.au" },
        { code: "{{business.tagline}}", label: "Tagline",       example: tagline      || "Quality you trust"  },
        { code: "{{business.address}}", label: "Address",       example: address      || "Melbourne VIC 3000" },
      ],
    },
    {
      id: "customer", label: "Customer", icon: User,
      color: "text-violet-700", chipBg: "bg-violet-50 border-violet-200 hover:bg-violet-100 text-violet-700",
      codes: [
        { code: "{{customer.name}}",           label: "Full Name",      example: "Sarah Johnson"   },
        { code: "{{customer.first_name}}",     label: "First Name",     example: "Sarah"           },
        { code: "{{customer.email}}",          label: "Email",          example: "sarah@email.com" },
        { code: "{{customer.phone}}",          label: "Phone",          example: "(03) 9000 1111"  },
        { code: "{{customer.loyalty_points}}", label: "Loyalty Points", example: "420 pts"         },
        { code: "{{customer.loyalty_tier}}",   label: "Loyalty Tier",   example: "Gold Member"     },
        { code: "{{customer.id}}",             label: "Customer ID",    example: "#CUS-0042"       },
        { code: "{{customer.total_spent}}",    label: "Total Spent",    example: "$1,240.00"       },
      ],
    },
    {
      id: "transaction", label: "Transaction", icon: ShoppingCart,
      color: "text-emerald-700", chipBg: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700",
      codes: [
        { code: "{{transaction.number}}",         label: "Receipt #",      example: "#TXN-1042"   },
        { code: "{{transaction.date}}",           label: "Date",           example: "18/05/2026"  },
        { code: "{{transaction.time}}",           label: "Time",           example: "10:42 AM"    },
        { code: "{{transaction.total}}",          label: "Total",          example: "$19.50"      },
        { code: "{{transaction.gst}}",            label: "GST Amount",     example: "$1.77"       },
        { code: "{{transaction.subtotal}}",       label: "Subtotal",       example: "$17.73"      },
        { code: "{{transaction.items}}",          label: "Item Count",     example: "3 items"     },
        { code: "{{transaction.payment_method}}", label: "Payment Method", example: "EFTPOS"      },
        { code: "{{transaction.change}}",         label: "Change Given",   example: "$0.50"       },
      ],
    },
    {
      id: "promo", label: "Promo / Discount", icon: Percent,
      color: "text-amber-700", chipBg: "bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-700",
      codes: [
        { code: "{{promo.code}}",        label: "Promo Code",   example: "SAVE10"         },
        { code: "{{promo.discount}}",    label: "Discount",     example: "10% off"        },
        { code: "{{promo.expiry}}",      label: "Expiry Date",  example: "30/06/2026"     },
        { code: "{{promo.min_spend}}",   label: "Min. Spend",   example: "$50.00"         },
        { code: "{{promo.description}}", label: "Description",  example: "Summer Sale 🎉" },
        { code: "{{promo.savings}}",     label: "Amount Saved", example: "$5.00"          },
      ],
    },
  ];
}

/* ─── Full-width Quick Codes bar ──────────────────────────────────────────── */

function QuickCodesBar({
  groups,
  focusedField,
  onInsert,
}: {
  groups: QuickCodeGroup[];
  focusedField: string | null;
  onInsert: (fieldKey: string, code: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(false);

  const handleCode = (code: string) => {
    if (focusedField) {
      onInsert(focusedField, code);
    } else {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Quick Codes</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Merge Tags</Badge>
          {focusedField && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-green-600 border-green-300 bg-green-50">
              Inserting into: {focusedField}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            {focusedField ? "Click a code to insert at cursor" : "Click any code to copy · Focus a text field to insert directly"}
          </p>
          <button
            onClick={() => setShowValues(!showValues)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showValues ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showValues ? "Show codes" : "Show values"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0">
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.id} className="p-4">
              <div className={cn("flex items-center gap-1.5 mb-3", group.color)}>
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">{group.label}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.codes.map((c) => {
                  const isCopied = copied === c.code;
                  return (
                    <button
                      key={c.code}
                      onClick={() => handleCode(c.code)}
                      title={`${c.label} · Example: ${c.example}`}
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border font-mono transition-all select-none",
                        isCopied ? "bg-green-100 border-green-400 text-green-700 scale-95" : group.chipBg
                      )}
                    >
                      {isCopied ? (
                        <><Check className="w-2.5 h-2.5" />{focusedField ? "Inserted!" : "Copied!"}</>
                      ) : showValues ? (
                        <span className="font-sans">{c.example}</span>
                      ) : (
                        c.code
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Template Options Panel ─────────────────────────────────────────────── */

function OptionsPanel({
  category,
  templateId,
  opts,
  update,
  reset,
  onFieldFocus,
  onFieldInsert,
}: {
  category: Category;
  templateId: string;
  opts: TplOpts;
  update: <K extends keyof TplOpts>(k: K, v: TplOpts[K]) => void;
  reset: () => void;
  onFieldFocus: (key: string | null) => void;
  onFieldInsert: (key: string, insert: (code: string) => void) => void;
}) {
  const fields = getOptionsConfig(category);
  const sections = [...new Set(fields.map((f) => f.section ?? "General"))];

  // Refs for all text/textarea fields for insert-at-cursor
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  const registerInsert = (key: string) => (code: string) => {
    const el = inputRefs.current[key];
    if (!el) return;
    const val = opts[key as keyof TplOpts] as string ?? "";
    const start = el.selectionStart ?? val.length;
    const end = el.selectionEnd ?? val.length;
    const next = val.slice(0, start) + code + val.slice(end);
    update(key as keyof TplOpts, next as TplOpts[keyof TplOpts]);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + code.length, start + code.length);
    });
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Options</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5">{category}</Badge>
        </div>
        <button onClick={reset} className="text-xs text-muted-foreground hover:text-destructive transition-colors">Reset</button>
      </div>

      <div className="overflow-y-auto flex-1 divide-y">
        {sections.map((section) => {
          const sectionFields = fields.filter((f) => (f.section ?? "General") === section);
          const toggles = sectionFields.filter((f) => f.type === "toggle");
          const texts   = sectionFields.filter((f) => f.type !== "toggle");

          return (
            <div key={section} className="p-4 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{section}</p>

              {/* Toggles in a compact grid */}
              {toggles.length > 0 && (
                <div className="space-y-2">
                  {toggles.map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Label className="text-xs cursor-pointer leading-tight">{f.label}</Label>
                        {f.hint && <p className="text-[10px] text-muted-foreground mt-0.5">{f.hint}</p>}
                      </div>
                      <Switch
                        checked={!!opts[f.key]}
                        onCheckedChange={(v) => update(f.key, v as TplOpts[typeof f.key])}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Text/textarea/select fields */}
              {texts.map((f) => {
                const val = (opts[f.key] as string) ?? "";
                return (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-xs">{f.label}</Label>
                    {f.type === "select" && f.options ? (
                      <select
                        value={val || f.options[0]?.value}
                        onChange={(e) => update(f.key, e.target.value as TplOpts[typeof f.key])}
                        className="text-xs h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : f.type === "textarea" ? (
                      <Textarea
                        ref={(el) => { inputRefs.current[f.key] = el; }}
                        value={val}
                        onChange={(e) => update(f.key, e.target.value as TplOpts[typeof f.key])}
                        onFocus={() => {
                          onFieldFocus(f.label);
                          onFieldInsert(f.key, registerInsert(f.key));
                        }}
                        onBlur={() => onFieldFocus(null)}
                        placeholder={f.placeholder}
                        className="text-xs min-h-[64px] resize-y font-mono"
                        rows={3}
                      />
                    ) : (
                      <Input
                        ref={(el) => { inputRefs.current[f.key] = el; }}
                        value={val}
                        onChange={(e) => update(f.key, e.target.value as TplOpts[typeof f.key])}
                        onFocus={() => {
                          onFieldFocus(f.label);
                          onFieldInsert(f.key, registerInsert(f.key));
                        }}
                        onBlur={() => onFieldFocus(null)}
                        placeholder={f.placeholder}
                        className="text-xs h-8 font-mono"
                      />
                    )}
                    {f.key === "messageText" && (
                      <p className="text-[10px] text-muted-foreground">
                        {val.length} chars{val.length > 160 ? ` · ${Math.ceil(val.length / 160)} SMS parts` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Template catalogue ─────────────────────────────────────────────────── */

const TEMPLATES: Record<Category, TemplateOption[]> = {
  receipts:   [
    { id: "r-pro",     name: "Professional", style: "professional", description: "Clean logo header, bold totals, structured layout"  },
    { id: "r-casual",  name: "Casual",       style: "casual",       description: "Friendly tone, rounded feel, softer typography"     },
    { id: "r-minimal", name: "Minimal",      style: "minimal",      description: "Text-only, ultra-compact, fast printing"            },
  ],
  invoices:   [
    { id: "i-pro",     name: "Professional", style: "professional", description: "Logo, payment terms, itemised table"                 },
    { id: "i-modern",  name: "Modern",       style: "bold",         description: "Bold colour header, two-column layout"               },
    { id: "i-minimal", name: "Minimal",      style: "minimal",      description: "No frills, plain A4 business invoice"               },
    { id: "a4-pro",    name: "A4 Receipt — Pro",    style: "professional", description: "Full-page receipt: logo, totals, thank-you" },
    { id: "a4-casual", name: "A4 Receipt — Casual", style: "casual",       description: "Friendly A4 receipt with message and socials" },
  ],
  emails:     [
    { id: "e-pro",     name: "Professional", style: "professional", description: "HTML email with header banner, itemised receipt"    },
    { id: "e-casual",  name: "Casual",       style: "casual",       description: "Warm tone, logo, product summary, return policy"   },
    { id: "e-minimal", name: "Minimal",      style: "minimal",      description: "Plain-text style, fast loading, high deliverability"},
  ],
  sms:        [
    { id: "s-receipt", name: "Sale Receipt",         style: "minimal",      description: "Short confirmation with total and thank you"    },
    { id: "s-appt",    name: "Appointment Reminder", style: "professional", description: "Date, time, business name, cancel link"         },
    { id: "s-layby",   name: "Layby Reminder",       style: "casual",       description: "Payment due reminder with balance owed"         },
  ],
  service:    [
    { id: "ss-standard", name: "Standard", style: "professional", description: "Full A4 sheet — all sections, grid layout, call history" },
    { id: "ss-compact",  name: "Compact",  style: "minimal",      description: "Condensed layout, fewer rows, fits more on one page"     },
  ],
};

const CATEGORY_META: Record<Category, { label: string; icon: React.ElementType; color: string }> = {
  receipts:   { label: "Receipts",     icon: Receipt,       color: "text-blue-500"    },
  invoices:   { label: "Invoices",     icon: FileText,      color: "text-violet-500"  },
  emails:     { label: "Emails",       icon: Mail,          color: "text-amber-500"   },
  sms:        { label: "SMS",          icon: MessageSquare, color: "text-rose-500"    },
  service:    { label: "Service Sheet", icon: ClipboardList, color: "text-cyan-500"    },
};

const STYLE_ICONS: Record<string, React.ElementType> = {
  professional: Star, casual: Sparkles, minimal: Minimize2, bold: Zap,
};

const STYLE_COLORS: Record<string, string> = {
  professional: "bg-blue-50 text-blue-700 border-blue-200",
  casual:       "bg-amber-50 text-amber-700 border-amber-200",
  minimal:      "bg-gray-50 text-gray-600 border-gray-200",
  bold:         "bg-violet-50 text-violet-700 border-violet-200",
};

export const ACTIVE_STORAGE_KEY = "koapos_active_templates";

/* ─── Preview components ─────────────────────────────────────────────────── */

interface PreviewProps {
  templateId: string;
  businessName: string; abn: string; tagline: string; website: string;
  email: string; address: string; brandColor: string; logo?: string;
  opts: TplOpts;
}

export function resolveCode(text: string, businessName: string, abn: string, website: string, email: string): string {
  return text
    .replace(/{{business\.name}}/g,    businessName)
    .replace(/{{business\.abn}}/g,     abn)
    .replace(/{{business\.email}}/g,   email)
    .replace(/{{business\.website}}/g, website)
    .replace(/{{business\.phone}}/g,   "(03) 9000 0000")
    .replace(/{{customer\.name}}/g,    "Sarah Johnson")
    .replace(/{{customer\.first_name}}/g, "Sarah")
    .replace(/{{transaction\.total}}/g, "$19.50")
    .replace(/{{transaction\.date}}/g,  "18/05/2026")
    .replace(/{{transaction\.number}}/g,"#TXN-1042")
    .replace(/{{[^}]+}}/g,             "…");
}

/* ─── Visual QR Code (CSS grid pattern, preview only) ────────────────────── */

function QRCodeVisual({ label = "CUS-0042", size = 44 }: { label?: string; size?: number }) {
  const seed = Array.from(label).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const N = 9;
  const cells = Array.from({ length: N * N }, (_, i) => {
    const r = Math.floor(i / N);
    const c = i % N;
    const isCornerBlock = (r < 3 && c < 3) || (r < 3 && c > N - 4) || (r > N - 4 && c < 3);
    const isCornerBorder = (r === 0 || r === 2) && (c < 3 || c > N - 4) ||
                           (c === 0 || c === 2) && (r < 3 || r > N - 4) ||
                           (r === N - 1 || r === N - 3) && c < 3 ||
                           (c === N - 1 || c === N - 3) && r > N - 4;
    if (isCornerBlock && !isCornerBorder) return true;
    const h = Math.abs(Math.sin(seed * (r * N + c + 1) * 0.31)) > 0.45;
    return h;
  });
  const cellPx = size / N;
  return (
    <div className="inline-block border border-gray-300 p-0.5 bg-white rounded-sm" title={label}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${N}, ${cellPx}px)`, gap: 0, width: size, height: size }}>
        {cells.map((filled, i) => (
          <div key={i} style={{ width: cellPx, height: cellPx, background: filled ? "#111" : "#fff" }} />
        ))}
      </div>
      <p className="font-mono text-[6px] text-gray-400 text-center mt-0.5">{label}</p>
    </div>
  );
}

function ReceiptPreview({ templateId, businessName, abn, website, email, brandColor, logo, opts }: PreviewProps) {
  const items = [{ name: "Flat White", qty: 2, price: 8.00 }, { name: "Banana Bread", qty: 1, price: 6.50 }, { name: "Orange Juice", qty: 1, price: 5.00 }];
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const gst = subtotal / 11;
  const date = "18/05/2026 10:42 AM";
  const footerMsg = opts.thankYouMsg || "Thank you for your purchase!";
  const footer    = opts.footerText;

  const QrBlock = () => opts.showCustomerQr ? (
    <div className="flex flex-col items-center border-t pt-1.5 mt-1 gap-0.5">
      <QRCodeVisual label="CUS-0042" size={40} />
      {opts.loyaltyQrText ? <p className="text-[8px] text-gray-400 text-center">{opts.loyaltyQrText}</p> : null}
    </div>
  ) : null;

  const BarcodeBlock = () => opts.showBarcode ? (
    <div className="border-t pt-1.5 mt-1 text-center">
      <Barcode value="TXN-1042" format="CODE128" width={1.2} height={24} fontSize={8} displayValue />
    </div>
  ) : null;

  const LoyaltyBlock = () => opts.showLoyaltyEarned ? (
    <div className="flex justify-between text-[9px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 mt-1">
      <span>★ Loyalty Earned</span><span>+19 pts</span>
    </div>
  ) : null;

  if (templateId === "r-minimal") {
    return (
      <div className="font-mono text-xs text-gray-800 space-y-0.5 leading-snug">
        <p className="text-center font-bold uppercase">{businessName}</p>
        {opts.showTagline && <p className="text-center text-[9px]">Quality you can trust</p>}
        {opts.showAbn && abn && <p className="text-center">ABN: {abn}</p>}
        <p className="text-center">{date}</p>
        <p className="text-center">─────────────────</p>
        {items.map((i) => <div key={i.name} className="flex justify-between"><span>{i.name} ×{i.qty}</span><span>${(i.qty * i.price).toFixed(2)}</span></div>)}
        <p className="text-center">─────────────────</p>
        <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        {opts.showGstBreakdown && <div className="flex justify-between"><span>GST (10%)</span><span>${gst.toFixed(2)}</span></div>}
        <div className="flex justify-between font-bold"><span>TOTAL</span><span>${subtotal.toFixed(2)}</span></div>
        {opts.showPaymentMethods && <div className="flex justify-between text-gray-500"><span>EFTPOS</span><span>Approved</span></div>}
        <LoyaltyBlock />
        <p className="text-center">─────────────────</p>
        {footerMsg && <p className="text-center">{resolveCode(footerMsg, businessName, abn, website, email)}</p>}
        {footer    && <p className="text-center text-gray-500">{resolveCode(footer, businessName, abn, website, email)}</p>}
        {opts.showWebsite && website && <p className="text-center text-gray-400">{website}</p>}
        <BarcodeBlock />
      </div>
    );
  }
  if (templateId === "r-casual") {
    return (
      <div className="text-xs text-gray-800 font-sans">
        <div className="text-center mb-2">
          {opts.showLogo && (logo
            ? <img src={logo} alt="Logo" className="w-10 h-10 rounded-full object-contain mx-auto mb-1" />
            : <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-white text-lg font-bold" style={{ background: brandColor }}>{businessName[0]}</div>
          )}
          <p className="font-bold text-base">{businessName}</p>
          {opts.showTagline && <p className="text-gray-400 text-[10px] italic">Quality you can trust</p>}
          {opts.showAbn && abn && <p className="text-gray-400 text-[9px]">ABN {abn}</p>}
          <p className="text-gray-500 text-[10px]">{date}</p>
        </div>
        <div className="bg-gray-50 rounded p-2 space-y-1 text-[10px]">
          {items.map((i) => <div key={i.name} className="flex justify-between"><span>{i.name} ×{i.qty}</span><span>${(i.qty * i.price).toFixed(2)}</span></div>)}
        </div>
        <div className="mt-2 space-y-0.5 text-[10px]">
          {opts.showGstBreakdown && <div className="flex justify-between"><span className="text-gray-500">GST incl.</span><span>${gst.toFixed(2)}</span></div>}
          <div className="flex justify-between font-bold text-sm border-t pt-1" style={{ color: brandColor }}><span>Total</span><span>${subtotal.toFixed(2)}</span></div>
          {opts.showPaymentMethods && <div className="flex justify-between text-gray-500"><span>EFTPOS</span><span>Approved</span></div>}
        </div>
        <LoyaltyBlock />
        <div className="text-center text-[10px] text-gray-400 mt-2 space-y-0.5">
          {footerMsg && <p>{resolveCode(footerMsg, businessName, abn, website, email)}</p>}
          {footer    && <p className="text-gray-500">{resolveCode(footer, businessName, abn, website, email)}</p>}
          {opts.showWebsite && website && <p className="text-blue-500">{website}</p>}
        </div>
        <BarcodeBlock />
      </div>
    );
  }
  return (
    <div className="text-xs text-gray-800 font-sans">
      <div className="text-center border-b pb-2 mb-2">
        {opts.showLogo && (logo
          ? <img src={logo} alt="Logo" className="w-10 h-8 object-contain mx-auto mb-1" />
          : <div className="w-6 h-6 rounded mx-auto mb-1" style={{ background: brandColor }} />
        )}
        <p className="font-bold text-sm uppercase tracking-wide">{businessName}</p>
        {opts.showTagline && <p className="text-[9px] text-gray-500 italic">Quality you can trust</p>}
        {opts.showAbn && abn && <p className="text-[10px] text-gray-500">ABN {abn}</p>}
        <p className="text-[10px] text-gray-400">{date}</p>
      </div>
      <table className="w-full text-[10px]">
        <thead><tr className="border-b"><th className="text-left pb-0.5">Item</th><th className="text-center">Qty</th><th className="text-right">Amt</th></tr></thead>
        <tbody>{items.map((i) => <tr key={i.name}><td className="py-0.5">{i.name}</td><td className="text-center">{i.qty}</td><td className="text-right">${(i.qty * i.price).toFixed(2)}</td></tr>)}</tbody>
      </table>
      <div className="border-t mt-1 pt-1 space-y-0.5 text-[10px]">
        {opts.showGstBreakdown && <div className="flex justify-between"><span className="text-gray-500">GST (10%)</span><span>${gst.toFixed(2)}</span></div>}
        <div className="flex justify-between font-bold"><span>TOTAL AUD</span><span>${subtotal.toFixed(2)}</span></div>
        {opts.showPaymentMethods && <div className="flex justify-between text-gray-500"><span>EFTPOS</span><span>Approved</span></div>}
      </div>
      <LoyaltyBlock />
      <div className="text-center text-[10px] text-gray-400 border-t mt-1 pt-1 space-y-0.5">
        {footerMsg && <p>{resolveCode(footerMsg, businessName, abn, website, email)}</p>}
        {footer    && <p>{resolveCode(footer, businessName, abn, website, email)}</p>}
        {opts.showWebsite && website && <p>{website}</p>}
      </div>
      <BarcodeBlock />
    </div>
  );
}

function InvoicePreview({ templateId, businessName, abn, website, email, address, brandColor, logo, opts }: PreviewProps) {
  const items = [{ name: "Product Design Services", qty: 3, price: 150 }, { name: "Logo Package", qty: 1, price: 450 }];
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;
  const terms = opts.paymentTerms || "Payment due within 30 days.";
  const notes = opts.invoiceNotes;
  const footer = opts.footerText;
  const thankYou = opts.thankYouMsg;
  const customMsg = opts.customMessage;

  const MessagesBlock = () => (
    <>
      {customMsg && <p className="text-gray-500 text-[10px] mt-1 bg-gray-50 rounded px-2 py-1 leading-relaxed">{resolveCode(customMsg, businessName, abn, website, email)}</p>}
      {thankYou  && <p className="text-center text-[11px] font-semibold mt-1" style={{ color: brandColor }}>{resolveCode(thankYou, businessName, abn, website, email)}</p>}
    </>
  );

  const CustomerBlock = () => (
    <div className="mb-1.5">
      {opts.showAllCustomerDetails ? (
        <div className="border rounded p-1.5 text-[9px] space-y-0.5 bg-gray-50">
          <p className="font-semibold text-[8px] uppercase text-gray-400 tracking-wide">Customer</p>
          <p className="font-medium">Sarah Johnson</p>
          <p className="text-gray-500">sarah@email.com · (03) 9000 1111</p>
          <p className="text-gray-500">42 Collins St, Melbourne VIC 3000</p>
          {opts.showCustomerQr && (
            <div className="flex items-center gap-2 border-t pt-1 mt-1">
              <QRCodeVisual label="CUS-0042" size={38} />
              {opts.loyaltyQrText ? <p className="text-[8px] text-gray-400">{opts.loyaltyQrText}</p> : null}
            </div>
          )}
        </div>
      ) : (
        <p className="font-medium text-[10px]">Bill To: Demo Client Pty Ltd</p>
      )}
      {!opts.showAllCustomerDetails && opts.showCustomerQr && (
        <div className="flex items-center gap-2 mt-1">
          <QRCodeVisual label="CUS-0042" size={38} />
          {opts.loyaltyQrText ? <p className="text-[8px] text-gray-400">{opts.loyaltyQrText}</p> : null}
        </div>
      )}
    </div>
  );

  const LoyaltyRow = () => opts.showLoyaltyEarned ? (
    <div className="flex justify-between text-[9px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 mt-1">
      <span>★ Loyalty Earned</span><span>+96 pts</span>
    </div>
  ) : null;

  const QrBlock = () => opts.showCustomerQr ? (
    <div className="flex items-center gap-2 border-t pt-1.5 mt-1.5">
      <QRCodeVisual label="CUS-0042" size={38} />
      {opts.loyaltyQrText ? <p className="text-[8px] text-gray-400">{opts.loyaltyQrText}</p> : null}
    </div>
  ) : null;

  const BarcodeBlock = () => opts.showBarcode ? (
    <div className="border-t pt-1.5 mt-1.5 text-center">
      <Barcode value="INV-1042" format="CODE128" width={1.5} height={26} fontSize={8} displayValue />
    </div>
  ) : null;

  const PaymentBlock = () => (opts.showPaymentMethods || opts.bankDetails) ? (
    <div className="border rounded p-1.5 mt-1.5 text-[9px] space-y-0.5">
      <p className="font-semibold text-[8px] uppercase text-gray-400 tracking-wide">{opts.paymentSectionHeading || "PAYMENT DETAILS"}</p>
      {opts.showPaymentMethods && (
        <div className="flex flex-wrap gap-1">
          {["EFTPOS", "Cash", "Visa", "Mastercard"].map(m => (
            <span key={m} className="border rounded px-1 py-0.5 text-[8px] text-gray-600 bg-white">{m}</span>
          ))}
        </div>
      )}
      {opts.bankDetails && (
        <p className="text-gray-500 whitespace-pre-wrap font-mono text-[8px]">{opts.bankDetails}</p>
      )}
    </div>
  ) : null;

  const SocialsBlock = () => opts.showSocialLinks ? (
    <div className="flex gap-2 text-[9px] text-gray-400 mt-1">
      <span>fb/ YourBusiness</span>
      <span>ig/ @yourbusiness</span>
    </div>
  ) : null;

  const NotesBlock = ({ className }: { className?: string }) => notes ? (
    <div className={className}>
      {notes.split("\n").map((line, i) => (
        <p key={i} className="text-gray-400">{resolveCode(line || " ", businessName, abn, website, email)}</p>
      ))}
    </div>
  ) : null;

  if (templateId === "i-minimal") {
    return (
      <div className="text-[10px] font-mono text-gray-800 space-y-1.5">
        <div className="flex justify-between font-bold text-xs"><span>{businessName}</span><span>INVOICE #1042</span></div>
        {opts.showAbn && abn && <p className="text-gray-500">ABN: {abn}</p>}
        <p className="text-gray-500">Date: 18/05/2026 · Due: 01/06/2026</p>
        <Separator />
        <CustomerBlock />
        <Separator />
        {items.map((i) => <div key={i.name} className="flex justify-between"><span className="flex-1">{i.name}</span><span className="w-8 text-right">{i.qty}</span><span className="w-16 text-right">${(i.qty * i.price).toFixed(2)}</span></div>)}
        <Separator />
        <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        {opts.showGstBreakdown && <div className="flex justify-between"><span>GST 10%</span><span>${gst.toFixed(2)}</span></div>}
        <div className="flex justify-between font-bold"><span>TOTAL DUE</span><span>${total.toFixed(2)}</span></div>
        <LoyaltyRow />
        <PaymentBlock />
        <p className="text-gray-400 pt-1">{resolveCode(terms, businessName, abn, website, email)}</p>
        <NotesBlock />
        <MessagesBlock />
        {footer && <p className="text-gray-400">{resolveCode(footer, businessName, abn, website, email)}</p>}
        <BarcodeBlock />
      </div>
    );
  }
  if (templateId === "i-modern") {
    return (
      <div className="text-[10px] text-gray-800">
        <div className="p-2 rounded-t text-white text-xs font-bold flex justify-between items-center mb-2" style={{ background: brandColor }}>
          <span className="text-base">{businessName}</span><span className="opacity-80">INVOICE #1042</span>
        </div>
        {opts.showTagline && <p className="text-[9px] text-gray-400 italic mb-1.5">Quality you can trust</p>}
        <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
          <div>
            <p className="text-gray-400">From</p>
            <p className="font-medium">{businessName}</p>
            {opts.showAbn && abn && <p className="text-gray-500">ABN {abn}</p>}
          </div>
          <div>
            {opts.showAllCustomerDetails ? (
              <>
                <p className="text-gray-400">Bill To</p>
                <p className="font-medium">Sarah Johnson</p>
                <p className="text-gray-500 text-[9px]">sarah@email.com</p>
                <p className="text-gray-500 text-[9px]">(03) 9000 1111</p>
              </>
            ) : (
              <>
                <p className="text-gray-400">Bill To</p>
                <p className="font-medium">Demo Client</p>
                <p className="text-gray-500">18/05/2026</p>
              </>
            )}
          </div>
        </div>
        <table className="w-full text-[10px]">
          <thead><tr className="border-b"><th className="text-left pb-0.5">Description</th><th className="text-right">Total</th></tr></thead>
          <tbody>{items.map((i) => <tr key={i.name}><td className="py-0.5">{i.name}</td><td className="text-right">${(i.qty * i.price).toFixed(2)}</td></tr>)}</tbody>
        </table>
        <div className="border-t mt-1 pt-1 space-y-0.5 text-[10px]">
          {opts.showGstBreakdown && <div className="flex justify-between"><span className="text-gray-500">GST</span><span>${gst.toFixed(2)}</span></div>}
          <div className="flex justify-between font-bold text-sm" style={{ color: brandColor }}><span>Total Due</span><span>${total.toFixed(2)}</span></div>
        </div>
        <LoyaltyRow />
        <PaymentBlock />
        <p className="text-gray-400 mt-1 text-[9px]">{resolveCode(terms, businessName, abn, website, email)}</p>
        <NotesBlock className="text-[9px]" />
        <MessagesBlock />
        <SocialsBlock />
        <BarcodeBlock />
      </div>
    );
  }
  return (
    <div className="text-[10px] text-gray-800">
      <div className="flex justify-between items-start border-b pb-2 mb-2">
        <div>
          {opts.showLogo && (logo
            ? <img src={logo} alt="Logo" className="max-h-8 max-w-[80px] object-contain mb-1" />
            : <div className="w-5 h-5 rounded mb-1" style={{ background: brandColor }} />
          )}
          <p className="font-bold text-xs">{businessName}</p>
          {opts.showTagline && <p className="text-[9px] text-gray-400 italic">Quality you can trust</p>}
          {opts.showAbn    && abn     && <p className="text-gray-500">ABN {abn}</p>}
          {address && <p className="text-gray-500">{address}</p>}
          {email   && <p className="text-gray-500">{email}</p>}
          {opts.showWebsite && website && <p className="text-gray-400">{website}</p>}
        </div>
        <div className="text-right">
          <p className="font-bold text-sm" style={{ color: brandColor }}>INVOICE</p>
          <p className="text-gray-500">#1042 · 18/05/2026</p>
          <p className="text-gray-500">Due: 01/06/2026</p>
        </div>
      </div>
      <CustomerBlock />
      <table className="w-full text-[10px] mb-1">
        <thead><tr className="border-b"><th className="text-left">Item</th><th className="text-center">Qty</th><th className="text-right">Rate</th><th className="text-right">Total</th></tr></thead>
        <tbody>{items.map((i) => <tr key={i.name}><td className="py-0.5">{i.name}</td><td className="text-center">{i.qty}</td><td className="text-right">${i.price.toFixed(2)}</td><td className="text-right">${(i.qty * i.price).toFixed(2)}</td></tr>)}</tbody>
      </table>
      <div className="border-t pt-1 space-y-0.5 text-[10px]">
        {opts.showGstBreakdown && <div className="flex justify-between"><span className="text-gray-500">GST (10%)</span><span>${gst.toFixed(2)}</span></div>}
        <div className="flex justify-between font-bold"><span>TOTAL DUE (AUD)</span><span>${total.toFixed(2)}</span></div>
      </div>
      <LoyaltyRow />
      <PaymentBlock />
      <div className="text-gray-400 mt-1 border-t pt-1 text-[10px] space-y-0.5">
        <p>{resolveCode(terms, businessName, abn, website, email)}</p>
        <NotesBlock />
        <MessagesBlock />
        {opts.showWebsite && website && <p>{website}</p>}
        {footer && <p>{resolveCode(footer, businessName, abn, website, email)}</p>}
        <SocialsBlock />
      </div>
      <BarcodeBlock />
    </div>
  );
}

function A4ReceiptPreview({ templateId, businessName, abn, website, email, brandColor, tagline, logo, opts }: PreviewProps) {
  const items = [{ name: "Flat White ×2", price: 8.00 }, { name: "Banana Bread ×1", price: 6.50 }];
  const total = items.reduce((s, i) => s + i.price, 0);
  const thankYou = opts.thankYouMsg || "Thank you so much!";
  const customMsg = opts.customMessage;
  const footer    = opts.footerText;

  if (templateId === "a4-casual") {
    return (
      <div className="text-[10px] text-gray-800">
        <div className="text-center mb-3 p-2 rounded-t" style={{ background: `${brandColor}18` }}>
          {opts.showLogo && (logo
            ? <img src={logo} alt="Logo" className="w-10 h-10 rounded-full object-contain mx-auto mb-1" />
            : <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-white font-bold" style={{ background: brandColor }}>{businessName[0]}</div>
          )}
          <p className="font-bold text-sm">{businessName}</p>
          {opts.showTagline && tagline && <p className="text-[10px] text-gray-500 italic">{tagline}</p>}
          {opts.showAbn && abn && <p className="text-[10px] text-gray-400">ABN {abn}</p>}
        </div>
        <p className="text-center text-gray-500 mb-2 text-[10px]">18 May 2026 · 10:42 AM · Receipt #0042</p>
        <div className="bg-gray-50 rounded p-2 space-y-1 text-[10px] mb-2">
          {items.map((i) => <div key={i.name} className="flex justify-between"><span>{i.name}</span><span>${i.price.toFixed(2)}</span></div>)}
        </div>
        <div className="flex justify-between font-bold text-xs mb-2" style={{ color: brandColor }}><span>Total Paid</span><span>${total.toFixed(2)}</span></div>
        <Separator className="my-2" />
        <p className="text-center font-bold text-xs mb-1">{resolveCode(thankYou, businessName, abn, website, email)}</p>
        {customMsg && <p className="text-center text-[10px] text-gray-500 mb-1">{resolveCode(customMsg, businessName, abn, website, email)}</p>}
        {footer    && <p className="text-center text-[10px] text-gray-400">{resolveCode(footer, businessName, abn, website, email)}</p>}
        {opts.showWebsite && website && <p className="text-center text-[10px] text-blue-500 mt-1">{website}</p>}
      </div>
    );
  }
  return (
    <div className="text-[10px] text-gray-800">
      <div className="flex justify-between items-start border-b pb-2 mb-2 gap-4">
        <div className="min-w-0">
          {opts.showLogo && <div className="w-5 h-5 rounded mb-1" style={{ background: brandColor }} />}
          <p className="font-bold text-xs truncate">{businessName}</p>
          {opts.showAbn    && abn     && <p className="text-gray-400 truncate">ABN {abn}</p>}
          {email   && <p className="text-gray-400 truncate">{email}</p>}
          {opts.showWebsite && website && <p className="text-gray-400 truncate">{website}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-xs whitespace-nowrap" style={{ color: brandColor }}>TAX INVOICE / RECEIPT</p>
          <p className="text-gray-400 whitespace-nowrap">#0042 · 18/05/2026</p>
        </div>
      </div>
      <table className="w-full text-[10px] mb-1">
        <thead><tr className="border-b"><th className="text-left">Description</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{items.map((i) => <tr key={i.name}><td className="py-0.5">{i.name}</td><td className="text-right">${i.price.toFixed(2)}</td></tr>)}</tbody>
      </table>
      <div className="border-t pt-1 space-y-0.5 text-[10px]">
        {opts.showGstBreakdown && <div className="flex justify-between text-gray-500"><span>GST Included</span><span>${(total / 11).toFixed(2)}</span></div>}
        <div className="flex justify-between font-bold"><span>TOTAL PAID (AUD)</span><span>${total.toFixed(2)}</span></div>
      </div>
      <div className="text-center text-[10px] text-gray-400 border-t mt-2 pt-1 space-y-0.5">
        <p>{resolveCode(thankYou, businessName, abn, website, email)}</p>
        {customMsg && <p>{resolveCode(customMsg, businessName, abn, website, email)}</p>}
        {footer    && <p>{resolveCode(footer, businessName, abn, website, email)}</p>}
      </div>
    </div>
  );
}

function EmailPreview({ templateId, businessName, abn, website, email: contactEmail, brandColor, tagline, logo, opts }: PreviewProps) {
  const greeting = opts.customGreeting || "Hi Sarah,";
  const signOff  = opts.customSignOff  || `— The team at ${businessName}`;
  const footer   = opts.footerText;
  const customMsg= opts.customMessage;
  const total    = "$19.50";

  if (templateId === "e-minimal") {
    return (
      <div className="text-[10px] font-mono text-gray-800 space-y-1">
        <p className="font-medium">{opts.subjectLine ? resolveCode(opts.subjectLine, businessName, abn, website, contactEmail) : `Your receipt from ${businessName}`}</p>
        <Separator />
        <p>{resolveCode(greeting, businessName, abn, website, contactEmail)}</p>
        {customMsg && <p className="text-gray-600">{resolveCode(customMsg, businessName, abn, website, contactEmail)}</p>}
        <p>Thanks for your purchase on 18/05/2026. Total: {total}</p>
        {opts.showAbn && abn && <p className="text-gray-400">ABN: {abn}</p>}
        <p>{resolveCode(signOff, businessName, abn, website, contactEmail)}</p>
        {footer && <p className="text-gray-400">{resolveCode(footer, businessName, abn, website, contactEmail)}</p>}
      </div>
    );
  }
  if (templateId === "e-casual") {
    return (
      <div className="text-[10px] text-gray-800">
        <div className="p-2 rounded-t text-center mb-2" style={{ background: `${brandColor}22` }}>
          {opts.showLogo && (logo
            ? <img src={logo} alt="Logo" className="w-9 h-9 rounded-full object-contain mx-auto mb-1" />
            : <div className="w-7 h-7 rounded-full mx-auto mb-1 flex items-center justify-center text-white font-bold" style={{ background: brandColor }}>{businessName[0]}</div>
          )}
          <p className="font-bold">{businessName}</p>
          {tagline && <p className="text-gray-500 text-[9px] italic">{tagline}</p>}
        </div>
        <p className="text-[10px] mb-1">{resolveCode(greeting, businessName, abn, website, contactEmail)}</p>
        {customMsg && <p className="text-[10px] text-gray-600 mb-1">{resolveCode(customMsg, businessName, abn, website, contactEmail)}</p>}
        <div className="bg-gray-50 rounded p-1.5 text-[10px] space-y-0.5 mb-2">
          <div className="flex justify-between"><span>Flat White ×2</span><span>$8.00</span></div>
          <div className="flex justify-between"><span>Banana Bread ×1</span><span>$6.50</span></div>
          <div className="flex justify-between font-bold border-t pt-1" style={{ color: brandColor }}><span>Total</span><span>{total}</span></div>
        </div>
        <p className="text-[10px] text-gray-500">{resolveCode(signOff, businessName, abn, website, contactEmail)}</p>
        {footer && <p className="text-[10px] text-gray-400 mt-1">{resolveCode(footer, businessName, abn, website, contactEmail)}</p>}
        {opts.showWebsite && website && <p className="text-[10px] text-blue-500 mt-1">{website}</p>}
      </div>
    );
  }
  return (
    <div className="text-[10px] text-gray-800">
      <div className="p-2 text-white mb-2 flex items-center gap-2 rounded-t" style={{ background: brandColor }}>
        {opts.showLogo && (logo
          ? <img src={logo} alt="Logo" className="w-7 h-7 object-contain rounded" />
          : <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center font-bold text-xs">{businessName[0]}</div>
        )}
        <div><p className="font-bold text-xs">{businessName}</p>{opts.showAbn && abn && <p className="opacity-70 text-[9px]">ABN {abn}</p>}</div>
        <span className="ml-auto opacity-70">Receipt</span>
      </div>
      <p className="text-[10px] px-1 mb-1">{resolveCode(greeting, businessName, abn, website, contactEmail)}</p>
      {customMsg && <p className="text-[10px] text-gray-500 px-1 mb-1">{resolveCode(customMsg, businessName, abn, website, contactEmail)}</p>}
      <table className="w-full text-[10px] px-1">
        <thead><tr className="border-b"><th className="text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Amt</th></tr></thead>
        <tbody><tr><td className="py-0.5">Flat White</td><td className="text-right">2</td><td className="text-right">$8.00</td></tr><tr><td className="py-0.5">Banana Bread</td><td className="text-right">1</td><td className="text-right">$6.50</td></tr></tbody>
      </table>
      <div className="border-t mt-1 pt-1 px-1 space-y-0.5">
        <div className="flex justify-between font-bold"><span>Total Paid</span><span>{total}</span></div>
        {opts.showGstBreakdown && <div className="flex justify-between text-gray-400"><span>GST Included</span><span>$1.77</span></div>}
      </div>
      <div className="border-t mt-2 pt-1 px-1 space-y-0.5 text-[9px] text-gray-400">
        <p>{resolveCode(signOff, businessName, abn, website, contactEmail)}</p>
        {footer && <p>{resolveCode(footer, businessName, abn, website, contactEmail)}</p>}
        {opts.showWebsite && website && <p>{website}</p>}
      </div>
    </div>
  );
}

function SMSPreview({ templateId, businessName, website, opts }: PreviewProps) {
  const raw = opts.messageText || (
    templateId === "s-appt"
      ? `Reminder: appointment at ${businessName} on 20 May at 2:00 PM. Reply CANCEL to cancel.`
      : templateId === "s-layby"
      ? `Hi Sarah, your layby at ${businessName} has $45.00 due by 25/05/2026. Balance: $120.00. Pop in or call us!`
      : `Hi Sarah! Thanks for visiting ${businessName}. Total: $19.50 on 18/05/2026. ${website}`
  );
  return (
    <div className="flex items-end justify-end">
      <div className="bg-green-500 text-white text-[10px] rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%] leading-relaxed shadow break-words">
        {resolveCode(raw, businessName, "", website, "")}
      </div>
    </div>
  );
}

/* ─── Service Sheet Preview ─────────────────────────────────────────────── */

function ServiceSheetPreview({ templateId, businessName, abn, website, email, address, brandColor, logo, opts }: PreviewProps) {
  const callRows = Math.max(2, Math.min(8, parseInt(opts.callHistoryRows || "6", 10)));
  const compact = templateId === "ss-compact";
  const jobFontSize = opts.jobNoFontSize?.toLowerCase();
  const jobNoClass = jobFontSize === "xlarge" ? "text-base font-black" : jobFontSize === "large" ? "text-sm font-bold" : "text-[9px] font-normal";
  return (
    <div className="text-[9px] text-gray-800 font-sans space-y-2">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-gray-800 pb-2 mb-2">
        <div className="space-y-0.5">
          {opts.showLogo && (logo
            ? <img src={logo} alt="Logo" className="max-h-7 max-w-[70px] object-contain mb-0.5" />
            : <div className="w-5 h-5 rounded mb-0.5" style={{ background: brandColor }} />
          )}
          <p className="font-bold text-[11px]">{businessName}</p>
          {opts.showAbn && abn && <p className="text-gray-400">ABN {abn}</p>}
          {address && <p className="text-gray-400">{address}</p>}
          {email && <p className="text-gray-400">{email}</p>}
        </div>
        <div className="text-right space-y-0.5">
          <p className="font-bold text-[11px] uppercase tracking-wide" style={{ color: brandColor }}>
            {opts.headerText || "SERVICE JOB SHEET"}
          </p>
          <p className={cn("text-gray-800", jobNoClass)}>Job No: <strong>SVC-0001</strong></p>
          <p className="text-gray-500">Date: {new Date().toLocaleDateString("en-AU")}</p>
          <p className="text-gray-500">Status: <strong>Pending</strong></p>
        </div>
      </div>

      {/* Customer + Device grid */}
      {(opts.showCustomerDetails || opts.showDeviceDetails) && (
        <div className={`grid gap-1.5 ${opts.showCustomerDetails && opts.showDeviceDetails ? "grid-cols-2" : "grid-cols-1"}`}>
          {opts.showCustomerDetails && (
            <div className="border rounded p-1.5 space-y-0.5">
              <p className="font-bold text-[7.5px] uppercase text-gray-400 tracking-wide">Customer</p>
              <p>Name: <span className="text-gray-500">Sarah Johnson</span></p>
              <p>Phone: <span className="text-gray-500">(03) 9000 1111</span></p>
              {!compact && <p>Email: <span className="text-gray-500">sarah@email.com</span></p>}
            </div>
          )}
          {opts.showDeviceDetails && (
            <div className="border rounded p-1.5 space-y-0.5">
              <p className="font-bold text-[7.5px] uppercase text-gray-400 tracking-wide">Device</p>
              <p>Type: <span className="text-gray-500">Laptop</span></p>
              <p>Model: <span className="text-gray-500">MacBook Pro 14"</span></p>
              {!compact && <p>Serial: <span className="text-gray-500">C02XY123</span></p>}
            </div>
          )}
        </div>
      )}

      {/* Work required */}
      {opts.showWorkDescription && (
        <div className="border rounded p-1.5">
          <p className="font-bold text-[7.5px] uppercase text-gray-400 tracking-wide mb-1">Fault / Work Required</p>
          <p className="text-gray-500 italic">Screen flickering on startup. Battery draining quickly.</p>
        </div>
      )}

      {/* Photos placeholder */}
      {opts.showPhotos && !compact && (
        <div>
          <p className="font-bold text-[7.5px] uppercase text-gray-400 tracking-wide mb-1">Device Photos</p>
          <div className="flex gap-1">
            {[1,2,3].map(i => <div key={i} className="w-8 h-8 rounded border border-dashed border-gray-300 bg-gray-50" />)}
          </div>
        </div>
      )}

      {/* Call History */}
      {opts.showCallHistory && (
        <div>
          <p className="font-bold text-[7.5px] uppercase text-gray-400 tracking-wide mb-1">Call History</p>
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-0.5 w-12 font-semibold">Date</th>
                <th className="text-left py-0.5 w-12 font-semibold">Staff</th>
                <th className="text-left py-0.5 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.min(callRows, compact ? 3 : 4) }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-300">—</td>
                  <td className="py-1.5 text-gray-300">—</td>
                  <td className="py-1.5 text-gray-300">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Signature area */}
      {opts.showSignature && (
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="border-t border-gray-400 pt-1">
            <p className="text-[7.5px] text-gray-400">Customer Signature</p>
          </div>
          <div className="border-t border-gray-400 pt-1">
            <p className="text-[7.5px] text-gray-400">Technician / Staff</p>
          </div>
        </div>
      )}

      {/* Footer / warranty */}
      {(opts.warrantyText || opts.footerText) && (
        <div className="border-t pt-1 space-y-0.5 text-[8px] text-gray-400">
          {opts.warrantyText && <p>{opts.warrantyText}</p>}
          {opts.footerText && <p>{resolveCode(opts.footerText, businessName, abn, website, email)}</p>}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ManagementTemplatesPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("receipts");
  const [activeTemplates, setActiveTemplates] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(ACTIVE_STORAGE_KEY) || "{}"); } catch { return {}; }
  });
  const [previewId, setPreviewId] = useState<string>("r-pro");

  // Focused field tracking for QuickCodesBar insert
  const [focusedFieldLabel, setFocusedFieldLabel] = useState<string | null>(null);
  const insertFnRef = useRef<((code: string) => void) | null>(null);

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();

  const { opts, update, reset } = useTplOpts(previewId);

  useEffect(() => {
    const defaults: Record<Category, string> = {
      receipts: "r-pro", invoices: "i-pro", emails: "e-pro", sms: "s-receipt", service: "ss-standard",
    };
    setPreviewId(activeTemplates[activeCategory] ?? defaults[activeCategory]);
  }, [activeCategory, activeTemplates]);

  const businessName = merchant?.businessName || "Your Business";
  const brandColor   = profile.brandColors?.[0] || "#efbf04";

  const previewProps: PreviewProps = {
    templateId: previewId, businessName,
    abn:      profile.abn      || "12 345 678 901",
    tagline:  profile.tagline  || "",
    website:  profile.website  || "www.yourbusiness.com.au",
    email:    profile.contactEmail || merchant?.email || "",
    address:  [
      (merchant as { address?: string } | undefined)?.address,
      (merchant as { city?: string } | undefined)?.city,
      profile.state, profile.postcode,
    ].filter(Boolean).join(", "),
    brandColor,
    logo: profile.logo || "",
    opts,
  };

  const quickCodeGroups = buildQuickCodeGroups(
    businessName, profile.abn || "", profile.contactEmail || merchant?.email || "",
    profile.website || "", profile.tagline || "",
    [profile.state, profile.postcode].filter(Boolean).join(" "),
  );

  const setActive = (categoryId: Category, templateId: string) => {
    const next = { ...activeTemplates, [categoryId]: templateId };
    setActiveTemplates(next);
    localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(next));
  };

  const currentTemplates = TEMPLATES[activeCategory];
  const StyleIcon = STYLE_ICONS[currentTemplates.find(t => t.id === previewId)?.style ?? "professional"];

  const renderPreview = () => {
    switch (activeCategory) {
      case "receipts": return <ReceiptPreview    {...previewProps} />;
      case "invoices":
        return previewId.startsWith("a4-")
          ? <A4ReceiptPreview {...previewProps} />
          : <InvoicePreview  {...previewProps} />;
      case "emails":  return <EmailPreview       {...previewProps} />;
      case "sms":     return <SMSPreview          {...previewProps} />;
      case "service": return <ServiceSheetPreview {...previewProps} />;
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Templates</h1>
              <p className="text-sm text-muted-foreground">Design and customise your receipts, invoices, emails and messages. All templates use your Business Details automatically.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5 shrink-0">
            <Building2 className="w-3.5 h-3.5" />
            <span>Showing: <strong className="text-foreground">{businessName}</strong></span>
          </div>
        </div>

        {/* 3-column layout */}
        <div className="flex gap-4 items-start min-w-0">

          {/* Col 1: category + template selector */}
          <div className="w-56 shrink-0 space-y-3">
            <div className="rounded-xl border bg-card overflow-hidden">
              {(Object.keys(CATEGORY_META) as Category[]).map((cat) => {
                const { label, icon: Icon, color } = CATEGORY_META[cat];
                const active = cat === activeCategory;
                const activeTpl = activeTemplates[cat];
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors border-b last:border-b-0",
                      active ? "bg-primary/5 text-primary font-semibold" : "hover:bg-muted/50 text-foreground"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : color)} />
                    <span className="flex-1 text-left">{label}</span>
                    {activeTpl && <Check className="w-3 h-3 text-green-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground px-0.5 uppercase tracking-wider">{CATEGORY_META[activeCategory].label} Templates</p>
              {currentTemplates.map((tpl) => {
                const selected  = activeTemplates[activeCategory] === tpl.id;
                const previewing = previewId === tpl.id;
                const SIcon     = STYLE_ICONS[tpl.style];
                return (
                  <div key={tpl.id} onClick={() => setPreviewId(tpl.id)}
                    className={cn("rounded-xl border p-2.5 cursor-pointer transition-all space-y-1.5",
                      previewing ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-muted-foreground/30 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs">{tpl.name}</span>
                      {selected && <Badge variant="default" className="text-[9px] h-3.5 px-1 gap-0.5"><Check className="w-2 h-2" /> Active</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">{tpl.description}</p>
                    <span className={cn("inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-medium", STYLE_COLORS[tpl.style])}>
                      <SIcon className="w-2 h-2" />{tpl.style}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Col 2: live preview */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StyleIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm truncate">{currentTemplates.find(t => t.id === previewId)?.name} Preview</span>
                <Badge variant="outline" className="text-xs shrink-0">{CATEGORY_META[activeCategory].label}</Badge>
              </div>
              <Button size="sm" onClick={() => setActive(activeCategory, previewId)}
                disabled={activeTemplates[activeCategory] === previewId} className="gap-1.5 shrink-0"
              >
                {activeTemplates[activeCategory] === previewId
                  ? <><Check className="w-3.5 h-3.5" /> Active</>
                  : "Set Active"}
              </Button>
            </div>

            <div className="rounded-xl border bg-gray-50 p-6 flex items-start justify-center min-h-[460px]">
              {activeCategory === "receipts" && (
                <div className="bg-white shadow-lg rounded border border-gray-200 p-4 w-56">{renderPreview()}</div>
              )}
              {activeCategory === "invoices" && (
                <div className="bg-white shadow-lg rounded border border-gray-200 p-4 w-80">{renderPreview()}</div>
              )}
              {activeCategory === "emails" && (
                <div className="bg-white shadow rounded-xl border border-gray-200 overflow-hidden w-80">
                  <div className="bg-gray-100 px-3 py-1.5 flex items-center gap-1.5 border-b">
                    <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="ml-2 text-[10px] text-gray-400">Email Preview</span>
                  </div>
                  <div className="p-3">{renderPreview()}</div>
                </div>
              )}
              {activeCategory === "sms" && (
                <div className="bg-gray-900 rounded-3xl p-4 w-56 shadow-xl">
                  <div className="bg-gray-800 h-2 w-12 rounded mx-auto mb-4" />
                  <div className="bg-white rounded-2xl p-3 min-h-40">
                    <p className="text-[9px] text-gray-400 text-center mb-3">{businessName}</p>
                    {renderPreview()}
                  </div>
                  <div className="bg-gray-800 h-1 w-16 rounded mx-auto mt-4" />
                </div>
              )}
              {activeCategory === "service" && (
                <div className="bg-white shadow-lg rounded border border-gray-200 p-5 w-full max-w-xl">
                  {renderPreview()}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>Live preview — changes in the Options panel update instantly. Business info comes from <strong>Management → Business Details</strong>.</span>
            </div>
          </div>

          {/* Col 3: options editor */}
          <div className="w-72 shrink-0">
            <OptionsPanel
              key={previewId}
              category={activeCategory}
              templateId={previewId}
              opts={opts}
              update={update}
              reset={reset}
              onFieldFocus={(label) => setFocusedFieldLabel(label)}
              onFieldInsert={(_key, fn) => { insertFnRef.current = fn; }}
            />
          </div>
        </div>

        {/* Full-width Quick Codes bar */}
        <QuickCodesBar
          groups={quickCodeGroups}
          focusedField={focusedFieldLabel}
          onInsert={(_fieldKey, code) => { insertFnRef.current?.(code); }}
        />
      </div>
    </AppLayout>
  );
}
