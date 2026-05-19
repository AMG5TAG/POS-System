import { Router, type IRouter } from "express";
import { db, formsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/forms", requireAuth, async (req, res): Promise<void> => {
  const forms = await db
    .select()
    .from(formsTable)
    .where(eq(formsTable.merchantId, req.session.merchantId!))
    .orderBy(desc(formsTable.updatedAt));
  res.json(forms);
});

router.post("/forms", requireAuth, async (req, res): Promise<void> => {
  const { name, description, fields } = req.body as {
    name?: string; description?: string; fields?: unknown[];
  };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [form] = await db
    .insert(formsTable)
    .values({
      merchantId:  req.session.merchantId!,
      name,
      description: description ?? null,
      fields:      fields ?? [],
    })
    .returning();
  res.status(201).json(form);
});

router.get("/forms/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const [form] = await db
    .select()
    .from(formsTable)
    .where(and(eq(formsTable.id, id), eq(formsTable.merchantId, req.session.merchantId!)));
  if (!form) { res.status(404).json({ error: "not found" }); return; }
  res.json(form);
});

router.put("/forms/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const { name, description, fields } = req.body as {
    name?: string; description?: string; fields?: unknown[];
  };
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates["name"] = name;
  if (description !== undefined) updates["description"] = description;
  if (fields !== undefined) updates["fields"] = fields;
  const [form] = await db
    .update(formsTable)
    .set(updates)
    .where(and(eq(formsTable.id, id), eq(formsTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!form) { res.status(404).json({ error: "not found" }); return; }
  res.json(form);
});

router.delete("/forms/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  await db
    .delete(formsTable)
    .where(and(eq(formsTable.id, id), eq(formsTable.merchantId, req.session.merchantId!)));
  res.json({ success: true });
});

export default router;
