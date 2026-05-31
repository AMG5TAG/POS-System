import { Router } from "express";
import { db, conversations, messages, productsTable, transactionsTable, merchantsTable } from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
router.use(requireAuth);

/* ── List conversations ─────────────────────────────────────────────────── */
router.get("/openai/conversations", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select()
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId))
    .orderBy(desc(conversations.createdAt));
  return res.json(rows);
});

/* ── Create or upsert conversation by mode ──────────────────────────────── */
router.post("/openai/conversations", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { mode = "general", title } = req.body as { mode?: string; title?: string };

  const [existing] = await db.select()
    .from(conversations)
    .where(and(eq(conversations.merchantId, merchantId), eq(conversations.mode, mode)))
    .limit(1);

  if (existing) return res.status(201).json(existing);

  const modeTitle = title ?? {
    budget: "Budget & Profit Forecasting",
    stock: "Stock Order Recommendations",
    marketing: "Marketing Ideas",
    general: "AI Assistant",
  }[mode] ?? "AI Assistant";

  const [created] = await db.insert(conversations)
    .values({ merchantId, mode, title: modeTitle })
    .returning();
  return res.status(201).json(created);
});

/* ── Get conversation with messages ─────────────────────────────────────── */
router.get("/openai/conversations/:id", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.merchantId, merchantId)));
  if (!conv) return res.status(404).json({ error: "Not found" });
  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  return res.json({ ...conv, messages: msgs });
});

/* ── Delete conversation ─────────────────────────────────────────────────── */
router.delete("/openai/conversations/:id", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const [conv] = await db.select({ id: conversations.id }).from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.merchantId, merchantId)));
  if (!conv) return res.status(404).json({ error: "Not found" });
  await db.delete(conversations).where(eq(conversations.id, id));
  return res.status(204).end();
});

