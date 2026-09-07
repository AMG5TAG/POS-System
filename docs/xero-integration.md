# Xero integration — platform one-click connect

Merchants connect their POS to Xero in **one click**. There is no per-merchant
developer app: the platform (Koastal) registers a **single** Xero app, and every
merchant authorises against it.

## How it works (code reference)

- Connect surfaces:
  - Wizard: `artifacts/koapos/src/pages/app/management-xero.tsx` (`/management/xero`)
  - Integrations card: `artifacts/koapos/src/pages/app/management-integrations.tsx` (`/management/integrations`)
- Backend routes: `artifacts/api-server/src/routes/xero.ts`
  - `GET /api/xero/auth/start` → redirects to Xero's consent screen
  - `GET /api/xero/auth/callback` → exchanges the code, stores tokens, redirects to `/management/xero?success=connected`
  - `GET /api/xero/status` → `{ connected, configured, tenantName, ... }`
- Credentials resolution: `getXeroClientCreds()` (`xero.ts:19-26`) uses the platform env vars
  `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET`.
- The "is it set up?" gate: `configured = !!(await getXeroClientCreds())` (`xero.ts:186`). When
  `configured` is true the UI shows the **Connect with Xero** button; when false it shows a
  "Xero isn't available yet — contact support" message.
- OAuth scopes (hard-coded, `XERO_SCOPES`, `xero.ts:36-37`):
  `openid profile email accounting.transactions accounting.contacts accounting.settings offline_access`

## A. Register the platform Xero app (one-time, Koastal)

1. Go to <https://developer.xero.com/app/manage> → **New app**.
2. **Integration type:** Web app. Name it (e.g. "KoaPOS").
3. **Company or application URL:** your platform URL.
4. **Redirect URI** — must match exactly (the callback is built from the request host in
   `xero.ts:81-83`):
   ```
   https://<your-platform-host>/api/xero/auth/callback
   ```
   If your host differs between dev and prod, add **both** redirect URIs to the app.
5. On **Configuration**, copy the **Client ID** and generate/copy a **Client Secret**.
6. Confirm the app is allowed to request the scopes listed above.

## B. Configure & restart the API

7. Set these as secrets/env on the **api-server**, then restart it:
   ```
   XERO_CLIENT_ID=<client id>
   XERO_CLIENT_SECRET=<client secret>
   ```

## C. Pre-check the config flag (no OAuth yet)

8. Log into KoaPOS, then in the same browser open `/api/xero/status`.
   - ✅ Expect `{"connected": false, "configured": true}`.
   - If `configured` is still `false`, the env vars didn't load — recheck B and that the API
     actually restarted.

## D. Run the one-click connect

9. Open `/management/xero`. The wizard opens on **Connect** and shows the blue **Connect with
   Xero** button (no Client ID/Secret fields).
10. Click **Connect with Xero** → sign in to Xero → **Allow access** → choose the organisation.
11. ✅ Expect to land on `/management/xero?success=connected`.
12. Re-check `/api/xero/status` → ✅ now `{"connected": true, "configured": true, ...}` with
    `tenantName` / `tenantId` populated.

## E. Finish the wizard

13. **Organisation** → select your Xero org. **Map Accounts** → map revenue, cash, card,
    GST/tax, etc. to your live Xero GL accounts. **Sync Settings** → enable auto-sync /
    sync-on-sale. **Go Live** → confirm.

## F. (Optional) Sync smoke test

14. Enable **Sync on sale**, complete a POS sale, and confirm it appears in the Xero org as an
    invoice and in the wizard's **sync log**.

## G. Integrations-card path

15. On `/management/integrations`, the **Xero** card shows **Authorise via OAuth 2.0** (no
    credential entry); clicking it redirects straight to Xero (`/api/xero/auth/start`).

## Notes / gotchas

- **Redirect URI mismatch** is the most common failure — it must be byte-identical (scheme,
  host, no trailing slash). A mismatch yields `?error=token_failed` / `?error=oauth_denied`.
- **25-organisation cap:** an *uncertified* Xero app stops connecting after 25 organisations.
  To scale past a pilot, submit the app for **Xero App Partner certification**.
- Test safely first by connecting a **Xero Demo Company** rather than a live org.
