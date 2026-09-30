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
/** An embedded contact photo: raw image bytes and their MIME type. */
export interface VCardPhoto { bytes: Buffer; contentType: string }

/* vCard 3.0 PHOTO type token from a MIME type ("image/png" → "PNG"). */
function photoType(contentType: string): string {
  const t = contentType.split("/")[1]?.split(";")[0]?.trim().toUpperCase() || "JPEG";
  return t === "JPG" ? "JPEG" : t;
}

/* Long lines are folded at 75 octets, continuation lines starting with a space
   (RFC 2425 §5.8.1) — a base64 photo is one very long line otherwise. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
}

export function customerToVCard(c: CustomerRow, note?: string | null, photo?: VCardPhoto | null): string {
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
  if (photo) lines.push(fold(`PHOTO;ENCODING=b;TYPE=${photoType(photo.contentType)}:${photo.bytes.toString("base64")}`));

  lines.push(`UID:${appleContactUid(c.id)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
