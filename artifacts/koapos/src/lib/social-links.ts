/**
 * Social-link helpers now live in the shared `@workspace/sales-documents`
 * package so the in-app print paths and the server-side PDF renderer share one
 * implementation. Re-exported here to keep existing `@/lib/social-links`
 * imports working unchanged.
 */
export * from "@workspace/sales-documents/social-links";
