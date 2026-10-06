# Google setup — Marketing › Google

How to connect Google Search Console, Google Analytics and Google Business
Profile (Maps + reviews) to KoaPOS, so their figures show under
**Marketing › Google** in the POS.

What the page shows once connected:

- **Search** — clicks from Google, times shown, average position, top searches,
  top pages, devices, and the status of your submitted sitemaps.
- **Analytics** — visitors on the site now, visitors, visits, page views, where
  visitors came from, top pages, towns and devices (website and shop together).
- **Maps** — listing views on Search and Maps, calls, direction requests, website
  clicks, messages, and the search terms that showed your listing.
- **Reviews** — average rating, every review, and replying / editing / deleting
  replies (managers and the owner). Replies post publicly on Google.

---

## Step 1 — Create the Google Cloud project (about 15 minutes)

1. Go to **https://console.cloud.google.com** and sign in with the Google account
   that manages Koastal's Search Console, Analytics and Business Profile.
2. Click the project picker at the top → **New project** → name it `KoaPOS` →
   **Create**. Make sure it is selected.
3. Go to **APIs & Services → Library**. Search for and **Enable** each of these:
   - Google Search Console API
   - Google Analytics Admin API
   - Google Analytics Data API
   - My Business Account Management API
   - My Business Business Information API
   - Business Profile Performance API
   - Google My Business API (for reviews — may only appear after Step 3's approval)

## Step 2 — Consent screen and keys

1. Go to **APIs & Services → OAuth consent screen** (may be labelled **Google
   Auth Platform**) → **Get started**.
   - App name: `KoaPOS`. Support email: your email.
   - **Audience:**
     - If your email is a Google Workspace account on koastal.com.au, choose
       **Internal** (simplest).
     - Otherwise choose **External**. When you finish, go to **Audience** and
       click **Publish app** so it is **In production**.
   - ⚠️ Do not leave it in **Testing** — in Testing, Google ends the connection
     every 7 days.
2. Go to **Clients → Create client** → **Web application**.
3. Under **Authorised redirect URIs**, add:

   ```
   https://pos.koastal.com.au/api/integrations/oauth/google_insights/callback
   ```

   Optional, for trying it in the Replit dev preview (skip if Google refuses it):

   ```
   https://<your-replit-dev-domain>/api/integrations/oauth/google_insights/callback
   ```

4. Click **Create**. Copy the **Client ID** and **Client secret** straight away —
   the secret may only be shown once.
5. In Replit open **Secrets** and add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

   Check they also appear under the deployment's secrets.

## Step 3 — Apply for Business Profile API access (start early — this is the slow part)

1. In Cloud Console, find your **project number** on the Dashboard (the number,
   not the name).
2. Go to **https://developers.google.com/my-business/content/prereqs** and follow
   its link to the access request form. Choose basic API access and enter the
   project number and business details.
3. Google generally expects the profile to be verified, active for a while
   (around 60 days), and showing your website.
4. Approval takes days to a few weeks; Google emails you. Until then the **Maps**
   and **Reviews** tabs show "waiting for Google approval" — Search and Analytics
   work straight away.

## Step 4 — Publish and connect

1. Make sure the latest code is committed, then **Publish** in Replit.
2. Sign in as the **owner** at **https://pos.koastal.com.au** →
   **Marketing → Google → Connect Google**.
3. Pick your Google account.
   - If you see "Google hasn't verified this app", click
     **Advanced → Go to KoaPOS**. That's expected for your own private app.
   - **Leave every box ticked** on the consent screen.
4. Under **What to show**, choose:
   - the Search Console site (pick `koastal.com.au (domain)` if listed)
   - the Analytics property for `G-4TX95M36H4`
   - your Business Profile listing (once approved)

---

## If something goes wrong

The page says what to do for each problem:

| Message | What to do |
|---|---|
| Google sign-in isn't set up yet | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are missing — Step 2.5, then republish. |
| This Google API is not enabled | Click **Enable it in Google Cloud**, wait a minute, refresh. |
| Google wasn't given access to this | **Reconnect Google** and leave every box ticked. |
| Waiting for Google approval | Business Profile access not approved yet — Step 3. |
| The connected Google account can't see this | Give that Google account access to the site / property / listing, or pick another. |
| Google access was revoked or has expired | **Reconnect Google**. If it happens weekly, the consent screen is still in Testing — Step 2.1. |

Notes:

- Search Console figures run about 2–3 days behind; Business Profile figures are
  daily and a few days behind.
- Only the owner can connect or disconnect Google (Management › Integrations →
  **Google Search, Analytics & Maps**). Disconnecting also withdraws the access
  at Google.
- KoaPOS stores only which site, property and listing you picked; the figures
  are fetched from Google when the page opens (cached for 10 minutes).
