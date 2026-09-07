import { useGetMerchant, useListProducts, useGetPosSettings } from "@workspace/api-client-react";
import type { Transaction } from "@workspace/api-client-react";
import { useSalesTemplate } from "@/lib/use-sales-template";
import { useBusinessProfile } from "@/lib/business-profile";
import { warrantyLabel } from "@/lib/warranty";
import { parseHardwareConfig, type PrintPurpose } from "@/lib/hardware-config";
import { printThermalReceipt } from "@/lib/thermal-printer";
import {
  printA4Invoice as rawPrintA4Invoice,
  printA4Quote as rawPrintA4Quote,
  printA4Receipt as rawPrintA4Receipt,
  printA4ServiceJob as rawPrintA4ServiceJob,
  normalizeReceiptStyle,
  type PrintRoute,
  type ReceiptBusinessInfo,
  type ReceiptTemplateOpts,
  type ServiceJobPrintData,
} from "@/lib/print-receipt";
import type { CustomerPdfTemplate } from "@/lib/customer-pdf";
import type { TplOpts } from "@/pages/app/management-templates";

/** Shape of the optional `template` on the send-invoice-email request. */
export interface InvoiceEmailTemplatePayload {
  templateId: string;
  subjectLine: string;
  customGreeting: string;
  customMessage: string;
  customSignOff: string;
  footerText: string;
  thankYouMsg: string;
  showGstBreakdown: boolean;
  showWebsite: boolean;
  showSocialLinks: boolean;
  showLogo: boolean;
  brandColor: string;
  logo: string;
  website: string;
  contactEmail: string;
  tagline: string;
  socialLinks: Record<string, string>;
}

/** Business-level extras (style + chips/socials) layered onto the template opts. */
interface ReceiptOptsExtra {
  styleVariant?: ReceiptTemplateOpts["styleVariant"];
  socialLinks?: Record<string, string>;
  paymentTypes?: string[];
  overallDiscountPct?: number;
}

/**
 * Maps a saved Sales Template (`TplOpts`) onto the subset of options the
 * print utilities understand (`ReceiptTemplateOpts`). `fontCss` is the
 * resolved CSS font-family string from `useSalesTemplate`. `extra` carries
 * the resolved layout style and business-level chips/socials.
 */
function toReceiptOpts(opts: TplOpts, fontCss: string, extra?: ReceiptOptsExtra): ReceiptTemplateOpts {
  return {
    showLogo: opts.showLogo,
    showAbn: opts.showAbn,
    showGstBreakdown: opts.showGstBreakdown,
    showWebsite: opts.showWebsite,
    showPaymentMethods: opts.showPaymentMethods,
    showCustomerQr: opts.showCustomerQr,
    showCustomQr: opts.showCustomQr,
    customQrImage: opts.customQrImage,
    customQrData: opts.customQrData,
    customQrCaption: opts.customQrCaption,
    showLoyaltyEarned: opts.showLoyaltyEarned,
    showBarcode: opts.showBarcode,
    showSerialNumber: opts.showSerialNumber,
    printCustomerCopy: opts.printCustomerCopy,
    thankYouMsg: opts.thankYouMsg,
    footerText: opts.footerText,
    headerText: opts.headerText,
    customMessage: opts.customMessage,
    loyaltyQrText: opts.loyaltyQrText,
    fontFamily: fontCss,
    // A4 Receipt / Invoice layout + extended toggles
    showTagline: opts.showTagline,
    showAllCustomerDetails: opts.showAllCustomerDetails,
    showSocialLinks: opts.showSocialLinks,
    paymentTerms: opts.paymentTerms,
    invoiceNotes: opts.invoiceNotes,
    bankDetails: opts.bankDetails,
    paymentSectionHeading: opts.paymentSectionHeading,
    styleVariant: extra?.styleVariant,
    socialLinks: extra?.socialLinks,
    paymentTypes: extra?.paymentTypes,
    overallDiscountPct: extra?.overallDiscountPct,
    // Service Ticket field-visibility toggles
    showCustomerDetails: opts.showCustomerDetails,
    showDeviceDetails: opts.showDeviceDetails,
    showWorkDescription: opts.showWorkDescription,
    warrantyText: opts.warrantyText,
    showServiceQr: opts.showServiceQr,
  };
}

