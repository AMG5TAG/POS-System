import jsPDF from "jspdf";
import type { Customer, CustomerNote, Transaction, Appointment, ServiceJob } from "@workspace/api-client-react";
import type { FormSubmission, FormTemplate } from "@/lib/forms-api";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-AU");
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-AU");
}

function fmtCurrency(v: number | string | null | undefined): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function isMergeNote(note: string): boolean {
  return note.startsWith("[System] Profile merged");
}

type ParsedMerge = {
  date: string;
  absorbedId: string;
  absorbedName: string;
  loyaltyLine: string;
  reason: string;
};

function parseMergeNote(note: string): ParsedMerge | null {
  const dateMatch   = note.match(/merged on ([^.]+)\./);
  const idNameMatch = note.match(/Profile ID:\s*(\d+)\s*\(([^)]+)\)/);
  const loyaltyMatch = note.match(/Loyalty consolidated:\s*([^R]+?)(?:\s+Reason:|$)/);
  const reasonMatch = note.match(/Reason:\s*(.+)$/);
  if (!dateMatch || !idNameMatch) return null;
  return {
    date:         dateMatch[1].trim(),
    absorbedId:   idNameMatch[1].trim(),
    absorbedName: idNameMatch[2].trim(),
    loyaltyLine:  loyaltyMatch ? loyaltyMatch[1].trim() : "",
    reason:       reasonMatch ? reasonMatch[1].trim() : "",
  };
}

/* ── Colour palette ──────────────────────────────────────────────────────── */

const C = {
  primary:    [59,  130, 246] as [number, number, number],
  indigo:     [99,  102, 241] as [number, number, number],
  dark:       [17,  24,  39]  as [number, number, number],
  mid:        [75,  85,  99]  as [number, number, number],
  light:      [156, 163, 175] as [number, number, number],
  border:     [229, 231, 235] as [number, number, number],
  bg:         [249, 250, 251] as [number, number, number],
  indigoBg:   [238, 242, 255] as [number, number, number],
  white:      [255, 255, 255] as [number, number, number],
  red:        [220, 38,  38]  as [number, number, number],
  amber:      [217, 119, 6]   as [number, number, number],
};

/* ── Layout constants ────────────────────────────────────────────────────── */

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 14;
const MR = 14;
const CONTENT_W = PAGE_W - ML - MR;

/* ── PDF Builder ─────────────────────────────────────────────────────────── */

interface ExportOptions {
  customer: Customer;
  transactions: Transaction[];
  appointments: Appointment[];
  serviceJobs: ServiceJob[];
  notes: CustomerNote[];
  formSubmissions?: FormSubmission[];
  allForms?: FormTemplate[];
  merchantName?: string;
}

