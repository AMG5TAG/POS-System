export type PendingInvoicePayment = {
  invoiceId: number;
  invoiceNumber: string;
  /* Full outstanding balance on the invoice (for display). */
  balance: number;
  /* Amount to charge at the terminal — a partial payment when less than the
     balance. Defaults to the full balance when omitted (backwards compatible). */
  amount?: number;
  customerId: number | null;
  customerName: string | null;
  /* Contact details carried through so the POS receipt dialog can prefill
     the Email / SMS fields for the invoiced customer. */
  customerEmail: string | null;
  customerPhone: string | null;
};

let _pending: PendingInvoicePayment | null = null;

export function setPendingInvoicePayment(data: PendingInvoicePayment): void {
  _pending = data;
}

export function takePendingInvoicePayment(): PendingInvoicePayment | null {
  const v = _pending;
  _pending = null;
  return v;
}
