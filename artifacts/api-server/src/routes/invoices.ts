import { Router, type IRouter } from "express";
import { db, invoicesTable, customersTable, merchantsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { sendEmail } from "../services/email";
import { computeNextSendDate } from "../services/recurringInvoiceScheduler";

const router: IRouter = Router();

type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };
type InvoiceEvent = { type: string; timestamp: string; detail?: string };

function customerName(first: string | null, last: string | null): string | null {
  const n = [first, last].filter(Boolean).join(" ");
  return n || null;
}

function fmt(
  inv: typeof invoicesTable.$inferSelect,
  cFirst?: string | null,
  cLast?: string | null,
  cEmail?: string | null,
  cPhone?: string | null,
  cAddress?: string | null,
  cCompany?: string | null,
  cBillingStreet?: string | null,
  cBillingCity?: string | null,
  cBillingState?: string | null,
  cBillingPostcode?: string | null,
) {
  const isRecurring = inv.isRecurring === "true";
  const nextSendDate =
    isRecurring && inv.recurringStartDate
      ? computeNextSendDate(inv.recurringStartDate, inv.recurringFrequency ?? "monthly").toISOString()
      : null;

  const billingParts = [cBillingStreet, cBillingCity, cBillingState, cBillingPostcode].filter(Boolean);
  const customerAddress = billingParts.length ? billingParts.join(", ") : (cAddress ?? null);

  return {
    ...inv,
    subtotal: parseFloat(inv.subtotal),
    taxTotal: parseFloat(inv.taxTotal),
    total: parseFloat(inv.total),
    items: (inv.items as LineItem[] | null) ?? [],
    events: (inv.events as InvoiceEvent[] | null) ?? [],
    dueDate: inv.dueDate?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    viewedAt: inv.viewedAt?.toISOString() ?? null,
    isRecurring,
    recurringFrequency: inv.recurringFrequency ?? null,
    recurringOccurrences: inv.recurringOccurrences ?? null,
    recurringStartDate: inv.recurringStartDate?.toISOString() ?? null,
    nextSendDate,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    customerName: customerName(cFirst ?? null, cLast ?? null),
    customerEmail: cEmail ?? null,
    customerPhone: cPhone ?? null,
    customerAddress,
    customerCompany: cCompany ?? null,
  };
}

async function appendInvoiceEvent(id: number, merchantId: number, event: InvoiceEvent) {
  const [row] = await db
    .select({ events: invoicesTable.events })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!row) return;
  const events: InvoiceEvent[] = [...((row.events as InvoiceEvent[] | null) ?? []), event];
  await db.update(invoicesTable).set({ events }).where(eq(invoicesTable.id, id));
}

// GET /invoices
router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { status, limit = 50, offset = 0 } = req.query as Record<string, string>;
  const merchantId = req.session.merchantId!;
  const conditions = [eq(invoicesTable.merchantId, merchantId)];
  if (status) conditions.push(eq(invoicesTable.status, status));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoicesTable)
    .where(and(...conditions));

  const rows = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(...conditions))
    .orderBy(desc(invoicesTable.createdAt))
    .limit(parseInt(String(limit)))
    .offset(parseInt(String(offset)));

  res.json({
    items: rows.map((r) => fmt(r.invoice, r.customerFirstName, r.customerLastName, r.customerEmail, r.customerPhone, r.customerAddress, r.customerCompany, r.customerBillingStreet, r.customerBillingCity, r.customerBillingState, r.customerBillingPostcode)),
    total: Number(countResult.count),
  });
});

// GET /invoices/:id
router.get("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const merchantId = req.session.merchantId!;

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));

  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode));
});

// POST /invoices
router.post("/invoices", requireAuth, async (req, res): Promise<void> => {
  const {
    customerId,
    dueDate,
    notes,
    items: lineItems,
    invoicePrefix,
    invoiceDigits,
    recurring,
  } = req.body as {
    customerId?: number;
    dueDate?: string;
    notes?: string;
    items?: LineItem[];
    invoicePrefix?: string;
    invoiceDigits?: number;
    recurring?: { frequency: string; startDate?: string | null; occurrences?: number };
  };

  const merchantId = req.session.merchantId!;
  const lines: LineItem[] = lineItems ?? [];
  // Prices are GST-inclusive (Australian standard): extract tax from price
  const total    = lines.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxTotal = lines.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.taxRate ?? 0) / (100 + (i.taxRate ?? 0))), 0);
  const subtotal = total - taxTotal;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoicesTable)
    .where(eq(invoicesTable.merchantId, merchantId));

  const prefix = (invoicePrefix ?? "KI").toUpperCase();
  const digits = Math.max(1, Math.min(10, invoiceDigits ?? 5));
  const invNumber = `${prefix}${String(Number(countRow.count) + 1).padStart(digits, "0")}`;

  const [inv] = await db.insert(invoicesTable).values({
    merchantId,
    customerId: customerId ?? null,
    invoiceNumber: invNumber,
    status: "draft",
    subtotal: String(subtotal),
    taxTotal: String(taxTotal),
    total: String(total),
    items: lines.length ? lines : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    notes: notes ?? null,
    isRecurring: recurring ? "true" : "false",
    recurringFrequency: recurring?.frequency ?? null,
    recurringOccurrences: recurring?.occurrences ?? null,
    recurringStartDate: recurring?.startDate ? new Date(recurring.startDate) : null,
  }).returning();

  // Fetch with full customer details
  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.id, inv.id));

  res.status(201).json(row ? fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode) : fmt(inv));
});

