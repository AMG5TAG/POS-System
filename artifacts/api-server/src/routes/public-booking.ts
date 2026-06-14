import { Router, type IRouter } from "express";
import { db, merchantsTable, customersTable, serviceJobsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

async function merchantByUsername(username: string) {
  const [m] = await db.select({ id: merchantsTable.id, businessName: merchantsTable.businessName, logoUrl: merchantsTable.logoUrl })
    .from(merchantsTable).where(eq(merchantsTable.username, username)).limit(1);
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
router.post("/book/:username", async (req, res): Promise<void> => {
  const m = await merchantByUsername(req.params.username);
  if (!m) { res.status(404).json({ error: "Shop not found" }); return; }
  const merchantId = m.id;

  const b = (req.body ?? {}) as Record<string, unknown>;
  const firstName = typeof b.firstName === "string" ? b.firstName.trim() : "";
  const lastName  = typeof b.lastName === "string" ? b.lastName.trim() : "";
  const email     = typeof b.email === "string" ? b.email.trim() : "";
  const phone     = typeof b.phone === "string" ? b.phone.trim() : "";
  const deviceType = typeof b.deviceType === "string" ? b.deviceType.trim() : "";
  const deviceDescription = typeof b.deviceDescription === "string" ? b.deviceDescription.trim() : "";
  const faultDescription  = typeof b.faultDescription === "string" ? b.faultDescription.trim() : "";

  if (!firstName) { res.status(400).json({ error: "Your name is required" }); return; }
  if (!email && !phone) { res.status(400).json({ error: "An email or phone is required" }); return; }
  if (!faultDescription) { res.status(400).json({ error: "Please describe the fault" }); return; }

  // Find an existing customer by email or phone, else create one.
  let customer: typeof customersTable.$inferSelect | null = null;
  if (email) {
    const [c] = await db.select().from(customersTable)
      .where(and(eq(customersTable.merchantId, merchantId), eq(customersTable.email, email))).limit(1);
    if (c) customer = c;
  }
  if (!customer && phone) {
    const [c] = await db.select().from(customersTable)
      .where(and(eq(customersTable.merchantId, merchantId), eq(customersTable.phone, phone))).limit(1);
    if (c) customer = c;
  }
  if (!customer) {
    const [created] = await db.insert(customersTable).values({
      merchantId, firstName, lastName: lastName || "", email: email || null, phone: phone || null,
    }).returning();
    customer = created;
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