export function exportCustomerPDF(opts: ExportOptions): void {
  const { customer, transactions, appointments, serviceJobs, notes, formSubmissions, allForms, merchantName } = opts;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = 0;

  /* ── Utility ── */

  function checkPage(needed = 10): void {
    if (y + needed > PAGE_H - 16) {
      doc.addPage();
      y = 16;
    }
  }

  function hRule(color = C.border): void {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.25);
    doc.line(ML, y, ML + CONTENT_W, y);
  }

  function sectionHeading(title: string): void {
    checkPage(14);
    y += 6;
    doc.setFillColor(...C.primary);
    doc.roundedRect(ML, y, CONTENT_W, 7, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.text(title.toUpperCase(), ML + 3.5, y + 4.8);
    y += 9;
  }

  function infoRow(label: string, value: string | null | undefined, yRef: number): number {
    const v = value ?? "—";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.light);
    doc.text(label, ML + 2, yRef + 4.5);
    doc.setTextColor(...C.dark);
    const maxW = CONTENT_W - 46;
    const lines = doc.splitTextToSize(v, maxW) as string[];
    const rowH = Math.max(8, lines.length * 4.5 + 3);
    doc.text(lines, ML + 44, yRef + 4.5);
    hRule();
    return rowH;
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 1. Header                                                                */
  /* ──────────────────────────────────────────────────────────────────────── */

  // Blue header bar
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PAGE_W, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...C.white);
  doc.text(merchantName ?? "KoaPOS", ML, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Customer History Export", ML, 19);

  // Date stamp top-right
  doc.setFontSize(8);
  const exportDate = new Date().toLocaleString("en-AU");
  const dateW = doc.getStringUnitWidth(exportDate) * 8 * 0.352778;
  doc.text(exportDate, PAGE_W - MR - dateW, 19);

  y = 35;

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 2. Customer Info                                                         */
  /* ──────────────────────────────────────────────────────────────────────── */

  sectionHeading("Customer Information");

  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unknown";

  // Name avatar circle
  const avatarY = y;
  doc.setFillColor(...C.indigoBg);
  doc.circle(ML + 8, avatarY + 8, 8, "F");
  const initials = ((customer.firstName?.[0] ?? "") + (customer.lastName?.[0] ?? "")).toUpperCase() || "?";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C.indigo);
  const initW = doc.getStringUnitWidth(initials) * 10 * 0.352778;
  doc.text(initials, ML + 8 - initW / 2, avatarY + 9.5);

  // Name + ID beside avatar
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.dark);
  doc.text(fullName, ML + 20, avatarY + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.mid);
  const subLine = [
    customer.customerGroup && `${customer.customerGroup}`,
    `ID #${customer.id}`,
    customer.loyaltyPoints != null && `${customer.loyaltyPoints} pts`,
  ].filter(Boolean).join("  ·  ");
  doc.text(subLine, ML + 20, avatarY + 13);

  y = avatarY + 22;

  // Warning note
  if (customer.warningNote) {
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(ML, y, CONTENT_W, 9, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.red);
    doc.text("⚠  " + customer.warningNote, ML + 3, y + 5.8);
    y += 12;
  }

  // Info rows
  const infoFields: [string, string | null | undefined][] = [
    ["Email",          customer.email],
    ["Phone",          customer.phone],
    ["Company",        customer.company],
    ["ABN",            customer.abn],
    ["Date of Birth",  customer.dateOfBirth],
    ["Referred By",    customer.referredBy],
    ["Billing Address", [customer.billingStreet, customer.billingCity, customer.billingState, customer.billingPostcode, customer.billingCountry].filter(Boolean).join(", ") || customer.address || null],
    ["Shipping Address", [customer.shippingStreet, customer.shippingCity, customer.shippingState, customer.shippingPostcode, customer.shippingCountry].filter(Boolean).join(", ") || null],
    ["Marketing Consent", customer.agreedToMarketing === "true" ? "Agreed" : "Not agreed"],
    ["Loyalty Points", customer.loyaltyPoints != null ? String(customer.loyaltyPoints) : null],
    ["Visit Count",    customer.visitCount != null ? `${customer.visitCount} visits` : null],
    ["Total Spent",    customer.totalSpent != null ? fmtCurrency(customer.totalSpent) : null],
  ];

  doc.setFillColor(...C.bg);
  doc.roundedRect(ML, y, CONTENT_W, infoFields.length * 8, 1.5, 1.5, "F");

  for (const [label, value] of infoFields) {
    checkPage(10);
    const rowH = infoRow(label, value, y);
    y += rowH;
  }
  y += 2;

  // Internal notes
  if (customer.notes) {
    checkPage(16);
    doc.setFillColor(...C.bg);
    doc.roundedRect(ML, y, CONTENT_W, 14, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.mid);
    doc.text("Internal Notes", ML + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);
    const noteLines = doc.splitTextToSize(customer.notes, CONTENT_W - 6) as string[];
    doc.text(noteLines, ML + 3, y + 10);
    y += Math.max(14, noteLines.length * 4 + 10) + 4;
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 3. Transaction History                                                   */
  /* ──────────────────────────────────────────────────────────────────────── */

  sectionHeading(`Transaction History (${transactions.length})`);

  if (!transactions.length) {
    checkPage(10);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.light);
    doc.text("No transactions recorded.", ML + 3, y + 5);
    y += 10;
  } else {
    // Table header
    checkPage(10);
    const cols = { receipt: ML, date: ML + 30, method: ML + 72, status: ML + 112, total: ML + 145, items: ML + 168 };
    const colWs = { receipt: 28, date: 40, method: 38, status: 30, total: 22, items: CONTENT_W - 168 + ML - ML };

    doc.setFillColor(...C.primary);
    doc.roundedRect(ML, y, CONTENT_W, 6.5, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.text("Receipt #",   cols.receipt + 1, y + 4.3);
    doc.text("Date",        cols.date    + 1, y + 4.3);
    doc.text("Method",      cols.method  + 1, y + 4.3);
    doc.text("Status",      cols.status  + 1, y + 4.3);
    doc.text("Total",       cols.total   + 1, y + 4.3);
    y += 6.5;

    let rowBg = false;
    for (const tx of transactions) {
      const itemsSummary = Array.isArray(tx.items)
        ? (tx.items as Array<{ quantity: number; productName: string }>)
            .map(i => `${i.quantity}× ${i.productName}`)
            .join(", ")
        : "";
      const itemLines = itemsSummary
        ? doc.splitTextToSize(itemsSummary, CONTENT_W - 4) as string[]
        : [];
      const rowH = 6 + (itemLines.length > 0 ? itemLines.length * 3.5 + 1 : 0);

      checkPage(rowH + 2);

      if (rowBg) {
        doc.setFillColor(...C.bg);
        doc.rect(ML, y, CONTENT_W, rowH, "F");
      }
      rowBg = !rowBg;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.dark);

      doc.text(tx.receiptNumber || `#${tx.id}`, cols.receipt + 1, y + 4);
      doc.text(fmtDate(tx.createdAt),             cols.date    + 1, y + 4);
      doc.text(String(tx.paymentMethod || "—"),   cols.method  + 1, y + 4);

      // Status badge
      const statusText = String(tx.status ?? "").toUpperCase();
      const statusColor: [number, number, number] = tx.status === "completed"
        ? [220, 252, 231] : tx.status === "refunded" ? [254, 226, 226] : [243, 244, 246];
      const statusTextColor: [number, number, number] = tx.status === "completed"
        ? [22, 163, 74] : tx.status === "refunded" ? C.red : C.mid;
      const sw = doc.getStringUnitWidth(statusText) * 7 * 0.352778 + 4;
      doc.setFillColor(...statusColor);
      doc.roundedRect(cols.status + 1, y + 1, sw, 4.5, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...statusTextColor);
      doc.text(statusText, cols.status + 3, y + 4.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.dark);
      doc.text(fmtCurrency(tx.total), cols.total + 1, y + 4);

      if (itemLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...C.mid);
        doc.text(itemLines, ML + 2, y + 7.5);
      }

      // row separator
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.15);
      doc.line(ML, y + rowH, ML + CONTENT_W, y + rowH);

      y += rowH;
    }

    // Summary totals
    checkPage(22);
    y += 3;
    const totalSpent = transactions.reduce((s, tx) => s + parseFloat(String(tx.total ?? 0)), 0);
    const refunded   = transactions.filter(tx => tx.status === "refunded").length;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.mid);
    doc.text(`${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}  ·  ${refunded} refund${refunded !== 1 ? "s" : ""}  ·  Lifetime spend: ${fmtCurrency(totalSpent)}`, ML + 3, y + 4);
    y += 8;
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 4. Appointments (if any)                                                 */
  /* ──────────────────────────────────────────────────────────────────────── */

  if (appointments.length > 0) {
    sectionHeading(`Appointments (${appointments.length})`);

    for (const appt of appointments) {
      checkPage(14);
      doc.setFillColor(...C.bg);
      doc.roundedRect(ML, y, CONTENT_W, 12, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...C.dark);
      doc.text(appt.title || "Appointment", ML + 3, y + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.mid);
      doc.text(`${fmtDateTime(appt.scheduledAt)}  ·  ${appt.durationMinutes} min  ·  ${appt.status}`, ML + 3, y + 9.5);
      y += 14;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 5. Service Jobs (if any)                                                 */
  /* ──────────────────────────────────────────────────────────────────────── */

  if (serviceJobs.length > 0) {
    sectionHeading(`Service Jobs (${serviceJobs.length})`);

    for (const job of serviceJobs) {
      checkPage(16);
      doc.setFillColor(...C.bg);
      doc.roundedRect(ML, y, CONTENT_W, 14, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...C.dark);
      doc.text(`${job.jobNumber}${job.deviceType ? "  ·  " + job.deviceType : ""}`, ML + 3, y + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.mid);
      const jobMeta = [
        job.status,
        job.estimatedCost != null && fmtCurrency(job.estimatedCost),
        `Booked: ${fmtDate(job.bookInDate)}`,
      ].filter(Boolean).join("  ·  ");
      doc.text(jobMeta, ML + 3, y + 9.5);

      if (job.deviceDescription) {
        doc.setFontSize(7);
        doc.setTextColor(...C.light);
        doc.text(job.deviceDescription, ML + 3, y + 13);
      }

      y += 17;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 6. Notes (including merge events)                                        */
  /* ──────────────────────────────────────────────────────────────────────── */

  sectionHeading(`Notes (${notes.length})`);

  if (!notes.length) {
    checkPage(10);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.light);
    doc.text("No notes recorded.", ML + 3, y + 5);
    y += 10;
  } else {
    for (const note of notes) {
      if (isMergeNote(note.note)) {
        /* ── Merge event card ── */
        const parsed = parseMergeNote(note.note);

        const mergeRows: [string, string][] = parsed
          ? [
              ["Absorbed profile", parsed.absorbedName],
              ["Profile ID",       `#${parsed.absorbedId}`],
              ...(parsed.loyaltyLine ? [["Consolidated", parsed.loyaltyLine] as [string, string]] : []),
              ...(parsed.reason      ? [["Reason",       parsed.reason]       as [string, string]] : []),
            ]
          : [["Raw note", note.note]];

        const cardH = 10 + mergeRows.length * 7;
        checkPage(cardH + 4);

        // Card background (indigo tint)
        doc.setFillColor(...C.indigoBg);
        doc.roundedRect(ML, y, CONTENT_W, cardH, 2, 2, "F");

        // Left accent bar
        doc.setFillColor(...C.indigo);
        doc.roundedRect(ML, y, 3, cardH, 1, 1, "F");

        // Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...C.indigo);
        doc.text("PROFILE MERGED", ML + 6, y + 5.5);

        const noteDate = parsed?.date ?? fmtDate(note.createdAt);
        const dateLabelW = doc.getStringUnitWidth(noteDate) * 8 * 0.352778;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...C.light);
        doc.text(noteDate, ML + CONTENT_W - dateLabelW, y + 5.5);

        let rowY = y + 10;
        for (const [lbl, val] of mergeRows) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...C.mid);
          doc.text(lbl, ML + 6, rowY + 4);
          doc.setTextColor(...C.dark);
          const valLines = doc.splitTextToSize(val, CONTENT_W - 55) as string[];
          doc.text(valLines, ML + 50, rowY + 4);
          // subtle separator
          doc.setDrawColor(199, 210, 254);
          doc.setLineWidth(0.2);
          doc.line(ML + 5, rowY + 7, ML + CONTENT_W - 2, rowY + 7);
          rowY += 7;
        }

        y += cardH + 4;
      } else {
        /* ── Regular note card ── */
        const noteLines = doc.splitTextToSize(note.note, CONTENT_W - 8) as string[];
        const cardH = Math.max(12, noteLines.length * 4 + 10);

        checkPage(cardH + 4);

        doc.setFillColor(...C.bg);
        doc.roundedRect(ML, y, CONTENT_W, cardH, 2, 2, "F");
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.25);
        doc.roundedRect(ML, y, CONTENT_W, cardH, 2, 2, "S");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...C.dark);
        doc.text(noteLines, ML + 4, y + 6);

        // Badges + date footer
        const footerY = y + cardH - 3.5;
        const tags: string[] = [];
        if (note.popupOnSale)    tags.push("Popup on sale");
        if (note.popupOnBooking) tags.push("Popup on booking");

        let badgeX = ML + 4;
        doc.setFontSize(6.5);
        for (const tag of tags) {
          const tw = doc.getStringUnitWidth(tag) * 6.5 * 0.352778 + 4;
          doc.setFillColor(243, 244, 246);
          doc.roundedRect(badgeX, footerY - 2.5, tw, 4, 1, 1, "F");
          doc.setTextColor(...C.mid);
          doc.text(tag, badgeX + 2, footerY + 0.5);
          badgeX += tw + 2;
        }

        const dateStr = fmtDate(note.createdAt);
        const dateW2 = doc.getStringUnitWidth(dateStr) * 6.5 * 0.352778;
        doc.setFontSize(6.5);
        doc.setTextColor(...C.light);
        doc.text(dateStr, ML + CONTENT_W - dateW2 - 2, footerY + 0.5);

        y += cardH + 4;
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 7. Form Submissions (if any)                                             */
  /* ──────────────────────────────────────────────────────────────────────── */

  const subs = formSubmissions ?? [];
  if (subs.length > 0) {
    sectionHeading(`Form Submissions (${subs.length})`);

    for (const sub of subs) {
      const form = allForms?.find(f => f.id === sub.formId);
      const formName = form?.name ?? "Form";
      const fields = form?.fields ?? [];
      const dataEntries = Object.entries(sub.data ?? {});

      const cardH = 12 + (dataEntries.length > 0 ? dataEntries.length * 6 + 4 : 0);
      checkPage(cardH + 4);

      doc.setFillColor(...C.bg);
      doc.roundedRect(ML, y, CONTENT_W, cardH, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...C.dark);
      doc.text(formName, ML + 3, y + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.light);
      const dateStr = fmtDateTime(sub.createdAt);
      const dateW = doc.getStringUnitWidth(dateStr) * 7.5 * 0.352778;
      doc.text(dateStr, ML + CONTENT_W - dateW - 3, y + 5);

      let rowY = y + 10;
      for (const [key, value] of dataEntries) {
        const field = fields.find(f => f.id === key);
        const label = field?.label ?? key;
        const displayValue = Array.isArray(value) ? value.join(", ") : String(value ?? "—");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...C.mid);
        doc.text(label, ML + 3, rowY + 4);

        doc.setTextColor(...C.dark);
        const valLines = doc.splitTextToSize(displayValue, CONTENT_W - 55) as string[];
        doc.text(valLines, ML + 50, rowY + 4);

        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.2);
        doc.line(ML + 3, rowY + 5.5, ML + CONTENT_W - 3, rowY + 5.5);

        rowY += 6;
      }

      y += cardH + 4;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 8. Footer on each page                                                   */
  /* ──────────────────────────────────────────────────────────────────────── */

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...C.bg);
    doc.rect(0, PAGE_H - 10, PAGE_W, 10, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.light);
    doc.text(
      `KoaPOS Customer Export  ·  ${fullName}  ·  Exported ${exportDate}`,
      ML,
      PAGE_H - 4,
    );
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MR - 22, PAGE_H - 4);
  }

  /* ── Download ── */
  const safeName = fullName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  doc.save(`customer-${safeName}-${Date.now()}.pdf`);
}
