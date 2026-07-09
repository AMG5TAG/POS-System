/**
 * One-time backfill: downsizes oversized base64 `data:` URI logos/branding images
 * already stored in the DB, mirroring the client-side resize now applied on upload.
 *
 * Targets (all `text` columns; the last two hold JSON strings with a `logoUrl` field):
 *   - business_profile.logo                     cap 512px
 *   - online_store_settings.logo_url            cap 512px
 *   - online_store_settings.favicon_url         cap 128px
 *   - qr_settings.logo_url                      cap 640px
 *   - qr_codes.settings          (JSON.logoUrl) cap 640px
 *   - qr_saved_templates.settings(JSON.logoUrl) cap 640px
 *
 * Only base64 `data:` URIs whose longest edge EXCEEDS the cap are rewritten:
 *   - plain http(s) URLs are skipped (not our bytes to touch)
 *   - SVGs are skipped (vector — resizing is meaningless)
 *   - images already within the cap are skipped
 *   - a re-encode that would grow the payload is skipped (never inflate)
 * Aspect ratio is preserved and images are never enlarged. Transparency is kept
 * (PNG out) unless the source is JPEG. Idempotent — safe to run more than once.
 *
 * DESTRUCTIVE: rewrites the stored image in place. Before writing, a real run dumps
 * every original value to scripts/backups/logo-backfill-<timestamp>.json so the
 * change can be rolled back. Run a dry run first to preview:
 *   pnpm --filter @workspace/scripts run backfill-resize-logos -- --dry-run
 * Then, to apply:
 *   pnpm --filter @workspace/scripts run backfill-resize-logos
 *
 * Intentionally NOT wired into `db:push` — it is a one-shot, manual migration.
 */
import { db, pool, businessProfileTable, onlineStoreSettingsTable, qrSettingsTable, qrCodesTable, qrSavedTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

const DATA_URI_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s;

let totalBytesSaved = 0;

/* Every planned change: the original value is captured here BEFORE anything is
   written, so a real run can dump a full backup to disk and then apply. */
interface PlannedChange {
  table: string;
  id: number;
  /** The column being written (the whole-value data URI columns, or a JSON column). */
  column: string;
  /** The original stored column value (for the backup / rollback file). */
  original: string;
  /** The new column value to write. */
  next: string;
  apply: (id: number, next: string) => Promise<void>;
}
const plan: PlannedChange[] = [];

/** Returns the resized data URI, or null when the value should be left untouched. */
async function resizeDataUri(value: string, cap: number): Promise<string | null> {
  if (typeof value !== "string") return null;
  const m = DATA_URI_RE.exec(value);
  if (!m) return null; // plain URL, empty, or non-base64 — not ours to resize
  const mime = m[1].toLowerCase();
  if (mime === "image/svg+xml") return null; // vector — nothing to downscale

  const input = Buffer.from(m[2], "base64");
  let img = sharp(input, { failOn: "none", animated: false });
  let meta;
  try {
    meta = await img.metadata();
  } catch {
    return null; // undecodable — leave as-is
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h || Math.max(w, h) <= cap) return null; // already within cap

  img = img.resize({ width: cap, height: cap, fit: "inside", withoutEnlargement: true });

  let outBuf: Buffer;
  let outMime: string;
  if (mime === "image/jpeg" || mime === "image/jpg") {
    outBuf = await img.jpeg({ quality: 90 }).toBuffer();
    outMime = "image/jpeg";
  } else {
    // Keep transparency for png/webp/gif sources.
    outBuf = await img.png({ compressionLevel: 9 }).toBuffer();
    outMime = "image/png";
  }
  const next = `data:${outMime};base64,${outBuf.toString("base64")}`;
  if (next.length >= value.length) return null; // never inflate

  totalBytesSaved += value.length - next.length;
  return next;
}

/** Detect resizes in a plain image column (whole value is the data URI). */
async function backfillColumn(
  table: string,
  rows: Array<{ id: number; value: string }>,
  cap: number,
  apply: (id: number, next: string) => Promise<void>,
) {
  let changed = 0;
  for (const row of rows) {
    const next = await resizeDataUri(row.value, cap);
    if (!next) continue;
    console.log(`  ${table} #${row.id}: ${row.value.length} -> ${next.length} bytes`);
    plan.push({ table, id: row.id, column: table.split(".")[1], original: row.value, next, apply });
    changed++;
  }
  console.log(`${table}: ${changed} image(s) ${DRY_RUN ? "would be" : ""} resized`);
}

/** Detect resizes in a JSON-string column, resizing its `logoUrl` field. */
async function backfillJsonSettings(
  table: string,
  rows: Array<{ id: number; settings: string }>,
  cap: number,
  apply: (id: number, next: string) => Promise<void>,
) {
  let changed = 0;
  for (const row of rows) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.settings);
    } catch {
      continue; // malformed JSON — skip
    }
    if (typeof parsed.logoUrl !== "string") continue;
    const next = await resizeDataUri(parsed.logoUrl, cap);
    if (!next) continue;
    parsed.logoUrl = next;
    const nextSettings = JSON.stringify(parsed);
    console.log(`  ${table} #${row.id}: logoUrl resized (${row.settings.length} -> ${nextSettings.length} bytes total)`);
    plan.push({ table, id: row.id, column: "settings", original: row.settings, next: nextSettings, apply });
    changed++;
  }
  console.log(`${table}: ${changed} logo(s) ${DRY_RUN ? "would be" : ""} resized`);
}

