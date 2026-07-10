import pg from "pg";
const { Client } = pg;
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  "select merchant_id, status, access_token, token_expires_at, credentials from merchant_integrations where integration_key='xero' order by merchant_id"
);
for (const row of rows) {
  console.log("\n===== merchant", row.merchant_id, "status=", row.status, "=====");
  let tenantId, tenantName;
  try { const cr = JSON.parse(row.credentials || "{}"); tenantId = cr.tenantId; tenantName = cr.tenantName; } catch {}
  console.log("tenantId:", tenantId, "| tenantName:", tenantName);
  console.log("token_expires_at:", row.token_expires_at, "| expired?", row.token_expires_at && new Date(row.token_expires_at) < new Date());
  if (row.access_token) {
    try {
      const payload = JSON.parse(Buffer.from(row.access_token.split(".")[1], "base64url").toString());
      console.log("token scope claim:", payload.scope);
      console.log("token exp:", new Date(payload.exp * 1000).toISOString());
    } catch (e) { console.log("could not decode token:", e.message); }
  } else { console.log("NO access token"); }
  // Live call to /Accounts
  if (row.access_token && tenantId) {
    const r = await fetch("https://api.xero.com/api.xro/2.0/Accounts?where=Status%3D%3D%22ACTIVE%22", {
      headers: { Authorization: `Bearer ${row.access_token}`, "xero-tenant-id": tenantId, "Content-Type": "application/json" },
    });
    console.log("LIVE /Accounts status:", r.status);
    const body = await r.text();
    console.log("LIVE /Accounts body (first 400):", body.slice(0, 400));
  }
}
await c.end();
