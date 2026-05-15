import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListCustomersQueryParams,
  CreateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  UpdateCustomerBody,
  DeleteCustomerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatCustomer(c: typeof customersTable.$inferSelect) {
  return {
    id: c.id,
    merchantId: c.merchantId,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: c.address ?? null,
    notes: c.notes ?? null,
    loyaltyPoints: c.loyaltyPoints,
    totalSpent: parseFloat(c.totalSpent),
    visitCount: c.visitCount,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListCustomersQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { search, limit = 50, offset = 0 } = queryParams.data;

  const conditions = [eq(customersTable.merchantId, req.session.merchantId!)];
  if (search) {
    conditions.push(
      or(
        ilike(customersTable.firstName, `%${search}%`),
        ilike(customersTable.lastName, `%${search}%`),
        ilike(customersTable.email, `%${search}%`),
        ilike(customersTable.phone, `%${search}%`)
      )!
    );
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(customersTable)
    .where(and(...conditions));

  const customers = await db
    .select()
    .from(customersTable)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(customersTable.createdAt);

  res.json({
    items: customers.map(formatCustomer),
    total: Number(countResult.count),
  });
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db
    .insert(customersTable)
    .values({ ...parsed.data, merchantId: req.session.merchantId! })
    .returning();
  res.status(201).json(formatCustomer(customer));
});

router.get("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, req.session.merchantId!)));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(formatCustomer(customer));
});

router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db
    .update(customersTable)
    .set(parsed.data)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(formatCustomer(customer));
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(customersTable)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
