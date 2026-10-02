/* Which stored objects a record of one business may point at.
 *
 * Customer files store an object key the browser sent, and two paths later read
 * that key straight from the private bucket with no ACL check: the shop's
 * "Your files" download and the Nextcloud mirror. Unchecked, a key naming
 * another business's upload or a server backup (`/objects/backups/...`) would
 * be handed to whoever can see the file. */

/** A key a new record may store: inside this business's own folder. */
export function isOwnObjectKey(key: unknown, merchantId: number): key is string {
  return typeof key === "string"
    && key.startsWith(`/objects/merchants/${merchantId}/`)
    && !key.split("/").includes("..");
}

/** A stored key that may be read on this business's behalf. Rows written
 *  before keys were merchant-prefixed carry a bare `/objects/<id>`, so those
 *  stay readable; another business's folder, backups and traversal do not. */
export function isReadableObjectKey(key: string, merchantId: number): boolean {
  if (key.split("/").includes("..")) return false;
  if (key.startsWith("/objects/merchants/")) return isOwnObjectKey(key, merchantId);
  if (key.startsWith("/objects/backups/")) return false;
  return key.startsWith("/objects/");
}
