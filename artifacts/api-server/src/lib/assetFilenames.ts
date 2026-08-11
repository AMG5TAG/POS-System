import { db, customerFilesTable, productReturnAuthsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Original filenames for stored objects, and how to hand them back to the
 * browser.
 *
 * Storage keys are content-addressed (`assets/<sha256>`) and carry no name or
 * extension, so the original filename lives in merchant_assets.filename and is
 * re-attached on the way out via Content-Disposition.
 */

/**
 * A Content-Disposition value that survives non-ASCII filenames.
 *
 * `inline` rather than `attachment` so images still render in an <img> tag —
 * it only changes what the browser calls the file when it is saved.
 * Both forms are emitted: a sanitised ASCII fallback for old clients and the
 * RFC 5987 encoded form that carries the exact original.
 */
export function contentDispositionFor(filename: string): string {
  const ascii = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 255);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Filenames recoverable for a merchant's pre-existing uploads, keyed by object
 * path.
 *
 * Uploads made before the media library did not record a filename anywhere
 * central, but the two features that attach documents — customer files and
 * supplier return authorisations — stored one alongside the object key. This
 * mines those so the backfill shows real names instead of a bare UUID.
 */
export async function recoverKnownFilenames(merchantId: number): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  try {
    const files = await db
      .select({ fileKey: customerFilesTable.fileKey, filename: customerFilesTable.filename })
      .from(customerFilesTable)
      .where(eq(customerFilesTable.merchantId, merchantId));
    for (const f of files) {
      if (f.fileKey && f.filename) names.set(f.fileKey, f.filename);
    }
  } catch {
    // Recovering names is best-effort; the import must not fail over it.
  }

  try {
    const returns = await db
      .select({ attachments: productReturnAuthsTable.attachments })
      .from(productReturnAuthsTable)
      .where(eq(productReturnAuthsTable.merchantId, merchantId));
    for (const r of returns) {
      for (const a of r.attachments ?? []) {
        if (a?.fileKey && a?.filename) names.set(a.fileKey, a.filename);
      }
    }
  } catch {
    // As above.
  }

  return names;
}
