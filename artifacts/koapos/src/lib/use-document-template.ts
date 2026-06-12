import { useGetMerchant, useListProducts } from "@workspace/api-client-react";
import type { Transaction } from "@workspace/api-client-react";
import { useSalesTemplate } from "@/lib/use-sales-template";
import { useBusinessProfile } from "@/lib/business-profile";
import { warrantyLabel } from "@/lib/warranty";
import {
  printReceipt as rawPrintReceipt,
  printA4Invoice as rawPrintA4Invoice,
  printA4Quote as rawPrintA4Quote,
  printA4Receipt as rawPrintA4Receipt,
  printA4ServiceJob as rawPrintA4ServiceJob,
  normalizeReceiptStyle,
  type ReceiptBusinessInfo,
  type ReceiptTemplateOpts,
  type ServiceJobPrintData,
} from "@/lib/print-receipt";
import type { TplOpts } from "@/pages/app/management-templates";

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
    showLoyaltyEarned: opts.showLoyaltyEarned,
    showBarcode: opts.showBarcode,
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
  };
}

export interface DocumentTemplateController {
  /** True while any of the underlying template / profile / merchant queries are loading. */
  isLoading: boolean;
  /** Business identity (name, ABN, website, email, brand colour) shared by every document. */
  businessInfo: ReceiptBusinessInfo;
  /** Print an 80mm thermal receipt using the saved Thermal_Receipt template. */
  printReceipt: (tx: Transaction) => Promise<void>;
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
  const { profile, isLoading: profileLoading } = useBusinessProfile();
  const { data: merchant, isLoading: merchantLoading } = useGetMerchant();
  const { data: productsData } = useListProducts(undefined, { query: { queryKey: ["products"] } });

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

  const businessInfo: ReceiptBusinessInfo = {
    businessName: merchant?.businessName ?? "Your Business",
    abn: profile?.abn ?? "",
    website: profile?.website ?? "",
    email: profile?.contactEmail ?? "",
    brandColor: (profile?.brandColors ?? [])[0] ?? "",
    tagline: profile?.tagline ?? "",
    logo: profile?.logo ?? "",
  };

  const isLoading =
    receipt.isLoading ||
    invoice.isLoading ||
    quote.isLoading ||
    a4Receipt.isLoading ||
    service.isLoading ||
    profileLoading ||
    merchantLoading;

  return {
    isLoading,
    businessInfo,
    printReceipt: (tx) =>
      rawPrintReceipt(withWarranty(tx), businessInfo, toReceiptOpts(receipt.opts, receipt.fontCss, {
        overallDiscountPct: (tx as { discountPct?: number | null }).discountPct ?? undefined,
      })),
    printInvoice: (tx) =>
      rawPrintA4Invoice(withWarranty(tx), businessInfo, toReceiptOpts(invoice.opts, invoice.fontCss, {
        overallDiscountPct: (tx as { discountPct?: number | null }).discountPct ?? undefined,
      })),
    printQuote: (tx) =>
      rawPrintA4Quote(tx, businessInfo, toReceiptOpts(quote.opts, quote.fontCss, {
        overallDiscountPct: (tx as { discountPct?: number | null }).discountPct ?? undefined,
      })),
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
      ),
    printServiceJob: (job, customerOverride) =>
      rawPrintA4ServiceJob(
        job,
        businessInfo,
        customerOverride,
        toReceiptOpts(service.opts, service.fontCss),
      ),
  };
}
