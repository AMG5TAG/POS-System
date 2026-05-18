import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Receipt, FileText, Mail, MessageSquare, Tag, Printer,
  Check, Star, Sparkles, Minimize2, Zap, Building2,
  Copy, ChevronDown, ChevronRight, User, ShoppingCart,
  Percent, Eye, EyeOff,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Category = "receipts" | "invoices" | "a4receipts" | "emails" | "sms";

interface TemplateOption {
  id: string;
  name: string;
  style: "professional" | "casual" | "minimal" | "bold";
  description: string;
}

/* ─── Quick Codes ─────────────────────────────────────────────────────────── */

interface QuickCode {
  code: string;
  label: string;
  example: string;
}

interface QuickCodeGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  codes: QuickCode[];
}

function buildQuickCodeGroups(
  businessName: string,
  abn: string,
  email: string,
  website: string,
  tagline: string,
  address: string,
): QuickCodeGroup[] {
  return [
    {
      id: "business",
      label: "Business Details",
      icon: Building2,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-200 hover:bg-blue-100",
      codes: [
        { code: "{{business.name}}",    label: "Business Name",  example: businessName || "Your Business"         },
        { code: "{{business.abn}}",     label: "ABN",            example: abn || "12 345 678 901"                 },
        { code: "{{business.email}}",   label: "Email",          example: email || "hello@yourbusiness.com.au"    },
        { code: "{{business.phone}}",   label: "Phone",          example: "(03) 9000 0000"                        },
        { code: "{{business.website}}", label: "Website",        example: website || "www.yourbusiness.com.au"    },
        { code: "{{business.tagline}}", label: "Tagline",        example: tagline || "Quality you can trust"      },
        { code: "{{business.address}}", label: "Address",        example: address || "Melbourne VIC 3000"         },
      ],
    },
    {
      id: "customer",
      label: "Customer",
      icon: User,
      color: "text-violet-600",
      bg: "bg-violet-50 border-violet-200 hover:bg-violet-100",
      codes: [
        { code: "{{customer.name}}",           label: "Full Name",       example: "Sarah Johnson"  },
        { code: "{{customer.first_name}}",     label: "First Name",      example: "Sarah"          },
        { code: "{{customer.email}}",          label: "Email",           example: "sarah@email.com"},
        { code: "{{customer.phone}}",          label: "Phone",           example: "(03) 9000 1111" },
        { code: "{{customer.loyalty_points}}", label: "Loyalty Points",  example: "420 pts"        },
        { code: "{{customer.loyalty_tier}}",   label: "Loyalty Tier",    example: "Gold Member"    },
        { code: "{{customer.id}}",             label: "Customer ID",     example: "#CUS-0042"      },
        { code: "{{customer.total_spent}}",    label: "Total Spent",     example: "$1,240.00"      },
      ],
    },
    {
      id: "transaction",
      label: "Transaction",
      icon: ShoppingCart,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
      codes: [
        { code: "{{transaction.number}}",         label: "Receipt #",       example: "#TXN-1042"   },
        { code: "{{transaction.date}}",           label: "Date",            example: "18/05/2026"  },
        { code: "{{transaction.time}}",           label: "Time",            example: "10:42 AM"    },
        { code: "{{transaction.total}}",          label: "Total",           example: "$19.50"      },
        { code: "{{transaction.gst}}",            label: "GST Amount",      example: "$1.77"       },
        { code: "{{transaction.subtotal}}",       label: "Subtotal",        example: "$17.73"      },
        { code: "{{transaction.items}}",          label: "Item Count",      example: "3 items"     },
        { code: "{{transaction.payment_method}}", label: "Payment Method",  example: "EFTPOS"      },
        { code: "{{transaction.change}}",         label: "Change Given",    example: "$0.50"       },
      ],
    },
    {
      id: "promo",
      label: "Promo / Discount",
      icon: Percent,
      color: "text-amber-600",
      bg: "bg-amber-50 border-amber-200 hover:bg-amber-100",
      codes: [
        { code: "{{promo.code}}",        label: "Promo Code",    example: "SAVE10"          },
        { code: "{{promo.discount}}",    label: "Discount",      example: "10% off"         },
        { code: "{{promo.expiry}}",      label: "Expiry Date",   example: "30/06/2026"      },
        { code: "{{promo.min_spend}}",   label: "Min. Spend",    example: "$50.00"          },
        { code: "{{promo.description}}", label: "Description",   example: "Summer Sale 🎉"  },
        { code: "{{promo.savings}}",     label: "Amount Saved",  example: "$5.00"           },
      ],
    },
  ];
}

/* ─── Quick Codes Panel ───────────────────────────────────────────────────── */

