# Milkpod SaaS Implementation Plan

Actionable steps derived from `docs/saas-billing-entitlements-plan.md`, grounded in the current codebase.

---

## Phase A — Foundation

### A1. Define plans and entitlements

Create `packages/api/src/modules/billing/plans.ts`:

- Export `PlanId = 'free' | 'pro' | 'team'` type
- Export `PlanEntitlements` type with fields:
  - `transcriptMinutesMonthly: number`
  - `aiWordsDaily: number`
  - `maxActiveShareLinks: number | null` (null = unlimited)
  - `allowedModelIds: string[]`
  - `canUsePublicShareQA: boolean`
  - `priorityProcessing: boolean`
  - `maxCollections: number | null`
- Export `PLAN_CATALOG` map of `PlanId → PlanEntitlements` with values from the pricing doc
- Export `getEntitlements(planId: PlanId): PlanEntitlements` helper
- Model tier split: Free gets `gpt-4.1-mini`, `gemini-2.0-flash`, `gemini-2.5-flash`. Pro/Team get all 7 models.

Files touched: new `packages/api/src/modules/billing/plans.ts`

### A2. Add billing DB schema

Create `packages/db/src/schema/billing.ts` with four tables:

1. **`billing_customer`** — `id`, `userId` (FK → user, unique), `provider` (`polar` | `razorpay`), `providerCustomerId` (unique), timestamps
2. **`billing_subscription`** — `id`, `userId` (FK → user, indexed), `provider`, `providerSubscriptionId` (unique), `planId` (`free` | `pro` | `team`), `status` (`trialing` | `active` | `past_due` | `canceled` | `incomplete`), `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `canceledAt`, timestamps
3. **`billing_webhook_event`** — `id`, `provider`, `providerEventId` (unique), `eventType`, `payload` (jsonb), `processedAt`, timestamps
4. **`monthly_usage`** — `id`, `userId` (FK → user), `periodStart` (date), `transcriptMinutesUsed` (int, default 0), unique on `(userId, periodStart)`

Steps:
1. Create the schema file
2. Export from `packages/db/src/schemas.ts`
3. Run `pnpm db:generate`
4. Run `pnpm db:migrate`
5. Run `pnpm build` (so downstream packages see new types)

Files touched: new `packages/db/src/schema/billing.ts`, edit `packages/db/src/schemas.ts`

### A3. Add entitlement resolver

Create `packages/api/src/modules/billing/service.ts`:

- `BillingService.getUserPlan(userId): Promise<PlanId>` — query `billing_subscription` for active/trialing sub, return `planId` or `'free'` if none
- `BillingService.getUserEntitlements(userId): Promise<PlanEntitlements>` — calls `getUserPlan` then `getEntitlements`
- `BillingService.getUsageSummary(userId)` — return current plan, subscription status, renewal date, daily word usage, monthly transcript minutes

Files touched: new `packages/api/src/modules/billing/service.ts`

### A4. Add billing summary endpoint

Create `packages/api/src/modules/billing/index.ts`:

- `GET /api/billing/plans` — return plan catalog with names, prices, entitlements (public-safe subset)
- `GET /api/billing/summary` — return current plan, subscription status, renewal date, usage snapshot, entitlements for the authenticated user

Mount in `packages/api/src/index.ts` alongside existing modules.

At this point the endpoint works but everyone is on Free. That's correct — no provider integration yet.

Files touched: new `packages/api/src/modules/billing/index.ts`, edit `packages/api/src/index.ts`

---

## Phase B — Provider Integration

### B1. Define provider interface

Create `packages/api/src/modules/billing/provider.ts`:

```ts
export interface BillingProvider {
  createCheckoutSession(params: {
    userId: string;
    email: string;
    planId: 'pro' | 'team';
    interval: 'month' | 'year';
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string }>;

  createPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ portalUrl: string }>;

  cancelSubscription(params: {
    subscriptionId: string;
    atPeriodEnd: boolean;
  }): Promise<void>;

  verifyWebhookSignature(params: {
    body: string;
    signature: string;
  }): boolean;

