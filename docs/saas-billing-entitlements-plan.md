# Milkpod SaaS Plan: Pricing, Billing, and Entitlements (v1)

## 1) Executive Summary

Milkpod already has a strong product core:

- Ingestion and transcript pipeline for YouTube and podcasts
- Transcript-aware chat with citations
- Share links with optional public Q&A

The fastest path to a real business is:

1. Position Milkpod as "AI content operations for creators, podcasters, and marketing teams" (not generic transcript tooling)
2. Ship paid plans and entitlements quickly
3. Gate expensive model usage and high-value collaboration features
4. Expand podcast and workflow automation features that directly tie to revenue

This document is a concrete v1 spec for pricing, billing, and entitlements in this repo.

---

## 2) Current State (Repo Reality Check)

### Already production-worthy

- `packages/api/src/modules/ingest/*`: ingestion flow and pipeline orchestration
- `packages/ai/src/tools.ts` + `packages/ai/src/retrieval.ts`: retrieval + tool calling
- `packages/api/src/modules/shares/*`: share links, revoke, public chat with rate limits
- `apps/web/src/components/share/*`: share UX

### Missing for SaaS

- No billing provider integration
- No subscriptions/invoices/customer records
- No entitlement layer (features and limits are mostly hardcoded)
- Billing UI is placeholder (`apps/web/src/components/dashboard/dashboard-shell.tsx`)
- No pricing page and conversion funnel

---

## 3) Business Positioning and ICP

### Recommended wedge

"AI post-production and knowledge copilot for long-form content"

### Initial ICPs

- Solo creators and podcasters
- Small agency teams repurposing content
- Internal teams (sales enablement, customer success, research)

### Why this is lucrative

- Clear recurring value (new content every week)
- Strong retention loops (library grows, search/chat value compounds)
- High willingness to pay for time saved in editing, clipping, and repurposing

---

## 4) Pricing Strategy (v1)

Use 3 plans with monthly and annual billing.

## Free

- 120 transcript minutes/month
- 2,000 AI words/day
- 1 active share link
- Basic models only
- Watermarked exports (when export ships)

## Pro (single user)

- 1,200 transcript minutes/month
- 30,000 AI words/day
- Unlimited share links
- Premium models
- Priority processing
- Private podcast feed tools (when web UI ships)

## Team

- 4,000 transcript minutes/month pooled
- 100,000 AI words/day pooled
- Seat-based collaboration
- Role controls and shared collections
- Usage analytics and audit logs

### Suggested pricing anchors

- Free: INR 0
- Pro: INR 1,499 to 2,499 / month (test)
- Team: INR 6,999+ base + per-seat add-on

Notes:

- Start with monthly only if needed for speed, add annual in phase 2
- Add overage packs later (minutes and AI usage)

---

## 5) Payments in India: Provider Plan

You cannot use Stripe, so design provider-agnostic billing from day 1.

### Recommended implementation path

1. Implement a `BillingProvider` interface in the API layer
2. Add a first provider adapter (Polar or Razorpay)
3. Keep all business logic in Milkpod services, not provider-specific routes

### Provider choice guidance

- Polar can work if your legal/entity/payment flow requirements are supported
- Razorpay is usually the most straightforward India-native option
- If unsure, ship the abstraction first and start with whichever onboarding is fastest

---

## 6) Entitlement Model (v1)

Keep plans in code (not DB) for speed and versioning.

Create a shared source:

- `packages/api/src/modules/billing/plans.ts`

```ts
export type PlanId = 'free' | 'pro' | 'team';

export type PlanEntitlements = {
  transcriptMinutesMonthly: number;
  aiWordsDaily: number;
  maxActiveShareLinks: number;
  allowedModelIds: string[];
  canUsePublicShareQA: boolean;
  priorityProcessing: boolean;
  maxCollections: number | null;
};
```

### Default model access by plan

- Free: fast/cheap models only
- Pro/Team: all current models (`packages/ai/src/models.ts`)

### Enforcement points

