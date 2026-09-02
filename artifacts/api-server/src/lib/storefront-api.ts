/**
 * The Storefront Data API, described once.
 *
 * A merchant who wants to build their own website — increasingly by handing the
 * job to an AI agent — needs read access to their KoaPOS catalogue, and often to
 * their customers and sales as well. This module is the single description of
 * that API: its scopes, its endpoints, and the connection brief handed to the
 * agent.
 *
 * Keeping the description here rather than in the route handlers is what lets
 * the generated brief be trustworthy: `routes/storefront-api.ts` implements
 * exactly these paths, and a test asserts the two lists match, so an endpoint
 * cannot be added, moved or removed without the merchant's brief following it.
 */

/* ─── Scopes ─────────────────────────────────────────────────────────────── */

export interface ApiScope {
  id: string;
  label: string;
  description: string;
  /** True when the scope exposes personal information about real people. */
  sensitive: boolean;
}

export const API_SCOPES: ApiScope[] = [
  { id: "products:read",  label: "Products",  sensitive: false,
    description: "Catalogue: products, categories, brands, prices, images." },
  { id: "inventory:read", label: "Inventory", sensitive: false,
    description: "Stock levels and low-stock thresholds, so a storefront can show availability." },
  { id: "customers:read", label: "Customers", sensitive: true,
    description: "Customer records — names, emails, phone numbers, addresses, loyalty balances." },
  { id: "sales:read",     label: "Sales",     sensitive: true,
    description: "Completed sales with their line items, totals and payment method." },
];

/** What a new key gets unless the merchant ticks more: catalogue only, no PII. */
export const DEFAULT_SCOPES = ["products:read", "inventory:read"];

export const ALL_SCOPE_IDS: string[] = API_SCOPES.map((s) => s.id);

export function isValidScope(scope: string): boolean {
  return ALL_SCOPE_IDS.includes(scope);
}

export function parseScopes(csv: string): string[] {
  return csv.split(",").map((s) => s.trim()).filter(isValidScope);
}

/* ─── Endpoints ──────────────────────────────────────────────────────────── */

export interface ApiParam { name: string; description: string }

export interface ApiEndpoint {
  /** Path under the API base, e.g. "/products/:id". */
  path: string;
  /** Scope required, or null when any valid key may call it. */
  scope: string | null;
  summary: string;
  params?: ApiParam[];
  /** Field names in each returned object, for the brief's schema section. */
  fields: string[];
}

const PAGING: ApiParam[] = [
  { name: "limit",  description: "Items per page, 1–200 (default 50)." },
  { name: "cursor", description: "Value of `nextCursor` from the previous page." },
];

