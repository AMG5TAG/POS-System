---
name: merchantIntegrationsTable columns
description: Correct column names for merchant_integrations table — commonly confused with wrong names
---

The `merchantIntegrationsTable` (defined in `lib/db/src/schema/merchants.ts`) has these columns:

| Correct column | Wrong guess | Notes |
|---|---|---|
| `integrationKey` | `key` | e.g. `"xero"`, `"quickbooks"` |
| `status` | `connected` | `"disconnected"` or `"connected"` |
| `credentials` | `meta` | text column; store as `JSON.stringify({...})`, read with `JSON.parse()` |
| `accessToken` | `vaultKey` | stored directly on the row (plaintext in dev) |
| `refreshToken` | — | direct column |
| `tokenExpiresAt` | — | timestamp |

**Why:** These were confused multiple times when writing new integration routes (Xero pattern uses `credentials` as a JSON blob for sync logs, tenant IDs, etc.).

**How to apply:** When writing any route that queries `merchantIntegrationsTable`, use `.where(eq(merchantIntegrationsTable.integrationKey, "mykey"))` and access `.credentials` (parse as JSON) for extra metadata. Mirror the pattern in `artifacts/api-server/src/routes/xero.ts` (`getRow`, `getCreds`, `saveCreds` helpers).
