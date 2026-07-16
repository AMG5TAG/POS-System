/**
 * vcardGenerator — server-side RFC 6350 vCard 3.0 builder for pushing KoaPOS
 * customers to CardDAV address books (iCloud/Apple Contacts). Mirrors the
 * client-side exporter in koapos `lib/contacts-export.ts`, which is already
 * verified against Apple Contacts / iCloud.
 *
 * The UID is deterministic (`koapos-customer-<id>`) so re-pushing a customer
 * overwrites the same contact rather than creating duplicates.
 */
import type { customersTable } from "@workspace/db";

type CustomerRow = typeof customersTable.$inferSelect;

/** Escape a value for a vCard text property (RFC 6350 §3.4). */
function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
}

/** Stable, deterministic filename/UID fragment for a customer's contact object. */
export function appleContactUid(customerId: number): string {
  return `koapos-customer-${customerId}`;
}

/**
 * Build a vCard for a customer. `note` (when provided) is written to the NOTE
 * field — the caller passes the same CRM-notes text used for Google/Microsoft
 * sync so behaviour is consistent across providers.
 */
export function customerToVCard(c: CustomerRow, note?: string | null): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  const first = c.firstName ?? "";
  const last = c.lastName ?? "";
  const fn = [first, last].filter(Boolean).join(" ");
  lines.push(`FN:${esc(fn || c.email || "Unknown")}`);
  lines.push(`N:${esc(last)};${esc(first)};;;`);

  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL,VOICE:${esc(c.phone)}`);
  if (c.company) lines.push(`ORG:${esc(c.company)}`);

  const street = c.billingStreet ?? c.address ?? "";
  const addrParts = [
    "",                                 // PO Box
    "",                                 // Extended address
    street,
    c.billingCity ?? "",
    c.billingState ?? "",
    c.billingPostcode ?? "",
    c.billingCountry ?? (street ? "Australia" : ""),
  ];
  if (addrParts.some(Boolean)) {
    lines.push(`ADR;TYPE=WORK:${addrParts.map(esc).join(";")}`);
  }

  if (note && note.trim()) lines.push(`NOTE:${esc(note)}`);
  if (c.dateOfBirth) lines.push(`BDAY:${c.dateOfBirth.replace(/-/g, "")}`);

  lines.push(`UID:${appleContactUid(c.id)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
