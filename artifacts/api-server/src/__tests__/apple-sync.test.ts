import { describe, it, expect } from "vitest";
import { customerToVCard, appleContactUid } from "../services/vcardGenerator";
import { generateIcs } from "../services/icsGenerator";

type CustomerArg = Parameters<typeof customerToVCard>[0];

const baseCustomer = {
  id: 42, merchantId: 1,
  firstName: "Sarah", lastName: "Johnson",
  email: "sarah@example.com", phone: "0400000000", company: "Koa Co",
  address: null, billingStreet: "1 Test St", billingCity: "Sydney",
  billingState: "NSW", billingPostcode: "2000", billingCountry: "Australia",
  dateOfBirth: "1990-05-01", notes: null,
} as unknown as CustomerArg;

describe("customerToVCard", () => {
  it("produces a valid vCard 3.0 with a deterministic UID", () => {
    const v = customerToVCard(baseCustomer);
    expect(v.startsWith("BEGIN:VCARD")).toBe(true);
    expect(v).toContain("VERSION:3.0");
    expect(v).toContain("FN:Sarah Johnson");
    expect(v).toContain("N:Johnson;Sarah;;;");
    expect(v).toContain("EMAIL;TYPE=INTERNET:sarah@example.com");
    expect(v).toContain("TEL;TYPE=CELL,VOICE:0400000000");
    expect(v).toContain("ADR;TYPE=WORK:;;1 Test St;Sydney;NSW;2000;Australia");
    expect(v).toContain(`UID:${appleContactUid(42)}`);
    expect(v.trim().endsWith("END:VCARD")).toBe(true);
  });

  it("escapes special characters and writes the note", () => {
    const v = customerToVCard({ ...baseCustomer, company: "A, B; C" } as CustomerArg, "Line1\nLine2");
    expect(v).toContain("ORG:A\\, B\\; C");
    expect(v).toContain("NOTE:Line1\\nLine2");
  });

  it("falls back to the email for the display name when unnamed", () => {
    const v = customerToVCard({ ...baseCustomer, firstName: null, lastName: null } as CustomerArg);
    expect(v).toContain("FN:sarah@example.com");
  });
});

describe("generateIcs method option", () => {
  const args = {
    uid: "koapos-appt-1", summary: "Repair drop-off",
    startAt: new Date("2030-01-01T10:00:00Z"), endAt: new Date("2030-01-01T10:30:00Z"),
  };

  it("omits METHOD for CalDAV objects (method: null)", () => {
    const ics = generateIcs({ ...args, method: null }).toString("utf-8");
    expect(ics).not.toContain("METHOD:");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:koapos-appt-1");
    expect(ics).toContain("SUMMARY:Repair drop-off");
  });

  it("includes METHOD:REQUEST by default (email invites)", () => {
    const ics = generateIcs(args).toString("utf-8");
    expect(ics).toContain("METHOD:REQUEST");
  });
});
