# KoaPOS — Operating Cost Report for 10 Platform Users

**Prepared:** 2026-06-14
**Scope:** Infrastructure & metered-service cost to the *platform operator* (Koastal) of running **10 merchant accounts** on KoaPOS. This is a cost-of-goods-sold (COGS) view, not a P&L — subscription revenue is excluded.

> **"Platform user" = one merchant tenant.** Each merchant may have many staff seats; staff seats add only marginal DB rows/sessions, not separate infrastructure. If you instead meant 10 staff inside one merchant, real cost is far lower (one tenant's share of the fixed infra).

---

## 1. What actually costs money

KoaPOS is a multi-tenant SaaS on **Replit** (autoscale target in `.replit`, Postgres + Object Storage, Node/Express API + React/Vite SPA). The important architectural fact for cost:

> **The API server runs 8+ in-process `setInterval` schedulers** (marketing automation hourly, recurring invoices, backups, low-stock alerts, social-post publishing, referral digests, token/login cleanup). These only fire while the process is alive, so the server must run **always-on** — a **Reserved VM**, *not* scale-to-zero Autoscale. That makes compute a fixed monthly cost, not a per-request one.

### Platform-billed (you pay)
| Driver | Why it costs | Billed to |
|---|---|---|
| **Reserved VM** (always-on API + static SPA) | In-process schedulers require 24/7 uptime | Platform |
| **PostgreSQL** (Drizzle/Neon-backed) | All tenant data: products, tx, invoices, customers, conversations | Platform |
| **Object Storage** | Per-merchant DB backups (`backupScheduler`), product images, receipts | Platform |
| **OpenAI API** | AI Assistant + Upsell Coach — uses a **single platform key** (`AI_INTEGRATIONS_OPENAI_API_KEY` via Replit's AI gateway), so usage is billed to you, not the merchant | Platform |
| **System email** (Resend) | Auth emails (password reset, login alerts) fallback | Platform (free tier) |
| **Replit Core membership** | Base subscription that the credits/deployments sit on | Platform |

### Merchant-billed (NOT your cost) — important
These look like integrations but the merchant connects **their own** account/keys, so the cost falls on them:
- **Twilio SMS** (`sms-settings.ts`, `PROVIDER = "twilio"`) — merchant's own Twilio
- **Merchant email** (Resend/SendGrid/SMTP in `email-settings.ts`) — merchant's own provider
- **All OAuth integrations** — Google, Microsoft 365, Dropbox, Xero, QuickBooks, **Stripe Connect**, Meta, X, LinkedIn, TikTok, Apple/Google Wallet. Each is "feature disabled if missing" and uses the merchant's connected account.

This keeps your variable cost small and predictable: **the only metered service you pay per-use is OpenAI.**

---

## 2. The two AI features (your only usage-metered cost)

From `artifacts/api-server/src/routes/openai.ts`:

**A. AI Assistant chat** — model **`gpt-5.4`**, `max_completion_tokens: 8192`, sends a business-context system prompt + up to **40 messages** of history per call. 4 modes (budget / stock / marketing / general). Streaming or single-shot.

**B. AI Upsell Coach** — model **`gpt-5-mini`**, `max_completion_tokens: 300`, fires at checkout (`POST /ai/upsell-suggestions`); prompt includes up to 60 products + cart + recent purchase history.

### Pricing used (OpenAI, mid-2026)
| Model | Input $/1M | Output $/1M |
|---|---|---|
| `gpt-5.4` (flagship) | $2.50 | $15.00 |
| `gpt-5-mini` | $0.25 | $2.00 |

### Per-call cost estimate
| Feature | Tokens in / out (avg) | Cost / call |
|---|---|---|
| Assistant (`gpt-5.4`) | ~3,000 in / ~600 out | **~$0.017** |
| Upsell (`gpt-5-mini`) | ~1,500 in / ~300 out | **~$0.001** |

---

## 3. Three usage scenarios (per merchant / month)

| | **Light** | **Moderate** | **Heavy** |
|---|---|---|---|
| Assistant messages | 25 | 100 | 400 |
| Upsell calls (≈ transactions) | 300 | 1,000 | 3,000 |
| Assistant cost | $0.43 | $1.70 | $6.80 |
| Upsell cost | $0.30 | $1.00 | $3.00 |
| **AI cost / merchant** | **~$0.73** | **~$2.70** | **~$9.80** |

> Upsell is the volume driver but is cheap (`gpt-5-mini`). The Assistant is the price driver. The 8,192-token output cap is the worst-case ceiling per assistant reply (~$0.14 if fully maxed) — real replies are far shorter.

---

## 4. Fixed infrastructure (10 tenants share one stack)

10 merchants is a tiny footprint — it fits comfortably in the smallest always-on tier. DB and storage scale with data volume, which is small for 10 stores.

| Component | Sizing for 10 tenants | Est. $/mo |
|---|---|---|
| Replit Core membership | Base plan ($25 credit allowance) | $25 |
| Reserved VM (always-on) | 0.5–1 vCPU / 2 GiB | $20–40 |
| PostgreSQL | ~1–3 GiB data + compute @ ~$1.50/GiB-mo storage | $5–15 |
| Object Storage | Backups + images, ~5–20 GiB @ ~$0.15/GiB-mo | $1–3 |
| Egress / bandwidth | Light SPA + API JSON | $1–3 |
| System email (Resend) | Auth only, within free tier (3k/mo) | $0 |
| **Fixed subtotal** | | **~$52–86 / mo** |

*Reserved-VM and storage rates are Replit's published mid-2026 figures (see Sources). The Core membership's included credits offset part of the VM/DB cost, so treat $25 + overages as the practical floor.*

---

## 5. Total cost for 10 users

| Scenario | Fixed infra | AI (10 × per-merchant) | **Total / mo** | **Per user / mo** |
|---|---|---|---|---|
| **Light** | ~$60 | ~$7 | **~$67** | **~$6.70** |
| **Moderate** | ~$70 | ~$27 | **~$97** | **~$9.70** |
| **Heavy** | ~$86 | ~$98 | **~$184** | **~$18.40** |

### Annualised (moderate): **~$1,160 / year** to serve 10 merchants.

---

## 6. Takeaways

1. **It's a fixed-cost business at this scale.** ~$60–86/mo of always-on infra is ~70–90% of the bill in light/moderate scenarios. The first 10 users are dominated by the always-on VM, not per-user usage.
2. **AI is your only true variable cost, and it's small** — ~$0.70–$9.80 per merchant/month. The architecture wisely pushes SMS, email, and payments onto merchant-owned accounts, so they don't hit your bill.
3. **Per-user COGS lands around $7–18/mo.** Any plan priced above ~$20/mo/merchant should be comfortably gross-margin positive once you're past the fixed-cost floor.
4. **Biggest cost-control levers, in order:** (a) cap/throttle the AI Assistant (token budget, message-history trim, or per-plan quota — history is currently capped at 40 messages but the assistant is ungated by plan); (b) right-size the Reserved VM; (c) prune old object-storage backups.
5. **Watch as you grow:** the always-on VM serves ~hundreds of tenants before needing an upgrade, so per-user cost *drops sharply* with scale — at 100 users the fixed infra is amortised ~10× and per-user COGS approaches the AI cost alone (~$3/user moderate).

### Caveats
- OpenAI token estimates are modelled, not measured. **Add a usage dashboard** (token counts per merchant) to replace these with actuals — the `conversations`/`messages` tables already log every AI exchange.
- Replit infra rates change periodically; figures are mid-2026. Confirm against your actual Replit billing statement.
- Assumes Replit-hosted Postgres/Object Storage (per `.replit`). Self-hosting or a dedicated Neon/S3 plan would shift the fixed line.

---

## Sources
- [Replit Pricing 2026 (lowcode.agency)](https://www.lowcode.agency/blog/replit-pricing-explained)
- [Replit Pricing Breakdown 2026 (Superblocks)](https://www.superblocks.com/blog/replit-pricing)
- [Replit usage-based billing docs](https://docs.replit.com/billing/about-usage-based-billing)
- [Replit official pricing](https://replit.com/pricing)
- [OpenAI API pricing](https://openai.com/api/pricing/)
- [GPT-5 Mini API pricing (devtk.ai)](https://devtk.ai/en/models/gpt-5-mini/)
- [OpenAI API pricing 2026 incl. GPT-5.4 (aipricing.guru)](https://www.aipricing.guru/openai-pricing/)