// PATCH /invoices/:id/viewed
router.patch("/invoices/:id/viewed", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const merchantId = req.session.merchantId!;

  const [existing] = await db
    .select({ events: invoicesTable.events })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const events: InvoiceEvent[] = [
    ...((existing.events as InvoiceEvent[] | null) ?? []),
    { type: "viewed", timestamp: new Date().toISOString() },
  ];
  await db
    .update(invoicesTable)
    .set({ viewedAt: new Date(), events })
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode));
});

// PATCH /invoices/:id
router.patch("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const { status, notes, dueDate, customerId, items, recurring } = req.body as {
    status?: string; notes?: string; dueDate?: string;
    customerId?: number | null; items?: LineItem[];
    recurring?: { enabled: boolean; frequency?: string; startDate?: string | null; occurrences?: number } | null;
  };
  const updates: Record<string, unknown> = {};
  if (status) {
    updates.status = status;
    if (status === "paid") updates.paidAt = new Date();
    else updates.paidAt = null;
  }
  if (notes !== undefined) updates.notes = notes;
  if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
  if (customerId !== undefined) updates.customerId = customerId ?? null;
  if (items !== undefined) {
    const lines: LineItem[] = items;
    const total    = lines.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxTotal = lines.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.taxRate ?? 0) / (100 + (i.taxRate ?? 0))), 0);
    const subtotal = total - taxTotal;
    updates.items    = lines.length ? lines : null;
    updates.subtotal = String(subtotal);
    updates.taxTotal = String(taxTotal);
    updates.total    = String(total);
  }
  if (recurring !== undefined) {
    updates.isRecurring = recurring?.enabled ? "true" : "false";
    updates.recurringFrequency = recurring?.enabled ? (recurring.frequency ?? null) : null;
    updates.recurringOccurrences = recurring?.enabled ? (recurring.occurrences ?? null) : null;
    updates.recurringStartDate = recurring?.enabled && recurring.startDate ? new Date(recurring.startDate) : null;
  }
  const [inv] = await db
    .update(invoicesTable)
    .set(updates)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.id, id));

  res.json(row ? fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail) : fmt(inv));
});

// DELETE /invoices/:id
router.delete("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

// POST /invoices/:id/send-email
router.post("/invoices/:id/send-email", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const merchantId = req.session.merchantId!;
  const { email } = req.body as { email: string };
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));

  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const bizName = merchant?.businessName ?? "KoaPOS";
  const inv = row.invoice;
  const cName = customerName(row.customerFirstName, row.customerLastName);
  const lines = (inv.items as LineItem[] | null) ?? [];

  const itemRows = lines.map((l) =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${l.description}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${l.quantity}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;">$${(l.quantity * l.unitPrice).toFixed(2)}</td>
    </tr>`
  ).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#222;">
      <h2 style="margin:0 0 4px;">${bizName}</h2>
      <p style="margin:0 0 4px;color:#888;font-size:13px;">Invoice ${inv.invoiceNumber}</p>
      ${cName ? `<p style="margin:0 0 24px;color:#888;font-size:13px;">To: ${cName}</p>` : ""}
      ${inv.dueDate ? `<p style="margin:0 0 24px;color:#888;font-size:13px;">Due: ${new Date(inv.dueDate).toLocaleDateString()}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Description</th>
            <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Qty</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="margin-top:16px;text-align:right;font-size:13px;color:#555;">
        <div>Subtotal: $${parseFloat(inv.subtotal).toFixed(2)}</div>
        <div>Tax: $${parseFloat(inv.taxTotal).toFixed(2)}</div>
        <div style="font-size:16px;font-weight:bold;margin-top:8px;">Total: $${parseFloat(inv.total).toFixed(2)}</div>
      </div>
      ${inv.notes ? `<p style="margin-top:24px;font-size:13px;color:#555;border-top:1px solid #eee;padding-top:16px;">${inv.notes}</p>` : ""}
      <p style="margin-top:32px;font-size:12px;color:#aaa;text-align:center;">Thank you for your business!</p>
    </div>`;

  const result = await sendEmail(merchantId, {
    to: email,
    subject: `Invoice ${inv.invoiceNumber} from ${bizName}`,
    html,
    text: `Invoice ${inv.invoiceNumber} from ${bizName}\nTotal: $${parseFloat(inv.total).toFixed(2)}\n\nThank you for your business!`,
  });

  if (!result.success) {
    req.log.warn({ invoiceId: id, email, error: result.error }, "Invoice email failed");
    res.status(400).json({ error: result.error ?? "Failed to send invoice email" });
    return;
  }

  // Mark as sent if still draft
  if (inv.status === "draft") {
    await db.update(invoicesTable).set({ status: "sent" }).where(eq(invoicesTable.id, id));
  }

  await appendInvoiceEvent(id, merchantId, { type: "email", timestamp: new Date().toISOString(), detail: email });

  req.log.info({ invoiceId: id, email }, "Invoice emailed");
  res.json({ success: true });
});

// POST /invoices/:id/event  — record a client-side event (download, print, etc.)
router.post("/invoices/:id/event", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const merchantId = req.session.merchantId!;
  const { type, detail } = req.body as { type: string; detail?: string };
  if (!type) { res.status(400).json({ error: "type is required" }); return; }

  const [existing] = await db
    .select({ events: invoicesTable.events })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const events: InvoiceEvent[] = [
    ...((existing.events as InvoiceEvent[] | null) ?? []),
    { type, timestamp: new Date().toISOString(), ...(detail ? { detail } : {}) },
  ];
  await db.update(invoicesTable).set({ events }).where(eq(invoicesTable.id, id));

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode));
});

export default router;
