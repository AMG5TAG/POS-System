/**
 * InvoiceSendDialog — a self-contained wrapper around the shared `SendDialog`
 * that can send an invoice by Email, SMS, or Print given only its id. It fetches
 * the full invoice itself, so any screen (e.g. a product's Sales History) can
 * open the send window without owning invoice/template/merchant state.
 *
 * Email + Print reuse the same flow as the Invoices page (branded PDF email;
 * client-side templated print). SMS posts to /invoices/:id/send-sms.
 */
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useGetInvoice, useSendInvoiceEmail, useSendInvoiceSms, useAddInvoiceEvent,
  useGetMerchant, getGetInvoiceQueryKey, type Invoice, type Transaction,
} from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { useSalesTemplate } from "@/lib/use-sales-template";
import { useDocumentTemplate } from "@/lib/use-document-template";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SendDialog, type SendMethodKey } from "@/components/send/send-dialog";

/* Adapt an invoice to the shared `Transaction` shape the print templates expect.
   Mirrors the mapping on the Invoices page. */
function invoiceToTransaction(inv: Invoice): Transaction {
  return {
    id: inv.id,
    merchantId: 0,
    customerId: inv.customerId ?? null,
    customer: (inv.customerName || inv.customerEmail)
      ? ({ firstName: inv.customerName ?? "", lastName: "", email: inv.customerEmail ?? "", phone: inv.customerPhone ?? "" } as unknown as Transaction["customer"])
      : undefined,
    receiptNumber: inv.invoiceNumber,
    status: inv.status as unknown as Transaction["status"],
    // buildInvoiceHtml derives the ex-GST subtotal as (subtotal - taxTotal), and
    // Invoice.subtotal is already GST-exclusive, so pass a GST-inclusive subtotal.
    subtotal: inv.subtotal + inv.taxTotal,
    taxTotal: inv.taxTotal,
    discountTotal: inv.discountTotal ?? 0,
    total: inv.total,
    paymentMethod: "" as unknown as Transaction["paymentMethod"],
    items: (inv.items ?? []).map((l) => ({
      productId: 0,
      productName: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      totalPrice: l.quantity * l.unitPrice,
    })),
    createdAt: inv.createdAt,
    amountPaid: inv.amountPaid,
    invoiceNumber: inv.invoiceNumber,
    discountLabel: inv.discountTotal
      ? `Discount${inv.discountType === "percent" && inv.discountValue ? ` (${inv.discountValue}%)` : ""}`
      : undefined,
  } as Transaction;
}

export function InvoiceSendDialog({
  invoiceId, open, onOpenChange, initialMethod = null,
}: {
  invoiceId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMethod?: SendMethodKey | null;
}) {
  const queryClient = useQueryClient();
  const { data: invoice } = useGetInvoice(invoiceId ?? 0, { query: { enabled: invoiceId != null, queryKey: getGetInvoiceQueryKey(invoiceId ?? 0) } });
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();
  const { opts: invoiceOpts } = useSalesTemplate("Invoice");
  const { printInvoice: printInvoiceTpl } = useDocumentTemplate();
  const sendEmailMutation = useSendInvoiceEmail();
  const sendSmsMutation = useSendInvoiceSms();
  const addEventMutation = useAddInvoiceEvent();

  const [emailSubject, setEmailSubject] = useState("");

  // Seed the email subject once the invoice (and business name) are known.
  useEffect(() => {
    if (open && invoice) {
      const bizName = merchant?.businessName ?? "Your Business";
      setEmailSubject(`Invoice ${invoice.invoiceNumber} from ${bizName}`);
    }
  }, [open, invoice, merchant?.businessName]);

  const emailTemplatePayload = () => ({
    templateId: "e-pro",
    subjectLine:      emailSubject.trim() || invoiceOpts.subjectLine,
    customGreeting:   invoiceOpts.customGreeting,
    customMessage:    invoiceOpts.customMessage,
    customSignOff:    invoiceOpts.customSignOff,
    footerText:       invoiceOpts.footerText,
    thankYouMsg:      invoiceOpts.thankYouMsg,
    showGstBreakdown: invoiceOpts.showGstBreakdown,
    showWebsite:      invoiceOpts.showWebsite,
    showSocialLinks:  invoiceOpts.showSocialLinks,
    showLogo:         invoiceOpts.showLogo,
    brandColor:       profile.brandColors?.[0] ?? "#4f46e5",
    logo:             profile.logo ?? "",
    website:          profile.website ?? "",
    contactEmail:     profile.contactEmail ?? "",
    tagline:          profile.tagline ?? "",
    socialLinks:      profile.socialLinks ?? {},
  });

  const recordEvent = async (type: string, detail?: string) => {
    if (!invoice) return;
    try {
      await addEventMutation.mutateAsync({ id: invoice.id, data: { type, detail } as Parameters<typeof addEventMutation.mutateAsync>[0]["data"] });
      queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoice.id) });
    } catch { /* event recording is best-effort */ }
  };

  const onEmail = async (email: string) => {
    if (!invoice) { toast.error("Invoice still loading — try again in a moment."); return; }
    await sendEmailMutation.mutateAsync({
      id: invoice.id,
      data: { email, template: emailTemplatePayload() } as Parameters<typeof sendEmailMutation.mutateAsync>[0]["data"],
    });
    toast.success("Invoice emailed");
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoice.id) });
  };

  const onSms = async (phone: string) => {
    if (!invoice) { toast.error("Invoice still loading — try again in a moment."); return; }
    await sendSmsMutation.mutateAsync({ id: invoice.id, data: { phone } });
    toast.success("Invoice sent by SMS");
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoice.id) });
  };

  const onReprint = () => {
    if (!invoice) { toast.error("Invoice still loading — try again in a moment."); return; }
    printInvoiceTpl(invoiceToTransaction(invoice));
    void recordEvent("print");
  };

  return (
    <SendDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send Invoice"
      documentLabel={invoice?.invoiceNumber}
      initialMethod={initialMethod}
      reprintLabel="Print"
      reprintSub="Print to printer"
      reprintButtonLabel="Print Invoice"
      reprintHint={invoice ? <>This will open a print preview for invoice <strong>{invoice.invoiceNumber}</strong>.</> : "Loading invoice…"}
      onReprint={onReprint}
      defaultEmail={invoice?.customerEmail ?? ""}
      emailHint="A PDF copy of the invoice will be attached."
      emailExtra={
        <div className="space-y-1.5">
          <Label className="text-xs">Subject</Label>
          <Input type="text" placeholder="Invoice subject…" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
        </div>
      }
      onEmail={onEmail}
      defaultPhone={invoice?.customerPhone ?? ""}
      smsHint="Sends a short SMS with the invoice number and amount."
      onSms={onSms}
    />
  );
}