async function main() {
  console.log(`backfill-resize-logos: ${DRY_RUN ? "DRY RUN (no writes)" : "APPLYING CHANGES"}`);

  // 1. business_profile.logo (cap 512)
  const bp = await db
    .select({ id: businessProfileTable.id, value: businessProfileTable.logo })
    .from(businessProfileTable);
  await backfillColumn("business_profile.logo", bp, 512, (id, next) =>
    db.update(businessProfileTable).set({ logo: next }).where(eq(businessProfileTable.id, id)).then(() => undefined),
  );

  // 2. online_store_settings.logo_url (cap 512) + favicon_url (cap 128)
  const oss = await db
    .select({ id: onlineStoreSettingsTable.id, logoUrl: onlineStoreSettingsTable.logoUrl, faviconUrl: onlineStoreSettingsTable.faviconUrl })
    .from(onlineStoreSettingsTable);
  await backfillColumn(
    "online_store_settings.logo_url",
    oss.map((r) => ({ id: r.id, value: r.logoUrl })),
    512,
    (id, next) => db.update(onlineStoreSettingsTable).set({ logoUrl: next }).where(eq(onlineStoreSettingsTable.id, id)).then(() => undefined),
  );
  await backfillColumn(
    "online_store_settings.favicon_url",
    oss.map((r) => ({ id: r.id, value: r.faviconUrl })),
    128,
    (id, next) => db.update(onlineStoreSettingsTable).set({ faviconUrl: next }).where(eq(onlineStoreSettingsTable.id, id)).then(() => undefined),
  );

  // 3. qr_settings.logo_url (cap 640)
  const qs = await db
    .select({ id: qrSettingsTable.id, value: qrSettingsTable.logoUrl })
    .from(qrSettingsTable);
  await backfillColumn("qr_settings.logo_url", qs, 640, (id, next) =>
    db.update(qrSettingsTable).set({ logoUrl: next }).where(eq(qrSettingsTable.id, id)).then(() => undefined),
  );

  // 4. qr_codes.settings JSON.logoUrl (cap 640)
  const codes = await db
    .select({ id: qrCodesTable.id, settings: qrCodesTable.settings })
    .from(qrCodesTable);
  await backfillJsonSettings("qr_codes.settings", codes, 640, (id, next) =>
    db.update(qrCodesTable).set({ settings: next }).where(eq(qrCodesTable.id, id)).then(() => undefined),
  );

  // 5. qr_saved_templates.settings JSON.logoUrl (cap 640)
  const templates = await db
    .select({ id: qrSavedTemplatesTable.id, settings: qrSavedTemplatesTable.settings })
    .from(qrSavedTemplatesTable);
  await backfillJsonSettings("qr_saved_templates.settings", templates, 640, (id, next) =>
    db.update(qrSavedTemplatesTable).set({ settings: next }).where(eq(qrSavedTemplatesTable.id, id)).then(() => undefined),
  );

  console.log(
    `\nbackfill-resize-logos: ${plan.length} image(s) ${DRY_RUN ? "would be" : ""} resized, ` +
      `~${(totalBytesSaved / 1024).toFixed(0)} KB ${DRY_RUN ? "would be" : ""} saved.`,
  );

  if (DRY_RUN) {
    console.log("Re-run without --dry-run to apply.");
    return;
  }
  if (plan.length === 0) return;

  // Back up every original value BEFORE writing, so the change is reversible.
  const backupDir = join(process.cwd(), "backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `logo-backfill-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      plan.map(({ table, id, column, original }) => ({ table, id, column, original })),
      null,
      2,
    ),
  );
  console.log(`Backed up ${plan.length} original value(s) to ${backupPath}`);

  for (const change of plan) {
    await change.apply(change.id, change.next);
  }
  console.log(`Applied ${plan.length} update(s).`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("backfill-resize-logos failed:", err);
    await pool.end();
    process.exit(1);
  });