  parseWebhookEvent(body: string): NormalizedWebhookEvent;
}
```

Files touched: new `packages/api/src/modules/billing/provider.ts`

### B2. Implement first provider adapter

Create `packages/api/src/modules/billing/providers/polar.ts` (or `razorpay.ts`):

- Implement the `BillingProvider` interface against the chosen provider's SDK/API
- Normalize all webhook events to internal types: `checkout.completed`, `subscription.updated`, `subscription.canceled`, `payment.failed`

Decision needed: **Polar or Razorpay?** Pick whichever onboards fastest. The abstraction means switching later is cheap.

Files touched: new `packages/api/src/modules/billing/providers/{polar|razorpay}.ts`

### B3. Add env vars

Update `packages/env/src/server.ts` — add:
- `BILLING_PROVIDER` (enum: `polar` | `razorpay`, optional, default undefined = billing disabled)
- Provider-specific keys (all optional, validated at runtime when provider is active)

Update `.env.example` files and `CLAUDE.md` / `AGENTS.md`.

Files touched: edit `packages/env/src/server.ts`, edit `apps/server/.env.example`, edit `CLAUDE.md`

### B4. Add checkout, portal, cancel endpoints

Extend `packages/api/src/modules/billing/index.ts`:

- `POST /api/billing/checkout` — input `{ planId, interval }`, call provider `createCheckoutSession`, return `{ checkoutUrl }`
- `POST /api/billing/portal` — look up `billing_customer`, call provider `createPortalSession`, return `{ portalUrl }`
- `POST /api/billing/cancel` — input `{ atPeriodEnd }`, call provider `cancelSubscription`

Files touched: edit `packages/api/src/modules/billing/index.ts`

### B5. Add webhook route

Add `POST /api/billing/webhook` (unauthenticated, signature-verified):

1. Verify provider signature → 401 if invalid
2. Parse event → extract `providerEventId`
3. Insert into `billing_webhook_event` — if unique conflict on `providerEventId`, return 200 (idempotent)
4. In a DB transaction, apply state transitions:
   - `checkout.completed` → upsert `billing_customer` + create/update `billing_subscription`
   - `subscription.updated` → sync `status`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`
   - `subscription.canceled` → set `canceledAt`, update status
   - `payment.failed` → set status to `past_due`
5. Set `processedAt` on the event row
6. Return 200

Files touched: edit `packages/api/src/modules/billing/index.ts` (or separate webhook file)

---

## Phase C — Enforcement

### C1. Make word quotas plan-aware

Current state: `DAILY_WORD_BUDGET = 2000` is a hardcoded constant in `packages/ai/src/limits.ts`, used by `UsageService.getRemainingWords` and the chat route.

Changes:
- In `UsageService.getRemainingWords(userId)` — call `BillingService.getUserEntitlements(userId)` to get `aiWordsDaily` instead of using the constant
- Keep `DAILY_WORD_BUDGET` as the Free tier default and `HARD_WORD_CAP` as the absolute safety ceiling
- Update `GET /api/usage/remaining` response to include plan-derived budget

Files touched: edit `packages/api/src/modules/usage/service.ts`, edit `packages/api/src/modules/usage/index.ts`

### C2. Gate model access

Current state: `packages/api/src/modules/chat/index.ts` validates `modelId` against all `VALID_MODEL_IDS` but doesn't check plan tier.

Changes:
- After session derivation in `POST /api/chat/`, get user entitlements
- If `modelId` is not in `entitlements.allowedModelIds`, return 403 with `{ error: 'model_restricted', upgrade: true }`
- Frontend should handle 403 with model restriction to show upgrade prompt

Files touched: edit `packages/api/src/modules/chat/index.ts`

### C3. Track and enforce transcript minutes

Current state: `POST /api/ingest/` has zero quota enforcement — any user can ingest unlimited videos.

Changes:
- Add `IngestService.getMonthlyMinutesUsed(userId)` — query `monthly_usage` for current UTC month
- Before enqueue in `POST /api/ingest/`: soft-check `monthlyMinutesUsed + estimatedDuration < entitlements.transcriptMinutesMonthly` (estimate from YouTube metadata `lengthSeconds`)
- On pipeline completion in `pipeline.ts`: compute actual transcript duration, increment `monthly_usage.transcriptMinutesUsed`
- If over quota, return 403 with upgrade hint

Files touched: edit `packages/api/src/modules/ingest/index.ts`, edit `packages/api/src/modules/ingest/pipeline.ts`, edit `packages/api/src/modules/ingest/service.ts`

### C4. Enforce share link limits

Current state: `ShareService.create` has no per-user link count check.

Changes:
- In `ShareService.create(userId, data)`: count active (non-revoked, non-expired) share links for user
- If count >= `entitlements.maxActiveShareLinks`, return 403 with upgrade hint
- Optionally gate `canQuery` on `entitlements.canUsePublicShareQA`

Files touched: edit `packages/api/src/modules/shares/service.ts`, edit `packages/api/src/modules/shares/index.ts`

### C5. Fix share Q&A word budget bypass

Current state: Share chat endpoint (`/api/shares/chat/:token`) calls `createChatStream` with only rate limiting (10/hr/link), no word budget deduction.

Changes:
- Identify the share link owner's `userId`
- Apply `UsageService.reserveWords` against the owner's daily budget (same as regular chat)
- This prevents free-tier users from bypassing quotas via shared links

Files touched: edit `packages/api/src/modules/shares/index.ts`

---

## Phase D — Frontend UX

