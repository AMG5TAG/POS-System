import { Router, type IRouter } from "express";
import { db, giftCardsTable, giftCardLedgerTable, giftCardSettingsTable } from "@workspace/db";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/* ── Helper: format card row ────────────────────────────────────────────── */
function formatCard(row: typeof giftCardsTable.$inferSelect) {
  return {
    ...row,
    initialValue:   parseFloat(row.initialValue   as unknown as string),
    currentBalance: parseFloat(row.currentBalance as unknown as string),
    expiryDate: row.expiryDate ? row.expiryDate.toISOString() : null,
    createdAt:  row.createdAt.toISOString(),
  };
}

function formatLedger(row: typeof giftCardLedgerTable.$inferSelect) {
  return {
    ...row,
    amount:       parseFloat(row.amount      as unknown as string),
    balanceAfter: parseFloat(row.balanceAfter as unknown as string),
    createdAt:    row.createdAt.toISOString(),
  };
}

/* ── GET /api/gift-card-settings ────────────────────────────────────────── */
router.get("/gift-card-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(giftCardSettingsTable)
    .where(eq(giftCardSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(giftCardSettingsTable)
      .values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

/* ── PUT /api/gift-card-settings ────────────────────────────────────────── */
router.put("/gift-card-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { expiryMonths, allowPartialRedemptions, prefix } = req.body as {
    expiryMonths?: number | null;
    allowPartialRedemptions?: string;
    prefix?: string;
  };
  const updates: Partial<typeof giftCardSettingsTable.$inferInsert> = {};
  if (expiryMonths            !== undefined) updates.expiryMonths            = expiryMonths ?? null;
  if (allowPartialRedemptions !== undefined) updates.allowPartialRedemptions = allowPartialRedemptions;
  if (prefix                  !== undefined) updates.prefix                  = prefix;

  const [existing] = await db.select().from(giftCardSettingsTable)
    .where(eq(giftCardSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(giftCardSettingsTable).set(updates)
      .where(eq(giftCardSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(giftCardSettingsTable)
    .values({ merchantId, ...updates }).returning();
  res.json(created);
});

/* ── GET /api/gift-cards ────────────────────────────────────────────────── */
router.get("/gift-cards", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const search = (req.query.search as string) || "";
  const status = (req.query.status as string) || "";
  const limit  = parseInt((req.query.limit  as string) || "100", 10);
  const offset = parseInt((req.query.offset as string) || "0",   10);

  const conditions = [eq(giftCardsTable.merchantId, merchantId)];
  if (search) {
    conditions.push(
      or(
        ilike(giftCardsTable.cardNumber, `%${search}%`),
        ilike(giftCardsTable.issuedTo,   `%${search}%`),
      )!
    );
  }
  if (status) conditions.push(eq(giftCardsTable.status, status));

  const where = and(...conditions);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(giftCardsTable)
    .where(where);
  const items = await db.select().from(giftCardsTable)
    .where(where)
    .orderBy(desc(giftCardsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ items: items.map(formatCard), total: count });
});

/* ── POST /api/gift-cards ───────────────────────────────────────────────── */
router.post("/gift-cards", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { cardNumber, initialValue, expiryDate, issuedTo, note } = req.body as {
    cardNumber: string;
    initialValue: number;
    expiryDate?: string | null;
    issuedTo?: string | null;
    note?: string | null;
  };
  if (!cardNumber || initialValue == null) {
    res.status(400).json({ error: "cardNumber and initialValue are required" }); return;
  }

  const [card] = await db.insert(giftCardsTable).values({
    merchantId,
    cardNumber: cardNumber.trim().toUpperCase(),
    initialValue:   String(initialValue),
    currentBalance: String(initialValue),
    status: "active",
    expiryDate: expiryDate ? new Date(expiryDate) : null,
    issuedTo: issuedTo ?? null,
    note: note ?? null,
  }).returning();

  /* Write issue ledger entry */
  await db.insert(giftCardLedgerTable).values({
    merchantId,
    giftCardId:   card.id,
    type:         "issue",
    amount:       String(initialValue),
    balanceAfter: String(initialValue),
    note:         `Gift card issued for $${initialValue.toFixed(2)}`,
  });

  res.status(201).json(formatCard(card));
});

/* ── POST /api/gift-cards/validate ──────────────────────────────────────── */
router.post("/gift-cards/validate", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { cardNumber, saleTotal } = req.body as { cardNumber: string; saleTotal: number };
  if (!cardNumber) { res.status(400).json({ error: "cardNumber is required" }); return; }

  const [card] = await db.select().from(giftCardsTable)
    .where(and(
      eq(giftCardsTable.merchantId, merchantId),
      eq(giftCardsTable.cardNumber, cardNumber.trim().toUpperCase()),
    )).limit(1);

  if (!card) {
    res.json({
      valid: false, cardId: 0, cardNumber, currentBalance: 0, applicableAmount: 0,
      status: "not_found", errorMessage: "Gift card not found",
    }); return;
  }

  const balance = parseFloat(card.currentBalance as unknown as string);

  /* Check expiry */
  if (card.expiryDate && new Date() > card.expiryDate) {
    if (card.status !== "expired") {
      await db.update(giftCardsTable).set({ status: "expired" })
        .where(eq(giftCardsTable.id, card.id));
    }
    res.json({
      valid: false, cardId: card.id, cardNumber, currentBalance: balance,
      applicableAmount: 0, status: "expired", errorMessage: "This gift card has expired",
    }); return;
  }

  if (card.status === "on_hold") {
    res.json({
      valid: false, cardId: card.id, cardNumber, currentBalance: balance,
      applicableAmount: 0, status: "on_hold", errorMessage: "This gift card is on hold",
    }); return;
  }

  if (card.status === "exhausted" || balance <= 0) {
    res.json({
      valid: false, cardId: card.id, cardNumber, currentBalance: balance,
      applicableAmount: 0, status: "exhausted", errorMessage: "This gift card has no remaining balance",
    }); return;
  }

  if (card.status !== "active") {
    res.json({
      valid: false, cardId: card.id, cardNumber, currentBalance: balance,
      applicableAmount: 0, status: card.status, errorMessage: `Gift card status: ${card.status}`,
    }); return;
  }

  /* Get partial redemption setting */
  const [settings] = await db.select().from(giftCardSettingsTable)
    .where(eq(giftCardSettingsTable.merchantId, merchantId)).limit(1);
  const allowPartial = settings?.allowPartialRedemptions !== "false";

  let applicableAmount: number;
  if (allowPartial) {
    applicableAmount = Math.min(balance, saleTotal);
  } else {
    /* Full-card only: the card must cover the entire sale */
    applicableAmount = balance >= saleTotal ? saleTotal : 0;
    if (applicableAmount === 0) {
      res.json({
        valid: false, cardId: card.id, cardNumber, currentBalance: balance,
        applicableAmount: 0, status: "active",
        errorMessage: `Partial redemptions not allowed. Card balance ($${balance.toFixed(2)}) is less than sale total ($${saleTotal.toFixed(2)})`,
      }); return;
    }
  }

  res.json({
    valid: true,
    cardId: card.id,
    cardNumber: card.cardNumber,
    currentBalance: balance,
    applicableAmount,
    status: card.status,
    errorMessage: null,
  });
});

/* ── GET /api/gift-cards/:id ────────────────────────────────────────────── */
router.get("/gift-cards/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const [card] = await db.select().from(giftCardsTable)
    .where(and(eq(giftCardsTable.id, id), eq(giftCardsTable.merchantId, merchantId))).limit(1);
  if (!card) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatCard(card));
});

