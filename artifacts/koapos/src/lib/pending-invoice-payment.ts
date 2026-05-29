export type PendingInvoicePayment = {
  invoiceId: number;
  invoiceNumber: string;
  balance: number;
  customerId: number | null;
  customerName: string | null;
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
