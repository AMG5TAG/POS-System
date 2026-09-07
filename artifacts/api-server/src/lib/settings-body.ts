/** Strip server-managed identity/timestamp columns from a settings upsert body
 *  before it is spread into `.set()` / `.values()`.
 *
 *  Several per-merchant settings routes spread the raw request body straight into
 *  a Drizzle write. Without this, an authenticated user could send `merchantId`
 *  (or `id`) in the body and, on the UPDATE path, reassign the row to another
 *  tenant — the WHERE clause only scopes which row is loaded, not what gets
 *  written. `merchantId` is always set explicitly by the handler, `id` is
 *  auto-generated, and the timestamps are DB-managed, so dropping all four is
 *  safe and closes the mass-assignment hole. Mirrors `normalizeBody` in
 *  sales-settings.ts (minus the route-specific numeric coercion). */
export function stripManagedFields<T extends Record<string, unknown>>(body: T): Partial<T> {
  const b: Partial<T> = { ...body };
  delete b.id;
  delete b.merchantId;
  delete b.createdAt;
  delete b.updatedAt;
  return b;
}