export interface DocumentTemplateController {
  /** True while any of the underlying template / profile / merchant queries are loading. */
  isLoading: boolean;
  /** Business identity (name, ABN, website, email, brand colour) shared by every document. */
  businessInfo: ReceiptBusinessInfo;
  /** Print an 80mm thermal receipt using the saved Thermal_Receipt template. */
  printReceipt: (tx: Transaction) => Promise<void>;
  /** Same receipt, routed at the "Refund receipt" printer instead of the sale one. */
  printRefundReceipt: (tx: Transaction) => Promise<void>;
  /** Print an A4 tax invoice using the saved Invoice template. */
  printInvoice: (tx: Transaction) => void;
  /** Print an A4 quote using the saved Quote template (same layout, "Quote" heading). */
  printQuote: (tx: Transaction) => void;
  /** Print an A4 receipt using the saved A4_Receipt template.
   *  Pass `overallDiscountPct` (e.g. 10 for 10%) when the cart discount was
   *  entered as a percentage so the receipt label reads "10% discount". */
  printA4Receipt: (tx: Transaction, overallDiscountPct?: number) => Promise<void>;
  /** Print an A4 service report using the saved Service_Ticket template. */
  printServiceJob: (
    job: ServiceJobPrintData,
    customerOverride?: { name?: string; email?: string; phone?: string },
  ) => void;
  /**
   * Payload for `POST /invoices/:id/email` — the saved **Email** template's
   * wording, style and branding. `subject` overrides the template's subject line
   * when the send dialog has one typed for this send.
   *
   * The server resolves the same row when a caller sends nothing (auto-send, the
   * reminder scheduler), so this only has to carry what the operator changed.
   */
  invoiceEmailTemplate: (subject?: string) => InvoiceEmailTemplatePayload;
  /** The saved Customer_PDF template, shaped for `exportCustomerPDF`. Unlike the
   *  printers above, the PDF builder is called directly by the customers page —
   *  the mapping lives here so every document still resolves its template in one
   *  place. */
  customerPdfTemplate: CustomerPdfTemplate;
}

/**
 * Centralized print/email controller. Any module that needs to print or send a
 * customer document should use this hook instead of calling the low-level
 * `print-receipt` utilities directly — it guarantees the active Sales Template
 * (Management > Sales Templates) layout, fonts and field-visibility toggles are
 * applied, with clean fallbacks when a template hasn't been configured yet.
 *
 * Future document types should be added here (and to `useSalesTemplate`) so the
 * whole app stays wired to the centralized template system from one place.
 */
