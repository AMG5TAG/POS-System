import { Router, type IRouter } from "express";
import { db, staffTable, transactionsTable, merchantsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateStaffBody,
  GetStaffMemberParams,
  UpdateStaffParams,
  UpdateStaffBody,
  DeleteStaffParams,
  VerifyStaffPinBody,
} from "@workspace/api-zod";
import { sendEmail } from "../services/email";

const router: IRouter = Router();

function formatStaff(s: typeof staffTable.$inferSelect) {
  return {
    id: s.id,
    merchantId: s.merchantId,
    name: s.name,
    firstName: s.firstName ?? null,
    lastName: s.lastName ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
    dateOfBirth: s.dateOfBirth ?? null,
    company: s.company ?? null,
    abn: s.abn ?? null,
    billingAddress: s.billingAddress ?? null,
    postalAddress: s.postalAddress ?? null,
    role: s.role,
    /* Raw PINs never leave the server — masked so clients can only tell
       whether a PIN is set. Verification goes through POST /staff/verify-pin. */
    pin: s.pin ? "****" : null,
    isActive: s.isActive === "true",
    defaultRegisterType: s.defaultRegisterType ?? null,
    posPrefs: s.posPrefs ?? null,
    payRate: s.payRate ?? null,
    loadingRate: s.loadingRate ?? null,
    superRate: s.superRate ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

/* ── PIN verification rate limiter ──
   In-memory failed-attempt counter per merchant: after MAX_FAILS wrong PINs
   within WINDOW_MS, verification is refused until the window expires. */
const PIN_MAX_FAILS = 10;
const PIN_WINDOW_MS = 60_000;
const pinFailures = new Map<number, { fails: number; resetAt: number }>();

function pinRateLimited(merchantId: number): boolean {
  const entry = pinFailures.get(merchantId);
  if (!entry || Date.now() > entry.resetAt) return false;
  return entry.fails >= PIN_MAX_FAILS;
}

function recordPinFailure(merchantId: number): void {
  const now = Date.now();
  const entry = pinFailures.get(merchantId);
  if (!entry || now > entry.resetAt) {
    pinFailures.set(merchantId, { fails: 1, resetAt: now + PIN_WINDOW_MS });
  } else {
    entry.fails += 1;
  }
}

router.get("/staff", requireAuth, async (req, res): Promise<void> => {
  const staff = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.merchantId, req.session.merchantId!))
    .orderBy(staffTable.name);
  res.json(staff.map(formatStaff));
});

router.post("/staff", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { firstName, lastName, isActive, ...rest } = parsed.data as typeof parsed.data & { isActive?: boolean };
  const derivedName =
    firstName || lastName
      ? `${firstName ?? ""} ${lastName ?? ""}`.trim() || parsed.data.name
      : parsed.data.name;
  const [member] = await db
    .insert(staffTable)
    .values({
      ...rest,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      name: derivedName,
      merchantId: req.session.merchantId!,
    })
    .returning();

  if (member.email && parsed.data.pin) {
    const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, req.session.merchantId!)).limit(1);
    const businessName = merchant?.businessName ?? "Your employer";
    const pin = parsed.data.pin;
    const firstName = member.firstName ?? member.name.split(" ")[0];
    await sendEmail(req.session.merchantId!, {
      to: member.email,
      subject: `Welcome to ${businessName} — your POS login PIN`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
          <h2 style="margin-bottom:4px">Welcome, ${firstName}!</h2>
          <p style="color:#555;margin-top:0">You've been added as a staff member at <strong>${businessName}</strong>.</p>
          <p>Your PIN to sign into the POS system is:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:12px;text-align:center;background:#f4f4f5;border-radius:8px;padding:20px 0;margin:16px 0">${pin}</div>
          <p style="color:#555;font-size:13px">Use this PIN when prompted at the POS register to switch to your account. Keep it private.</p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0"/>
          <p style="color:#999;font-size:12px">This message was sent by ${businessName} via KoaPOS. If you were not expecting this email, please disregard it.</p>
        </div>
      `,
      text: `Welcome, ${firstName}!\n\nYou've been added as a staff member at ${businessName}.\n\nYour POS PIN is: ${pin}\n\nUse this PIN at the register to switch to your account. Keep it private.`,
    }).catch(() => { /* non-fatal — staff record is already saved */ });
  }

  res.status(201).json(formatStaff(member));
});

// POST /staff/verify-pin — must be defined BEFORE /staff/:id to avoid param conflict
router.post("/staff/verify-pin", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = VerifyStaffPinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (pinRateLimited(merchantId)) {
    res.json({ ok: false, reason: "rate_limited" });
    return;
  }
  const { pin, requireManager, establishDaySession } = parsed.data as typeof parsed.data & { establishDaySession?: boolean };
  const staff = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.merchantId, merchantId), eq(staffTable.isActive, "true")));
  const match = staff.find((s) => s.pin && s.pin === pin);
  if (!match) {
    recordPinFailure(merchantId);
    res.json({ ok: false, reason: "invalid" });
    return;
  }
  if (requireManager && match.role !== "manager" && match.role !== "owner") {
    res.json({ ok: false, reason: "role" });
    return;
  }
  // Day-login: record the server-verified staff as the session's day-staff so
  // server-side attribution (daily closes, stock takes, customer merges) credits
  // them. Only the day-login flow sets establishDaySession; per-sale staff
  // switches and approval prompts verify a PIN without claiming the day session.
  if (establishDaySession) {
    req.session.staffId = match.id;
  }
  res.json({ ok: true, staff: formatStaff(match) });
});