- Chat word quota: `packages/api/src/modules/usage/service.ts`
- Chat model access: `packages/api/src/modules/chat/index.ts`
- Ingest monthly minute quota: `packages/api/src/modules/ingest/index.ts`
- Share link limits/Q&A permissions: `packages/api/src/modules/shares/service.ts`

---

## 7) Data Model Changes (Drizzle)

Add billing schema in:

- `packages/db/src/schema/billing.ts`

## Tables

### `billing_customer`

- `id` (pk)
- `user_id` (fk -> user.id, unique)
- `provider` (`polar` | `razorpay`)
- `provider_customer_id` (unique)
- lifecycle timestamps

### `billing_subscription`

- `id` (pk)
- `user_id` (fk -> user.id, indexed)
- `provider`
- `provider_subscription_id` (unique)
- `plan_id` (`free` | `pro` | `team`)
- `status` (`trialing` | `active` | `past_due` | `canceled` | `incomplete`)
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end` (bool)
- `canceled_at` (nullable)
- lifecycle timestamps

### `billing_webhook_event`

- `id` (pk)
- `provider`
- `provider_event_id` (unique)
- `event_type`
- `payload` (jsonb)
- `processed_at`
- lifecycle timestamps

### `monthly_usage`

- `id` (pk)
- `user_id` (fk -> user.id)
- `period_start` (date, UTC month start)
- `transcript_minutes_used` (int default 0)
- `storage_mb_used` (int default 0) optional for later
- unique `(user_id, period_start)`

Keep existing `daily_usage` for chat words; add plan-aware daily limits.

---

## 8) Backend Billing Module (API)

Create:

- `packages/api/src/modules/billing/index.ts`
- `packages/api/src/modules/billing/service.ts`
- `packages/api/src/modules/billing/provider.ts`
- `packages/api/src/modules/billing/providers/{polar|razorpay}.ts`
- `packages/api/src/modules/billing/model.ts`

## Endpoints

### Authenticated

- `GET /api/billing/plans`
  - Returns plan catalog and visible prices

- `GET /api/billing/summary`
  - Returns current plan, subscription status, renewal date, usage snapshot, entitlements

- `POST /api/billing/checkout`
  - Input: `{ planId: 'pro' | 'team', interval: 'month' | 'year' }`
  - Output: `{ checkoutUrl: string }`

- `POST /api/billing/portal`
  - Output: `{ portalUrl: string }`

- `POST /api/billing/cancel`
  - Input: `{ atPeriodEnd: boolean }`

### Public webhook

- `POST /api/billing/webhook`
  - Verify provider signature
  - Idempotency via `billing_webhook_event.provider_event_id`
  - Update `billing_subscription`

---

## 9) Webhook Processing Rules

Normalize incoming provider events to internal state transitions.

### Required event families

- Checkout/session completed -> create or update customer and subscription
- Subscription created/updated -> sync status and period dates
- Subscription canceled -> set canceled flags
- Payment failed -> set `past_due` and trigger in-app warning

### Idempotency strategy

1. Insert event into `billing_webhook_event`
2. If unique conflict on `provider_event_id`, return 200 and stop
3. Apply state transitions in a DB transaction

---

## 10) Frontend Billing UX

### New routes

- `apps/web/src/app/pricing/page.tsx`
- `apps/web/src/app/dashboard/billing/page.tsx` (or tab-level panel)

### Dashboard integration

Replace placeholder Billing menu and "Upgrade" CTA in:

- `apps/web/src/components/dashboard/dashboard-shell.tsx`

### Billing views

- Current plan card
- Usage progress bars (daily words, monthly transcript minutes)
- Upgrade/downgrade buttons
- Manage billing button (portal)
- Past due and renewal banners

---

## 11) Usage and Quota Enforcement Changes

## Chat words

- Replace static `DAILY_WORD_BUDGET` usage in API responses with entitlement-derived value
- Keep hard safety cap in AI package as fail-safe

## Transcript minutes

- On successful ingestion completion, compute asset duration minutes and increment `monthly_usage.transcript_minutes_used`
- For in-progress jobs, soft-check before enqueue and hard-check before marking ready

## Share limits

- In `ShareService.create`, enforce `maxActiveShareLinks`
- Free plan can disable public share Q&A or keep a strict small quota

## Model gating

- In chat request handling, reject model IDs outside current plan entitlements with 403 + upgrade hint

---

## 12) Environment Variables

Add billing provider vars in:

- `packages/env/src/server.ts`
- `apps/server/.env.example`
- `apps/web/.env.example` (only if client needs public key)
- `AGENTS.md` and `CLAUDE.md`

### Example server vars

- `BILLING_PROVIDER=polar` (or `razorpay`)
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRODUCT_PRO_MONTHLY`
- `POLAR_PRODUCT_TEAM_MONTHLY`

