import { ensureReferralCode } from "../lib/referrals";
import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, merchantsTable, customersTable, serviceJobsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { normalisePhoneFor } from "../lib/phone";
import { phoneMatchKey } from "../lib/phone-match";
import { soleMerchantId } from "../lib/sole-merchant";

const router: IRouter = Router();

/* Public and unauthenticated: every POST writes a customer and a service job,
   so it gets the same per-IP budget as the shop's appointment requests. */
const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many bookings from this connection — please call us instead." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  skip: (req) => LOCALHOST.has(req.ip ?? ""),
});

/** A trimmed string field, capped so one request can't store megabytes. */
const field = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The business behind a booking URL — only ever this install's own. Other
 *  accounts are still in the database (demo, test), and a booking to one wrote
 *  a customer and a service job into data nobody here looks at. */
async function merchantByUsername(username: string) {
  const sole = await soleMerchantId();
  if (sole == null) return null;
  const [m] = await db.select({ id: merchantsTable.id, businessName: merchantsTable.businessName, logoUrl: merchantsTable.logoUrl })
    .from(merchantsTable).where(and(eq(merchantsTable.username, username), eq(merchantsTable.id, sole))).limit(1);
  return m ?? null;
}

const DEVICE_TYPES = [
  "Smartphone", "Tablet", "Laptop", "Desktop", "All-in-One",
  "Game Console", "Printer", "Network Device", "Other",
];

// GET /book/:username — public shopfront info for the booking widget.
router.get("/book/:username", async (req, res): Promise<void> => {
  const m = await merchantByUsername(req.params.username);
  if (!m) { res.status(404).json({ error: "Shop not found" }); return; }
  res.json({
    businessName: m.businessName ?? "Repair Shop",
    logoUrl: m.logoUrl ?? null,
    deviceTypes: DEVICE_TYPES,
  });
});

// POST /book/:username — public repair booking. Creates/links a customer and a
// pending service job; the shop follows up with a quote.
router.post("/book/:username", bookingLimiter, async (req, res): Promise<void> => {
  const m = await merchantByUsername(String(req.params.username));
  if (!m) { res.status(404).json({ error: "Shop not found" }); return; }
  const merchantId = m.id;

  const b = (req.body ?? {}) as Record<string, unknown>;
  const firstName = field(b.firstName, 80);
  const lastName  = field(b.lastName, 80);
  const email     = field(b.email, 254);
  // Public route: no session, so the normalisation middleware doesn't run here.
  // The shop is known from the URL, so its country code is applied directly.
  const phone     = await normalisePhoneFor(merchantId, field(b.phone, 40));
  const deviceType = field(b.deviceType, 60);
  const deviceDescription = field(b.deviceDescription, 500);
  const faultDescription  = field(b.faultDescription, 2000);

  if (!firstName) { res.status(400).json({ error: "Your name is required" }); return; }
  if (!email && !phone) { res.status(400).json({ error: "An email or phone is required" }); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Please check your email address" }); return; }
  if (!faultDescription) { res.status(400).json({ error: "Please describe the fault" }); return; }

  // Find an existing customer by email or phone, else create one.
  let customer: typeof customersTable.$inferSelect | null = null;
  if (email) {
    const [c] = await db.select().from(customersTable)
      .where(and(eq(customersTable.merchantId, merchantId), eq(customersTable.email, email))).limit(1);
    if (c) customer = c;
  }
  // Matched on the digit tail rather than the string: the regular whose record
  // reads "0400 000 000" is the same person as the "+61400000000" this form now
  // submits, and an exact comparison would book them a second customer record.
  const phoneKey = phoneMatchKey(phone);
  if (!customer && phoneKey) {
    const digits = sql`regexp_replace(coalesce(${customersTable.phone}, ''), '[^0-9]', '', 'g')`;
    const [c] = await db.select().from(customersTable)
      .where(and(
        eq(customersTable.merchantId, merchantId),
        sql`length(${digits}) >= ${phoneKey.length}`,
        sql`right(${digits}, ${phoneKey.length}) = ${phoneKey}`,
      )).limit(1);
    if (c) customer = c;
  }
  if (!customer) {
    const [created] = await db.insert(customersTable).values({
      merchantId, firstName, lastName: lastName || "", email: email || null, phone: phone || null,
    }).returning();
    customer = created;
    // Every customer has a referral code to share (lib/referrals.ts).
    await ensureReferralCode(created!).catch(() => {});
  }

  // Generate the next job number (SJ####).
  const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(serviceJobsTable).where(eq(serviceJobsTable.merchantId, merchantId));
  const jobNumber = `SJ${String(Number(countRow.c) + 1).padStart(4, "0")}`;
  const today = new Date().toISOString().split("T")[0];

  const [job] = await db.insert(serviceJobsTable).values({
    merchantId,
    customerId: customer.id,
    jobNumber,
    title: `Online booking — ${deviceType || "device"}`,
    status: "pending",
    bookInDate: today,
    deviceType: deviceType || null,
    deviceDescription: deviceDescription || null,
    workDescription: faultDescription,
    notes: "Submitted via online booking.",
  }).returning();

  res.status(201).json({ jobNumber: job.jobNumber, businessName: m.businessName ?? "Repair Shop" });
});

export default router;