/** Only tables that carry `updated_at` can answer this, so it is not universal. */
const UPDATED_SINCE: ApiParam = {
  name: "updatedSince",
  description: "ISO-8601 timestamp; only records changed since then. Use this to sync incrementally instead of refetching everything.",
};

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    path: "/store", scope: null,
    summary: "The business behind the key: name, branding, contact details, currency and timezone. Call this first — it also confirms the key works and reports the scopes it holds.",
    fields: ["businessName", "username", "logoUrl", "email", "phone", "address", "city", "country", "currency", "timezone", "scopes"],
  },
  {
    path: "/products", scope: "products:read",
    summary: "Active products, newest first. Prices are decimal numbers; `stock` is present only when the key also holds inventory:read.",
    params: [
      ...PAGING, UPDATED_SINCE,
      { name: "categoryId", description: "Only products in this category." },
      { name: "search", description: "Case-insensitive match on name, SKU or barcode." },
      { name: "includeInactive", description: '"true" to include products the merchant has deactivated (they are hidden by default).' },
    ],
    fields: ["id", "name", "description", "price", "sku", "barcode", "imageUrl", "categoryId", "categoryName", "brandName", "taxRate", "isActive", "tags", "stock", "createdAt", "updatedAt"],
  },
  {
    path: "/products/:id", scope: "products:read",
    summary: "One product by id.",
    fields: ["id", "name", "description", "price", "sku", "barcode", "imageUrl", "categoryId", "categoryName", "brandName", "taxRate", "isActive", "tags", "stock", "createdAt", "updatedAt"],
  },
  {
    path: "/categories", scope: "products:read",
    summary: "Product categories, including their parent for nested menus.",
    fields: ["id", "name", "parentId", "sortOrder", "color", "icon"],
  },
  {
    path: "/brands", scope: "products:read",
    summary: "Brands referenced by products.",
    fields: ["id", "name", "logoUrl", "website"],
  },
  {
    path: "/inventory", scope: "inventory:read",
    summary: "Stock levels only — a light endpoint to poll for availability without refetching the catalogue. Stock is per product, not per location.",
    params: [...PAGING, UPDATED_SINCE],
    fields: ["id", "sku", "stock", "lowStockThreshold", "trackInventory", "updatedAt"],
  },
  {
    path: "/customers", scope: "customers:read",
    summary: "Customer records. PERSONAL INFORMATION — see the privacy note below.",
    params: [
      ...PAGING, UPDATED_SINCE,
      { name: "search", description: "Case-insensitive match on name, email or phone." },
    ],
    fields: ["id", "firstName", "lastName", "company", "email", "phone", "address", "billing", "shipping", "customerGroup", "loyaltyPoints", "totalSpent", "visitCount", "acceptsMarketing", "createdAt", "updatedAt"],
  },
  {
    path: "/customers/:id", scope: "customers:read",
    summary: "One customer by id. PERSONAL INFORMATION.",
    fields: ["id", "firstName", "lastName", "company", "email", "phone", "address", "billing", "shipping", "customerGroup", "loyaltyPoints", "totalSpent", "visitCount", "acceptsMarketing", "createdAt", "updatedAt"],
  },
  {
    path: "/sales", scope: "sales:read",
    summary: "Completed sales, newest first. `customerId` is null for a walk-in sale.",
    params: [
      ...PAGING,
      { name: "from", description: "ISO-8601 date/time; sales at or after this moment." },
      { name: "to",   description: "ISO-8601 date/time; sales before this moment." },
      { name: "customerId", description: "Only this customer's sales." },
    ],
    fields: ["id", "receiptNumber", "status", "customerId", "subtotal", "taxTotal", "discountTotal", "total", "paymentMethod", "items", "createdAt"],
  },
  {
    path: "/sales/:id", scope: "sales:read",
    summary: "One sale by id, with its line items.",
    fields: ["id", "receiptNumber", "status", "customerId", "subtotal", "taxTotal", "discountTotal", "total", "paymentMethod", "items", "createdAt"],
  },
];

/* ─── Limits ─────────────────────────────────────────────────────────────── */

export const RATE_LIMIT = { requests: 120, windowMinutes: 1 };
export const PAGE_SIZE = { default: 50, max: 200 };

/** Path the API is served under, relative to the app's origin. */
export const API_BASE_PATH = "/api/storefront/v1";

/* ─── The connection brief ───────────────────────────────────────────────── */

export interface ManifestInput {
  origin: string;
  businessName: string;
  keyName: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt?: Date | null;
  /** The plaintext key — available only at creation. Otherwise a placeholder. */
  secret?: string | null;
  generatedAt?: Date;
}

/**
 * The file a merchant hands to their AI: everything needed to connect, and the
 * rules for doing it safely.
 *
 * It is Markdown because that is what coding agents read best, with one JSON
 * block for anything that wants to parse rather than read. The key itself is
 * only embedded when the brief is generated at creation time — every later
 * download carries a placeholder, because KoaPOS keeps only a hash and could
 * not reproduce the secret even if it wanted to.
 */
