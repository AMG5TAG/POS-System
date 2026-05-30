import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetMerchant,
  useGetTaxSettings,
  useUpdateTaxSettings,
  useListSalesTemplates,
  useUpsertSalesTemplate,
  useGetRegionalExtSettings,
  useUpdateRegionalExtSettings,
  type SalesTemplate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Barcode from "react-barcode";
import {
  Receipt, FileText, Mail, MessageSquare, Tag, Printer, Info,
  Check, Star, Sparkles, Minimize2, Zap, Building2,
  Copy, User, ShoppingCart, Percent, Eye, EyeOff,
  Settings2, ClipboardList, FileSearch, Save, ShieldCheck,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Category = "Thermal_Receipt" | "Invoice" | "A4_Receipt" | "Quote" | "Service_Ticket";

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
  showLogins:           boolean;
  showFormsFiles:       boolean;
  // Font
  fontFamily:           string;
}

export const DEFAULT_OPTS: TplOpts = {
  headerText: "", footerText: "", thankYouMsg: "",
  customGreeting: "", customSignOff: "",
  paymentTerms: "", invoiceNotes: "",
  customMessage: "", subjectLine: "",
  messageText: "",
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
  showLogins: false, showFormsFiles: false,
  fontFamily: "inter",
};

function useTplOpts(category: Category, templates: SalesTemplate[]) {
  const [opts, setOpts] = useState<TplOpts>({ ...DEFAULT_OPTS });
  const [isDefault, setIsDefault] = useState(true);
  const upsert = useUpsertSalesTemplate();

  useEffect(() => {
    const row = templates.find((t) => t.templateType === category);
    if (row) {
      const saved = (row.options ?? {}) as Partial<TplOpts>;
      setOpts({
        ...DEFAULT_OPTS,
        ...saved,
        headerText: row.headerHtml ?? "",
        footerText: row.footerHtml ?? "",
        showLogo: row.showLogo ?? true,
        fontFamily: row.fontFamily ?? "inter",
      });
      setIsDefault(row.isDefault ?? true);
    } else {
      setOpts({ ...DEFAULT_OPTS });
      setIsDefault(true);
    }
  }, [category, templates]);

  const update = useCallback(<K extends keyof TplOpts>(k: K, v: TplOpts[K]) => {
    setOpts((prev) => ({ ...prev, [k]: v }));
  }, []);

  const reset = useCallback(() => {
    setOpts({ ...DEFAULT_OPTS });
    setIsDefault(true);
  }, []);

  const save = useCallback(
    (selectedStyle: string) => {
      const { headerText, footerText, showLogo, fontFamily, ...rest } = opts;
      upsert.mutate(
        {
          templateType: category as "Invoice" | "Thermal_Receipt" | "A4_Receipt" | "Quote" | "Service_Ticket",
          data: {
            headerHtml: headerText,
            footerHtml: footerText,
            showLogo,
            fontFamily,
            isDefault,
            selectedStyle,
            options: rest as Record<string, unknown>,
          },
        },
        {
          onSuccess: () => toast.success("Template saved"),
          onError: () => toast.error("Failed to save template"),
        },
      );
    },
    [category, opts, isDefault, upsert],
  );

  return { opts, update, reset, isDefault, setIsDefault, save, saving: upsert.isPending };
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
    case "Thermal_Receipt": return [
      { section: "Header", key: "showLogo",          label: "Show Business Logo",  type: "toggle" },
      { section: "Header", key: "showTagline",        label: "Show Tagline",        type: "toggle" },
      { section: "Header", key: "showAbn",            label: "Show ABN",            type: "toggle" },
      { section: "Header", key: "headerText",         label: "Custom Header Text",  type: "text",     placeholder: "e.g. Welcome to {{business.name}}", quickCodes: true },
      { section: "Body",   key: "fontFamily",         label: "Font Family",         type: "select",   options: FONT_OPTIONS.map(f => ({ value: f.value, label: f.label })) },
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
    case "A4_Receipt":
    case "Invoice": return [
      { section: "Header",   key: "showLogo",                label: "Show Business Logo",        type: "toggle" },
      { section: "Header",   key: "showAbn",                 label: "Show ABN",                  type: "toggle" },
      { section: "Header",   key: "showTagline",             label: "Show Tagline",              type: "toggle" },
      { section: "Header",   key: "headerText",              label: "Custom Header HTML",        type: "textarea", placeholder: "e.g. TAX INVOICE / RECEIPT", quickCodes: true },
      { section: "Customer", key: "showAllCustomerDetails",  label: "Show All Customer Details", type: "toggle", hint: "Name, email, phone, address on the invoice" },
      { section: "Customer", key: "showCustomerQr",          label: "Show Customer QR Code",     type: "toggle", hint: "QR code linked to customer loyalty profile" },
      { section: "Customer", key: "loyaltyQrText",           label: "QR Scan Label",             type: "text",   placeholder: "Scan to view customer loyalty profile" },
      { section: "Body",     key: "fontFamily",              label: "Font Family",               type: "select",   options: FONT_OPTIONS.map(f => ({ value: f.value, label: f.label })) },
      { section: "Body",     key: "showGstBreakdown",        label: "Show GST Breakdown",        type: "toggle" },
      { section: "Body",     key: "showLoyaltyEarned",       label: "Show Loyalty Earned",       type: "toggle" },
      { section: "Body",     key: "showBarcode",             label: "Show Sale Barcode",         type: "toggle", hint: "Scannable barcode to retrieve this sale" },
      { section: "Payment",  key: "showPaymentMethods",      label: "Show Accepted Methods",     type: "toggle", hint: "Shows methods enabled in POS Registers" },
      { section: "Payment",  key: "paymentSectionHeading",   label: "Payment Heading",           type: "text",     placeholder: "PAYMENT DETAILS" },
      { section: "Payment",  key: "bankDetails",             label: "Bank Transfer Details",     type: "textarea", placeholder: "Bank: ANZ\nBSB: 012-345\nAccount: 123456789\nRef: Invoice #" },
      { section: "Terms",    key: "paymentTerms",            label: "Payment Terms",             type: "text",     placeholder: "Payment due within 30 days.", quickCodes: true },
      { section: "Terms",    key: "invoiceNotes",            label: "Invoice Notes",             type: "textarea", placeholder: "e.g. Thank you for your business. Late fees apply.", quickCodes: true },
      { section: "Footer",   key: "thankYouMsg",             label: "Thank You Message",         type: "text",     placeholder: "Thank you for your purchase!", quickCodes: true },
      { section: "Footer",   key: "customMessage",           label: "Custom Footer HTML",        type: "textarea", placeholder: "e.g. Return policy, loyalty info, special offers…", quickCodes: true },
      { section: "Footer",   key: "showSocialLinks",         label: "Show Business Socials",     type: "toggle", hint: "Pulls social links from Business Info" },
      { section: "Footer",   key: "footerText",              label: "Footer Text",               type: "text",     placeholder: "Thank you for your business!", quickCodes: true },
      { section: "Footer",   key: "showWebsite",             label: "Show Website",              type: "toggle" },
    ];
    case "Quote": return [
      { section: "Header",   key: "showLogo",                label: "Show Business Logo",        type: "toggle" },
      { section: "Header",   key: "showAbn",                 label: "Show ABN",                  type: "toggle" },
      { section: "Header",   key: "showTagline",             label: "Show Tagline",              type: "toggle" },
      { section: "Header",   key: "headerText",              label: "Custom Header HTML",        type: "textarea", placeholder: "e.g. QUOTE / ESTIMATE", quickCodes: true },
      { section: "Customer", key: "showAllCustomerDetails",  label: "Show All Customer Details", type: "toggle", hint: "Name, email, phone, address on the quote" },
      { section: "Body",     key: "fontFamily",              label: "Font Family",               type: "select",   options: FONT_OPTIONS.map(f => ({ value: f.value, label: f.label })) },
      { section: "Body",     key: "showGstBreakdown",        label: "Show GST Breakdown",        type: "toggle" },
      { section: "Terms",    key: "paymentTerms",            label: "Quote Validity",            type: "text",     placeholder: "This quote is valid for 30 days.", quickCodes: true },
      { section: "Terms",    key: "invoiceNotes",            label: "Quote Notes",               type: "textarea", placeholder: "e.g. Prices subject to change after validity period.", quickCodes: true },
      { section: "Footer",   key: "customMessage",           label: "Custom Footer HTML",        type: "textarea", placeholder: "e.g. Thank you for your enquiry…", quickCodes: true },
      { section: "Footer",   key: "footerText",              label: "Footer Text",               type: "text",     placeholder: "Thank you for your enquiry!", quickCodes: true },
      { section: "Footer",   key: "showWebsite",             label: "Show Website",              type: "toggle" },
    ];
    case "Service_Ticket": return [
      { section: "Header",   key: "showLogo",             label: "Show Business Logo",       type: "toggle" },
      { section: "Header",   key: "showAbn",              label: "Show ABN",                 type: "toggle" },
      { section: "Header",   key: "headerText",           label: "Custom Header HTML",       type: "textarea", placeholder: "SERVICE JOB SHEET" },
      { section: "Body",     key: "fontFamily",           label: "Font Family",              type: "select",   options: FONT_OPTIONS.map(f => ({ value: f.value, label: f.label })) },
      { section: "Job No",   key: "jobNoFontSize",        label: "Job No Font Size",         type: "select",   options: [{ value: "normal", label: "Normal" }, { value: "large", label: "Large" }, { value: "xlarge", label: "X-Large" }] },
      { section: "Sections", key: "showCustomerDetails",  label: "Show Customer Details",    type: "toggle" },
      { section: "Sections", key: "showDeviceDetails",    label: "Show Device Details",      type: "toggle" },
      { section: "Sections", key: "showWorkDescription",  label: "Show Fault / Work Req.",   type: "toggle" },
      { section: "Sections", key: "showPhotos",           label: "Show Device Photos",       type: "toggle" },
      { section: "Sections", key: "showSignature",        label: "Show Signature Area",      type: "toggle" },
      { section: "Sections", key: "showCallHistory",      label: "Show Call History",        type: "toggle" },
      { section: "Sections", key: "callHistoryRows",      label: "Call History Rows",        type: "text",     placeholder: "6", hint: "Number of blank rows for manual notes" },
      { section: "Sections", key: "showLogins",           label: "Show Logins / Accounts",   type: "toggle", hint: "Print customer logins and linked accounts" },
      { section: "Sections", key: "showFormsFiles",       label: "Show Forms and Files",     type: "toggle", hint: "Print attached documents and consent forms" },
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

function NotificationsPanel() {
  const { data: settings } = useGetTaxSettings();
  const update = useUpdateTaxSettings();
  const [email, setEmail] = useState("false");
  const [sms, setSms] = useState("false");

  useEffect(() => {
    if (settings) {
      setEmail(settings.emailReceiptsEnabled ?? "false");
      setSms(settings.smsReceiptsEnabled ?? "false");
    }
  }, [settings]);

  const bool = (v: string) => v === "true";
  const toggleStr = (v: string) => v === "true" ? "false" : "true";

  function saveEmail(next: string) {
    setEmail(next);
    update.mutate({ data: { emailReceiptsEnabled: next } }, {
      onSuccess: () => toast.success("Email receipt setting saved"),
      onError: () => toast.error("Failed to save"),
    });
  }

  function saveSms(next: string) {
    setSms(next);
    update.mutate({ data: { smsReceiptsEnabled: next } }, {
      onSuccess: () => toast.success("SMS receipt setting saved"),
      onError: () => toast.error("Failed to save"),
    });
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4" /> Email & SMS Receipts
        </CardTitle>
        <CardDescription>Send receipts automatically to customers after a sale</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">Email Receipts</p>
              <p className="text-xs text-muted-foreground">Send receipts to customers via email</p>
            </div>
          </div>
          <Switch checked={bool(email)}
            onCheckedChange={() => saveEmail(toggleStr(email))} />
        </div>
        {bool(email) && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Email delivery requires an email integration. Connect Mailchimp or another email provider in
              <strong> Management → Integrations</strong> to enable automatic email receipts.
            </span>
          </div>
        )}
        <Separator />
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">SMS Receipts</p>
              <p className="text-xs text-muted-foreground">Send receipts to customers via SMS</p>
            </div>
          </div>
          <Switch checked={bool(sms)}
            onCheckedChange={() => saveSms(toggleStr(sms))} />
        </div>
        {bool(sms) && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              SMS delivery requires a Twilio or similar integration. Configure it in
              <strong> Management → Integrations</strong>.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const FONT_OPTIONS: { value: string; label: string; css: string }[] = [
  { value: "inter",    label: "Inter",       css: "Inter, system-ui, sans-serif"         },
  { value: "roboto",   label: "Roboto",      css: "Roboto, 'Helvetica Neue', sans-serif" },
  { value: "lato",     label: "Lato",        css: "Lato, 'Helvetica Neue', sans-serif"   },
  { value: "georgia",  label: "Georgia",     css: "Georgia, 'Times New Roman', serif"    },
  { value: "courier",  label: "Courier",     css: "'Courier New', Courier, monospace"    },
];

function OptionsPanel({
  category,
  templateId,
  opts,
  update,
  reset,
  isDefault,
  setIsDefault,
  onSave,
  saving,
  onFieldFocus,
  onFieldInsert,
}: {
  category: Category;
  templateId: string;
  opts: TplOpts;
  update: <K extends keyof TplOpts>(k: K, v: TplOpts[K]) => void;
  reset: () => void;
  isDefault: boolean;
  setIsDefault: (v: boolean) => void;
  onSave: () => void;
  saving: boolean;
  onFieldFocus: (key: string | null) => void;
  onFieldInsert: (key: string, insert: (code: string) => void) => void;
}) {
  const fields = getOptionsConfig(category);
  const sections = [...new Set(fields.map((f) => f.section ?? "General"))];

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
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Options</span>
        </div>
        <button onClick={reset} className="text-[11px] text-muted-foreground hover:text-destructive transition-colors">Reset</button>
      </div>

      {/* System default toggle */}
      <div className="px-3 py-2 border-b bg-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          <div>
            <p className="text-[11px] font-medium leading-tight">Set as System Default</p>
            <p className="text-[9px] text-muted-foreground">Used by all print and export actions</p>
          </div>
        </div>
        <Switch checked={isDefault} onCheckedChange={setIsDefault} />
      </div>

      {/* Option fields — single column */}
      <div className="p-3 grid grid-cols-1 gap-3">
        {sections.map((section) => {
          const sectionFields = fields.filter((f) => (f.section ?? "General") === section);
          const toggles = sectionFields.filter((f) => f.type === "toggle");
          const texts   = sectionFields.filter((f) => f.type !== "toggle");

          return (
            <div key={section} className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{section}</p>

              {toggles.length > 0 && (
                <div className="space-y-1">
                  {toggles.map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Label className="text-[11px] cursor-pointer leading-tight">{f.label}</Label>
                        {f.hint && <p className="text-[9px] text-muted-foreground leading-none">{f.hint}</p>}
                      </div>
                      <Switch
                        checked={!!opts[f.key]}
                        onCheckedChange={(v) => update(f.key, v as TplOpts[typeof f.key])}
                      />
                    </div>
                  ))}
                </div>
              )}

              {texts.map((f) => {
                const val = (opts[f.key] as string) ?? "";
                return (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-[11px]">{f.label}</Label>
                    {f.type === "select" && f.options ? (
                      <select
                        value={val || f.options[0]?.value}
                        onChange={(e) => update(f.key, e.target.value as TplOpts[typeof f.key])}
                        className="text-[11px] h-7 w-full rounded-md border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
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
                        className="text-[11px] min-h-[48px] resize-y font-mono"
                        rows={2}
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
                        className="text-[11px] h-7 font-mono"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="px-3 py-2 border-t bg-muted/10">
        <Button size="sm" className="w-full gap-2 h-8" onClick={onSave} disabled={saving}>
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving…" : "Save Template"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Template catalogue ─────────────────────────────────────────────────── */

const TEMPLATES: Record<Category, TemplateOption[]> = {
  Thermal_Receipt: [
    { id: "r-pro",     name: "Professional", style: "professional", description: "Clean logo header, bold totals, structured layout"  },
    { id: "r-casual",  name: "Casual",       style: "casual",       description: "Friendly tone, rounded feel, softer typography"     },
    { id: "r-minimal", name: "Minimal",      style: "minimal",      description: "Text-only, ultra-compact, fast printing"            },
  ],
  Invoice: [
    { id: "i-pro",     name: "Professional", style: "professional", description: "Logo, payment terms, itemised table"                 },
    { id: "i-modern",  name: "Modern",       style: "bold",         description: "Bold colour header, two-column layout"               },
    { id: "i-minimal", name: "Minimal",      style: "minimal",      description: "No frills, plain A4 business invoice"               },
  ],
  A4_Receipt: [
    { id: "ar-pro",     name: "Professional", style: "professional", description: "Logo, itemised table, full receipt layout"           },
    { id: "ar-modern",  name: "Modern",       style: "bold",         description: "Bold colour header, two-column receipt"              },
    { id: "ar-minimal", name: "Minimal",      style: "minimal",      description: "No frills, plain A4 sales receipt"                  },
  ],
  Quote: [
    { id: "q-pro",     name: "Professional", style: "professional", description: "Logo, validity period, itemised quote table"         },
    { id: "q-modern",  name: "Modern",       style: "bold",         description: "Bold accent header, two-column quote layout"         },
    { id: "q-minimal", name: "Minimal",      style: "minimal",      description: "Plain A4, minimal branding, fast to produce"        },
  ],
  Service_Ticket: [
    { id: "ss-standard", name: "Standard", style: "professional", description: "Full A4 sheet — all sections, grid layout, call history" },
    { id: "ss-compact",  name: "Compact",  style: "minimal",      description: "Condensed layout, fewer rows, fits more on one page"     },
  ],
};

const CATEGORY_META: Record<Category, { label: string; icon: React.ElementType; color: string }> = {
  Thermal_Receipt: { label: "Thermal Receipt", icon: Receipt,       color: "text-blue-500"    },
  A4_Receipt:      { label: "A4 Receipt",       icon: FileText,      color: "text-emerald-500" },
  Invoice:         { label: "Invoice",          icon: FileText,      color: "text-violet-500"  },
  Quote:           { label: "Quote",            icon: FileSearch,    color: "text-amber-500"   },
  Service_Ticket:  { label: "Service Ticket",   icon: ClipboardList, color: "text-cyan-500"    },
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

function ReceiptPreview({ templateId, businessName, abn, website, email, brandColor, tagline, logo, opts }: PreviewProps) {
  const items = [{ name: "Flat White", qty: 2, price: 8.00 }, { name: "Banana Bread", qty: 1, price: 6.50 }, { name: "Orange Juice", qty: 1, price: 5.00 }];
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const gst = subtotal / 11;
  const date = "18/05/2026 10:42 AM";
  const footerMsg = opts.thankYouMsg;
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
        {opts.showTagline && tagline && <p className="text-center text-[9px]">{tagline}</p>}
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
          {opts.showTagline && tagline && <p className="text-gray-400 text-[10px] italic">{tagline}</p>}
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
        {opts.showTagline && tagline && <p className="text-[9px] text-gray-500 italic">{tagline}</p>}
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

function InvoicePreview({ templateId, businessName, abn, website, email, address, brandColor, tagline, logo, opts }: PreviewProps) {
  const items = [{ name: "Product Design Services", qty: 3, price: 150 }, { name: "Logo Package", qty: 1, price: 450 }];
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;
  const terms = opts.paymentTerms;
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
        </div>
      ) : (
        <p className="font-medium text-[10px]">Bill To: Demo Client Pty Ltd</p>
      )}
    </div>
  );

  const CustomerQrBlock = () => opts.showCustomerQr ? (
    <div className="text-center shrink-0">
      <p className="text-[8px] text-gray-400 uppercase tracking-wide mb-1">Customer Profile</p>
      <QRCodeVisual label="CUS-0042" size={42} />
    </div>
  ) : null;

  const LoyaltyRow = () => opts.showLoyaltyEarned ? (
    <div className="flex justify-between text-[9px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 mt-1">
      <span>★ Loyalty Earned</span><span>+96 pts</span>
    </div>
  ) : null;

  const BarcodeBlock = () => opts.showBarcode ? (
    <div className="border-t pt-1.5 mt-1.5 text-center">
      <Barcode value="INV-1042" format="CODE128" width={1.5} height={26} fontSize={8} displayValue />
    </div>
  ) : null;

  const PaymentBlock = () => (opts.showPaymentMethods || opts.bankDetails) ? (
    <div className="border rounded p-1.5 mt-1.5 text-[9px] space-y-0.5">
      <p className="font-semibold text-[8px] uppercase text-gray-400 tracking-wide">{opts.paymentSectionHeading || ""}</p>
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
        <p key={i} className="text-gray-400">{resolveCode(line, businessName, abn, website, email)}</p>
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
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0"><CustomerBlock /></div>
          <CustomerQrBlock />
        </div>
        <Separator />
        {items.map((i) => <div key={i.name} className="flex justify-between"><span className="flex-1">{i.name}</span><span className="w-8 text-right">{i.qty}</span><span className="w-16 text-right">${(i.qty * i.price).toFixed(2)}</span></div>)}
        <Separator />
        <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        {opts.showGstBreakdown && <div className="flex justify-between"><span>GST 10%</span><span>${gst.toFixed(2)}</span></div>}
        <div className="flex justify-between font-bold"><span>TOTAL DUE</span><span>${total.toFixed(2)}</span></div>
        <LoyaltyRow />
        <PaymentBlock />
        {terms && <p className="text-gray-400 pt-1">{resolveCode(terms, businessName, abn, website, email)}</p>}
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
        {opts.showTagline && tagline && <p className="text-[9px] text-gray-400 italic mb-1.5">{tagline}</p>}
        <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
          <div>
            <p className="text-gray-400">From</p>
            <p className="font-medium">{businessName}</p>
            {opts.showAbn && abn && <p className="text-gray-500">ABN {abn}</p>}
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
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
            <CustomerQrBlock />
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
        {terms && <p className="text-gray-400 mt-1 text-[9px]">{resolveCode(terms, businessName, abn, website, email)}</p>}
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
          {opts.showTagline && tagline && <p className="text-[9px] text-gray-400 italic">{tagline}</p>}
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
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex-1 min-w-0"><CustomerBlock /></div>
        <CustomerQrBlock />
      </div>
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
        {terms && <p>{resolveCode(terms, businessName, abn, website, email)}</p>}
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

function EmailPreview({ templateId, businessName, abn, website, email: contactEmail, brandColor, tagline, logo, opts }: PreviewProps) {
  const greeting = opts.customGreeting;
  const signOff  = opts.customSignOff;
  const footer   = opts.footerText;
  const customMsg= opts.customMessage;
  const total    = "$19.50";

  if (templateId === "e-minimal") {
    return (
      <div className="text-[10px] font-mono text-gray-800 space-y-1">
        {opts.subjectLine && <p className="font-medium">{resolveCode(opts.subjectLine, businessName, abn, website, contactEmail)}</p>}
        <Separator />
        {greeting && <p>{resolveCode(greeting, businessName, abn, website, contactEmail)}</p>}
        {customMsg && <p className="text-gray-600">{resolveCode(customMsg, businessName, abn, website, contactEmail)}</p>}
        <p>Thanks for your purchase on 18/05/2026. Total: {total}</p>
        {opts.showAbn && abn && <p className="text-gray-400">ABN: {abn}</p>}
        {signOff && <p>{resolveCode(signOff, businessName, abn, website, contactEmail)}</p>}
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
        {greeting && <p className="text-[10px] mb-1">{resolveCode(greeting, businessName, abn, website, contactEmail)}</p>}
        {customMsg && <p className="text-[10px] text-gray-600 mb-1">{resolveCode(customMsg, businessName, abn, website, contactEmail)}</p>}
        <div className="bg-gray-50 rounded p-1.5 text-[10px] space-y-0.5 mb-2">
          <div className="flex justify-between"><span>Flat White ×2</span><span>$8.00</span></div>
          <div className="flex justify-between"><span>Banana Bread ×1</span><span>$6.50</span></div>
          <div className="flex justify-between font-bold border-t pt-1" style={{ color: brandColor }}><span>Total</span><span>{total}</span></div>
        </div>
        {signOff && <p className="text-[10px] text-gray-500">{resolveCode(signOff, businessName, abn, website, contactEmail)}</p>}
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
      {greeting && <p className="text-[10px] px-1 mb-1">{resolveCode(greeting, businessName, abn, website, contactEmail)}</p>}
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
        {signOff && <p>{resolveCode(signOff, businessName, abn, website, contactEmail)}</p>}
        {footer && <p>{resolveCode(footer, businessName, abn, website, contactEmail)}</p>}
        {opts.showWebsite && website && <p>{website}</p>}
      </div>
    </div>
  );
}

function SMSPreview({ templateId, businessName, website, opts }: PreviewProps) {
  const raw = opts.messageText;
  return raw ? (
    <div className="flex items-end justify-end">
      <div className="bg-green-500 text-white text-[10px] rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%] leading-relaxed shadow break-words">
        {resolveCode(raw, businessName, "", website, "")}
      </div>
    </div>
  ) : null;
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

      {/* Logins / Accounts */}
      {opts.showLogins && (
        <div>
          <p className="font-bold text-[7.5px] uppercase text-gray-400 tracking-wide mb-1">Logins / Accounts</p>
          <div className="border rounded p-1.5 space-y-0.5 text-[8px] text-gray-500">
            <div className="flex justify-between"><span className="text-gray-400">iCloud:</span><span className="font-mono">sarah@icloud.com</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Google:</span><span className="font-mono">sarah.j@email.com</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Microsoft:</span><span className="font-mono">sarah@workplace.com</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Screen PIN:</span><span className="font-mono">0458</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Password Manager:</span><span className="font-mono">1Password (vault key: 3x7)</span></div>
          </div>
        </div>
      )}

      {/* Forms and Files */}
      {opts.showFormsFiles && (
        <div>
          <p className="font-bold text-[7.5px] uppercase text-gray-400 tracking-wide mb-1">Forms and Files</p>
          <div className="border rounded p-1.5 space-y-0.5 text-[8px] text-gray-500">
            <div className="flex justify-between"><span>Device Damage Waiver</span><span className="text-gray-400">signed 18/05/2026</span></div>
            <div className="flex justify-between"><span>Data Recovery Consent</span><span className="text-gray-400">signed 18/05/2026</span></div>
            <div className="flex justify-between"><span>Backup Confirmation</span><span className="text-gray-400">signed 18/05/2026</span></div>
            <div className="flex justify-between"><span>Pre-Service Photos</span><span className="text-gray-400">3 photos attached</span></div>
          </div>
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

/* ─── Receipt & Print Settings ───────────────────────────────────────────── */

type PaperSize = "58mm" | "80mm" | "a4";

function ReceiptPrintSettings() {
  const queryClient = useQueryClient();
  const { data: regExtData } = useGetRegionalExtSettings({ query: { queryKey: ["regional-ext-settings"] } });
  const updateRegExt = useUpdateRegionalExtSettings();
  const [selected, setSelected] = useState<PaperSize>("80mm");

  useEffect(() => {
    if (regExtData?.receiptPaperSize) setSelected(regExtData.receiptPaperSize as PaperSize);
  }, [regExtData]);

  const sizes: { value: PaperSize; label: string; desc: string; w: number; h: number }[] = [
    { value: "58mm", label: "58 mm",  desc: "Small handheld printers",             w: 24, h: 36 },
    { value: "80mm", label: "80 mm",  desc: "Most counter-top thermal printers",   w: 30, h: 36 },
    { value: "a4",   label: "A4",     desc: "Full invoices & detailed receipts",   w: 40, h: 56 },
  ];

  const handleSave = () => {
    updateRegExt.mutate({ data: { receiptPaperSize: selected } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["regional-ext-settings"] });
        toast.success("Print settings saved");
      },
      onError: () => toast.error("Failed to save print settings"),
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-primary" />
          Receipt &amp; Print Settings
        </CardTitle>
        <CardDescription>
          Choose the default paper size for receipts and printed documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 flex-1">
        <div className="grid grid-cols-3 gap-3 text-center">
          {sizes.map(p => (
            <div
              key={p.value}
              onClick={() => setSelected(p.value)}
              className={`rounded-lg border-2 p-3 cursor-pointer transition-colors ${
                p.value === selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div
                className="mx-auto mb-2 rounded border-2 border-current bg-white"
                style={{ width: p.w, height: p.h }}
              />
              <p className="text-xs font-semibold">{p.label}</p>
              <p className="text-[11px] text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave}>Save Print Settings</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

const DEFAULT_STYLE: Record<Category, string> = {
  Thermal_Receipt: "r-pro",
  A4_Receipt:      "ar-pro",
  Invoice:         "i-pro",
  Quote:           "q-pro",
  Service_Ticket:  "ss-standard",
};

export default function ManagementTemplatesPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("Thermal_Receipt");
  const [previewId, setPreviewId]           = useState<string>("r-pro");

  const [focusedFieldLabel, setFocusedFieldLabel] = useState<string | null>(null);
  const insertFnRef = useRef<((code: string) => void) | null>(null);

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();

  const { data: tplData, isLoading: tplLoading } = useListSalesTemplates({
    query: { queryKey: ["sales-templates"] },
  });
  const templates = useMemo<SalesTemplate[]>(() => tplData?.items ?? [], [tplData]);

  const { opts, update, reset, isDefault, setIsDefault, save, saving } = useTplOpts(
    activeCategory,
    templates,
  );

  // Sync previewId from DB selectedStyle when switching category
  useEffect(() => {
    const row = templates.find((t) => t.templateType === activeCategory);
    const style = row?.selectedStyle || DEFAULT_STYLE[activeCategory];
    setPreviewId(style);
  }, [activeCategory, templates]);

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

  const currentTemplates = TEMPLATES[activeCategory];
  const StyleIcon = STYLE_ICONS[currentTemplates.find(t => t.id === previewId)?.style ?? "professional"];
  const dbRow = templates.find((t) => t.templateType === activeCategory);
  const activeStyle = dbRow?.selectedStyle ?? DEFAULT_STYLE[activeCategory];

  const renderPreview = () => {
    switch (activeCategory) {
      case "Thermal_Receipt":  return <ReceiptPreview      {...previewProps} />;
      case "Invoice":
      case "A4_Receipt":       return <InvoicePreview      {...previewProps} />;
      case "Quote":            return <InvoicePreview      {...previewProps} />;
      case "Service_Ticket":   return <ServiceSheetPreview {...previewProps} />;
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
              <h1 className="text-2xl font-bold">Sales Templates</h1>
              <p className="text-sm text-muted-foreground">Configure print templates for receipts, invoices, quotes and service tickets. Changes are saved to the database and used across all print and export actions.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5 shrink-0">
            <Building2 className="w-3.5 h-3.5" />
            <span>Showing: <strong className="text-foreground">{businessName}</strong></span>
          </div>
        </div>

        {/* Top settings row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <NotificationsPanel />
          <ReceiptPrintSettings />
        </div>

        {tplLoading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading templates…</div>
        ) : (
          <>
            {/* Full-width category bar */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex divide-x">
                {(Object.keys(CATEGORY_META) as Category[]).map((cat) => {
                  const { label, icon: Icon, color } = CATEGORY_META[cat];
                  const active = cat === activeCategory;
                  const catRow = templates.find((t) => t.templateType === cat);
                  const saved  = !!catRow;
                  return (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm transition-colors",
                        active ? "bg-primary/5 text-primary font-semibold" : "hover:bg-muted/50 text-foreground"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : color)} />
                      <span className="hidden sm:inline">{label}</span>
                      <span className="sm:hidden">{label.split(' ')[0]}</span>
                      {saved && <Check className="w-3 h-3 text-green-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Full-width styles row */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground px-0.5 uppercase tracking-wider">{CATEGORY_META[activeCategory].label} Styles</p>
              <div className="flex gap-3">
                {currentTemplates.map((tpl) => {
                  const isActiveStyle = activeStyle === tpl.id;
                  const previewing    = previewId === tpl.id;
                  const SIcon         = STYLE_ICONS[tpl.style];
                  return (
                    <div key={tpl.id} onClick={() => setPreviewId(tpl.id)}
                      className={cn("flex-1 rounded-xl border p-2.5 cursor-pointer transition-all space-y-1.5",
                        previewing ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-muted-foreground/30 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-xs">{tpl.name}</span>
                        {isActiveStyle && (
                          <Badge variant="default" className="text-[9px] h-3.5 px-1 gap-0.5">
                            <Check className="w-2 h-2" /> Saved
                          </Badge>
                        )}
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

            {/* Options + Preview side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left: Options */}
              <OptionsPanel
                key={`${activeCategory}-${previewId}`}
                category={activeCategory}
                templateId={previewId}
                opts={opts}
                update={update}
                reset={reset}
                isDefault={isDefault}
                setIsDefault={setIsDefault}
                onSave={() => save(previewId)}
                saving={saving}
                onFieldFocus={(label) => setFocusedFieldLabel(label)}
                onFieldInsert={(_key, fn) => { insertFnRef.current = fn; }}
              />

              {/* Right: Preview */}
              <div className="space-y-3">
                {/* Preview header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StyleIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-sm truncate">
                      {currentTemplates.find(t => t.id === previewId)?.name} Preview
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">{CATEGORY_META[activeCategory].label}</Badge>
                  </div>
                </div>

                {/* Preview box */}
                <div className="rounded-xl border bg-gray-50 p-6 flex items-start justify-center min-h-[460px]">
                  {activeCategory === "Thermal_Receipt" && (
                    <div className="bg-white shadow-lg rounded border border-gray-200 p-4 w-56">{renderPreview()}</div>
                  )}
                  {(activeCategory === "Invoice" || activeCategory === "A4_Receipt" || activeCategory === "Quote") && (
                    <div className="bg-white shadow-lg rounded border border-gray-200 p-4 w-80">{renderPreview()}</div>
                  )}
                  {activeCategory === "Service_Ticket" && (
                    <div className="bg-white shadow-lg rounded border border-gray-200 p-5 w-full max-w-xl">{renderPreview()}</div>
                  )}
                </div>

                {/* Info bar */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Live preview — edits update instantly. Business details come from <strong>Management → Business Details</strong>. Press <strong>Save Template</strong> to persist to database.</span>
                </div>
              </div>
            </div>

            {/* Full-width Quick Codes bar */}
            <QuickCodesBar
              groups={quickCodeGroups}
              focusedField={focusedFieldLabel}
              onInsert={(_fieldKey, code) => { insertFnRef.current?.(code); }}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
