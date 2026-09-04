/**
 * migrate-ai-keys-to-vault — move merchant-supplied AI API keys out of the
 * plaintext `merchant_integrations.credentials` column and into the encrypted
 * OAuth token vault.
 *
 * WHY: the `openai` integration shipped as `useVault: false`, so any merchant
 * who pasted an OpenAI key had it stored as plaintext JSON in a regular table
 * column — unlike every other credentials-type integration (stripe_own, zip,
 * afterpay, klarna, apple_icloud), which encrypt at rest. Both AI integrations
 * are now `useVault: true`, and this moves the keys already on disk.
 *
 * WHAT IT TOUCHES: only rows of `merchant_integrations` whose
 * `integration_key` is 'openai' or 'anthropic' AND whose `credentials` column
 * is non-empty. For each one it writes an encrypted vault entry, reads it back
 * to prove the round-trip, and only then nulls the plaintext column. Nothing
 * else in the table is read or modified, and no other table is touched.
 *
 * WHAT IS LOST: the plaintext copy of those API keys, and nothing else. The key
 * itself survives, encrypted, and the integration keeps working. A merchant
 * whose row has an unparseable `credentials` value is reported and SKIPPED
 * rather than cleared, so a malformed row is never silently destroyed.
 *
 * SAFETY:
 *   - Dry-run by DEFAULT (transaction rolled back). Pass --commit to write.
 *   - Prints the DB host it connected to so you cannot migrate the wrong DB.
 *   - Idempotent: a row already migrated has no plaintext left to move, so
 *     re-running is a no-op.
 *   - Requires VAULT_ENCRYPTION_KEY. Running without it aborts before any write
 *     rather than encrypting under the insecure dev fallback.
 *
 * Usage:
 *   # dry-run against dev
 *   pnpm exec tsx scripts/migrate-ai-keys-to-vault.ts
 *   # dry-run against production (rolled back)
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec tsx scripts/migrate-ai-keys-to-vault.ts
 *   # COMMIT against production
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec tsx scripts/migrate-ai-keys-to-vault.ts --commit
 */
import { parseArgs } from "node:util";
import { db, pool, merchantIntegrationsTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { upsertCredentialVault, readCredentialVault } from "../src/services/tokenVault";

const AI_KEYS = ["openai", "anthropic"];

function dbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    return new URL(url).host || "(unparseable)";
  } catch {
    return "(unparseable)";
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { commit: { type: "boolean", default: false } } });
  const commit = values.commit === true;

  console.log(`Database host : ${dbHost()}`);
  console.log(`Mode          : ${commit ? "COMMIT — will write" : "DRY RUN — no changes will persist"}`);

  // The vault refuses to encrypt under the dev fallback outside development;
  // fail here rather than after writing half the rows.
  if (!process.env.VAULT_ENCRYPTION_KEY?.trim()) {
    console.error(
      "\nAborting: VAULT_ENCRYPTION_KEY is not set. Set it to the same value the\n" +
        "API server uses, or the migrated keys will be unreadable at runtime.",
    );
    process.exitCode = 1;
    return;
  }

  const rows = await db
    .select({
      id: merchantIntegrationsTable.id,
      merchantId: merchantIntegrationsTable.merchantId,
      integrationKey: merchantIntegrationsTable.integrationKey,
      credentials: merchantIntegrationsTable.credentials,
    })
    .from(merchantIntegrationsTable)
    .where(
      and(
        inArray(merchantIntegrationsTable.integrationKey, AI_KEYS),
        isNotNull(merchantIntegrationsTable.credentials),
        ne(merchantIntegrationsTable.credentials, ""),
      ),
    );

  console.log(`\nRows with a plaintext AI key: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.credentials!) as Record<string, unknown>;
    } catch {
      console.warn(
        `  SKIP merchant ${row.merchantId} / ${row.integrationKey}: credentials is not JSON — left untouched for manual review.`,
      );
      skipped += 1;
      continue;
    }

    const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
    if (!apiKey) {
      console.warn(
        `  SKIP merchant ${row.merchantId} / ${row.integrationKey}: no apiKey field — left untouched.`,
      );
      skipped += 1;
      continue;
    }

    if (!commit) {
      console.log(
        `  WOULD MIGRATE merchant ${row.merchantId} / ${row.integrationKey} (key ending …${apiKey.slice(-4)})`,
      );
      migrated += 1;
      continue;
    }

    // Encrypt first, prove it reads back, and only then drop the plaintext —
    // so an encryption or storage failure can never lose the merchant's key.
    await upsertCredentialVault(row.merchantId, row.integrationKey, parsed);
    const readBack = await readCredentialVault<{ apiKey?: string }>(
      row.merchantId,
      row.integrationKey,
    );
    if (readBack?.apiKey !== apiKey) {
      console.error(
        `  FAILED merchant ${row.merchantId} / ${row.integrationKey}: vault round-trip mismatch — plaintext left in place.`,
      );
      skipped += 1;
      continue;
    }

    await db
      .update(merchantIntegrationsTable)
      .set({ credentials: null })
      .where(eq(merchantIntegrationsTable.id, row.id));

    console.log(`  MIGRATED merchant ${row.merchantId} / ${row.integrationKey}`);
    migrated += 1;
  }

  console.log(
    `\n${commit ? "Migrated" : "Would migrate"}: ${migrated}   Skipped: ${skipped}`,
  );
  if (!commit) console.log("Dry run — nothing was written. Re-run with --commit to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
