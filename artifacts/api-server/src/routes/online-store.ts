import { Router, type IRouter } from "express";
import dns from "node:dns/promises";
import { db, onlineStoreSettingsTable, onlineStoreThirdpartyTable, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { stripManagedFields } from "../lib/settings-body";

const router: IRouter = Router();

/** Host that customer CNAME records must point at. */
const PLATFORM_HOST = "koapos.com.au";

/** Normalise a user-entered domain to a bare hostname (no scheme / path / port). */
function normaliseDomain(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

// Public storefront (no auth): resolve a merchant's published store by username.
//   /b/:username/o/:slug  →  https://koapos.com.au/b/USERNAME/o/SLUG
// The slug is a vanity path (one store per merchant), so the merchant username
// identifies the store; drafts (not published) are hidden.
router.get("/online-store/public/b/:username/o/:slug", async (req, res): Promise<void> => {
  const username = String(req.params.username || "").trim().toLowerCase();
  if (!username) { res.status(404).json({ error: "Store not found" }); return; }

  const [merchant] = await db
    .select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(eq(merchantsTable.username, username))
    .limit(1);
  if (!merchant) { res.status(404).json({ error: "Store not found" }); return; }

  const [row] = await db
    .select()
    .from(onlineStoreSettingsTable)
    .where(eq(onlineStoreSettingsTable.merchantId, merchant.id))
    .limit(1);
  // Only serve a published builder store — never leak a draft or third-party config.
  if (!row || row.published !== "true" || row.mode !== "builder") {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.json(row);
});

router.get("/online-store-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(onlineStoreSettingsTable).where(eq(onlineStoreSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(onlineStoreSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/online-store-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = stripManagedFields(req.body ?? {}) as Partial<typeof onlineStoreSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(onlineStoreSettingsTable).where(eq(onlineStoreSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(onlineStoreSettingsTable).set(body).where(eq(onlineStoreSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(onlineStoreSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

/* Verify a custom domain: confirm its DNS points at the platform, then mark it
 * live. TLS is issued automatically by the edge (on-demand TLS / SSL-for-SaaS)
 * once the hostname resolves to us, so a DNS-verified subdomain is treated as
 * active. Apex domains (no sub-label) can't use CNAME, so we accept an A/ALIAS
 * that resolves and leave it "verifying" for the edge to finish the cert. */
router.post("/online-store/domain/verify", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const domain = normaliseDomain((req.body as { domain?: string })?.domain);

  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    res.status(400).json({ error: "Enter a valid domain, e.g. shop.yourbusiness.com" });
    return;
  }

  const [existing] = await db.select().from(onlineStoreSettingsTable)
    .where(eq(onlineStoreSettingsTable.merchantId, merchantId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Store settings not found" }); return; }

  const labels = domain.split(".");
  const isApex = labels.length <= 2; // e.g. "example.com" has no sub-label
  let status: "active" | "verifying" | "failed" = "failed";
  let detail = "";

  try {
    if (!isApex) {
      // Subdomain → must CNAME to the platform host.
      const cnames = await dns.resolveCname(domain).catch(() => [] as string[]);
      const pointsToUs = cnames.some((c) => normaliseDomain(c).endsWith(PLATFORM_HOST));
      if (pointsToUs) {
        status = "active";
      } else {
        status = "failed";
        detail = `No CNAME record for ${domain} pointing to ${PLATFORM_HOST} was found. It can take up to 24–48 hours to propagate.`;
      }
    } else {
      // Apex domain → CNAME isn't valid; accept if it resolves to an address
      // (ALIAS/A record) and let the edge finish issuing the certificate.
      const addrs = await dns.resolve(domain).catch(() => [] as string[]);
      if (addrs.length > 0) {
        status = "verifying";
        detail = "Apex domain detected — using ALIAS/A record. The certificate is being issued; this can take a few minutes.";
      } else {
        status = "failed";
        detail = `${domain} doesn't resolve yet. Add an ALIAS/A record (CNAME isn't valid on a root domain), then verify again.`;
      }
    }
  } catch {
    status = "failed";
    detail = `Could not resolve DNS for ${domain}. Check the record and try again.`;
  }

  const [updated] = await db.update(onlineStoreSettingsTable)
    .set({ domain, domainStatus: status })
    .where(eq(onlineStoreSettingsTable.merchantId, merchantId))
    .returning();

  res.json({ status, error: status === "failed" ? detail : undefined, detail: detail || undefined, settings: updated });
});

router.get("/online-store-thirdparty", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(onlineStoreThirdpartyTable).where(eq(onlineStoreThirdpartyTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(onlineStoreThirdpartyTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/online-store-thirdparty", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = stripManagedFields(req.body ?? {}) as Partial<typeof onlineStoreThirdpartyTable.$inferInsert>;
  const [existing] = await db.select().from(onlineStoreThirdpartyTable).where(eq(onlineStoreThirdpartyTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(onlineStoreThirdpartyTable).set(body).where(eq(onlineStoreThirdpartyTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(onlineStoreThirdpartyTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

export default router;