export function useDocumentTemplate(): DocumentTemplateController {
  const receipt = useSalesTemplate("Thermal_Receipt");
  const invoice = useSalesTemplate("Invoice");
  const quote = useSalesTemplate("Quote");
  const a4Receipt = useSalesTemplate("A4_Receipt");
  const service = useSalesTemplate("Service_Ticket");
  const customerPdf = useSalesTemplate("Customer_PDF");
  const email = useSalesTemplate("Email");
  const { profile, isLoading: profileLoading } = useBusinessProfile();
  const { data: merchant, isLoading: merchantLoading } = useGetMerchant();
  const { data: productsData } = useListProducts(undefined, { query: { queryKey: ["products"] } });
  // Register hardware config drives native ESC/POS printing (Partner Tech RP-700
  // etc.) when a printer is connected over USB/serial; otherwise printReceipt
  // falls back to the HTML print path.
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const hardware = parseHardwareConfig((posSettings as { hardwareConfig?: string } | undefined)?.hardwareConfig);

  // Warranty is computed at print time from each product's current setting.
  // Sold line items carry productId, so we attach a warranty label per item
  // without ever touching the POS sale path.
  const warrantyByProductId = new Map<number, string>();
  for (const p of (productsData?.items ?? []) as Array<{ id: number; warrantyDuration?: number | null; warrantyUnit?: string | null }>) {
    const label = warrantyLabel(p.warrantyDuration, p.warrantyUnit);
    if (label) warrantyByProductId.set(p.id, label);
  }
  const withWarranty = (tx: Transaction): Transaction => {
    const items = ((tx.items ?? []) as Array<{ productId?: number | null; warranty?: string | null }>).map((it) => {
      const label = it.productId != null ? warrantyByProductId.get(it.productId) : undefined;
      return label ? { ...it, warranty: label } : it;
    });
    return { ...tx, items } as Transaction;
  };

  const m = merchant as { phone?: string | null; address?: string | null; city?: string | null; partnerReferralCode?: string | null } | undefined;
  const p = profile as { state?: string | null; postcode?: string | null } | undefined;
  const businessInfo: ReceiptBusinessInfo = {
    businessName: merchant?.businessName ?? "Your Business",
    abn: profile?.abn ?? "",
    website: profile?.website ?? "",
    email: profile?.contactEmail ?? "",
    brandColor: (profile?.brandColors ?? [])[0] ?? "",
    tagline: profile?.tagline ?? "",
    logo: profile?.logo ?? "",
    phone: m?.phone ?? "",
    address: [m?.address, m?.city, p?.state, p?.postcode].filter(Boolean).join(", "),
    partnerReferralCode: m?.partnerReferralCode ?? "",
  };

  const isLoading =
    receipt.isLoading ||
    invoice.isLoading ||
    quote.isLoading ||
    a4Receipt.isLoading ||
    service.isLoading ||
    customerPdf.isLoading ||
    email.isLoading ||
    profileLoading ||
    merchantLoading;

  /** Route descriptor for a purpose, so each document lands on its own printer. */
  const route = (purpose: PrintPurpose): PrintRoute => ({ purpose, hw: hardware });

  const thermalReceipt = (tx: Transaction, purpose: PrintPurpose) =>
    printThermalReceipt(withWarranty(tx), businessInfo, toReceiptOpts(receipt.opts, receipt.fontCss, {
      overallDiscountPct: (tx as { discountPct?: number | null }).discountPct ?? undefined,
    }), hardware, purpose).then(() => { /* method (usb/serial/bridge/html) is internal */ });

  const invoiceEmailTemplate = (subject?: string): InvoiceEmailTemplatePayload => ({
    // The Email template's style ids (e-pro / e-casual / e-minimal) pick the
    // email layout server-side.
    templateId:       email.selectedStyle || "e-pro",
    subjectLine:      subject?.trim() || email.opts.subjectLine,
    customGreeting:   email.opts.customGreeting,
    customMessage:    email.opts.customMessage,
    customSignOff:    email.opts.customSignOff,
    footerText:       email.opts.footerText,
    thankYouMsg:      email.opts.thankYouMsg,
    showGstBreakdown: email.opts.showGstBreakdown,
    showWebsite:      email.opts.showWebsite,
    showSocialLinks:  email.opts.showSocialLinks,
    showLogo:         email.opts.showLogo,
    brandColor:       businessInfo.brandColor || "#4f46e5",
    logo:             businessInfo.logo || "",
    website:          businessInfo.website || "",
    contactEmail:     businessInfo.email || "",
    tagline:          businessInfo.tagline || "",
    socialLinks:      profile?.socialLinks ?? {},
  });

  const customerPdfTemplate: CustomerPdfTemplate = {
    brandColor: businessInfo.brandColor || null,
    logoUrl: businessInfo.logo || null,
    showLogo: customerPdf.opts.showLogo,
    // The PDF maps this to its nearest built-in family, so pass the stored key.
    fontFamily: customerPdf.fontFamily,
    headerText: customerPdf.opts.headerText,
    footerText: customerPdf.opts.footerText,
    showCustomQr: customerPdf.opts.showCustomQr,
    customQrImage: customerPdf.opts.customQrImage,
    customQrCaption: customerPdf.opts.customQrCaption,
    sections: {
      transactions:    customerPdf.opts.showTransactions,
      appointments:    customerPdf.opts.showAppointments,
      serviceJobs:     customerPdf.opts.showServiceJobs,
      notes:           customerPdf.opts.showNotes,
      formSubmissions: customerPdf.opts.showFormSubmissions,
      warningNote:     customerPdf.opts.showWarningNote,
      internalNotes:   customerPdf.opts.showInternalNotes,
    },
  };

  return {
    isLoading,
    businessInfo,
    invoiceEmailTemplate,
    customerPdfTemplate,
    printReceipt: (tx) => thermalReceipt(tx, "receipt"),
    printRefundReceipt: (tx) => thermalReceipt(tx, "refund"),
    printInvoice: (tx) =>
      rawPrintA4Invoice(withWarranty(tx), businessInfo, toReceiptOpts(invoice.opts, invoice.fontCss, {
        overallDiscountPct: (tx as { discountPct?: number | null }).discountPct ?? undefined,
      }), route("invoice")),
    printQuote: (tx) =>
      rawPrintA4Quote(tx, businessInfo, toReceiptOpts(quote.opts, quote.fontCss, {
        overallDiscountPct: (tx as { discountPct?: number | null }).discountPct ?? undefined,
      }), route("quote")),
    printA4Receipt: (tx, overallDiscountPct) =>
      rawPrintA4Receipt(
        withWarranty(tx),
        businessInfo,
        toReceiptOpts(a4Receipt.opts, a4Receipt.fontCss, {
          styleVariant: normalizeReceiptStyle(a4Receipt.selectedStyle),
          socialLinks: profile?.socialLinks,
          paymentTypes: profile?.paymentTypes,
          overallDiscountPct: overallDiscountPct ?? (tx as { discountPct?: number | null }).discountPct ?? undefined,
        }),
        route("a4Receipt"),
      ),
    printServiceJob: (job, customerOverride) =>
      rawPrintA4ServiceJob(
        job,
        businessInfo,
        customerOverride,
        toReceiptOpts(service.opts, service.fontCss),
        route("serviceJobSheet"),
      ),
  };
}