/* ── PATCH /api/gift-cards/:id ──────────────────────────────────────────── */
router.patch("/gift-cards/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const { status, currentBalance, expiryDate, issuedTo, note, adjustmentNote } = req.body as {
    status?: string;
    currentBalance?: number;
    expiryDate?: string | null;
    issuedTo?: string | null;
    note?: string | null;
    adjustmentNote?: string | null;
  };

  const [card] = await db.select().from(giftCardsTable)
    .where(and(eq(giftCardsTable.id, id), eq(giftCardsTable.merchantId, merchantId))).limit(1);
  if (!card) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Partial<typeof giftCardsTable.$inferInsert> = {};
  if (expiryDate !== undefined) updates.expiryDate = expiryDate ? new Date(expiryDate) : null;
  if (issuedTo   !== undefined) updates.issuedTo   = issuedTo ?? null;
  if (note       !== undefined) updates.note        = note ?? null;

  /* Balance adjustment — write a ledger entry */
  if (currentBalance !== undefined) {
    const oldBalance = parseFloat(card.currentBalance as unknown as string);
    const delta      = currentBalance - oldBalance;
    updates.currentBalance = String(currentBalance);
    if (currentBalance <= 0) updates.status = "exhausted";
    else if (card.status === "exhausted") updates.status = "active";

    await db.insert(giftCardLedgerTable).values({
      merchantId,
      giftCardId:   card.id,
      type:         "adjustment",
      amount:       String(delta),
      balanceAfter: String(currentBalance),
      note:         adjustmentNote ?? `Manual balance adjustment from $${oldBalance.toFixed(2)} to $${currentBalance.toFixed(2)}`,
    });
  }

  /* Status change */
  if (status !== undefined && status !== updates.status) {
    updates.status = status;
    if (status === "on_hold" || status === "active" || status === "expired") {
      await db.insert(giftCardLedgerTable).values({
        merchantId,
        giftCardId:   card.id,
        type:         status === "on_hold" ? "void" : "adjustment",
        amount:       "0",
        balanceAfter: card.currentBalance as unknown as string,
        note:         adjustmentNote ?? `Status changed to ${status}`,
      });
    }
  }

  const [updated] = await db.update(giftCardsTable).set(updates)
    .where(and(eq(giftCardsTable.id, id), eq(giftCardsTable.merchantId, merchantId))).returning();
  res.json(formatCard(updated));
});

/* ── DELETE /api/gift-cards/:id ─────────────────────────────────────────── */
router.delete("/gift-cards/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(giftCardLedgerTable).where(
    and(eq(giftCardLedgerTable.giftCardId, id), eq(giftCardLedgerTable.merchantId, merchantId))
  );
  await db.delete(giftCardsTable)
    .where(and(eq(giftCardsTable.id, id), eq(giftCardsTable.merchantId, merchantId)));
  res.status(204).end();
});

/* ── GET /api/gift-cards/:id/ledger ─────────────────────────────────────── */
router.get("/gift-cards/:id/ledger", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const entries = await db.select().from(giftCardLedgerTable)
    .where(and(eq(giftCardLedgerTable.giftCardId, id), eq(giftCardLedgerTable.merchantId, merchantId)))
    .orderBy(desc(giftCardLedgerTable.createdAt));
  res.json(entries.map(formatLedger));
});

export default router;
