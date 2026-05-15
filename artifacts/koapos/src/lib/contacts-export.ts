import type { Customer } from "@workspace/api-client-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function esc(v: string | null | undefined) {
  return (v ?? "").replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

function dl(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvRow(fields: (string | number | null | undefined)[]) {
  return fields
    .map((f) => {
      const s = String(f ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

// ─── vCard (.vcf) ─────────────────────────────────────────────────────────────
// RFC 6350 v3 — understood by Outlook, Apple Contacts, iCloud, Google Contacts

function customerToVCard(c: Customer): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  const fn = [c.firstName, c.lastName].filter(Boolean).join(" ");
  lines.push(`FN:${esc(fn || c.email || "Unknown")}`);
  lines.push(`N:${esc(c.lastName)};${esc(c.firstName)};;;`);

  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
  if (c.phone) lines.push(`TEL;TYPE=WORK,VOICE:${esc(c.phone)}`);
  if (c.company) lines.push(`ORG:${esc(c.company)}`);

  const addrParts = [
    "",                       // PO Box
    "",                       // Extended address
    c.billingStreet ?? c.address ?? "",
    c.billingCity ?? "",
    c.billingState ?? "",
    c.billingPostcode ?? "",
    c.billingCountry ?? "Australia",
  ];
  if (addrParts.some(Boolean)) {
    lines.push(`ADR;TYPE=WORK:${addrParts.map(esc).join(";")}`);
  }

  const notes: string[] = [];
  if (c.customerGroup) notes.push(`Group: ${c.customerGroup}`);
  if (c.loyaltyPoints) notes.push(`Loyalty pts: ${c.loyaltyPoints}`);
  if (c.notes) notes.push(c.notes);
  if (notes.length) lines.push(`NOTE:${esc(notes.join(" | "))}`);

  if (c.dateOfBirth) lines.push(`BDAY:${c.dateOfBirth.replace(/-/g, "")}`);

  lines.push(`UID:koapos-customer-${c.id}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function exportVCard(customers: Customer[], filename = "koapos-customers.vcf") {
  const content = customers.map(customerToVCard).join("\r\n");
  dl(filename, content, "text/vcard;charset=utf-8");
}

// ─── Google Contacts CSV ──────────────────────────────────────────────────────
// https://support.google.com/contacts/answer/1069522

const GOOGLE_HEADERS = [
  "Name", "Given Name", "Additional Name", "Family Name",
  "Name Prefix", "Name Suffix", "Nickname", "Birthday", "Gender",
  "Notes", "Group Membership",
  "E-mail 1 - Type", "E-mail 1 - Value",
  "Phone 1 - Type", "Phone 1 - Value",
  "Address 1 - Type", "Address 1 - Formatted",
  "Address 1 - Street", "Address 1 - City",
  "Address 1 - Region", "Address 1 - Postal Code", "Address 1 - Country",
  "Organization 1 - Type", "Organization 1 - Name",
];

function customerToGoogleRow(c: Customer): string {
  const fn = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const addr = [c.billingStreet ?? c.address, c.billingCity, c.billingState, c.billingPostcode, c.billingCountry]
    .filter(Boolean).join(", ");
  const notes = [c.customerGroup && `Group: ${c.customerGroup}`, c.notes].filter(Boolean).join(" | ");

  return csvRow([
    fn, c.firstName, "", c.lastName,
    "", "", "", c.dateOfBirth || "", "",
    notes, c.customerGroup ? `* KoaPOS - ${c.customerGroup}` : "* KoaPOS",
    c.email ? "Work" : "", c.email || "",
    c.phone ? "Work" : "", c.phone || "",
    addr ? "Work" : "", addr,
    c.billingStreet ?? c.address ?? "", c.billingCity ?? "",
    c.billingState ?? "", c.billingPostcode ?? "", c.billingCountry ?? "Australia",
    c.company ? "Work" : "", c.company || "",
  ]);
}

export function exportGoogleCSV(customers: Customer[], filename = "koapos-google-contacts.csv") {
  const rows = [csvRow(GOOGLE_HEADERS), ...customers.map(customerToGoogleRow)];
  dl(filename, rows.join("\n"), "text/csv;charset=utf-8");
}

// ─── Outlook CSV ──────────────────────────────────────────────────────────────
// Standard Outlook contacts import format

const OUTLOOK_HEADERS = [
  "First Name", "Last Name", "Middle Name", "Title", "Suffix",
  "Company", "Job Title", "E-mail Address",
  "Business Phone", "Mobile Phone", "Home Phone",
  "Business Street", "Business City", "Business State", "Business Postal Code", "Business Country",
  "Notes", "Categories", "Birthday",
];

function customerToOutlookRow(c: Customer): string {
  const notes = [c.customerGroup && `Group: ${c.customerGroup}`, c.notes].filter(Boolean).join(" | ");
  return csvRow([
    c.firstName ?? "", c.lastName ?? "", "", "", "",
    c.company ?? "", "", c.email ?? "",
    c.phone ?? "", "", "",
    c.billingStreet ?? c.address ?? "",
    c.billingCity ?? "", c.billingState ?? "",
    c.billingPostcode ?? "", c.billingCountry ?? "Australia",
    notes, c.customerGroup ?? "", c.dateOfBirth ?? "",
  ]);
}

export function exportOutlookCSV(customers: Customer[], filename = "koapos-outlook-contacts.csv") {
  const rows = [csvRow(OUTLOOK_HEADERS), ...customers.map(customerToOutlookRow)];
  dl(filename, rows.join("\n"), "text/csv;charset=utf-8");
}

// ─── Generic CSV ──────────────────────────────────────────────────────────────

const GENERIC_HEADERS = [
  "First Name", "Last Name", "Email", "Phone", "Company", "ABN",
  "Billing Street", "Billing City", "Billing State", "Billing Postcode", "Billing Country",
  "Customer Group", "Loyalty Points", "Total Spent", "Visit Count", "Notes", "Date of Birth",
];

function customerToGenericRow(c: Customer): string {
  return csvRow([
    c.firstName ?? "", c.lastName ?? "", c.email ?? "", c.phone ?? "",
    c.company ?? "", c.abn ?? "",
    c.billingStreet ?? c.address ?? "", c.billingCity ?? "",
    c.billingState ?? "", c.billingPostcode ?? "", c.billingCountry ?? "",
    c.customerGroup ?? "", c.loyaltyPoints ?? 0, c.totalSpent ?? 0,
    c.visitCount ?? 0, c.notes ?? "", c.dateOfBirth ?? "",
  ]);
}

export function exportGenericCSV(customers: Customer[], filename = "koapos-customers.csv") {
  const rows = [csvRow(GENERIC_HEADERS), ...customers.map(customerToGenericRow)];
  dl(filename, rows.join("\n"), "text/csv;charset=utf-8");
}
