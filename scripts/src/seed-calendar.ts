import { db, customersTable, appointmentsTable, serviceJobsTable, invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  // Get merchant id 1 (demo merchant)
  const merchantId = 1;

  // Update customer birthdays — set them to this month so they appear in May 2026
  await db.update(customersTable)
    .set({ dateOfBirth: "1990-05-12" })
    .where(eq(customersTable.id, 1));
  await db.update(customersTable)
    .set({ dateOfBirth: "1985-05-27" })
    .where(eq(customersTable.id, 2));

  console.log("Updated customer birthdays");

  // Seed appointments for May 2026
  const appointments = [
    {
      merchantId,
      customerId: 1,
      title: "Product Demo — Sarah Johnson",
      description: "Showcase new product lineup",
      scheduledAt: new Date("2026-05-07T09:00:00+10:00"),
      durationMinutes: 60,
      status: "completed",
    },
    {
      merchantId,
      customerId: 2,
      title: "Account Review — Mike Chen",
      description: "Quarterly loyalty review",
      scheduledAt: new Date("2026-05-14T14:30:00+10:00"),
      durationMinutes: 30,
      status: "completed",
    },
    {
      merchantId,
      customerId: 1,
      title: "Equipment Service Check",
      description: "Annual POS hardware check",
      scheduledAt: new Date("2026-05-19T10:00:00+10:00"),
      durationMinutes: 90,
      status: "scheduled",
    },
    {
      merchantId,
      title: "Staff Training Session",
      description: "New inventory module walkthrough",
      scheduledAt: new Date("2026-05-22T13:00:00+10:00"),
      durationMinutes: 120,
      status: "scheduled",
    },
    {
      merchantId,
      customerId: 2,
      title: "VIP Customer Consult — Mike Chen",
      description: "Enterprise product enquiry",
      scheduledAt: new Date("2026-05-28T11:00:00+10:00"),
      durationMinutes: 45,
      status: "scheduled",
    },
  ];

  await db.insert(appointmentsTable).values(appointments);
  console.log("Seeded appointments");

  // Seed service jobs for May 2026
  const serviceJobs = [
    {
      merchantId,
      customerId: 1,
      jobNumber: "SJ-001",
      title: "Barcode Scanner Repair",
      description: "Scanner not reading barcodes reliably",
      scheduledAt: new Date("2026-05-05T08:00:00+10:00"),
      status: "completed",
      estimatedCost: "120.00",
    },
    {
      merchantId,
      jobNumber: "SJ-002",
      title: "Receipt Printer Maintenance",
      description: "Routine cleaning and paper path check",
      scheduledAt: new Date("2026-05-12T09:30:00+10:00"),
      status: "completed",
      estimatedCost: "85.00",
    },
    {
      merchantId,
      customerId: 2,
      jobNumber: "SJ-003",
      title: "POS Terminal Upgrade",
      description: "Software upgrade to latest firmware",
      scheduledAt: new Date("2026-05-20T14:00:00+10:00"),
      status: "in-progress",
      estimatedCost: "250.00",
    },
    {
      merchantId,
      jobNumber: "SJ-004",
      title: "Network Setup",
      description: "Configure new router for card payment terminals",
      scheduledAt: new Date("2026-05-26T10:00:00+10:00"),
      status: "pending",
      estimatedCost: "180.00",
    },
  ];

  await db.insert(serviceJobsTable).values(serviceJobs);
  console.log("Seeded service jobs");

  // Seed invoices for May 2026
  const invoices = [
    {
      merchantId,
      customerId: 1,
      invoiceNumber: "INV-2026-001",
      status: "paid",
      subtotal: "450.00",
      taxTotal: "45.00",
      total: "495.00",
      dueDate: new Date("2026-05-10T00:00:00+10:00"),
      paidAt: new Date("2026-05-08T11:00:00+10:00"),
    },
    {
      merchantId,
      invoiceNumber: "INV-2026-002",
      status: "sent",
      subtotal: "1200.00",
      taxTotal: "120.00",
      total: "1320.00",
      dueDate: new Date("2026-05-15T00:00:00+10:00"),
    },
    {
      merchantId,
      customerId: 2,
      invoiceNumber: "INV-2026-003",
      status: "sent",
      subtotal: "875.00",
      taxTotal: "87.50",
      total: "962.50",
      dueDate: new Date("2026-05-20T00:00:00+10:00"),
    },
    {
      merchantId,
      invoiceNumber: "INV-2026-004",
      status: "overdue",
      subtotal: "320.00",
      taxTotal: "32.00",
      total: "352.00",
      dueDate: new Date("2026-05-01T00:00:00+10:00"),
    },
    {
      merchantId,
      customerId: 1,
      invoiceNumber: "INV-2026-005",
      status: "draft",
      subtotal: "650.00",
      taxTotal: "65.00",
      total: "715.00",
      dueDate: new Date("2026-05-31T00:00:00+10:00"),
    },
  ];

  await db.insert(invoicesTable).values(invoices);
  console.log("Seeded invoices");

  console.log("Calendar seed complete!");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