Razorpay alternative:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_PLAN_PRO_MONTHLY`
- `RAZORPAY_PLAN_TEAM_MONTHLY`

---

## 13) Rollout Plan (Practical Sequence)

## Phase A - Foundation (week 1)

1. Add billing DB schema + migrations
2. Add `plans.ts` and entitlement resolver
3. Add `GET /api/billing/summary` with mock/free-only behavior

## Phase B - Provider integration (week 2)

1. Implement first provider adapter
2. Build checkout + portal endpoints
3. Implement webhook route + idempotency

## Phase C - Enforcement (week 3)

1. Gate model access
2. Make word quotas plan-aware
3. Add monthly transcript minute tracking and enforcement
4. Enforce share link limits

## Phase D - UX and conversion (week 4)

1. Add `/pricing` page
2. Replace dashboard placeholder billing UI
3. Add upgrade prompts at quota and feature gates
4. Add cancellation and renewal messaging

---

## 14) Post-v1 Features That Increase Revenue

Prioritize features that are easy to package as paid value:

1. Podcast web UI over existing backend APIs (feeds, episodes, ingest)
2. One-click repurposing outputs (summary, clips, social posts)
3. Team workspaces and seat billing
4. Share analytics (views, questions, top moments)
5. Branded share pages and custom domain embeds

---

## 15) Metrics to Track from Day 1

- Activation: first asset ingested within 24h
- Time-to-value: time to first useful answer from chat
- Free-to-paid conversion rate
- Paid retention (logo and revenue)
- Gross margin per customer (model + transcription cost vs revenue)
- Top quota hit reasons (minutes, words, model restrictions)

---

## 16) Risks and Mitigations

- Cost blowups from premium model defaults
  - Mitigation: cheaper default model for free tier + strict per-plan model allowlist

- Webhook duplication and race conditions
  - Mitigation: unique event IDs + transactional updates

- Confusing limits that frustrate users
  - Mitigation: transparent usage dashboard and clear upgrade copy

- Provider lock-in
  - Mitigation: provider abstraction in billing service

---

## 17) Concrete Build Checklist

## Database

- [ ] Add `packages/db/src/schema/billing.ts`
- [ ] Export from `packages/db/src/schemas.ts`
- [ ] Generate migration (`pnpm db:generate`)
- [ ] Run migration (`pnpm db:migrate`)

## API

- [ ] Create billing module and mount in `packages/api/src/index.ts`
- [ ] Add plan resolver and entitlement utilities
- [ ] Add webhook route with signature verification
- [ ] Add quota enforcement hooks in ingest/chat/share

## Web

- [ ] Add `/pricing` page
- [ ] Add billing panel/page
- [ ] Wire Upgrade and Billing CTAs in dashboard shell
- [ ] Add paywall and upgrade toasts on entitlement failures

## Env and docs

- [ ] Update `packages/env/src/server.ts`
- [ ] Update `apps/server/.env.example`
- [ ] Update `apps/web/.env.example` if needed
- [ ] Update `AGENTS.md` and `CLAUDE.md`

## Verification

- [ ] Unit test plan resolver and entitlement checks
- [ ] Integration test webhook idempotency
- [ ] Manual test: checkout -> active subscription -> gated feature unlock
- [ ] Manual test: cancel -> period end behavior -> downgrade to free limits

---

## 18) Recommendation

Ship billing and entitlement gating before broad feature expansion.

Milkpod already has enough core product depth to monetize now. The highest-leverage move is to turn existing usage into paid conversion with clear plans, hard limits, and obvious premium value.