### D1. Add pricing page

Create `apps/web/src/app/pricing/page.tsx`:

- Fetch plan catalog from `GET /api/billing/plans`
- 3-column pricing grid (Free / Pro / Team)
- CTA buttons: "Get Started" (free), "Subscribe" (pro/team) → calls `POST /api/billing/checkout` and redirects to `checkoutUrl`
- Feature comparison table
- Can be a public page (no auth required to view, auth required to subscribe)

Files touched: new `apps/web/src/app/pricing/page.tsx`

### D2. Build billing dashboard panel

Create `apps/web/src/app/dashboard/billing/page.tsx` (or integrate into existing settings):

- Fetch `GET /api/billing/summary`
- Show: current plan card, subscription status, renewal date
- Usage bars: daily words used/limit, monthly transcript minutes used/limit
- Buttons: "Upgrade" (→ checkout), "Manage Billing" (→ portal), "Cancel"
- Past-due warning banner if `status === 'past_due'`

Files touched: new `apps/web/src/app/dashboard/billing/page.tsx`

### D3. Update dashboard shell

Current state: `SidebarPlanUsage` in `dashboard-shell.tsx` has a decorative Upgrade button and hardcoded "Starter" badge.

Changes:
- Wire `SidebarPlanUsage` to `GET /api/billing/summary` instead of just usage/remaining
- Show actual plan name in badge (Free / Pro / Team)
- Make Upgrade button navigate to `/pricing` or trigger checkout
- Enable the Billing menu item in user dropdown → link to `/dashboard/billing`
- Wire `userStats` to real asset count and minutes data

Files touched: edit `apps/web/src/components/dashboard/dashboard-shell.tsx`

### D4. Add upgrade prompts at gates

When the API returns 403 with `upgrade: true`:

- Model restriction → toast: "This model requires a Pro plan" + Upgrade button
- Word quota exhausted → existing 429 handling, add "Upgrade for 15x more words" CTA
- Transcript minute limit → toast on ingest failure + Upgrade button
- Share link limit → toast on share creation failure + Upgrade button

Centralize the upgrade prompt logic in a shared hook or component.

Files touched: edit relevant chat/ingest/share UI components, potentially new `apps/web/src/components/upgrade-prompt.tsx`

---

## Phase E — Polish and Verification

### E1. Unit tests

- Test `getEntitlements` returns correct values for each plan
- Test `BillingService.getUserPlan` returns `'free'` when no subscription exists
- Test `BillingService.getUserPlan` returns correct plan for active subscription
- Test word quota uses plan-derived limits
- Test model gating rejects restricted models for free tier

### E2. Integration tests

- Test webhook idempotency: same `providerEventId` processed once
- Test webhook state transitions: checkout → active, cancel → canceled
- Test concurrent word reservations with plan-aware limits

### E3. Manual test flows

- [ ] Sign up → land on Free → verify limits (2000 words/day, 120 min/month, 1 share link, 3 models)
- [ ] Free user tries premium model → gets 403 + upgrade prompt
- [ ] Free user hits word limit → gets 429 + upgrade CTA
- [ ] Checkout → active Pro subscription → verify limits expand (30k words, 1200 min, all models)
- [ ] Cancel Pro → period ends → downgrade to Free limits
- [ ] Past due → in-app warning banner appears

---

## Dependency Graph

```
A1 (plans.ts)
 ↓
A2 (billing schema + migration)
 ↓
A3 (BillingService) ← depends on A1 + A2
 ↓
A4 (summary endpoint) ← depends on A3
 │
 ├─→ Phase C (all enforcement) ← depends on A3
 │    C1 (word quotas)
 │    C2 (model gating)
 │    C3 (transcript minutes)
 │    C4 (share limits)
 │    C5 (share Q&A fix)
 │
 └─→ Phase B (provider integration) ← depends on A2
      B1 (interface)
      B2 (adapter) ← depends on B1
      B3 (env vars)
      B4 (checkout/portal) ← depends on B2
      B5 (webhook) ← depends on B2

Phase D (frontend) ← depends on A4 + B4
 D1 (pricing page)
 D2 (billing dashboard)
 D3 (shell updates)
 D4 (upgrade prompts) ← depends on C1–C5
```

Phases B and C can run in parallel after A completes. Phase D depends on both B and C.

---

## Open Decisions

1. **Billing provider**: Polar vs Razorpay — pick whichever onboards fastest
2. **Annual billing**: Ship monthly-only first, or wait to include annual?
3. **Pricing amounts**: Test INR 1,499 or 2,499 for Pro?
4. **Free tier model list**: Which 3 models for free? Suggestion: `gpt-4.1-mini`, `gemini-2.0-flash`, `gemini-2.5-flash`
5. **Share Q&A on free tier**: Disable entirely or keep with strict rate limit?