// POST /staff/end-day-session — clear the session's day-staff (day sign-out /
// close till), the counterpart to verify-pin's establishDaySession. After this,
// server-side attribution (daily closes, stock takes, customer merges) falls
// back to the merchant owner until another staff signs in for the day.
router.post("/staff/end-day-session", requireAuth, async (req, res): Promise<void> => {
  delete req.session.staffId;
  res.json({ ok: true });
});

// GET /staff/sales-report — must be defined BEFORE /staff/:id to avoid param conflict
router.get("/staff/sales-report", requireAuth, async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) {
    res.status(400).json({ error: "from and to query params are required (YYYY-MM-DD)" });
    return;
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  // Include the full "to" day by advancing to end-of-day
  toDate.setHours(23, 59, 59, 999);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    return;
  }

  // Fetch all transactions for the merchant in the date range
  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.merchantId, req.session.merchantId!),
        gte(transactionsTable.createdAt, fromDate),
        lte(transactionsTable.createdAt, toDate),
      ),
    );

  // Fetch all staff members for the merchant
  const staffMembers = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.merchantId, req.session.merchantId!));

  // Aggregate per staffId (null = unassigned)
  type Agg = {
    staffId: number | null;
    staffName: string;
    role: string | null;
    transactionCount: number;
    grossRevenue: number;
    refundCount: number;
    refundAmount: number;
    productQty: Map<string, number>;
  };

  // Pre-seed every known staff member so zero-transaction staff appear in results
  const aggMap = new Map<string, Agg>();
  for (const s of staffMembers) {
    aggMap.set(String(s.id), {
      staffId: s.id,
      staffName: s.name,
      role: s.role,
      transactionCount: 0,
      grossRevenue: 0,
      refundCount: 0,
      refundAmount: 0,
      productQty: new Map(),
    });
  }

  for (const tx of transactions) {
    const key = tx.staffId === null ? "unassigned" : String(tx.staffId);
    if (!aggMap.has(key)) {
      // Transaction assigned to a staff member no longer in the staff table,
      // or genuinely unassigned (null staffId)
      aggMap.set(key, {
        staffId: tx.staffId,
        staffName: tx.staffId === null ? "Unassigned" : `Staff #${tx.staffId}`,
        role: null,
        transactionCount: 0,
        grossRevenue: 0,
        refundCount: 0,
        refundAmount: 0,
        productQty: new Map(),
      });
    }
    const agg = aggMap.get(key)!;
    const total = parseFloat(tx.total);

    if (tx.status === "refunded") {
      // Full refund — entire transaction total was refunded
      agg.refundCount += 1;
      agg.refundAmount += total;
    } else if (tx.status === "partial_refund") {
      // Partial refund — only part of the original sale was refunded;
      // total on a partial_refund row represents the refunded portion
      agg.refundCount += 1;
      agg.refundAmount += total;
    } else if (tx.status !== "voided") {
      agg.transactionCount += 1;
      agg.grossRevenue += total;

      // Aggregate product quantities for top-product calculation
      const items = (tx.items ?? []) as Array<{ productName?: string; quantity?: number; giftCardIssue?: boolean }>;
      for (const item of items) {
        if (item.productName && !item.giftCardIssue) {
          const existing = agg.productQty.get(item.productName) ?? 0;
          agg.productQty.set(item.productName, existing + (item.quantity ?? 1));
        }
      }
    }
  }

  const items = Array.from(aggMap.values()).map((agg) => {
    const netRevenue = agg.grossRevenue - agg.refundAmount;
    const avgBasket = agg.transactionCount > 0 ? agg.grossRevenue / agg.transactionCount : 0;

    let topProduct: string | null = null;
    let topQty = 0;
    for (const [name, qty] of agg.productQty) {
      if (qty > topQty) {
        topQty = qty;
        topProduct = name;
      }
    }

    return {
      staffId: agg.staffId,
      staffName: agg.staffName,
      role: agg.role,
      transactionCount: agg.transactionCount,
      grossRevenue: Math.round(agg.grossRevenue * 100) / 100,
      refundCount: agg.refundCount,
      refundAmount: Math.round(agg.refundAmount * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      avgBasket: Math.round(avgBasket * 100) / 100,
      topProduct,
    };
  });

  // Sort by netRevenue descending by default
  items.sort((a, b) => b.netRevenue - a.netRevenue);

  res.json({ from, to, items });
});

router.get("/staff/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetStaffMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [member] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, params.data.id), eq(staffTable.merchantId, req.session.merchantId!)));
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.json(formatStaff(member));
});

router.patch("/staff/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { isActive, firstName, lastName, name, ...rest } = parsed.data as typeof parsed.data & {
    firstName?: string;
    lastName?: string;
  };
  const updates: Record<string, unknown> = { ...rest };
  /* "****" is the masked placeholder clients receive — never persist it. */
  if (updates.pin === "****") delete updates.pin;
  if (isActive !== undefined) updates.isActive = isActive ? "true" : "false";
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (firstName !== undefined || lastName !== undefined) {
    const existing = await db
      .select()
      .from(staffTable)
      .where(and(eq(staffTable.id, params.data.id), eq(staffTable.merchantId, req.session.merchantId!)))
      .limit(1);
    const base = existing[0];
    const fn = firstName ?? base?.firstName ?? "";
    const ln = lastName ?? base?.lastName ?? "";
    updates.name = `${fn} ${ln}`.trim() || name || base?.name || "Staff";
  } else if (name !== undefined) {
    updates.name = name;
  }

  const [member] = await db
    .update(staffTable)
    .set(updates)
    .where(and(eq(staffTable.id, params.data.id), eq(staffTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.json(formatStaff(member));
});

router.delete("/staff/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(staffTable)
    .where(and(eq(staffTable.id, params.data.id), eq(staffTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