/* ── Build business context system prompt ───────────────────────────────── */
async function buildSystemPrompt(merchantId: number, mode: string): Promise<string> {
  const [merchant] = await db.select({
    businessName: merchantsTable.businessName,
    ownerName: merchantsTable.ownerName,
    phone: merchantsTable.phone,
    address: merchantsTable.address,
  }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));

  const businessName = merchant?.businessName ?? "this business";

  if (mode === "budget") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const salesAgg = await db.select({
      totalRevenue: sql<number>`COALESCE(SUM(${transactionsTable.total}), 0)`,
      totalTransactions: sql<number>`COUNT(*)`,
      avgTransaction: sql<number>`COALESCE(AVG(${transactionsTable.total}), 0)`,
    }).from(transactionsTable)
      .where(and(
        eq(transactionsTable.merchantId, merchantId),
        gte(transactionsTable.createdAt, thirtyDaysAgo),
      ));

    const productCount = await db.select({ count: sql<number>`COUNT(*)` })
      .from(productsTable).where(eq(productsTable.merchantId, merchantId));

    const agg = salesAgg[0];
    return `You are a financial analyst and business advisor for "${businessName}", an Australian retail merchant using KoaPOS.

Business context (last 30 days):
- Total Revenue: $${Number(agg?.totalRevenue ?? 0).toFixed(2)} AUD
- Total Transactions: ${agg?.totalTransactions ?? 0}
- Average Transaction Value: $${Number(agg?.avgTransaction ?? 0).toFixed(2)} AUD
- Active Products: ${productCount[0]?.count ?? 0}

Your role: Provide insightful financial forecasting, budgeting advice, profit analysis, and actionable recommendations based on the sales data above. When asked about predictions, use the historical data as your baseline. Always present figures in AUD. Be concise, practical, and specific to Australian retail.`;
  }

  if (mode === "stock") {
    const lowStockProducts = await db.select({
      name: productsTable.name,
      sku: productsTable.sku,
      stockQuantity: productsTable.stockQuantity,
      lowStockThreshold: productsTable.lowStockThreshold,
      price: productsTable.price,
      categoryId: productsTable.categoryId,
    }).from(productsTable)
      .where(and(
        eq(productsTable.merchantId, merchantId),
        eq(productsTable.trackInventory, "true"),
        sql`${productsTable.stockQuantity} <= COALESCE(${productsTable.lowStockThreshold}, 5)`,
      ))
      .limit(30);

    const allProducts = await db.select({
      name: productsTable.name,
      stockQuantity: productsTable.stockQuantity,
      categoryId: productsTable.categoryId,
    }).from(productsTable)
      .where(eq(productsTable.merchantId, merchantId))
      .limit(50);

    const lowStockSummary = lowStockProducts.length > 0
      ? lowStockProducts.map(p =>
          `  - ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ""}: ${p.stockQuantity ?? 0} units remaining${p.lowStockThreshold ? `, threshold: ${p.lowStockThreshold}` : ""}, $${p.price} AUD`
        ).join("\n")
      : "  (No low-stock items currently detected)";

    return `You are an inventory and purchasing manager for "${businessName}", an Australian retail merchant using KoaPOS.

Current inventory snapshot:
Low-stock / needs reordering:
${lowStockSummary}

Total active products: ${allProducts.length}

Your role: Analyse the stock levels above and provide specific purchase order recommendations — including suggested reorder quantities, prioritisation by urgency, and any patterns you notice. Factor in typical Australian retail lead times (5–14 days for domestic, 4–8 weeks for international). Always be specific about quantities and rationale.`;
  }

  if (mode === "marketing") {
    const [merchant2] = await db.select().from(merchantsTable)
      .where(eq(merchantsTable.id, merchantId));

    const recentTx = await db.select({
      total: transactionsTable.total,
      paymentMethod: transactionsTable.paymentMethod,
    }).from(transactionsTable)
      .where(eq(transactionsTable.merchantId, merchantId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(20);

    const totalRevenue = recentTx.reduce((s, t) => s + Number(t.total), 0);
    const cardPayments = recentTx.filter(t => t.paymentMethod === "card").length;
    const cashPayments = recentTx.filter(t => t.paymentMethod === "cash").length;

    return `You are a creative marketing strategist for "${businessName}", an Australian retail merchant using KoaPOS.

Business profile:
- Business Name: ${merchant2?.businessName ?? businessName}
- Owner: ${merchant2?.ownerName ?? "N/A"}
- Location/Phone: ${merchant2?.phone ?? "N/A"}

Recent sales metrics (last 20 transactions):
- Revenue: $${totalRevenue.toFixed(2)} AUD
- Payment split: ${cardPayments} card, ${cashPayments} cash

Your role: Generate creative, localised marketing ideas, social media copy, promotional angles, and campaign concepts tailored for Australian retail. Keep suggestions practical and actionable — include specific caption examples, hashtag suggestions, and timing recommendations. Focus on ideas that work for small-to-medium retail businesses.`;
  }

  return `You are an AI business assistant for "${businessName}", an Australian retail merchant using KoaPOS. Help the business owner with analytical questions about their business, retail operations, and strategy.`;
}

/* ── Send message + SSE stream ──────────────────────────────────────────── */
router.post("/openai/conversations/:id/messages", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const { content } = req.body as { content: string };

  if (!content?.trim()) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.merchantId, merchantId)));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.insert(messages).values({ conversationId: id, role: "user", content: content.trim() });

  const history = await db.select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt)
    .limit(40);

  const systemPrompt = await buildSystemPrompt(merchantId, conv.mode);
  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";
  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
  } catch (err) {
    req.log.error({ err }, "OpenAI streaming error");
    res.write(`data: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
  return;
});

/* ── AI Upsell Coach ────────────────────────────────────────────────────── */
// POST /ai/upsell-suggestions
// Returns 2 product suggestions the cashier should recommend at checkout.
router.post("/ai/upsell-suggestions", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { customerId, cartItems } = req.body as {
    customerId?: number | null;
    cartItems?: Array<{ productId: number; name: string }>;
  };

  const [products, recentTxs] = await Promise.all([
    db.select({
      id: productsTable.id,
      name: productsTable.name,
      price: productsTable.price,
      categoryId: productsTable.categoryId,
    })
      .from(productsTable)
      .where(and(eq(productsTable.merchantId, merchantId), eq(productsTable.isActive, "true")))
      .limit(60),
    customerId
      ? db.select({ items: transactionsTable.items })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.merchantId, merchantId),
            eq(transactionsTable.customerId, customerId),
            eq(transactionsTable.status, "completed"),
          ))
          .orderBy(desc(transactionsTable.createdAt))
          .limit(10)
      : Promise.resolve([] as { items: unknown }[]),
  ]);

  if (products.length === 0) { res.json({ suggestions: [] }); return; }

  const cartIds = new Set((cartItems ?? []).map(i => i.productId));
  const available = products.filter(p => !cartIds.has(p.id));
  if (available.length === 0) { res.json({ suggestions: [] }); return; }

  const pastNames = new Set<string>();
  for (const tx of recentTxs) {
    const items = tx.items as Array<{ productName?: string }> | null;
    if (items) items.forEach(i => i.productName && pastNames.add(i.productName));
  }

  const cartContext = cartItems?.length
    ? `Current cart: ${cartItems.map(i => i.name).join(", ")}.`
    : "Cart is empty.";
  const historyContext = pastNames.size
    ? `\nCustomer previously bought: ${[...pastNames].slice(0, 20).join(", ")}.`
    : "";
  const productList = available
    .map(p => `ID:${p.id} "${p.name}" $${parseFloat(String(p.price)).toFixed(2)}`)
    .join("\n");

  const prompt = `You are an upsell coach for a retail point-of-sale. Pick 2 products for the cashier to suggest.

${cartContext}${historyContext}

Available products (only pick from these, by exact ID):
${productList}

Rules:
- Return ONLY a JSON array, no other text: [{"productId":number,"reason":"one short sentence for the cashier to say"}]
- Pick products that complement the cart or match past purchases
- Maximum 2 items`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    let parsed: Array<{ productId: number; reason: string }> = [];
    try { parsed = JSON.parse(completion.choices[0]?.message?.content ?? "[]"); } catch { parsed = []; }

    const suggestions = parsed
      .filter(s => typeof s.productId === "number" && typeof s.reason === "string")
      .map(s => {
        const p = available.find(pr => pr.id === s.productId);
        if (!p) return null;
        return { productId: p.id, name: p.name, price: parseFloat(String(p.price)), reason: s.reason };
      })
      .filter(Boolean)
      .slice(0, 2);

    res.json({ suggestions });
  } catch (err) {
    req.log.error({ err }, "AI upsell failed");
    res.json({ suggestions: [] });
  }
  return;
});

export default router;