export function buildConnectionManifest(input: ManifestInput): string {
  const {
    origin, businessName, keyName, keyPrefix, scopes,
    expiresAt, secret, generatedAt = new Date(),
  } = input;

  const base = `${origin}${API_BASE_PATH}`;
  const keyValue = secret ?? "<YOUR_API_KEY>";
  const granted = API_SCOPES.filter((s) => scopes.includes(s.id));
  const sensitive = granted.filter((s) => s.sensitive);
  const endpoints = API_ENDPOINTS.filter((e) => e.scope === null || scopes.includes(e.scope));

  const lines: string[] = [];
  const w = (s = "") => lines.push(s);

  w(`# KoaPOS Storefront Data API — connection brief`);
  w();
  w(`For: **${businessName}**`);
  w(`Key: **${keyName || "(unnamed)"}** (\`${keyPrefix}…\`)`);
  w(`Generated: ${generatedAt.toISOString()}`);
  w();
  w(`> Give this file to the AI agent or developer building your website. It`);
  w(`> describes everything needed to read your KoaPOS data — and the rules for`);
  w(`> doing it safely. It is not a substitute for reading your own privacy`);
  w(`> obligations before exposing customer data on a public site.`);
  w();

  /* ── Instructions aimed squarely at the agent ── */
  w(`## Instructions for the AI agent`);
  w();
  w(`1. Read this whole file before writing code.`);
  w(`2. Every request goes to a server you control — never from the visitor's`);
  w(`   browser. The key below grants read access to this business's data; any`);
  w(`   code path that ships it to a browser leaks it to every visitor.`);
  w(`3. Store the key in an environment variable (\`KOAPOS_API_KEY\`). Never`);
  w(`   commit it, never inline it in source, never log it.`);
  w(`4. Cache responses and sync incrementally with \`updatedSince\` rather than`);
  w(`   refetching the catalogue on every page view. The rate limit below is`);
  w(`   generous for a cached site and tight for an uncached one.`);
  w(`5. This API is **read-only**. Nothing here can create an order, take a`);
  w(`   payment, or change anything in KoaPOS. Build checkout with a payment`);
  w(`   provider of your own.`);
  w(`6. Treat every value as untrusted text when rendering it into HTML — product`);
  w(`   descriptions and customer notes are typed by people.`);
  w();

  /* ── Connection ── */
  w(`## Connection`);
  w();
  w(`- **Base URL:** \`${base}\``);
  w(`- **Auth header:** \`Authorization: Bearer ${keyValue}\``);
  w(`- **Format:** JSON. Send \`Accept: application/json\`.`);
  w(`- **Method:** \`GET\` only.`);
  if (!secret) {
    w();
    w(`> The key itself is not in this file. KoaPOS stores only a hash of it, so`);
    w(`> it can be shown once — when it is created — and never again. Paste your`);
    w(`> saved key in place of \`<YOUR_API_KEY>\`, or create a new key in`);
    w(`> Management › Online Store › Data API.`);
  }
  if (expiresAt) {
    w();
    w(`> **This key expires ${expiresAt.toISOString().slice(0, 10)}.** Requests after that date fail with 401.`);
  }
  w();
  w(`### First call`);
  w();
  w("```bash");
  w(`curl -s "${base}/store" -H "Authorization: Bearer ${keyValue}"`);
  w("```");
  w();
  w(`It returns the business profile and the scopes this key holds. A 401 means`);
  w(`the key is wrong, revoked or expired; a 403 means the key is valid but`);
  w(`lacks the scope for that endpoint.`);
  w();
  w("```ts");
  w(`// Node / TypeScript — server side only.`);
  w(`const KOAPOS_BASE = "${base}";`);
  w(`async function koapos<T>(path: string, params: Record<string, string> = {}): Promise<T> {`);
  w(`  const url = new URL(KOAPOS_BASE + path);`);
  w(`  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);`);
  w(`  const res = await fetch(url, {`);
  w(`    headers: { Authorization: \`Bearer \${process.env.KOAPOS_API_KEY}\`, Accept: "application/json" },`);
  w(`  });`);
  w(`  if (!res.ok) throw new Error(\`KoaPOS \${res.status}: \${await res.text()}\`);`);
  w(`  return res.json() as Promise<T>;`);
  w(`}`);
  w("```");
  w();

  /* ── Scopes ── */
  w(`## What this key can read`);
  w();
  for (const s of API_SCOPES) {
    const has = scopes.includes(s.id);
    w(`- ${has ? "✅" : "❌"} \`${s.id}\` — ${s.description}${s.sensitive ? " **(personal information)**" : ""}`);
  }
  w();
  w(`Requests outside these scopes return \`403 insufficient_scope\`. To change`);
  w(`them the merchant issues a new key — scopes are fixed for the life of a key.`);
  w();

  /* ── Endpoints ── */
  w(`## Endpoints`);
  w();
  w(`All paths are relative to the base URL. List endpoints return`);
  w(`\`{ "data": [...], "nextCursor": string | null, "hasMore": boolean }\`;`);
  w(`single-item endpoints return the object itself.`);
  w();
  for (const e of endpoints) {
    w(`### \`GET ${e.path}\``);
    w();
    w(e.summary);
    w();
    if (e.params?.length) {
      w(`Query parameters:`);
      w();
      for (const p of e.params) w(`- \`${p.name}\` — ${p.description}`);
      w();
    }
    w(`Fields: ${e.fields.map((f) => `\`${f}\``).join(", ")}`);
    w();
  }

  /* ── Paging ── */
  w(`## Paging and incremental sync`);
  w();
  w(`Pages are cursor-based and stable: pass \`cursor\` from the previous`);
  w(`response's \`nextCursor\` until \`hasMore\` is false. Default page size is`);
  w(`${PAGE_SIZE.default}, maximum ${PAGE_SIZE.max}.`);
  w();
  w(`For a site that stays in sync, store the timestamp of your last successful`);
  w(`sync and pass it as \`updatedSince\` on the next run. Only changed records`);
  w(`come back. Deletions are not reported — a product removed from KoaPOS simply`);
  w(`stops appearing, so reconcile by full sync occasionally (nightly is plenty).`);
  w();

  /* ── Errors and limits ── */
  w(`## Errors and limits`);
  w();
  w(`| Status | Meaning | What to do |`);
  w(`|---|---|---|`);
  w(`| 401 | Key missing, wrong, revoked or expired | Stop and tell the merchant — retrying will not help |`);
  w(`| 403 | Valid key, but the scope is not granted | Drop the feature or ask for a new key |`);
  w(`| 404 | No such record for this business | Treat as missing, not as an error |`);
  w(`| 429 | Rate limited | Back off and respect \`Retry-After\` |`);
  w(`| 5xx | KoaPOS problem | Retry with exponential backoff, serve cached data |`);
  w();
  w(`Errors are JSON: \`{ "error": "insufficient_scope", "message": "…" }\`.`);
  w();
  w(`Rate limit: **${RATE_LIMIT.requests} requests per ${RATE_LIMIT.windowMinutes} minute(s)** per key.`);
  w();

  /* ── Security ── */
  w(`## Security rules`);
  w();
  w(`- The key is a bearer credential: whoever holds it can read everything in`);
  w(`  the scopes above. Treat it like a password.`);
  w(`- Server side only. Not in browser JavaScript, not in a mobile app bundle,`);
  w(`  not in a URL query string, not in a public repository.`);
  w(`- One key per site or environment, so a leak can be revoked without taking`);
  w(`  everything else down. Revoking is immediate: Management › Online Store ›`);
  w(`  Data API › Revoke.`);
  w(`- Rotate on a schedule and whenever anyone with access leaves.`);
  w(`- Serve your site over HTTPS; requests to this API must use HTTPS.`);
  w();

  /* ── Privacy ── */
  if (sensitive.length) {
    w(`## Privacy — read this before using ${sensitive.map((s) => `\`${s.id}\``).join(" or ")}`);
    w();
    w(`This key can read **personal information about real people**: ${sensitive.map((s) => s.label.toLowerCase()).join(" and ")}.`);
    w();
    w(`- Never publish it. Customer names, contact details and purchase history`);
    w(`  must not be rendered into any public page, sitemap, feed or search index.`);
    w(`- Use it only where the person is authenticated as themselves — an account`);
    w(`  area or order history — or in aggregate, where no individual is`);
    w(`  identifiable.`);
    w(`- Do not send it to third-party services (including AI model providers)`);
    w(`  without the merchant's explicit instruction. Pasting a customer export`);
    w(`  into a chat window is a disclosure.`);
    w(`- Australian merchants: the Privacy Act 1988 and the Australian Privacy`);
    w(`  Principles apply to this data, including how long you keep it and what`);
    w(`  you do after a breach. The merchant remains responsible for it.`);
    w(`- Store only what the site actually needs, and delete it when it no longer`);
    w(`  does.`);
    w();
  }

  /* ── Machine-readable ── */
  w(`## Machine-readable configuration`);
  w();
  w("```json");
  w(JSON.stringify({
    api: "koapos-storefront-v1",
    baseUrl: base,
    auth: { type: "bearer", header: "Authorization", format: "Bearer <key>", envVar: "KOAPOS_API_KEY" },
    key: secret ? { value: secret, prefix: keyPrefix } : { value: null, prefix: keyPrefix, note: "shown once at creation" },
    business: businessName,
    scopes,
    readOnly: true,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    rateLimit: { requests: RATE_LIMIT.requests, windowMinutes: RATE_LIMIT.windowMinutes },
    pageSize: PAGE_SIZE,
    endpoints: endpoints.map((e) => ({ method: "GET", path: e.path, scope: e.scope, fields: e.fields })),
  }, null, 2));
  w("```");
  w();
  w(`---`);
  w();
  w(`Generated by KoaPOS for ${businessName}. Endpoints and limits are current as`);
  w(`of the date above; re-download this brief after changing keys.`);

  return lines.join("\n") + "\n";
}

/** File name offered to the merchant for the brief. */
export function manifestFilename(businessName: string): string {
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store";
  return `koapos-api-${slug}.md`;
}