function QuickCodesPanel({
  groups,
  onInsert,
}: {
  groups: QuickCodeGroup[];
  onInsert?: (code: string) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>("business");
  const [copied, setCopied] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(false);

  const handleCode = (code: string) => {
    if (onInsert) {
      onInsert(code);
    } else {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Quick Codes</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Merge Tags</Badge>
        </div>
        <button
          onClick={() => setShowValues(!showValues)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showValues ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showValues ? "Hide values" : "Show values"}
        </button>
      </div>

      {/* Helper text */}
      <div className="px-4 py-2 bg-muted/20 border-b">
        <p className="text-[11px] text-muted-foreground">
          {onInsert
            ? "Click any code to insert it at your cursor position."
            : "Click any code to copy it. Paste into your template text where you want it to appear."}
        </p>
      </div>

      {/* Groups */}
      <div className="divide-y">
        {groups.map((group) => {
          const Icon = group.icon;
          const open = openGroup === group.id;
          return (
            <div key={group.id}>
              <button
                onClick={() => setOpenGroup(open ? null : group.id)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors"
              >
                <Icon className={cn("w-3.5 h-3.5", group.color)} />
                <span className="flex-1 text-left font-medium">{group.label}</span>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">{group.codes.length}</Badge>
                {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>

              {open && (
                <div className="px-3 pb-3 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {group.codes.map((c) => {
                      const isCopied = copied === c.code;
                      return (
                        <button
                          key={c.code}
                          onClick={() => handleCode(c.code)}
                          title={`${c.label}\nExample: ${c.example}`}
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border font-mono transition-all",
                            isCopied
                              ? "bg-green-100 border-green-400 text-green-700 scale-95"
                              : cn(group.bg, group.color)
                          )}
                        >
                          {isCopied ? (
                            <><Check className="w-2.5 h-2.5" />{onInsert ? "Inserted!" : "Copied!"}</>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5 opacity-60" />
                              {showValues ? (
                                <span className="font-sans text-[10px] opacity-80">{c.example}</span>
                              ) : (
                                c.code
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {showValues && (
                    <div className="mt-2 space-y-0.5">
                      {group.codes.map((c) => (
                        <div key={c.code} className="flex items-center gap-2 text-[10px]">
                          <code className={cn("font-mono px-1 py-0.5 rounded text-[10px]", group.bg, group.color)}>{c.code}</code>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-foreground font-medium">{c.example}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── SMS / Email message editor with Quick Code insertion ─────────────────── */

const DEFAULT_SMS_MESSAGES: Record<string, string> = {
  "s-receipt": `Hi {{customer.first_name}}! Thanks for visiting {{business.name}}. Your receipt: {{transaction.total}} on {{transaction.date}}. See you next time! {{business.website}}`,
  "s-appt":    `Reminder: You have an appointment at {{business.name}} on {{transaction.date}} at {{transaction.time}}. Reply CANCEL to cancel. Questions? Call {{business.phone}}.`,
  "s-layby":   `Hi {{customer.first_name}}, your layby at {{business.name}} has a payment due by {{transaction.date}}. Balance remaining: {{transaction.total}}. Pop in or call {{business.phone}} to pay. Thanks!`,
};

const DEFAULT_EMAIL_SUBJECTS: Record<string, string> = {
  "e-pro":    `Your receipt from {{business.name}} — {{transaction.number}}`,
  "e-casual": `Thanks for visiting {{business.name}}! 🎉`,
  "e-minimal":`Receipt {{transaction.number}} from {{business.name}}`,
};

function MessageEditor({
  templateId,
  category,
  quickCodeGroups,
}: {
  templateId: string;
  category: Category;
  quickCodeGroups: QuickCodeGroup[];
}) {
  const storageKey = `koapos_tpl_msg_${templateId}`;
  const [text, setText] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return stored;
    } catch {}
    if (category === "sms") return DEFAULT_SMS_MESSAGES[templateId] ?? DEFAULT_SMS_MESSAGES["s-receipt"];
    if (category === "emails") return DEFAULT_EMAIL_SUBJECTS[templateId] ?? DEFAULT_EMAIL_SUBJECTS["e-pro"];
    return "";
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, text); } catch {}
  }, [text, storageKey]);

  // When template changes, load the stored (or default) text
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) { setText(stored); return; }
    } catch {}
    if (category === "sms") setText(DEFAULT_SMS_MESSAGES[templateId] ?? "");
    else if (category === "emails") setText(DEFAULT_EMAIL_SUBJECTS[templateId] ?? "");
  }, [templateId, category, storageKey]);

  const insertAtCursor = useCallback((code: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + code);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + code + text.slice(end);
    setText(next);
    // Restore cursor after the inserted code
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + code.length, start + code.length);
    });
  }, [text]);

  const label = category === "sms" ? "Message Text" : "Subject Line";
  const placeholder = category === "sms"
    ? "Type your SMS message here… use codes from Quick Codes below to personalise it."
    : "Email subject line — use codes to personalise.";

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {category === "sms" ? <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" /> : <Mail className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-sm font-semibold">Customise {label}</span>
        </div>
        <button
          onClick={() => {
            const def = category === "sms"
              ? (DEFAULT_SMS_MESSAGES[templateId] ?? "")
              : (DEFAULT_EMAIL_SUBJECTS[templateId] ?? "");
            setText(def);
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset to default
        </button>
      </div>
      <div className="p-3 space-y-2">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="font-mono text-xs min-h-[80px] resize-y"
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{text.length} characters{category === "sms" && text.length > 160 ? ` · ${Math.ceil(text.length / 160)} SMS parts` : ""}</span>
          <span>Click a Quick Code below to insert at cursor</span>
        </div>
      </div>
      {/* Inline Quick Codes for insert-at-cursor */}
      <div className="border-t">
        <QuickCodesPanel groups={quickCodeGroups} onInsert={insertAtCursor} />
      </div>
    </div>
  );
}

/* ─── Template catalogue ─────────────────────────────────────────────────── */

const TEMPLATES: Record<Category, TemplateOption[]> = {
  receipts: [
    { id: "r-pro",     name: "Professional",  style: "professional", description: "Clean logo header, bold totals, structured layout" },
    { id: "r-casual",  name: "Casual",        style: "casual",       description: "Friendly tone, rounded feel, softer typography" },
    { id: "r-minimal", name: "Minimal",       style: "minimal",      description: "Text-only, ultra-compact, fast printing" },
  ],
  invoices: [
    { id: "i-pro",     name: "Professional",  style: "professional", description: "Logo, payment terms, itemised table" },
    { id: "i-modern",  name: "Modern",        style: "bold",         description: "Bold colour header, two-column layout" },
    { id: "i-minimal", name: "Minimal",       style: "minimal",      description: "No frills, plain A4 business invoice" },
  ],
  a4receipts: [
    { id: "a4-pro",    name: "Professional",  style: "professional", description: "Full-page receipt with logo and business details" },
    { id: "a4-casual", name: "Casual",        style: "casual",       description: "Friendly A4 with thank you message and socials" },
  ],
  emails: [
    { id: "e-pro",     name: "Professional",  style: "professional", description: "HTML email with header banner, itemised receipt" },
    { id: "e-casual",  name: "Casual",        style: "casual",       description: "Warm tone, logo, product summary, return policy" },
    { id: "e-minimal", name: "Minimal",       style: "minimal",      description: "Plain-text style, fast loading, high deliverability" },
  ],
  sms: [
    { id: "s-receipt", name: "Sale Receipt",         style: "minimal",      description: "Short confirmation with total and thank you" },
    { id: "s-appt",    name: "Appointment Reminder", style: "professional", description: "Date, time, business name, cancel link" },
    { id: "s-layby",   name: "Layby Reminder",       style: "casual",       description: "Payment due reminder with balance owed" },
  ],
};

const CATEGORY_META: Record<Category, { label: string; icon: React.ElementType; color: string }> = {
  receipts:   { label: "Receipts",     icon: Receipt,        color: "text-blue-500"   },
  invoices:   { label: "Invoices",     icon: FileText,       color: "text-violet-500" },
  a4receipts: { label: "A4 Receipts",  icon: Printer,        color: "text-emerald-500"},
  emails:     { label: "Emails",       icon: Mail,           color: "text-amber-500"  },
  sms:        { label: "SMS",          icon: MessageSquare,  color: "text-rose-500"   },
};

const STYLE_ICONS: Record<string, React.ElementType> = {
  professional: Star,
  casual:       Sparkles,
  minimal:      Minimize2,
  bold:         Zap,
};

const STYLE_COLORS: Record<string, string> = {
  professional: "bg-blue-50 text-blue-700 border-blue-200",
  casual:       "bg-amber-50 text-amber-700 border-amber-200",
  minimal:      "bg-gray-50 text-gray-600 border-gray-200",
  bold:         "bg-violet-50 text-violet-700 border-violet-200",
};

const STORAGE_KEY = "koapos_active_templates";

/* ─── Preview renderers ──────────────────────────────────────────────────── */

interface PreviewProps {
  templateId: string;
  businessName: string;
  abn: string;
  tagline: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  logo: string;
  brandColor: string;
}

function ReceiptPreview({ templateId, businessName, abn, website, email, brandColor }: PreviewProps) {
  const items = [
    { name: "Flat White",       qty: 2, price: 8.00  },
    { name: "Banana Bread",     qty: 1, price: 6.50  },
    { name: "Orange Juice",     qty: 1, price: 5.00  },
  ];
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const gst = subtotal / 11;
  const total = subtotal;
  const date = "18/05/2026 10:42 AM";

  if (templateId === "r-minimal") {
    return (
      <div className="font-mono text-xs text-gray-800 space-y-0.5 leading-snug">
        <p className="text-center font-bold uppercase">{businessName}</p>
        {abn && <p className="text-center">ABN: {abn}</p>}
        <p className="text-center">{date}</p>
        <p className="text-center">─────────────────</p>
        {items.map((i) => (
          <div key={i.name} className="flex justify-between">
            <span>{i.name} ×{i.qty}</span>
            <span>${(i.qty * i.price).toFixed(2)}</span>
          </div>
        ))}
        <p className="text-center">─────────────────</p>
        <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>GST (10%)</span><span>${gst.toFixed(2)}</span></div>
        <div className="flex justify-between font-bold"><span>TOTAL</span><span>${total.toFixed(2)}</span></div>
        <p className="text-center">─────────────────</p>
        <p className="text-center">EFTPOS — APPROVED</p>
        <p className="text-center text-gray-500">{website}</p>
      </div>
    );
  }

  if (templateId === "r-casual") {
    return (
      <div className="text-xs text-gray-800 font-sans">
        <div className="text-center mb-2">
          <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-white text-lg font-bold" style={{ background: brandColor }}>{businessName[0]}</div>
          <p className="font-bold text-base">{businessName} ☕</p>
          <p className="text-gray-500 text-[10px]">{date}</p>
        </div>
        <div className="bg-gray-50 rounded p-2 space-y-1 text-[10px]">
          {items.map((i) => (
            <div key={i.name} className="flex justify-between">
              <span>{i.name} ×{i.qty}</span>
              <span>${(i.qty * i.price).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-gray-500">GST incl.</span><span>${gst.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-sm border-t pt-1" style={{ color: brandColor }}><span>Total</span><span>${total.toFixed(2)}</span></div>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-2">Thanks for visiting! See you soon 😊</p>
        {email && <p className="text-center text-[10px] text-blue-500">{email}</p>}
      </div>
    );
  }

  return (
    <div className="text-xs text-gray-800 font-sans">
      <div className="text-center border-b pb-2 mb-2">
        <div className="w-6 h-6 rounded mx-auto mb-1" style={{ background: brandColor }} />
        <p className="font-bold text-sm uppercase tracking-wide">{businessName}</p>
        {abn && <p className="text-[10px] text-gray-500">ABN {abn}</p>}
        <p className="text-[10px] text-gray-400">{date}</p>
      </div>
      <table className="w-full text-[10px]">
        <thead><tr className="border-b"><th className="text-left pb-0.5">Item</th><th className="text-center">Qty</th><th className="text-right">Amt</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.name}><td className="py-0.5">{i.name}</td><td className="text-center">{i.qty}</td><td className="text-right">${(i.qty * i.price).toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="border-t mt-1 pt-1 space-y-0.5 text-[10px]">
        <div className="flex justify-between"><span className="text-gray-500">GST (10%)</span><span>${gst.toFixed(2)}</span></div>
        <div className="flex justify-between font-bold"><span>TOTAL AUD</span><span>${total.toFixed(2)}</span></div>
        <div className="flex justify-between text-gray-500"><span>EFTPOS</span><span>Approved</span></div>
      </div>
      {(website || email) && (
        <p className="text-center text-[10px] text-gray-400 border-t mt-1 pt-1">{website || email}</p>
      )}
    </div>
  );
}

function InvoicePreview({ templateId, businessName, abn, website, email, address, brandColor }: PreviewProps) {
  const items = [
    { name: "Product Design Services", qty: 3, price: 150 },
    { name: "Logo Package",             qty: 1, price: 450 },
  ];
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;

  if (templateId === "i-minimal") {
    return (
      <div className="text-[10px] font-mono text-gray-800 space-y-1.5">
        <div className="flex justify-between font-bold text-xs">
          <span>{businessName}</span><span>INVOICE #1042</span>
        </div>
        {abn && <p className="text-gray-500">ABN: {abn}</p>}
        <p className="text-gray-500">Date: 18/05/2026 · Due: 01/06/2026</p>
        <Separator />
        <p className="font-bold">Bill To: Demo Client Pty Ltd</p>
        <Separator />
        {items.map((i) => (
          <div key={i.name} className="flex justify-between">
            <span className="flex-1">{i.name}</span>
            <span className="w-8 text-right">{i.qty}</span>
            <span className="w-16 text-right">${(i.qty * i.price).toFixed(2)}</span>
          </div>
        ))}
        <Separator />
        <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>GST 10%</span><span>${gst.toFixed(2)}</span></div>
        <div className="flex justify-between font-bold"><span>TOTAL DUE</span><span>${total.toFixed(2)}</span></div>
        <p className="text-gray-400 pt-1">Payment due within 30 days</p>
      </div>
    );
  }

  if (templateId === "i-modern") {
    return (
      <div className="text-[10px] text-gray-800">
        <div className="p-2 rounded-t text-white text-xs font-bold flex justify-between items-center mb-2" style={{ background: brandColor }}>
          <span className="text-base">{businessName}</span>
          <span className="opacity-80">INVOICE #1042</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
          <div><p className="text-gray-400">From</p><p className="font-medium">{businessName}</p><p className="text-gray-500">{abn ? `ABN ${abn}` : ""}</p></div>
          <div><p className="text-gray-400">Bill To</p><p className="font-medium">Demo Client</p><p className="text-gray-500">18/05/2026</p></div>
        </div>
        <table className="w-full text-[10px]">
          <thead><tr className="border-b"><th className="text-left pb-0.5">Description</th><th className="text-right">Total</th></tr></thead>
          <tbody>{items.map((i) => <tr key={i.name}><td className="py-0.5">{i.name}</td><td className="text-right">${(i.qty * i.price).toFixed(2)}</td></tr>)}</tbody>
        </table>
        <div className="border-t mt-1 pt-1 space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-gray-500">GST</span><span>${gst.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-sm" style={{ color: brandColor }}><span>Total Due</span><span>${total.toFixed(2)}</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-[10px] text-gray-800">
      <div className="flex justify-between items-start border-b pb-2 mb-2">
        <div>
          <div className="w-5 h-5 rounded mb-1" style={{ background: brandColor }} />
          <p className="font-bold text-xs">{businessName}</p>
          {abn && <p className="text-gray-500">ABN {abn}</p>}
          {address && <p className="text-gray-500">{address}</p>}
          {email && <p className="text-gray-500">{email}</p>}
        </div>
        <div className="text-right">
          <p className="font-bold text-sm" style={{ color: brandColor }}>INVOICE</p>
          <p className="text-gray-500">#1042 · 18/05/2026</p>
          <p className="text-gray-500">Due: 01/06/2026</p>
        </div>
      </div>
      <p className="font-medium mb-1">Bill To: Demo Client Pty Ltd</p>
      <table className="w-full text-[10px] mb-1">
        <thead><tr className="border-b"><th className="text-left">Item</th><th className="text-center">Qty</th><th className="text-right">Rate</th><th className="text-right">Total</th></tr></thead>
        <tbody>{items.map((i) => <tr key={i.name}><td className="py-0.5">{i.name}</td><td className="text-center">{i.qty}</td><td className="text-right">${i.price.toFixed(2)}</td><td className="text-right">${(i.qty * i.price).toFixed(2)}</td></tr>)}</tbody>
      </table>
      <div className="border-t pt-1 space-y-0.5 text-right text-[10px]">
        <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">GST (10%)</span><span>${gst.toFixed(2)}</span></div>
        <div className="flex justify-between font-bold"><span>TOTAL DUE (AUD)</span><span>${total.toFixed(2)}</span></div>
      </div>
      <p className="text-gray-400 mt-1 border-t pt-1">Payment terms: 30 days. {website}</p>
    </div>
  );
}

function A4ReceiptPreview({ templateId, businessName, abn, website, email, brandColor, tagline }: PreviewProps) {
  const items = [{ name: "Flat White ×2", price: 8.00 }, { name: "Banana Bread ×1", price: 6.50 }];
  const total = items.reduce((s, i) => s + i.price, 0);

  if (templateId === "a4-casual") {
    return (
      <div className="text-[10px] text-gray-800">
        <div className="text-center mb-3 p-2 rounded-t" style={{ background: `${brandColor}18` }}>
          <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-white font-bold" style={{ background: brandColor }}>{businessName[0]}</div>
          <p className="font-bold text-sm">{businessName}</p>
          {tagline && <p className="text-[10px] text-gray-500 italic">{tagline}</p>}
          {abn && <p className="text-[10px] text-gray-400">ABN {abn}</p>}
        </div>
        <p className="text-center text-gray-500 mb-2 text-[10px]">18 May 2026 · 10:42 AM · Receipt #0042</p>
        <div className="bg-gray-50 rounded p-2 space-y-1 text-[10px] mb-2">
          {items.map((i) => <div key={i.name} className="flex justify-between"><span>{i.name}</span><span>${i.price.toFixed(2)}</span></div>)}
        </div>
        <div className="flex justify-between font-bold text-xs mb-3" style={{ color: brandColor }}><span>Total Paid</span><span>${total.toFixed(2)}</span></div>
        <Separator className="my-2" />
        <p className="text-center font-bold text-xs mb-1">Thank you so much! 🙏</p>
        <p className="text-center text-[10px] text-gray-500">We hope to see you again soon.</p>
        {website && <p className="text-center text-[10px] text-blue-500 mt-1">{website}</p>}
      </div>
    );
  }

  return (
    <div className="text-[10px] text-gray-800">
      <div className="flex justify-between items-start border-b pb-2 mb-2">
        <div>
          <div className="w-5 h-5 rounded mb-1" style={{ background: brandColor }} />
          <p className="font-bold text-xs">{businessName}</p>
          {abn && <p className="text-gray-400">ABN {abn}</p>}
          {email && <p className="text-gray-400">{email}</p>}
          {website && <p className="text-gray-400">{website}</p>}
        </div>
        <div className="text-right">
          <p className="font-bold text-xs" style={{ color: brandColor }}>TAX INVOICE / RECEIPT</p>
          <p className="text-gray-400">#0042 · 18/05/2026</p>
        </div>
      </div>
      <table className="w-full text-[10px] mb-1">
        <thead><tr className="border-b"><th className="text-left">Description</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{items.map((i) => <tr key={i.name}><td className="py-0.5">{i.name}</td><td className="text-right">${i.price.toFixed(2)}</td></tr>)}</tbody>
      </table>
      <div className="border-t pt-1 text-right space-y-0.5">
        <div className="flex justify-between text-gray-500"><span>GST Included</span><span>${(total / 11).toFixed(2)}</span></div>
        <div className="flex justify-between font-bold"><span>TOTAL PAID (AUD)</span><span>${total.toFixed(2)}</span></div>
      </div>
      <p className="text-center text-[10px] text-gray-400 border-t mt-2 pt-1">Thank you for your business — {businessName}</p>
    </div>
  );
}

function EmailPreview({ templateId, businessName, abn, website, email: contactEmail, brandColor, tagline }: PreviewProps) {
  const total = "$19.50";
  if (templateId === "e-minimal") {
    return (
      <div className="text-[10px] font-mono text-gray-800 space-y-1">
        <p>From: {contactEmail || `hello@${businessName.toLowerCase().replace(/\s/g, "")}.com.au`}</p>
        <p>Subject: Your receipt from {businessName}</p>
        <Separator />
        <p>Hi Sarah,</p>
        <p>Thanks for your purchase at {businessName} on 18/05/2026.</p>
        <p>Total paid: {total} (GST incl.)</p>
        {abn && <p>ABN: {abn}</p>}
        <p>Questions? Reply to this email.</p>
        <p>— {businessName} Team</p>
      </div>
    );
  }
  if (templateId === "e-casual") {
    return (
      <div className="text-[10px] text-gray-800">
        <div className="p-2 rounded-t text-center mb-2" style={{ background: `${brandColor}22` }}>
          <div className="w-7 h-7 rounded-full mx-auto mb-1 flex items-center justify-center text-white font-bold" style={{ background: brandColor }}>{businessName[0]}</div>
          <p className="font-bold">{businessName}</p>
          {tagline && <p className="text-gray-500 text-[9px] italic">{tagline}</p>}
        </div>
        <p className="text-[10px] mb-1">Hey Sarah 👋 Thanks for stopping by!</p>
        <p className="text-[10px] text-gray-500 mb-2">Here&apos;s your receipt for today&apos;s visit.</p>
        <div className="bg-gray-50 rounded p-1.5 text-[10px] space-y-0.5 mb-2">
          <div className="flex justify-between"><span>Flat White ×2</span><span>$8.00</span></div>
          <div className="flex justify-between"><span>Banana Bread ×1</span><span>$6.50</span></div>
          <div className="flex justify-between font-bold border-t pt-1" style={{ color: brandColor }}><span>Total</span><span>{total}</span></div>
        </div>
        <p className="text-[10px] text-gray-500">Returns accepted within 30 days 🛍️</p>
        {website && <p className="text-[10px] text-blue-500">{website}</p>}
      </div>
    );
  }
  return (
    <div className="text-[10px] text-gray-800">
      <div className="p-2 text-white mb-2 flex items-center gap-2 rounded-t" style={{ background: brandColor }}>
        <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center font-bold text-xs">{businessName[0]}</div>
        <div><p className="font-bold text-xs">{businessName}</p>{abn && <p className="opacity-70 text-[9px]">ABN {abn}</p>}</div>
        <span className="ml-auto opacity-70">Receipt</span>
      </div>
      <p className="text-[10px] px-1 mb-1">Dear Sarah,</p>
      <p className="text-[10px] text-gray-500 px-1 mb-2">Thank you for your purchase on 18/05/2026.</p>
      <table className="w-full text-[10px] px-1">
        <thead><tr className="border-b"><th className="text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Amt</th></tr></thead>
        <tbody>
          <tr><td className="py-0.5">Flat White</td><td className="text-right">2</td><td className="text-right">$8.00</td></tr>
          <tr><td className="py-0.5">Banana Bread</td><td className="text-right">1</td><td className="text-right">$6.50</td></tr>
        </tbody>
      </table>
      <div className="border-t mt-1 pt-1 px-1 space-y-0.5">
        <div className="flex justify-between font-bold"><span>Total Paid</span><span>{total}</span></div>
        <div className="flex justify-between text-gray-400"><span>GST Included</span><span>$1.77</span></div>
      </div>
      <div className="border-t mt-2 pt-1 px-1 text-gray-400 text-[9px] text-center">{contactEmail} · {website}</div>
    </div>
  );
}

function SMSPreview({ templateId, businessName, website }: PreviewProps) {
  const messages: Record<string, string> = {
    "s-receipt": `Hi Sarah! Thanks for visiting ${businessName}. Your receipt: $19.50 on 18/05/2026. See you next time! ${website}`,
    "s-appt":    `Reminder: You have an appointment at ${businessName} on Wed 20 May at 2:00 PM. Reply CANCEL to cancel. Questions? Call us on (03) 9XXX XXXX.`,
    "s-layby":   `Hi Sarah, your layby at ${businessName} has a payment of $45.00 due by 25/05/2026. Balance remaining: $120.00. Pop in or call us to pay. Thanks!`,
  };
  return (
    <div className="flex items-end justify-end">
      <div className="bg-green-500 text-white text-[10px] rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%] leading-relaxed shadow">
        {messages[templateId] || messages["s-receipt"]}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ManagementTemplatesPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("receipts");
  const [activeTemplates, setActiveTemplates] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  });
  const [previewId, setPreviewId] = useState<string>("r-pro");

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();

  useEffect(() => {
    const defaults: Record<Category, string> = {
      receipts: "r-pro", invoices: "i-pro", a4receipts: "a4-pro", emails: "e-pro", sms: "s-receipt",
    };
    setPreviewId(activeTemplates[activeCategory] ?? defaults[activeCategory]);
  }, [activeCategory, activeTemplates]);

  const businessName = merchant?.businessName || "Your Business";
  const brandColor = profile.brandColors?.[0] || "#efbf04";

  const previewProps: PreviewProps = {
    templateId:   previewId,
    businessName,
    abn:          profile.abn || "12 345 678 901",
    tagline:      profile.tagline || "",
    website:      profile.website || "www.yourbusiness.com.au",
    email:        profile.contactEmail || merchant?.email || "",
    phone:        "",
    address:      [profile.state, profile.postcode].filter(Boolean).join(" "),
    logo:         profile.logo || "",
    brandColor,
  };

  const quickCodeGroups = buildQuickCodeGroups(
    businessName,
    profile.abn || "",
    profile.contactEmail || merchant?.email || "",
    profile.website || "",
    profile.tagline || "",
    [profile.state, profile.postcode].filter(Boolean).join(" "),
  );

  const setActive = (categoryId: Category, templateId: string) => {
    const next = { ...activeTemplates, [categoryId]: templateId };
    setActiveTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const currentTemplates = TEMPLATES[activeCategory];
  const StyleIcon = STYLE_ICONS[currentTemplates.find(t => t.id === previewId)?.style ?? "professional"];
  const showEditor = activeCategory === "sms" || activeCategory === "emails";

  const renderPreview = () => {
    switch (activeCategory) {
      case "receipts":   return <ReceiptPreview {...previewProps} />;
      case "invoices":   return <InvoicePreview {...previewProps} />;
      case "a4receipts": return <A4ReceiptPreview {...previewProps} />;
      case "emails":     return <EmailPreview {...previewProps} />;
      case "sms":        return <SMSPreview {...previewProps} />;
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
              <p className="text-sm text-muted-foreground">Choose templates for your receipts, invoices, emails and messages. All templates use your Business Details automatically.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>Showing: <strong className="text-foreground">{businessName}</strong></span>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* Left: category tabs + template cards */}
          <div className="w-72 shrink-0 space-y-3">
            {/* Category tabs */}
            <div className="rounded-xl border bg-card overflow-hidden">
              {(Object.keys(CATEGORY_META) as Category[]).map((cat) => {
                const { label, icon: Icon, color } = CATEGORY_META[cat];
                const active = cat === activeCategory;
                const activeTpl = activeTemplates[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b last:border-b-0",
                      active ? "bg-primary/5 text-primary font-semibold" : "hover:bg-muted/50 text-foreground"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : color)} />
                    <span className="flex-1 text-left">{label}</span>
                    {activeTpl && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Template cards */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-1 uppercase tracking-wide">{CATEGORY_META[activeCategory].label} Templates</p>
              {currentTemplates.map((tpl) => {
                const selected = activeTemplates[activeCategory] === tpl.id;
                const previewing = previewId === tpl.id;
                const StyleIconComp = STYLE_ICONS[tpl.style];
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setPreviewId(tpl.id)}
                    className={cn(
                      "rounded-xl border p-3 cursor-pointer transition-all space-y-2",
                      previewing ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-muted-foreground/30 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{tpl.name}</span>
                      {selected && <Badge variant="default" className="text-[10px] h-4 px-1.5 gap-0.5"><Check className="w-2.5 h-2.5" /> Active</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{tpl.description}</p>
                    <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium", STYLE_COLORS[tpl.style])}>
                      <StyleIconComp className="w-2.5 h-2.5" />{tpl.style}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Read-only Quick Codes for non-text templates */}
            {!showEditor && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-1 uppercase tracking-wide">Quick Codes Reference</p>
                <QuickCodesPanel groups={quickCodeGroups} />
              </div>
            )}
          </div>

          {/* Right: live preview + set active + editor/quick codes */}
          <div className="flex-1 space-y-4 min-w-0">
            {/* Preview header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StyleIcon className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{currentTemplates.find(t => t.id === previewId)?.name} Preview</span>
                <Badge variant="outline" className="text-xs">{CATEGORY_META[activeCategory].label}</Badge>
              </div>
              <Button
                size="sm"
                onClick={() => setActive(activeCategory, previewId)}
                disabled={activeTemplates[activeCategory] === previewId}
                className="gap-1.5"
              >
                {activeTemplates[activeCategory] === previewId ? (
                  <><Check className="w-3.5 h-3.5" /> Active Template</>
                ) : (
                  "Set as Active"
                )}
              </Button>
            </div>

            {/* Preview area */}
            <div className="rounded-xl border bg-gray-50 p-6 flex items-start justify-center" style={{ minHeight: showEditor ? 260 : 520 }}>
              {(activeCategory === "receipts" || activeCategory === "a4receipts") && (
                <div className="bg-white shadow-lg rounded border border-gray-200 p-4 w-56 mx-auto">
                  {renderPreview()}
                </div>
              )}
              {activeCategory === "invoices" && (
                <div className="bg-white shadow-lg rounded border border-gray-200 p-4 w-80 mx-auto">
                  {renderPreview()}
                </div>
              )}
              {activeCategory === "emails" && (
                <div className="bg-white shadow rounded-xl border border-gray-200 overflow-hidden w-80 mx-auto">
                  <div className="bg-gray-100 px-3 py-1.5 flex items-center gap-1.5 border-b">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="ml-2 text-[10px] text-gray-400">Email Preview</span>
                  </div>
                  <div className="p-3">{renderPreview()}</div>
                </div>
              )}
              {activeCategory === "sms" && (
                <div className="bg-gray-900 rounded-3xl p-4 w-56 mx-auto shadow-xl">
                  <div className="bg-gray-800 h-2 w-12 rounded mx-auto mb-4" />
                  <div className="bg-white rounded-2xl p-3 min-h-40">
                    <p className="text-[9px] text-gray-400 text-center mb-3">{businessName}</p>
                    {renderPreview()}
                  </div>
                  <div className="bg-gray-800 h-1 w-16 rounded mx-auto mt-4" />
                </div>
              )}
            </div>

            {/* SMS / Email message editor with embedded Quick Codes */}
            {showEditor && (
              <MessageEditor
                templateId={previewId}
                category={activeCategory}
                quickCodeGroups={quickCodeGroups}
              />
            )}

            {/* Info strip */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2.5">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>Business details are pulled from <strong>Management → Business Details</strong>. Update your logo, ABN, and contact info there to see them reflected here.</span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
